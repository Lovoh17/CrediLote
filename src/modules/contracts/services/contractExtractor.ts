import { ExtraerDatosPromesaResult, Lote, TipoDocumentoExtraido } from '@/shared/types';
import {
  lambertElSalvadorToWGS84,
  calcularPoligonal,
  esPuntoLambertValido,
  dentroDeElSalvador,
  parseRumbo,
  TramoRumbo,
  PuntoLambert,
} from '@/shared/utils/geoElSalvador';
import { reconciliarTramos, tramosCuadran } from './verificacionTramos';

// Proxy local del servidor de Vite (vite.config.ts): agrega la clave GEMINI_API_KEY en el servidor.
// La clave nunca está en el código del navegador.
const GEMINI_PROXY_URL = '/api/gemini/v1beta/models';

/** Error que detiene la cascada de modelos (clave inválida, solicitud mal formada, etc.). */
class ErrorNoRecuperable extends Error {}

/**
 * Modelos en orden de preferencia (verificados con models.list y una consulta de prueba el 2026-10-01).
 * Si uno está saturado (503), sin cuota (429), con error interno (500) o tarda demasiado, se reintenta y
 * luego se prueba el siguiente. Si un nombre deja de existir (404), se salta.
 */
export const FALLBACK_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.6-flash', // en la prueba del 2026-10-01 respondió completo en ~8 s mientras los demás estaban saturados
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3-flash-preview',
];

/** Estados temporales: vale la pena reintentar el mismo modelo tras una espera. */
const ESTADOS_TEMPORALES = new Set([429, 500, 503]);
const INTENTOS_POR_MODELO = 2;
const ESPERA_BASE_MS = 4000;
const ESPERA_MAXIMA_MS = 20000;
/** Un PDF escaneado grande puede tardar; pasado este tiempo se prueba otro modelo. */
const TIEMPO_MAXIMO_POR_INTENTO_MS = 150_000;

export interface ExtractorProgressCallback {
  (status: string): void;
}

/**
 * Convierte un archivo File a base64 puro (sin prefijo data:...)
 */
export async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [header, base64] = dataUrl.split(',');
      const mimeType = header.match(/:(.*?);/)?.[1] || file.type || 'application/pdf';
      resolve({ base64, mimeType });
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

// Todos los ejemplos de este prompt son FICTICIOS. No copiar aquí datos de contratos reales.
const SYSTEM_INSTRUCTION = `Eres un asistente legal, contable y topográfico experto en escrituras notariales y contratos de promesa de compraventa de inmuebles, segregaciones y lotificaciones en El Salvador.
Tu tarea es analizar minuciosamente el documento proporcionado (PDF digital, escaneo notarial o imágenes de hojas protocolizadas) y extraer todos los datos estructurados en formato JSON.

REGLAS DE INTERPRETACIÓN NOTARIAL SALVADOREÑA:
0. TIPO DE DOCUMENTO: indica qué es el documento en "tipoDocumento":
   - "PROMESA_COMPRAVENTA": promesa de venta (comprador, precio, prima y cuotas).
   - "COMPRAVENTA": escritura de compraventa definitiva.
   - "REMEDICION": remedición o establecimiento de cabida de un inmueble (no hay comprador ni precio).
   - "SEGREGACION": segregación o desmembración sin venta.
   - "OTRO": cualquier otro documento.
   Si no es una promesa ni una compraventa, igual extrae el inmueble y la descripción técnica, y devuelve null en los datos que no aparezcan.

1. NÚMEROS Y DOCUMENTOS EN LETRAS (MUY IMPORTANTE):
   - En las escrituras notariales de El Salvador, las cantidades y documentos suelen escribirse enteramente en letras por solemnidad legal.
   - DUI en letras: "cero cuatro cinco uno dos tres siete ocho - ocho" debe convertirse al formato numérico estándar "04512378-8".
   - Cantidades monetarias en letras: "VEINTE MIL DÓLARES" -> 20000; "CUATRO MIL CUATROCIENTOS DÓLARES" -> 4400; "QUINIENTOS TREINTA Y UN DÓLARES CON CUARENTA Y TRES CENTAVOS" -> 531.43.
   - Plazos en letras: "DOCE MESES" -> 12; "TREINTA Y SEIS MESES" -> 36.
   - Fechas de otorgamiento y corte: "quince de marzo del año dos mil veintiséis" -> día 15.
   - Superficies en letras: "OCHOCIENTOS CINCUENTA PUNTO VEINTICINCO METROS CUADRADOS" -> 850.25.

2. PARTES CONTRATANTES:
   - "EL PROMITENTE VENDEDOR": Nombre completo, edad, profesión, domicilio y DUI/NIT.
   - "EL PROMITENTE COMPRADOR": Nombre completo, edad, profesión, domicilio y DUI/NIT.
   - Teléfono o WhatsApp: si se menciona en el texto.

3. INMUEBLE Y DESCRIPCIÓN TÉCNICA:
   - Denominación: si es un lote en residencial (ej. "Lote 14, Bloque A") o una segregación rústica (ej. "Porción segregada de 850.25 m2").
   - Matrícula del CNR si se menciona (ej. 12345678-00000).
   - Superficie: área en metros cuadrados (m2). Si solo viene en varas cuadradas, convertir con 1 v2 = 0.698737 m2.
   - Punto de partida: es SIEMPRE el primer punto que aparece con coordenadas, aunque el documento NO diga que de ahí se
     parte ni lo llame "punto de partida" (puede decir "mojón uno", "vértice Nor Poniente", "punto 1", "esquina", o solo dar las
     coordenadas junto a la descripción o en una tabla). Devuelve sus coordenadas Lambert El Salvador en metros en
     "puntoPartidaLambert" (NORTE ~ 200,000-350,000 y ESTE ~ 400,000-700,000; si vienen como "Y" y "X", Y es NORTE y X es ESTE).
     Ejemplo: "NORTE doscientos cincuenta mil ciento veinte punto cincuenta, ESTE quinientos ochenta mil trescientos cuarenta punto veinticinco" -> { "norte": 250120.50, "este": 580340.25 }.
   - "verticesLambert": si el documento o el plano trae las coordenadas Lambert de varios vértices (lista o tabla), devuélvelas
     TODAS en el orden en que aparecen; la primera es el punto de partida. Si solo hay una coordenada o ninguna, [] .
   - Tramos de rumbos y distancias: incluir TODOS los tramos de TODOS los linderos (Norte, Oriente, Sur, Poniente), en el mismo orden en que aparecen en la descripción técnica, empezando en el punto de partida.
     Las páginas del escaneo pueden venir desordenadas: guíate por el número de página y la continuidad del texto.
     Si la descripción técnica aparece más de una vez (en la promesa y otra vez en el acta notarial), compara las copias
     tramo por tramo. Lee con cuidado los números en letras: "once punto cero dos" es 11.02 (no 1.02).
     Cada tramo se devuelve DESCOMPUESTO:
       * "inicio": "N" para Norte, "S" para Sur.
       * "grados", "minutos", "segundos": números.
       * "fin": "E" para Este u Oriente; "W" para Oeste o Poniente. ¡No confundir Oeste con Este!
       * "distancia": metros.
     Ejemplo: "rumbo Sur cuarenta y cinco grados diez minutos veinte segundos Oeste con una distancia de doce punto cincuenta metros"
       -> { "inicio": "S", "grados": 45, "minutos": 10, "segundos": 20, "fin": "W", "distancia": 12.50 }.
   - "referenciaPartida": cómo nombra el documento el primer punto, donde empieza el tramo 1 (ej. "vértice Nor Poniente", "mojón uno"), aunque no tenga coordenadas. Si no lo nombra, null.
   - "linderos": por cada lindero, cuántos tramos DICE el documento que tiene. Copia el número del texto, no cuentes los tramos tú.
     Ejemplos: "LINDERO NORTE ... formado por diez tramos" -> { "nombre": "NORTE", "tramosDeclarados": 10 };
     "AL PONIENTE: Consta de seis tramos rectos" -> { "nombre": "PONIENTE", "tramosDeclarados": 6 }; "consta de un tramo recto" -> 1.
     Si el documento no dice cuántos tramos tiene un lindero, devuelve "tramosDeclarados": null.
     En "colindante" copia con quién o con qué colinda ese lindero, tal como lo dice el documento
     (ej. "Resto del Inmueble, calle de por medio"); si no lo dice, null.
   - No inventes coordenadas. Si el documento no trae coordenadas geográficas (latitud/longitud), devuelve "coordenadasWGS84": [].
     Si las trae, devuélvelas en el orden del documento: la primera también es el punto de partida.
     Si vienen en grados, minutos y segundos, conviértelas a grados decimales: grados + minutos/60 + segundos/3600,
     negativo para Sur y para Oeste/Poniente. Ejemplo: 13°18'12.9" N, 87°59'20.3" O -> { "lat": 13.30358, "lng": -87.98897 }.
     ¡No confundas los rumbos de los tramos (dirección, ej. "Norte 80°11'33" Este") con coordenadas: un rumbo no es una posición!

4. CONDICIONES FINANCIERAS (DÓLARES USD):
   - precioPactado: Precio total convenido.
   - primaEntregada: Anticipo o prima recibida al firmar.
   - plazoMeses: Número de cuotas mensuales pactadas.
   - tasaInteresAnual: Si no se estipula interés o la cuota es exactamente (precio - prima) / plazo, la tasa es 0 y el sistema es "DIRECTO_SIN_INTERES". Si hay tasa pactada con cuota fija nivelada, usar "FRANCES".
   - diaCortePago: Día del mes acordado para el pago.
   - Si un dato no aparece en el documento, devuelve null en ese campo. No lo inventes.
   - Los montos se devuelven como número sin símbolo ni separador de miles (20000, no "$20,000.00").

5. CONFIANZA: porcentaje de 0 a 100 por grupo (partes, financiero, coordenadas).

DEBES RETORNAR ÚNICAMENTE UN OBJETO JSON VÁLIDO CON ESTA ESTRUCTURA:
{
  "tipoDocumento": "PROMESA_COMPRAVENTA" | "COMPRAVENTA" | "REMEDICION" | "SEGREGACION" | "OTRO",
  "vendedorNombre": string,
  "vendedorDni": string,
  "compradorNombre": string,
  "compradorDni": string,
  "compradorTelefono": string,
  "proyectoNombre": string,
  "codigoLote": string,
  "bloqueManzana": string,
  "areaM2": number,
  "precioPactado": number,
  "primaEntregada": number,
  "plazoMeses": number,
  "tasaInteresAnual": number,
  "sistemaAmortizacion": "FRANCES" | "DIRECTO_SIN_INTERES" | "ALEMAN",
  "diaCortePago": number,
  "puntoPartidaLambert": { "norte": number, "este": number } | null,
  "verticesLambert": [
    { "norte": number, "este": number }
  ],
  "referenciaPartida": string | null,
  "linderos": [
    { "nombre": string, "tramosDeclarados": number | null, "colindante": string | null }
  ],
  "tramosRumbosYDistancias": [
    { "inicio": "N" | "S", "grados": number, "minutos": number, "segundos": number, "fin": "E" | "W", "distancia": number }
  ],
  "coordenadasWGS84": [
    { "lat": number, "lng": number }
  ],
  "confianza": {
    "partes": number,
    "financiero": number,
    "coordenadas": number
  }
}`;

/**
 * Normaliza un tramo devuelto por el modelo. Acepta el formato descompuesto
 * ({ inicio, grados, minutos, segundos, fin, distancia }) o el antiguo ({ rumbo: string, distancia }).
 * Lanza un error si no se puede interpretar.
 */
export function normalizarTramo(raw: any): TramoRumbo {
  const distancia = Number(raw?.distancia);
  if (!Number.isFinite(distancia) || distancia <= 0) {
    throw new Error('distancia no válida');
  }

  if (typeof raw?.rumbo === 'string' && raw.inicio === undefined) {
    return { ...parseRumbo(raw.rumbo), distancia };
  }

  const inicio = String(raw?.inicio ?? '').trim().toUpperCase();
  const finRaw = String(raw?.fin ?? '').trim().toUpperCase();
  const fin = finRaw === 'O' || finRaw.startsWith('OES') || finRaw.startsWith('PON') ? 'W' : finRaw.charAt(0);
  const grados = Number(raw?.grados);
  const minutos = Number(raw?.minutos ?? 0);
  const segundos = Number(raw?.segundos ?? 0);

  if (
    !['N', 'S'].includes(inicio.charAt(0)) ||
    !['E', 'W'].includes(fin) ||
    !Number.isFinite(grados) ||
    grados > 90 ||
    !(minutos >= 0 && minutos < 60) ||
    !(segundos >= 0 && segundos < 60)
  ) {
    throw new Error('rumbo incompleto o fuera de rango');
  }

  return {
    inicio: inicio.charAt(0) as 'N' | 'S',
    grados,
    minutos,
    segundos,
    fin: fin as 'E' | 'W',
    distancia,
  };
}

/**
 * Convierte a número lo que devuelva el modelo: 20000, "20000", "$20,000.00" o "12 meses".
 * Devuelve 0 si no hay número (null, texto en letras, etc.).
 */
export function aNumero(valor: unknown): number {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  if (typeof valor !== 'string') return 0;
  const limpio = valor.replace(/[^\d.-]/g, '');
  const n = limpio ? Number(limpio) : 0;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Latitud o longitud a grados decimales. Acepta números o texto en grados, minutos y segundos
 * ("13°18'12.9\" N", "87 59 20.3 O"): grados + minutos/60 + segundos/3600, negativo para Sur y Oeste/Poniente.
 */
export function aGradosDecimales(valor: unknown): number {
  if (typeof valor === 'number') return valor;
  if (typeof valor !== 'string') return Number.NaN;
  const texto = valor.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const numeros = (texto.replace(/(\d),(\d)/g, '$1.$2').match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (numeros.length === 0) return Number.NaN;
  const [grados, minutos = 0, segundos = 0] = numeros;
  const negativo = /^\s*-/.test(texto) || /\b(S|SUR|W|O|OESTE|PONIENTE)\b/.test(texto);
  const decimal = grados + minutos / 60 + segundos / 3600;
  return negativo ? -decimal : decimal;
}

/**
 * En El Salvador la longitud es Oeste (negativa). Corrige el signo olvidado y la latitud/longitud intercambiadas
 * cuando así el punto cae dentro del país; si no, lo deja como vino.
 */
function corregirCoordenadaElSalvador(c: { lat: number; lng: number }): { lat: number; lng: number } {
  if (dentroDeElSalvador(c)) return c;
  const candidatos = [
    { lat: c.lat, lng: -c.lng },
    { lat: c.lng, lng: c.lat },
    { lat: c.lng, lng: -c.lat },
  ];
  return candidatos.find(dentroDeElSalvador) ?? c;
}

/** Linderos del documento como texto para el lote: "10 tramos · Resto del Inmueble, calle de por medio". */
function describirLinderos(linderos: { nombre: string; tramos: number; colindante: string }[]): Lote['linderos'] {
  const clave = (nombre: string): keyof NonNullable<Lote['linderos']> | null =>
    /NORTE/.test(nombre) ? 'norte' : /SUR/.test(nombre) ? 'sur' : /ORIENTE|ESTE/.test(nombre) ? 'este' : /PONIENTE|OESTE/.test(nombre) ? 'oeste' : null;
  const resultado: NonNullable<Lote['linderos']> = {};
  for (const l of linderos) {
    const k = clave(l.nombre);
    const texto = [l.tramos > 0 ? `${l.tramos} tramo${l.tramos === 1 ? '' : 's'}` : '', l.colindante].filter(Boolean).join(' · ');
    if (k && texto) resultado[k] = resultado[k] ? `${resultado[k]}; ${texto}` : texto;
  }
  return Object.keys(resultado).length > 0 ? resultado : undefined;
}

type PuntoLeido = PuntoLambert & { invertido?: boolean };

/**
 * Punto Lambert como lo devuelva el modelo: { norte, este } o { y, x } (Y es Norte y X es Este). Si Norte y Este
 * vienen intercambiados (el Norte del país está por debajo de 400,000 y el Este por encima), se corrigen.
 */
function leerPuntoLambert(raw: any): PuntoLeido | null {
  if (!raw || typeof raw !== 'object') return null;
  const norte = aNumero(raw.norte ?? raw.y ?? raw.Y);
  const este = aNumero(raw.este ?? raw.x ?? raw.X);
  if (esPuntoLambertValido({ norte, este })) return { norte, este };
  if (esPuntoLambertValido({ norte: este, este: norte })) return { norte: este, este: norte, invertido: true };
  return null;
}

/** Confianza en porcentaje 0–100. Algunos modelos la devuelven como fracción (0.95 en vez de 95). */
function aPorcentaje(valor: unknown, porDefecto: number): number {
  if (valor === null || valor === undefined || valor === '') return porDefecto;
  const n = aNumero(valor);
  return Math.round(Math.min(100, Math.max(0, n > 0 && n <= 1 ? n * 100 : n)));
}

function normalizarTipoDocumento(valor: unknown): TipoDocumentoExtraido | undefined {
  const t = String(valor ?? '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!t) return undefined;
  if (t.includes('PROMESA')) return 'PROMESA_COMPRAVENTA';
  if (t.includes('REMEDI') || t.includes('CABIDA')) return 'REMEDICION';
  if (t.includes('SEGREG') || t.includes('DESMEMBR')) return 'SEGREGACION';
  if (t.includes('COMPRAVENTA') || t.includes('VENTA')) return 'COMPRAVENTA';
  return 'OTRO';
}

const DESCRIPCION_TIPO: Record<TipoDocumentoExtraido, string> = {
  PROMESA_COMPRAVENTA: 'una promesa de venta',
  COMPRAVENTA: 'una escritura de compraventa',
  REMEDICION: 'un acta de remedición de inmueble',
  SEGREGACION: 'una escritura de segregación',
  OTRO: 'otro tipo de documento',
};

export function normalizeExtractedData(parsed: any): ExtraerDatosPromesaResult {
  const avisos: string[] = [];

  // 0. Tipo de documento: si no es una promesa ni una compraventa, no trae comprador, precio ni prima
  const tipoDocumento = normalizarTipoDocumento(parsed.tipoDocumento);
  if (tipoDocumento && tipoDocumento !== 'PROMESA_COMPRAVENTA' && tipoDocumento !== 'COMPRAVENTA') {
    avisos.push(
      `Este documento parece ser ${DESCRIPCION_TIPO[tipoDocumento]}, no una promesa de venta. ` +
        'Verifique que subió el archivo correcto; si continúa, ingrese a mano el comprador, el precio, la prima y el plazo.'
    );
  }

  // 1. Comprador
  const compradorNombre =
    parsed.compradorNombre ||
    parsed.promitente_compradora?.nombre ||
    parsed.promitente_comprador?.nombre ||
    parsed.comprador?.nombre ||
    '';

  const compradorDni =
    parsed.compradorDni ||
    parsed.promitente_compradora?.dui ||
    parsed.promitente_comprador?.dui ||
    parsed.comprador?.dui ||
    '';

  const compradorTelefono =
    parsed.compradorTelefono ||
    parsed.promitente_compradora?.telefono ||
    parsed.promitente_comprador?.telefono ||
    parsed.comprador?.telefono ||
    '';

  // 2. Vendedor
  const vendedorNombre =
    parsed.vendedorNombre ||
    parsed.promitente_vendedora?.nombre ||
    parsed.promitente_vendedor?.nombre ||
    parsed.promitente_vendedora?.razon_social ||
    parsed.vendedor?.nombre ||
    '';

  // 3. Inmueble y Proyecto
  const proyectoNombre =
    parsed.proyectoNombre || parsed.objeto_inmueble?.lotificacion || parsed.objeto_inmueble?.proyecto || '';

  const areaM2 =
    aNumero(parsed.areaM2) ||
    aNumero(parsed.objeto_inmueble?.extension_superficial?.metros_cuadrados) ||
    aNumero(parsed.objeto_inmueble?.areaM2);

  let codigoLote =
    parsed.codigoLote || parsed.objeto_inmueble?.identificacion || parsed.objeto_inmueble?.lote || '';

  // Si no se nombró explícitamente "Lote X", nombrar la porción o segregación
  if (!codigoLote || codigoLote === 'L-XX') {
    codigoLote = areaM2 ? `Porción ${Math.round(areaM2)} m²` : 'Porción Segregada 1';
  }

  const bloqueManzana =
    parsed.bloqueManzana ||
    parsed.objeto_inmueble?.poligono ||
    parsed.objeto_inmueble?.bloque ||
    parsed.objeto_inmueble?.manzana ||
    'Polígono Único';

  // 4. Condiciones Financieras
  const precioPactado = aNumero(parsed.precioPactado) || aNumero(parsed.condiciones_financieras?.precio_total);

  const primaEntregada = aNumero(parsed.primaEntregada) || aNumero(parsed.condiciones_financieras?.prima_inicial);

  if (!precioPactado) {
    avisos.push('El documento no indica el precio de venta. Ingréselo antes de confirmar (no se registran ventas de $0).');
  } else if (!primaEntregada) {
    avisos.push('No se encontró la prima. Si el comprador entregó prima, ingrésela antes de confirmar.');
  }

  let plazoMeses = aNumero(parsed.plazoMeses) || aNumero(parsed.condiciones_financieras?.plazo_meses);
  if (!plazoMeses) {
    plazoMeses = 12;
    avisos.push('No se detectó el plazo; se propuso 12 meses. Verifíquelo.');
  }

  let tasaInteresAnual =
    aNumero(parsed.tasaInteresAnual) || aNumero(parsed.condiciones_financieras?.tasa_interes_anual);

  let diaCortePago = aNumero(parsed.diaCortePago) || aNumero(parsed.condiciones_financieras?.dia_pago_mensual);
  if (!diaCortePago || diaCortePago < 1 || diaCortePago > 31) {
    diaCortePago = 15;
    avisos.push('No se detectó el día de pago; se propuso el día 15. Verifíquelo.');
  }

  let sistemaAmortizacion: 'FRANCES' | 'DIRECTO_SIN_INTERES' | 'ALEMAN' = 'FRANCES';
  const sisRaw = String(parsed.sistemaAmortizacion || parsed.condiciones_financieras?.sistema_amortizacion || '').toUpperCase();

  if (sisRaw.includes('ALEMAN')) {
    sistemaAmortizacion = 'ALEMAN';
  } else if (sisRaw.includes('DIRECT') || sisRaw.includes('SIN INTERES') || tasaInteresAnual === 0) {
    sistemaAmortizacion = 'DIRECTO_SIN_INTERES';
    tasaInteresAnual = 0;
  }

  // 5. Geoespacial (RN-G1, RN-G2). El punto de partida es SIEMPRE el primer punto con coordenadas, aunque el
  // documento no diga que de ahí se parte: el punto Lambert indicado o, si no, el primero de la tabla de vértices.
  const verticesLeidos: (PuntoLeido | null)[] = (Array.isArray(parsed.verticesLambert) ? parsed.verticesLambert : []).map(
    leerPuntoLambert
  );
  const verticesLambert = verticesLeidos.filter((p): p is PuntoLeido => !!p);
  const puntoRaw = parsed.puntoPartidaLambert || parsed.objeto_inmueble?.mojon_uno || parsed.coordenadasOrigen;
  const puntoLeido = puntoRaw ? leerPuntoLambert(puntoRaw) : null;
  const primerPunto = puntoLeido ?? verticesLambert[0];
  const puntoPartida: PuntoLambert | undefined = primerPunto ? { norte: primerPunto.norte, este: primerPunto.este } : undefined;
  if (puntoRaw && !puntoLeido) {
    avisos.push('Se detectó un punto de partida, pero no parece una coordenada Lambert de El Salvador. Verifíquelo.');
  }
  if (primerPunto?.invertido || verticesLambert.some((p) => p.invertido)) {
    avisos.push('Las coordenadas Lambert venían con Norte y Este intercambiados; se corrigieron. Verifíquelas con el documento.');
  }
  if (verticesLeidos.length > verticesLambert.length) {
    avisos.push(
      `${verticesLeidos.length - verticesLambert.length} coordenada(s) de vértices no parecen Lambert de El Salvador y se omitieron.`
    );
  }

  const referenciaPartida =
    typeof parsed.referenciaPartida === 'string' && parsed.referenciaPartida.trim() ? parsed.referenciaPartida.trim() : undefined;

  const tramosRaw: any[] = Array.isArray(parsed.tramosRumbosYDistancias)
    ? parsed.tramosRumbosYDistancias
    : Array.isArray(parsed.objeto_inmueble?.tramos)
    ? parsed.objeto_inmueble.tramos
    : [];

  const tramos: TramoRumbo[] = [];
  tramosRaw.forEach((raw, i) => {
    try {
      tramos.push(normalizarTramo(raw));
    } catch (err: any) {
      avisos.push(`Tramo ${i + 1} omitido (${err.message}). Agréguelo manualmente en la tabla de tramos.`);
    }
  });

  // Tramos que el documento dice tener cada lindero: si se leyeron menos, falta una página del PDF o el
  // modelo omitió tramos (caso real: un acta de 21 tramos llegó sin la página del lindero poniente).
  const linderosLeidos: { nombre: string; tramos: number; colindante: string }[] = (
    Array.isArray(parsed.linderos) ? parsed.linderos : []
  ).map((l: any) => ({
    nombre: String(l?.nombre ?? '').trim().toUpperCase(),
    tramos: Math.round(aNumero(l?.tramosDeclarados)),
    colindante: typeof l?.colindante === 'string' ? l.colindante.trim() : '',
  }));
  // Solo se compara si el documento declara los tramos de todos sus linderos (si no, la suma sería parcial)
  const linderos = linderosLeidos.every((l) => l.tramos > 0) ? linderosLeidos : [];
  const tramosDeclarados = linderos.reduce((suma, l) => suma + l.tramos, 0) || undefined;
  if (tramosDeclarados && tramosDeclarados !== tramosRaw.length) {
    const detalle = linderos.map((l) => `${l.nombre || 'lindero'}: ${l.tramos}`).join(', ');
    avisos.push(
      tramosDeclarados > tramosRaw.length
        ? `El documento dice que la descripción tiene ${tramosDeclarados} tramos (${detalle}), pero solo se leyeron ` +
            `${tramosRaw.length}. Puede faltar una página del PDF o el modelo omitió tramos: sin todos los tramos el ` +
            'polígono no cierra y el lote no se dibuja bien.'
        : `Se leyeron ${tramosRaw.length} tramos, pero el documento dice que son ${tramosDeclarados} (${detalle}). ` +
            'Revise si hay tramos repetidos.'
    );
  }

  let coordenadas: { lat: number; lng: number }[] = [];

  if (puntoPartida && tramos.length > 0) {
    const origen = lambertElSalvadorToWGS84(puntoPartida.este, puntoPartida.norte);
    coordenadas = calcularPoligonal(origen, tramos).vertices;
  } else if (verticesLambert.length >= 3) {
    // Sin tramos, pero con la tabla de coordenadas de los vértices: el polígono sale directo de ella
    coordenadas = verticesLambert.map((p) => lambertElSalvadorToWGS84(p.este, p.norte));
  } else if (puntoPartida) {
    // RN-G2: sin tramos no hay polígono. No se dibuja una figura inventada.
    avisos.push(
      'Solo se detectó el mojón de partida. El lote quedará sin polígono hasta que se agreguen los tramos de rumbo y distancia.'
    );
  } else {
    // Tramos sin punto de partida: el aviso lo da la revisión de geometría del formulario (junto con el cierre)
    const coordsRaw = parsed.coordenadasWGS84 || parsed.coordenadas || parsed.objeto_inmueble?.vertices_gps || [];
    if (Array.isArray(coordsRaw)) {
      const leidas = coordsRaw
        .map((c: any) => ({ lat: aGradosDecimales(c?.lat ?? c?.latitud), lng: aGradosDecimales(c?.lng ?? c?.longitud) }))
        .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && c.lat !== 0 && c.lng !== 0);
      coordenadas = leidas.map(corregirCoordenadaElSalvador);
      if (coordenadas.some((c, i) => c.lat !== leidas[i].lat || c.lng !== leidas[i].lng)) {
        avisos.push(
          'Algunas coordenadas venían sin el signo del Oeste o con latitud y longitud intercambiadas; se corrigieron. Verifíquelas.'
        );
      }
    }
    // La primera latitud/longitud también es el punto de partida: con tramos, el polígono sale de ahí
    if (tramos.length > 0 && coordenadas.length > 0 && dentroDeElSalvador(coordenadas[0])) {
      coordenadas = calcularPoligonal(coordenadas[0], tramos).vertices;
    }
  }

  // Ni forma ni ubicación (típico de los lotes de una lotificación: solo número, polígono, área y matrícula)
  if (tramos.length === 0 && coordenadas.length === 0 && !puntoPartida) {
    avisos.push(
      'El documento no trae descripción técnica (rumbos y distancias) ni coordenadas: no hay con qué dibujar el lote. ' +
        'Si el lote ya está en el catálogo del proyecto con su polígono (por ejemplo, cargado del plano de la lotificación), ' +
        'use el mismo código de lote y se conservará su dibujo.'
    );
  }

  return {
    tipoDocumento,
    vendedorNombre,
    compradorNombre,
    compradorDni,
    compradorTelefono,
    proyectoNombre,
    codigoLote,
    bloqueManzana,
    areaM2,
    precioPactado,
    primaEntregada,
    plazoMeses,
    tasaInteresAnual,
    sistemaAmortizacion,
    diaCortePago,
    coordenadas,
    puntoPartida,
    referenciaPartida,
    tramos,
    tramosDeclarados,
    linderos: describirLinderos(linderosLeidos),
    avisos,
    confianza: {
      partes: aPorcentaje(parsed.confianza?.partes, compradorNombre && compradorDni ? 90 : 60),
      financiero: precioPactado ? aPorcentaje(parsed.confianza?.financiero, primaEntregada ? 90 : 60) : 0,
      // Sin polígono no hay coordenadas que confirmar, aunque el modelo diga 100 %
      coordenadas: coordenadas.length >= 3 ? aPorcentaje(parsed.confianza?.coordenadas, 90) : 0,
    },
  };
}

export interface OpcionesConsulta {
  modelos?: string[];
  intentosPorModelo?: number;
  /** Espera entre reintentos (inyectable en pruebas). */
  esperar?: (ms: number) => Promise<void>;
  fetch?: typeof fetch;
  tiempoMaximoMs?: number;
}

const esperarReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Espera sugerida por Google (cabecera Retry-After o detalle RetryInfo del error), en milisegundos. */
function esperaSugeridaMs(respuesta: Response, cuerpo: string): number | null {
  const cabecera = Number(respuesta.headers.get('retry-after'));
  if (cabecera > 0) return cabecera * 1000;
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(cuerpo);
  return m ? Number(m[1]) * 1000 : null;
}

const DESCRIPCION_ESTADO: Record<string, string> = {
  '429': 'sin cuota disponible (429)',
  '500': 'con error interno (500)',
  '503': 'saturado (503)',
  '404': 'no disponible (404)',
  tiempo: 'sin respuesta a tiempo',
  red: 'con error de conexión',
};

/**
 * Envía el payload a Gemini a través del proxy local, con reintentos y cascada de modelos.
 * Devuelve el texto de la respuesta (JSON en texto).
 */
export async function consultarGemini(
  payload: unknown,
  onProgress?: ExtractorProgressCallback,
  opciones: OpcionesConsulta = {}
): Promise<string> {
  const modelos = opciones.modelos ?? FALLBACK_MODELS;
  const intentos = opciones.intentosPorModelo ?? INTENTOS_POR_MODELO;
  const esperar = opciones.esperar ?? esperarReal;
  const hacerFetch = opciones.fetch ?? fetch;
  const tiempoMaximo = opciones.tiempoMaximoMs ?? TIEMPO_MAXIMO_POR_INTENTO_MS;
  const cuerpo = JSON.stringify(payload);
  const resultados: { modelo: string; estado: string }[] = [];

  for (const modelo of modelos) {
    for (let intento = 1; intento <= intentos; intento++) {
      onProgress?.(
        intento === 1
          ? `Analizando documento notarial con ${modelo}...`
          : `Reintentando con ${modelo} (intento ${intento} de ${intentos})...`
      );

      const control = new AbortController();
      const temporizador = setTimeout(() => control.abort(), tiempoMaximo);
      let respuesta: Response;
      try {
        respuesta = await hacerFetch(`${GEMINI_PROXY_URL}/${modelo}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: cuerpo,
          signal: control.signal,
        });
      } catch (err) {
        clearTimeout(temporizador);
        const porTiempo = (err as { name?: string })?.name === 'AbortError';
        resultados.push({ modelo, estado: porTiempo ? 'tiempo' : 'red' });
        console.warn(`Gemini ${modelo}: ${porTiempo ? 'tiempo agotado' : 'error de red'}`, err);
        break; // probar el siguiente modelo
      }
      clearTimeout(temporizador);

      if (respuesta.ok) {
        const data = await respuesta.json();
        // Algunos modelos dividen la respuesta en varias partes (y pueden incluir partes de razonamiento)
        const partes: { text?: string; thought?: boolean }[] = data?.candidates?.[0]?.content?.parts ?? [];
        const texto = partes.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
        if (!texto) throw new ErrorNoRecuperable('La respuesta de Gemini no contiene datos estructurados.');
        return texto;
      }

      const errorTexto = await respuesta.text();
      console.warn(`Gemini ${modelo} (${respuesta.status}):`, errorTexto.slice(0, 300));
      if (errorTexto.includes('GEMINI_API_KEY')) {
        throw new ErrorNoRecuperable('No se ha configurado GEMINI_API_KEY en .env.local. Agréguela y reinicie el servidor (npm run dev).');
      }
      if (respuesta.status === 404) {
        resultados.push({ modelo, estado: '404' });
        break;
      }
      if (!ESTADOS_TEMPORALES.has(respuesta.status)) {
        // 400, 401, 403…: clave inválida o solicitud rechazada; otro modelo no lo resolvería
        throw new ErrorNoRecuperable(`Gemini rechazó la solicitud (${respuesta.status}): ${errorTexto.slice(0, 300)}`);
      }

      resultados.push({ modelo, estado: String(respuesta.status) });
      if (intento < intentos) {
        const espera = Math.min(esperaSugeridaMs(respuesta, errorTexto) ?? ESPERA_BASE_MS * intento, ESPERA_MAXIMA_MS);
        onProgress?.(`${modelo} está ${DESCRIPCION_ESTADO[String(respuesta.status)] ?? 'ocupado'}; reintentando en ${Math.round(espera / 1000)} s...`);
        await esperar(espera);
      }
    }
  }

  // Ningún modelo respondió: mensaje claro con el detalle de cada uno
  const ultimoPorModelo = new Map(resultados.map((r) => [r.modelo, r.estado]));
  const detalle = [...ultimoPorModelo].map(([m, e]) => `${m} ${DESCRIPCION_ESTADO[e] ?? e}`).join('; ');
  const sinCuota = [...ultimoPorModelo.values()].includes('429');
  throw new Error(
    `Gemini no está disponible en este momento${sinCuota ? ' (algún modelo alcanzó el límite de uso de la clave)' : ': los servidores de Google están saturados'}. ` +
      `Espere unos minutos e intente de nuevo; el archivo no se perdió. Detalle: ${detalle}.`
  );
}

/** Para releer solo la descripción técnica cuando los tramos de la primera lectura no cuadran. */
const INSTRUCCION_SOLO_TRAMOS = `Eres un topógrafo de El Salvador. Del documento adjunto transcribe SOLO la descripción técnica del inmueble:
todos los tramos de rumbo y distancia de todos los linderos (Norte, Oriente, Sur, Poniente), en el orden del documento,
empezando en el primer punto.
- Las páginas pueden venir desordenadas: guíate por el número de página y por la continuidad del texto.
- Si la descripción técnica aparece más de una vez (por ejemplo, en la promesa y otra vez en el acta notarial), compara las
  copias tramo por tramo y vuelve a leer con cuidado cualquier tramo en que no coincidan.
- Lee con cuidado los números escritos en letras: "once punto cero dos" es 11.02 (no 1.02); "cincuenta y dos minutos" es 52.
- Cada tramo, descompuesto: "inicio" "N" o "S"; "grados", "minutos", "segundos"; "fin" "E" (Este u Oriente) o "W" (Oeste o
  Poniente); "distancia" en metros.
- En "linderos", cuántos tramos dice el documento que tiene cada lindero (copia el número del texto, no los cuentes tú).
Responde SOLO este JSON:
{ "linderos": [ { "nombre": string, "tramosDeclarados": number | null } ],
  "tramosRumbosYDistancias": [ { "inicio": "N" | "S", "grados": number, "minutos": number, "segundos": number, "fin": "E" | "W", "distancia": number } ] }`;

/**
 * Lecturas de la descripción técnica: la principal y una solo de los tramos, hechas al mismo tiempo; si no coinciden
 * o no cuadran, una tercera para desempatar.
 */
const LECTURAS_MAXIMAS = 3;

const payloadDocumento = (instruccion: string, pedido: string, documento: { base64: string; mimeType: string }) => ({
  systemInstruction: { parts: [{ text: instruccion }] },
  contents: [{ parts: [{ text: pedido }, { inlineData: { mimeType: documento.mimeType, data: documento.base64 } }] }],
  generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
});

/** Tramos de una lectura de solo la descripción técnica; los que no se pueden interpretar se descartan. */
function tramosDeLectura(texto: string): TramoRumbo[] {
  const datos = JSON.parse(texto);
  const crudos: unknown[] = Array.isArray(datos?.tramosRumbosYDistancias) ? datos.tramosRumbosYDistancias : [];
  return crudos.flatMap((raw) => {
    try {
      return [normalizarTramo(raw)];
    } catch {
      return [];
    }
  });
}

/**
 * Llama a la API de Gemini para extraer los datos de un archivo contractual
 */
export async function extraerDatosPromesaConGemini(
  file: File,
  onProgress?: ExtractorProgressCallback
): Promise<ExtraerDatosPromesaResult> {
  onProgress?.('Preparando documento notarial...');
  return extraerDatosDeDocumento(await fileToBase64(file), onProgress);
}

/** Extracción a partir del documento ya codificado (separada de la lectura del archivo para poder probarla). */
export async function extraerDatosDeDocumento(
  documento: { base64: string; mimeType: string },
  onProgress?: ExtractorProgressCallback,
  opciones: OpcionesConsulta = {}
): Promise<ExtraerDatosPromesaResult> {
  const payload = payloadDocumento(
    SYSTEM_INSTRUCTION,
    'Analiza minuciosamente el documento contractual notarial adjunto y extrae los datos requeridos en formato JSON estricto.',
    documento
  );
  const payloadTramos = payloadDocumento(INSTRUCCION_SOLO_TRAMOS, 'Transcribe la descripción técnica del documento adjunto.', documento);
  // Las lecturas de verificación no esperan tanto como la principal: un intento en los dos primeros modelos
  const opcionesVerificacion = { ...opciones, modelos: (opciones.modelos ?? FALLBACK_MODELS).slice(0, 2), intentosPorModelo: 1 };
  const leerTramos = async () => tramosDeLectura(await consultarGemini(payloadTramos, undefined, opcionesVerificacion));

  // La segunda lectura de los tramos va al mismo tiempo que la principal: no agrega espera
  const [principal, segunda] = await Promise.allSettled([consultarGemini(payload, onProgress, opciones), leerTramos()]);
  if (principal.status === 'rejected') throw principal.reason;
  let parsed: any;
  let resultado: ExtraerDatosPromesaResult;
  try {
    parsed = JSON.parse(principal.value);
    resultado = normalizeExtractedData(parsed);
  } catch {
    throw new Error('Gemini respondió, pero no en el formato esperado. Intente de nuevo.');
  }
  const otras = segunda.status === 'fulfilled' ? [segunda.value] : [];
  return verificarTramosLeidos(parsed, resultado, otras, leerTramos, onProgress);
}

/**
 * Compara la primera lectura de los tramos con las demás. Si no coinciden, no cuadran o faltan tramos, pide otra
 * lectura (hasta LECTURAS_MAXIMAS) y combina las lecturas (verificacionTramos.ts). Avisa qué tramos estaban en duda.
 */
async function verificarTramosLeidos(
  parsed: any,
  primera: ExtraerDatosPromesaResult,
  otras: TramoRumbo[][],
  leerTramos: () => Promise<TramoRumbo[]>,
  onProgress: ExtractorProgressCallback | undefined
): Promise<ExtraerDatosPromesaResult> {
  const tramos = primera.tramos ?? [];
  if (tramos.length < 3) return primera;

  const area = primera.areaM2;
  const declarados = primera.tramosDeclarados;
  const lecturas: TramoRumbo[][] = [tramos, ...otras];
  let r = reconciliarTramos(lecturas, area, declarados)!;
  const faltaVerificar = () =>
    r.enDuda.length > 0 || !tramosCuadran(r.evaluacion, area) || (!!declarados && r.tramos.length !== declarados);

  while (lecturas.length < LECTURAS_MAXIMAS && faltaVerificar()) {
    onProgress?.(
      `Los tramos no coinciden entre lecturas o no cuadran: leyendo otra vez la descripción técnica (lectura ${lecturas.length + 1} de ${LECTURAS_MAXIMAS})...`
    );
    try {
      lecturas.push(await leerTramos());
    } catch {
      break; // Gemini no disponible o respuesta inválida: se queda con las lecturas que hay
    }
    r = reconciliarTramos(lecturas, area, declarados)!;
  }

  const veces = `${lecturas.length} ${lecturas.length === 1 ? 'vez' : 'veces'}`;
  const lista = (t: number[]) => (t.length === 1 ? `el tramo ${t[0]}` : `los tramos ${t.join(', ')}`);
  const cuadra = tramosCuadran(r.evaluacion, area);
  const final =
    r.corregidos.length > 0 ? normalizeExtractedData({ ...parsed, tramosRumbosYDistancias: r.tramos }) : primera;

  let aviso: string | null = null;
  if (r.enDuda.length > 0) {
    aviso = cuadra
      ? `Se leyó la descripción técnica ${veces}: ${lista(r.enDuda)} no ${r.enDuda.length === 1 ? 'coincidía' : 'coincidían'} entre lecturas y se usó la versión que más ` +
        `se repite y con la que el polígono cierra (${r.evaluacion.errorCierreM.toFixed(3)} m; área ${r.evaluacion.areaM2.toFixed(2)} m²). ` +
        `Compare ${r.enDuda.length === 1 ? 'ese tramo' : 'esos tramos'} con el documento antes de confirmar.`
      : `Se leyó la descripción técnica ${veces} y los tramos todavía no cuadran. Revise contra el documento ${lista(r.enDuda)}, ` +
        `que no ${r.enDuda.length === 1 ? 'coincidía' : 'coincidían'} entre lecturas.`;
  } else if (!cuadra) {
    aviso =
      lecturas.length === 1
        ? 'Los tramos no cuadran y no se pudo releer la descripción técnica (Gemini no respondió). Revíselos contra el documento.'
        : `Se leyó la descripción técnica ${veces} y las lecturas coinciden, pero los tramos no cuadran: puede faltar una ` +
          'página del PDF o haber un error en el propio documento. Revíselos contra el documento.';
  }
  return aviso ? { ...final, avisos: [...(final.avisos ?? []), aviso] } : final;
}
