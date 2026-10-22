/**
 * Versión limpia de los documentos guardados (ADR-013). Se genera la primera vez que se pide (o justo después de
 * subir el documento), se guarda en Neon Storage junto al original y las siguientes veces solo se descarga.
 */
import { limpiarDocumento } from './limpiezaDocumento';

/** Lo que este módulo necesita de la base de datos (server/db.ts). */
export interface DbDocumentos {
  obtenerDocumento(id: string): Promise<{ clave: string; nombre: string; mime: string; claveLimpia: string | null } | null>;
  guardarClaveLimpia(id: string, claveLimpia: string): Promise<void>;
}

/** Lo que este módulo necesita del almacenamiento (server/almacenamiento.ts). */
export interface AlmacenDocumentos {
  subir(clave: string, contenido: Buffer, mime: string): Promise<void>;
  descargar(clave: string): Promise<{ cuerpo: Uint8Array; mime?: string }>;
}

export type VersionLimpia =
  | { estado: 'ok'; contenido: Uint8Array; mime: string; nombre: string }
  | { estado: 'no-existe' }
  | { estado: 'no-se-puede-limpiar' };

/** Generaciones en curso, para no limpiar dos veces el mismo documento si se pide mientras se genera. */
const enCurso = new Map<string, Promise<VersionLimpia>>();

export function obtenerVersionLimpia(id: string, db: DbDocumentos, almacen: AlmacenDocumentos): Promise<VersionLimpia> {
  const pendiente = enCurso.get(id);
  if (pendiente) return pendiente;
  const promesa = generar(id, db, almacen).finally(() => enCurso.delete(id));
  enCurso.set(id, promesa);
  return promesa;
}

async function generar(id: string, db: DbDocumentos, almacen: AlmacenDocumentos): Promise<VersionLimpia> {
  const meta = await db.obtenerDocumento(id);
  if (!meta) return { estado: 'no-existe' };
  const nombre = nombreLimpio(meta.nombre, meta.mime);

  if (meta.claveLimpia) {
    const guardada = await almacen.descargar(meta.claveLimpia);
    return { estado: 'ok', contenido: guardada.cuerpo, mime: guardada.mime ?? mimeLimpio(meta.mime), nombre };
  }

  const original = await almacen.descargar(meta.clave);
  const limpio = await limpiarDocumento(original.cuerpo, meta.mime);
  if (!limpio) return { estado: 'no-se-puede-limpiar' };

  const claveLimpia = `${meta.clave}.limpio.${limpio.mime === 'application/pdf' ? 'pdf' : 'jpg'}`;
  await almacen.subir(claveLimpia, limpio.contenido, limpio.mime);
  await db.guardarClaveLimpia(id, claveLimpia);
  return { estado: 'ok', contenido: limpio.contenido, mime: limpio.mime, nombre };
}

const mimeLimpio = (mime: string) => (mime === 'application/pdf' ? 'application/pdf' : 'image/jpeg');

function nombreLimpio(nombre: string, mime: string): string {
  const base = nombre.replace(/\.[^.]+$/, '');
  return `${base} (versión limpia).${mime === 'application/pdf' ? 'pdf' : 'jpg'}`;
}
