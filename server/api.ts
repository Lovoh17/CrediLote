/**
 * API local de CrediLote (ADR-013): estado en Neon Postgres y documentos en Neon Storage.
 * Se monta como middleware del servidor de Vite (`npm run dev` / `npm run preview`).
 *
 * Seguridad (fase de un solo administrador, ver 01.4):
 * - Solo atiende peticiones desde este equipo (127.0.0.1 / ::1), salvo CREDILOTE_API_PERMITIR_RED=1.
 * - Rechaza peticiones con cabecera Origin de otro sitio (evita que una web externa use la API).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { crearDb, Db } from './db';
import { crearAlmacenamiento, Almacenamiento, ConfigAlmacenamiento } from './almacenamiento';
import { obtenerVersionLimpia } from './documentosLimpios';
import { guardarDocumento } from './documentosSubida';

export interface ConfigApi {
  databaseUrl?: string;
  almacenamiento: ConfigAlmacenamiento;
  permitirRed?: boolean;
}

const PREFIJO = '/api/';
const MAX_ESTADO_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENTO_BYTES = 15 * 1024 * 1024;
const TIPOS_DOCUMENTO = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

type Siguiente = (err?: unknown) => void;

export function crearMiddlewareApi(config: ConfigApi) {
  const db: Db | null = config.databaseUrl ? crearDb(config.databaseUrl) : null;
  const almacenamiento: Almacenamiento = crearAlmacenamiento(config.almacenamiento);

  return async (req: IncomingMessage, res: ServerResponse, next: Siguiente) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    // /api/gemini lo atiende el proxy de Gemini (vite.config.ts)
    if (!url.pathname.startsWith(PREFIJO) || url.pathname.startsWith('/api/gemini')) return next();

    try {
      if (!config.permitirRed && !esLocal(req)) return responder(res, 403, { error: 'Solo se permite acceso desde este equipo.' });
      if (!origenPermitido(req)) return responder(res, 403, { error: 'Origen no permitido.' });

      const ruta = url.pathname.slice(PREFIJO.length).replace(/\/+$/, '');
      const metodo = req.method ?? 'GET';
      // HEAD se atiende como GET (Node no envía el cuerpo): la interfaz lo usa para saber si un documento está listo
      const lectura = metodo === 'GET' || metodo === 'HEAD';

      if (ruta === 'salud' && metodo === 'GET') {
        let baseDatos = false;
        if (db) {
          try {
            await db.asegurarEsquema();
            baseDatos = true;
          } catch {
            baseDatos = false;
          }
        }
        return responder(res, 200, { baseDatos, almacenamiento: almacenamiento.configurado });
      }

      if (!db) return responder(res, 503, { error: 'DATABASE_URL no está configurada en .env.local.' });

      // --- Estado de la aplicación ---
      if (ruta === 'estado' && metodo === 'GET') {
        const estado = await db.leerEstado();
        return estado ? responder(res, 200, estado) : responder(res, 404, { error: 'Sin estado guardado.' });
      }

      if (ruta === 'estado' && metodo === 'PUT') {
        const cuerpo = JSON.parse((await leerCuerpo(req, MAX_ESTADO_BYTES)).toString('utf8'));
        if (typeof cuerpo?.versionEsperada !== 'number' || typeof cuerpo?.datos !== 'object' || cuerpo.datos === null) {
          return responder(res, 400, { error: 'Se esperaba { versionEsperada, datos }.' });
        }
        const r = await db.guardarEstado(cuerpo.versionEsperada, cuerpo.datos);
        if (r.ok) return responder(res, 200, { version: r.version });
        return responder(res, 409, { error: 'Conflicto de versión.', versionActual: 'versionActual' in r ? r.versionActual : 0 });
      }

      if (ruta === 'estado/proyeccion' && metodo === 'POST') {
        const conteo = await db.regenerarProyeccion();
        return conteo ? responder(res, 200, conteo) : responder(res, 404, { error: 'Sin estado guardado.' });
      }

      if (ruta === 'estado/historial' && metodo === 'GET') {
        return responder(res, 200, await db.listarHistorial(Number(url.searchParams.get('limite')) || 50));
      }

      const version = /^estado\/historial\/(\d+)$/.exec(ruta);
      if (version && metodo === 'GET') {
        const datos = await db.leerVersionHistorial(Number(version[1]));
        return datos ? responder(res, 200, { version: Number(version[1]), datos }) : responder(res, 404, { error: 'Versión no encontrada.' });
      }

      // --- Documentos ---
      if (ruta === 'documentos' && metodo === 'GET') {
        if (url.searchParams.get('sinContrato') === '1') return responder(res, 200, await db.listarDocumentosSinContrato());
        const contratoId = url.searchParams.get('contratoId');
        if (!contratoId) return responder(res, 400, { error: 'Falta contratoId (o sinContrato=1).' });
        return responder(res, 200, await db.listarDocumentos(contratoId));
      }

      if (ruta === 'documentos' && metodo === 'POST') {
        if (!almacenamiento.configurado) {
          return responder(res, 503, { error: 'El almacenamiento de documentos no está configurado (variables AWS_* en .env.local).' });
        }
        // contratoId es opcional: la promesa se guarda al subirla y se vincula al contrato cuando se registra
        const contratoId = url.searchParams.get('contratoId');
        const nombre = (url.searchParams.get('nombre') ?? 'documento').replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ()]/g, '_').slice(0, 120);
        const mime = String(req.headers['content-type'] ?? '').split(';')[0];
        if (!TIPOS_DOCUMENTO.has(mime)) return responder(res, 415, { error: 'Formato no admitido (PDF, JPG, PNG o WebP).' });
        const contenido = await leerCuerpo(req, MAX_DOCUMENTO_BYTES);
        const { registro, nuevo } = await guardarDocumento({ contenido, nombre, mime, contratoId }, db, almacenamiento);
        if (nuevo) {
          // La versión limpia se prepara enseguida, sin hacer esperar la subida
          void obtenerVersionLimpia(registro.id, db, almacenamiento).catch((e) =>
            console.error('[CrediLote API] No se pudo generar la versión limpia:', e instanceof Error ? e.message : e)
          );
        }
        return responder(res, nuevo ? 201 : 200, { ...registro, nuevo });
      }

      const vincular = /^documentos\/([0-9a-f-]{36})\/vincular$/.exec(ruta);
      if (vincular && metodo === 'POST') {
        const contratoId = url.searchParams.get('contratoId');
        if (!contratoId) return responder(res, 400, { error: 'Falta contratoId.' });
        const r = await db.vincularDocumento(vincular[1], contratoId);
        if (r === 'no-existe') return responder(res, 404, { error: 'Documento no encontrado.' });
        if (r === 'otro-contrato') return responder(res, 409, { error: 'El documento ya pertenece a otro contrato.' });
        return responder(res, 200, { id: vincular[1], contratoId });
      }

      const limpio = /^documentos\/([0-9a-f-]{36})\/limpio$/.exec(ruta);
      if (limpio && lectura) {
        const r = await obtenerVersionLimpia(limpio[1], db, almacenamiento);
        if (r.estado === 'no-existe') return responder(res, 404, { error: 'Documento no encontrado.' });
        if (r.estado === 'no-se-puede-limpiar') {
          return responder(res, 422, { error: 'Este documento no es un escaneo que se pueda limpiar; vea el original.' });
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', r.mime);
        res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(r.nombre)}`);
        res.setHeader('Cache-Control', 'private, max-age=0');
        return res.end(Buffer.from(r.contenido));
      }

      const documento = /^documentos\/([0-9a-f-]{36})$/.exec(ruta);
      if (documento && lectura) {
        const meta = await db.obtenerDocumento(documento[1]);
        if (!meta) return responder(res, 404, { error: 'Documento no encontrado.' });
        const archivo = await almacenamiento.descargar(meta.clave);
        res.statusCode = 200;
        res.setHeader('Content-Type', meta.mime || archivo.mime || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(meta.nombre)}`);
        res.setHeader('Cache-Control', 'private, max-age=0');
        return res.end(Buffer.from(archivo.cuerpo));
      }

      return responder(res, 404, { error: 'Ruta no encontrada.' });
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      const estado = mensaje === 'Cuerpo demasiado grande' ? 413 : e instanceof SyntaxError ? 400 : 500;
      // No se registran datos del cuerpo: pueden contener información personal
      console.error(`[CrediLote API] ${req.method} ${url.pathname}: ${mensaje}`);
      return responder(res, estado, { error: estado === 500 ? 'Error interno del servidor.' : mensaje });
    }
  };
}

function responder(res: ServerResponse, estado: number, cuerpo: unknown) {
  res.statusCode = estado;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(cuerpo));
}

function esLocal(req: IncomingMessage): boolean {
  const ip = req.socket.remoteAddress ?? '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

/** Sin cabecera Origin (navegación directa o mismo origen en GET) o con el mismo host. */
function origenPermitido(req: IncomingMessage): boolean {
  const origen = req.headers.origin;
  if (!origen) return true;
  try {
    return new URL(origen).host === req.headers.host;
  } catch {
    return false;
  }
}

function leerCuerpo(req: IncomingMessage, maximo: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const partes: Buffer[] = [];
    let total = 0;
    req.on('data', (parte: Buffer) => {
      total += parte.length;
      if (total > maximo) {
        reject(new Error('Cuerpo demasiado grande'));
        req.destroy();
        return;
      }
      partes.push(parte);
    });
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}
