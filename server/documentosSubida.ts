/**
 * Guardado de documentos (ADR-013). La promesa se guarda en cuanto se sube a la app, antes de registrarla: así queda
 * aunque el registro se rechace o no se termine. Al registrar la promesa, el documento se vincula a su contrato.
 * Un mismo archivo (misma huella SHA-256) no se guarda dos veces.
 */
import { createHash, randomUUID } from 'node:crypto';
import type { AlmacenDocumentos } from './documentosLimpios';

export interface RegistroDocumento {
  id: string;
  contratoId: string | null;
  nombre: string;
  mime: string;
  tamano: number;
  creadoEn: string;
}

/** Lo que este módulo necesita de la base de datos (server/db.ts). */
export interface DbSubida {
  buscarDocumentoPorHash(sha256: string): Promise<RegistroDocumento | null>;
  registrarDocumento(doc: {
    contratoId: string | null;
    clave: string;
    nombre: string;
    mime: string;
    tamano: number;
    sha256: string;
  }): Promise<{ id: string; creadoEn: string }>;
  vincularDocumento(id: string, contratoId: string): Promise<'ok' | 'no-existe' | 'otro-contrato'>;
}

export async function guardarDocumento(
  entrada: { contenido: Buffer; nombre: string; mime: string; contratoId?: string | null },
  db: DbSubida,
  almacen: Pick<AlmacenDocumentos, 'subir'>
): Promise<{ registro: RegistroDocumento; nuevo: boolean }> {
  const sha256 = createHash('sha256').update(entrada.contenido).digest('hex');
  const contratoId = entrada.contratoId || null;

  const existente = await db.buscarDocumentoPorHash(sha256);
  if (existente) {
    // El mismo archivo subido otra vez: se reutiliza y, si todavía no tenía contrato, se vincula
    if (contratoId && !existente.contratoId && (await db.vincularDocumento(existente.id, contratoId)) === 'ok') {
      return { registro: { ...existente, contratoId }, nuevo: false };
    }
    return { registro: existente, nuevo: false };
  }

  const clave = `documentos/${randomUUID()}-${entrada.nombre}`;
  await almacen.subir(clave, entrada.contenido, entrada.mime);
  const { id, creadoEn } = await db.registrarDocumento({
    contratoId,
    clave,
    nombre: entrada.nombre,
    mime: entrada.mime,
    tamano: entrada.contenido.length,
    sha256,
  });
  return {
    registro: { id, contratoId, nombre: entrada.nombre, mime: entrada.mime, tamano: entrada.contenido.length, creadoEn },
    nuevo: true,
  };
}
