/**
 * Versión limpia de una promesa escaneada (fotos o escaneos con sombras, fondo gris y poco contraste).
 *
 * Cada página se procesa así: escala de grises → se divide entre su propio fondo (una copia muy desenfocada), lo que
 * elimina sombras e iluminación desigual y deja el papel blanco → se estira el contraste → se enfoca el texto.
 * Es la misma imagen del documento, solo más legible: no se transcribe ni se cambia el contenido. El original se
 * conserva siempre.
 */
import { inflateSync } from 'node:zlib';
import sharp from 'sharp';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFPage, PDFRawStream } from 'pdf-lib';

/** Lado mayor de las páginas limpias (suficiente para leer e imprimir sin pesar demasiado). */
const LADO_MAXIMO_PX = 2400;

/** Devuelve la imagen limpia en JPEG. */
export async function limpiarImagen(entrada: Uint8Array): Promise<Buffer> {
  const gris = await sharp(entrada).rotate().grayscale().resize({
    width: LADO_MAXIMO_PX,
    height: LADO_MAXIMO_PX,
    fit: 'inside',
    withoutEnlargement: true,
  }).toBuffer({ resolveWithObject: true });
  const { width, height } = gris.info;

  // Fondo estimado: desenfoque grande (el texto desaparece y quedan las sombras y el tono del papel), invertido para
  // que "colour-dodge" divida la imagen entre él.
  const sigma = Math.max(8, Math.round(Math.max(width, height) / 90));
  const fondoInvertido = await sharp(gris.data).blur(sigma).negate().toBuffer();
  const plano = await sharp(gris.data).composite([{ input: fondoInvertido, blend: 'colour-dodge' }]).toBuffer();

  return sharp(plano)
    .grayscale()
    .normalise({ lower: 1, upper: 99 })
    .linear(1.15, -20) // texto un poco más oscuro sin quemar sellos ni firmas
    .sharpen({ sigma: 1 })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

/** Bytes JPEG de la imagen más grande de la página (escaneos: una foto por página), o null si no hay. */
function imagenDePagina(pagina: PDFPage): Uint8Array | null {
  const contexto = pagina.doc.context;
  const xobjects = pagina.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
  if (!xobjects) return null;

  let mejor: { bytes: Uint8Array; area: number } | null = null;
  for (const [, ref] of xobjects.entries()) {
    const flujo = contexto.lookup(ref);
    if (!(flujo instanceof PDFRawStream)) continue;
    const dict = flujo.dict;
    if (dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;

    const filtro = dict.get(PDFName.of('Filter'));
    const filtros = filtro instanceof PDFArray ? filtro.asArray() : filtro ? [filtro] : [];
    const nombres = filtros.map((f) => f.toString());
    if (nombres[nombres.length - 1] !== '/DCTDecode') continue; // solo JPEG (lo normal en fotos y escaneos)

    let bytes: Uint8Array = flujo.contents;
    for (const nombre of nombres.slice(0, -1)) {
      if (nombre !== '/FlateDecode') {
        bytes = new Uint8Array();
        break;
      }
      bytes = inflateSync(bytes);
    }
    if (bytes.length === 0) continue;

    const ancho = Number(dict.get(PDFName.of('Width'))?.toString() ?? 0);
    const alto = Number(dict.get(PDFName.of('Height'))?.toString() ?? 0);
    if (!mejor || ancho * alto > mejor.area) mejor = { bytes, area: ancho * alto };
  }
  return mejor?.bytes ?? null;
}

/**
 * Versión limpia de un PDF escaneado o de una imagen. Devuelve null si el documento no es un escaneo que se pueda
 * limpiar (por ejemplo, un PDF de texto o con imágenes en un formato no compatible): entonces se muestra el original.
 */
export async function limpiarDocumento(contenido: Uint8Array, mime: string): Promise<{ contenido: Buffer; mime: string } | null> {
  if (mime.startsWith('image/')) {
    return { contenido: await limpiarImagen(contenido), mime: 'image/jpeg' };
  }
  if (mime !== 'application/pdf') return null;

  const original = await PDFDocument.load(contenido, { ignoreEncryption: true });
  const salida = await PDFDocument.create();
  salida.setTitle('Versión limpia del escaneo (generada por CrediLote; el original se conserva)');

  for (const pagina of original.getPages()) {
    const imagen = imagenDePagina(pagina);
    if (!imagen) return null;
    const jpg = await salida.embedJpg(await limpiarImagen(imagen));
    const { width, height } = pagina.getSize();
    const nueva = salida.addPage([width, height]);
    nueva.setRotation(pagina.getRotation());
    const escala = Math.min(width / jpg.width, height / jpg.height);
    nueva.drawImage(jpg, {
      x: (width - jpg.width * escala) / 2,
      y: (height - jpg.height * escala) / 2,
      width: jpg.width * escala,
      height: jpg.height * escala,
    });
  }
  return { contenido: Buffer.from(await salida.save()), mime: 'application/pdf' };
}
