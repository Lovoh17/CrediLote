import { describe, it, expect, vi } from 'vitest';
import { guardarDocumento, DbSubida, RegistroDocumento } from './documentosSubida';

/** Base de datos y almacenamiento simulados en memoria. */
function entorno() {
  const filas: (RegistroDocumento & { sha256: string; clave: string })[] = [];
  const db: DbSubida = {
    buscarDocumentoPorHash: vi.fn(async (sha256: string) => {
      const f = filas.find((x) => x.sha256 === sha256);
      return f ? { id: f.id, contratoId: f.contratoId, nombre: f.nombre, mime: f.mime, tamano: f.tamano, creadoEn: f.creadoEn } : null;
    }),
    registrarDocumento: vi.fn(async (doc) => {
      const id = `doc-${filas.length + 1}`;
      filas.push({ ...doc, id, creadoEn: '2026-10-03T00:00:00.000Z' });
      return { id, creadoEn: '2026-10-03T00:00:00.000Z' };
    }),
    vincularDocumento: vi.fn(async (id: string, contratoId: string) => {
      const f = filas.find((x) => x.id === id);
      if (!f) return 'no-existe' as const;
      if (f.contratoId && f.contratoId !== contratoId) return 'otro-contrato' as const;
      f.contratoId = contratoId;
      return 'ok' as const;
    }),
  };
  const almacen = { subir: vi.fn(async () => {}) };
  return { db, almacen, filas };
}

const PDF = Buffer.from('%PDF-1.4 promesa ficticia');
const OTRO_PDF = Buffer.from('%PDF-1.4 otra promesa ficticia');

describe('guardarDocumento: la promesa se guarda al subirla, antes de registrarla', () => {
  it('guarda un documento sin contrato', async () => {
    const { db, almacen } = entorno();
    const r = await guardarDocumento({ contenido: PDF, nombre: 'promesa.pdf', mime: 'application/pdf' }, db, almacen);
    expect(r).toMatchObject({ nuevo: true, registro: { id: 'doc-1', contratoId: null, nombre: 'promesa.pdf', tamano: PDF.length } });
    expect(almacen.subir).toHaveBeenCalledWith(expect.stringMatching(/^documentos\/[0-9a-f-]{36}-promesa\.pdf$/), PDF, 'application/pdf');
  });

  it('el mismo archivo subido otra vez no se guarda dos veces', async () => {
    const { db, almacen, filas } = entorno();
    await guardarDocumento({ contenido: PDF, nombre: 'promesa.pdf', mime: 'application/pdf' }, db, almacen);
    const otraVez = await guardarDocumento({ contenido: PDF, nombre: 'promesa (1).pdf', mime: 'application/pdf' }, db, almacen);
    expect(otraVez).toMatchObject({ nuevo: false, registro: { id: 'doc-1' } });
    expect(almacen.subir).toHaveBeenCalledTimes(1);
    expect(filas).toHaveLength(1);

    await guardarDocumento({ contenido: OTRO_PDF, nombre: 'otra.pdf', mime: 'application/pdf' }, db, almacen);
    expect(filas).toHaveLength(2);
  });

  it('si el archivo repetido aún no tenía contrato y ahora llega con uno, queda vinculado', async () => {
    const { db, almacen, filas } = entorno();
    await guardarDocumento({ contenido: PDF, nombre: 'promesa.pdf', mime: 'application/pdf' }, db, almacen);
    const r = await guardarDocumento({ contenido: PDF, nombre: 'promesa.pdf', mime: 'application/pdf', contratoId: 'k-1' }, db, almacen);
    expect(r.registro.contratoId).toBe('k-1');
    expect(filas[0].contratoId).toBe('k-1');
  });

  it('no cambia el contrato de un documento que ya pertenece a otro', async () => {
    const { db, almacen, filas } = entorno();
    await guardarDocumento({ contenido: PDF, nombre: 'promesa.pdf', mime: 'application/pdf', contratoId: 'k-1' }, db, almacen);
    const r = await guardarDocumento({ contenido: PDF, nombre: 'promesa.pdf', mime: 'application/pdf', contratoId: 'k-2' }, db, almacen);
    expect(r.registro.contratoId).toBe('k-1');
    expect(filas[0].contratoId).toBe('k-1');
  });
});
