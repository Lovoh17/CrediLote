import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { limpiarImagen, limpiarDocumento } from './limpiezaDocumento';
import { obtenerVersionLimpia, DbDocumentos, AlmacenDocumentos } from './documentosLimpios';

const ANCHO = 600;
const ALTO = 800;

/** "Foto" sintética de una hoja: papel gris con una sombra que oscurece el borde izquierdo y renglones de texto. */
async function escaneoSintetico(): Promise<Buffer> {
  const pixeles = Buffer.alloc(ANCHO * ALTO);
  for (let y = 0; y < ALTO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      const papel = 175 + Math.round((x / ANCHO) * 30); // de 175 (sombra) a 205
      const texto = y % 40 >= 20 && y % 40 < 26 && x > 60 && x < 540; // renglones
      pixeles[y * ANCHO + x] = texto ? 70 : papel;
    }
  }
  return sharp(pixeles, { raw: { width: ANCHO, height: ALTO, channels: 1 } }).jpeg({ quality: 92 }).toBuffer();
}

async function brilloPromedio(jpeg: Buffer, zona: { left: number; top: number; width: number; height: number }) {
  const { data } = await sharp(jpeg).extract(zona).grayscale().raw().toBuffer({ resolveWithObject: true });
  return data.reduce((s, v) => s + v, 0) / data.length;
}

describe('limpiarImagen: deja el papel blanco y el texto oscuro', () => {
  it('quita la sombra y el gris del papel sin borrar el texto', async () => {
    const original = await escaneoSintetico();
    const limpia = await limpiarImagen(original);
    const papelConSombra = { left: 5, top: 5, width: 40, height: 12 };
    const renglon = { left: 100, top: 21, width: 400, height: 4 };

    expect(await brilloPromedio(original, papelConSombra)).toBeLessThan(190);
    expect(await brilloPromedio(limpia, papelConSombra)).toBeGreaterThan(235);
    expect(await brilloPromedio(limpia, renglon)).toBeLessThan(110);
  });
});

describe('limpiarDocumento', () => {
  it('limpia cada página de un PDF escaneado y conserva el número de páginas', async () => {
    const pdf = await PDFDocument.create();
    const jpg = await pdf.embedJpg(await escaneoSintetico());
    for (let i = 0; i < 2; i++) pdf.addPage([ANCHO, ALTO]).drawImage(jpg, { x: 0, y: 0, width: ANCHO, height: ALTO });
    const r = await limpiarDocumento(await pdf.save(), 'application/pdf');
    expect(r?.mime).toBe('application/pdf');
    expect((await PDFDocument.load(r!.contenido)).getPageCount()).toBe(2);
  });

  it('un PDF de texto (sin escaneo) no se "limpia": se muestra el original', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText('Documento de prueba');
    expect(await limpiarDocumento(await pdf.save(), 'application/pdf')).toBeNull();
  });

  it('una foto de la promesa se limpia como imagen JPEG', async () => {
    const r = await limpiarDocumento(await escaneoSintetico(), 'image/jpeg');
    expect(r?.mime).toBe('image/jpeg');
  });
});

describe('obtenerVersionLimpia: se genera una vez y se guarda junto al original', () => {
  async function entorno() {
    const archivos = new Map<string, { cuerpo: Uint8Array; mime?: string }>([['contratos/k1/promesa.jpg', { cuerpo: await escaneoSintetico(), mime: 'image/jpeg' }]]);
    let claveLimpia: string | null = null;
    const db: DbDocumentos = {
      obtenerDocumento: vi.fn(async (id: string) => (id === 'doc-1' ? { clave: 'contratos/k1/promesa.jpg', nombre: 'promesa.jpg', mime: 'image/jpeg', claveLimpia } : null)),
      guardarClaveLimpia: vi.fn(async (_id: string, clave: string) => {
        claveLimpia = clave;
      }),
    };
    const almacen: AlmacenDocumentos = {
      subir: vi.fn(async (clave: string, contenido: Buffer, mime: string) => {
        archivos.set(clave, { cuerpo: contenido, mime });
      }),
      descargar: vi.fn(async (clave: string) => archivos.get(clave)!),
    };
    return { db, almacen };
  }

  it('la primera vez limpia y guarda; después solo descarga la versión guardada', async () => {
    const { db, almacen } = await entorno();
    const primera = await obtenerVersionLimpia('doc-1', db, almacen);
    expect(primera).toMatchObject({ estado: 'ok', mime: 'image/jpeg', nombre: 'promesa (versión limpia).jpg' });
    expect(almacen.subir).toHaveBeenCalledWith('contratos/k1/promesa.jpg.limpio.jpg', expect.any(Buffer), 'image/jpeg');

    const segunda = await obtenerVersionLimpia('doc-1', db, almacen);
    expect(segunda.estado).toBe('ok');
    expect(almacen.subir).toHaveBeenCalledTimes(1);
    expect(almacen.descargar).toHaveBeenLastCalledWith('contratos/k1/promesa.jpg.limpio.jpg');
  });

  it('dos pedidos al mismo tiempo generan una sola versión limpia', async () => {
    const { db, almacen } = await entorno();
    await Promise.all([obtenerVersionLimpia('doc-1', db, almacen), obtenerVersionLimpia('doc-1', db, almacen)]);
    expect(almacen.subir).toHaveBeenCalledTimes(1);
  });

  it('documento inexistente', async () => {
    const { db, almacen } = await entorno();
    expect(await obtenerVersionLimpia('doc-x', db, almacen)).toEqual({ estado: 'no-existe' });
  });
});
