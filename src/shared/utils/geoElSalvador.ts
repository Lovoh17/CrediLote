/**
 * Utilidades geoespaciales específicas para el catastro y escrituración de El Salvador.
 * Convierte coordenadas oficiales de El Salvador (Lambert Conformal Conic / CNR) a WGS84
 * y calcula poligonales a partir de rumbos y distancias (reglas RN-G1 a RN-G3 del vault).
 */

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Radio usado para el plano local (RN-G2). */
const RADIO_TIERRA = 6378137.0;

/** Tolerancias de RN-G2 y RN-G3. */
export const PRECISION_MINIMA_CIERRE = 1000; // error de cierre ≤ perímetro / 1000
export const TOLERANCIA_AREA_OK = 0.02; // ≤ 2 %
export const TOLERANCIA_AREA_MAX = 0.05; // > 5 % requiere confirmación

export interface CoordenadaWGS84 {
  lat: number;
  lng: number;
}

export interface PuntoLambert {
  norte: number;
  este: number;
}

/**
 * Convierte coordenadas proyectadas oficiales de El Salvador (Lambert / CNR / PNL)
 * a coordenadas geográficas WGS84 (Latitud, Longitud).
 *
 * Supone el datum SIRGAS-ES2007 (prácticamente igual a WGS84). Escrituras antiguas
 * referidas a un datum anterior pueden quedar desplazadas.
 *
 * Parámetros oficiales IGN / CNR El Salvador:
 * - Paralelos estándar: 13° 19' N (13.316667°), 14° 15' N (14.25°)
 * - Latitud de origen: 13° 47' N (13.783333°)
 * - Meridiano central: -89° 00' W (-89.0°)
 * - Falso Este: 500,000.0 m
 * - Falso Norte: 295,809.174 m
 */
export function lambertElSalvadorToWGS84(este: number, norte: number): CoordenadaWGS84 {
  const a = 6378137.0; // Semieje mayor (WGS84 / GRS80)
  const f = 1 / 298.257223563;
  const e2 = 2 * f - f * f;
  const eVal = Math.sqrt(e2);

  const phi1 = 13.31666667 * D2R;
  const phi2 = 14.25 * D2R;
  const phi0 = 13.78333333 * D2R;
  const lam0 = -89.0 * D2R;
  const ef = 500000.0;
  const nf = 295809.174;

  const m1 = Math.cos(phi1) / Math.sqrt(1 - e2 * Math.sin(phi1) * Math.sin(phi1));
  const m2 = Math.cos(phi2) / Math.sqrt(1 - e2 * Math.sin(phi2) * Math.sin(phi2));

  const t = (phi: number) =>
    Math.tan(Math.PI / 4 - phi / 2) /
    Math.pow((1 - eVal * Math.sin(phi)) / (1 + eVal * Math.sin(phi)), eVal / 2);

  const t1 = t(phi1);
  const t2 = t(phi2);
  const t0 = t(phi0);

  const nVal = (Math.log(m1) - Math.log(m2)) / (Math.log(t1) - Math.log(t2));
  const F = m1 / (nVal * Math.pow(t1, nVal));
  const rho0 = a * F * Math.pow(t0, nVal);

  const x = este - ef;
  const y = norte - nf;

  const rho = Math.sign(nVal) * Math.sqrt(x * x + (rho0 - y) * (rho0 - y));
  const theta = Math.atan2(x, rho0 - y);

  const tVal = Math.pow(rho / (a * F), 1 / nVal);

  let phi = Math.PI / 2 - 2 * Math.atan(tVal);
  for (let i = 0; i < 5; i++) {
    phi =
      Math.PI / 2 -
      2 *
        Math.atan(
          tVal * Math.pow((1 - eVal * Math.sin(phi)) / (1 + eVal * Math.sin(phi)), eVal / 2)
        );
  }

  const lam = lam0 + theta / nVal;

  return {
    lat: Number((phi * R2D).toFixed(7)),
    lng: Number((lam * R2D).toFixed(7)),
  };
}

/** Indica si un par Norte/Este parece una coordenada Lambert de El Salvador. */
export function esPuntoLambertValido(punto?: Partial<PuntoLambert> | null): punto is PuntoLambert {
  return (
    !!punto &&
    Number.isFinite(punto.norte) &&
    Number.isFinite(punto.este) &&
    (punto.norte as number) > 100000 &&
    (punto.norte as number) < 400000 &&
    (punto.este as number) > 300000 &&
    (punto.este as number) < 800000
  );
}

// ---------------------------------------------------------------------------
// Rumbos y distancias (RN-G2)
// ---------------------------------------------------------------------------

/** Tramo de una descripción técnica, con el rumbo ya descompuesto. */
export interface TramoRumbo {
  inicio: 'N' | 'S';
  grados: number;
  minutos: number;
  segundos: number;
  fin: 'E' | 'W';
  distancia: number; // metros
}

export class RumboInvalidoError extends Error {
  constructor(public readonly texto: string, motivo: string) {
    super(`Rumbo no válido "${texto}": ${motivo}`);
    this.name = 'RumboInvalidoError';
  }
}

/**
 * Convierte un rumbo escrito como texto en sus componentes.
 * Admite "Sur 64°32'05\" Este", "S 64 32 05 E", "Norte 10° Oeste", "N 80° Poniente", "N 10°00' O".
 * Lanza RumboInvalidoError si no se puede interpretar (nunca devuelve un valor por defecto).
 */
export function parseRumbo(texto: string): Omit<TramoRumbo, 'distancia'> {
  const limpio = texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Palabras completas: OESTE debe ir antes que ESTE y con límites de palabra.
    .replace(/\bNORTE\b/g, ' N ')
    .replace(/\bSUR\b/g, ' S ')
    .replace(/\b(OESTE|PONIENTE)\b/g, ' W ')
    .replace(/\b(ESTE|ORIENTE)\b/g, ' E ')
    .trim();

  const inicioMatch = limpio.match(/^([NS])\b/);
  const finMatch = limpio.match(/\b([EWO])\s*[.;,]?$/);
  if (!inicioMatch || !finMatch) {
    throw new RumboInvalidoError(texto, 'debe empezar con Norte/Sur y terminar con Este/Oeste');
  }

  const cuerpo = limpio.slice(inicioMatch[0].length, limpio.length - finMatch[0].length);
  const numeros = (cuerpo.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => Number(n.replace(',', '.')));
  if (numeros.length === 0 || numeros.length > 3) {
    throw new RumboInvalidoError(texto, 'se esperaban grados, minutos y segundos');
  }

  const [grados, minutos = 0, segundos = 0] = numeros;
  if (grados > 90 || minutos >= 60 || segundos >= 60) {
    throw new RumboInvalidoError(texto, 'grados ≤ 90, minutos y segundos < 60');
  }

  return {
    inicio: inicioMatch[1] as 'N' | 'S',
    grados,
    minutos,
    segundos,
    fin: finMatch[1] === 'E' ? 'E' : 'W',
  };
}

/** Rumbo → azimut en grados (0° = Norte, sentido horario). */
export function azimutDeRumbo(r: Omit<TramoRumbo, 'distancia'>): number {
  const angulo = r.grados + r.minutos / 60 + r.segundos / 3600;
  if (r.inicio === 'N') return r.fin === 'E' ? angulo : 360 - angulo;
  return r.fin === 'E' ? 180 - angulo : 180 + angulo;
}

/** Formato legible: N 10°00'00" E */
export function formatearRumbo(r: Omit<TramoRumbo, 'distancia'>): string {
  const pad = (n: number) => String(Math.round(n)).padStart(2, '0');
  return `${r.inicio} ${pad(r.grados)}°${pad(r.minutos)}'${pad(r.segundos)}" ${r.fin}`;
}

export interface ResultadoPoligonal {
  /** Vértices del polígono (el primero es el punto de partida; no se repite al final). */
  vertices: CoordenadaWGS84[];
  perimetroM: number;
  /** Distancia entre el punto final calculado y el de partida. */
  errorCierreM: number;
  /** Denominador de la precisión: perímetro / error de cierre (Infinity si cierra exacto). */
  precision: number;
  areaM2: number;
}

/**
 * Calcula la poligonal a partir de un punto de partida y los tramos (RN-G2),
 * en plano local (válido para lotes de menos de ~1 km).
 */
export function calcularPoligonal(origen: CoordenadaWGS84, tramos: TramoRumbo[]): ResultadoPoligonal {
  const puntos: [number, number][] = [[0, 0]]; // [Este, Norte] en metros
  let e = 0;
  let n = 0;
  let perimetro = 0;

  for (const tramo of tramos) {
    const az = azimutDeRumbo(tramo) * D2R;
    e += tramo.distancia * Math.sin(az);
    n += tramo.distancia * Math.cos(az);
    perimetro += tramo.distancia;
    puntos.push([e, n]);
  }

  const errorCierre = Math.hypot(e, n);
  // El último punto es el regreso al mojón de partida: se descarta y el polígono se cierra al primero.
  const planos = tramos.length > 0 ? puntos.slice(0, -1) : puntos;

  return {
    vertices: planos.map(([pe, pn]) => planoAWGS84(origen, pe, pn)),
    perimetroM: perimetro,
    errorCierreM: errorCierre,
    precision: errorCierre > 0 ? perimetro / errorCierre : Infinity,
    areaM2: areaShoelace(planos),
  };
}

/** Área en m² de un polígono dado en WGS84 (proyección local alrededor del primer vértice). */
/** Distancia aproximada en km entre dos puntos cercanos (suficiente para comparar ubicaciones en el país). */
export function distanciaAproxKm(a: CoordenadaWGS84, b: CoordenadaWGS84): number {
  const dLat = (b.lat - a.lat) * 110.574;
  const dLng = (b.lng - a.lng) * 111.32 * Math.cos(((a.lat + b.lat) / 2) * D2R);
  return Math.hypot(dLat, dLng);
}

/** El punto está dentro del recuadro de El Salvador (con margen para el golfo de Fonseca). */
export function dentroDeElSalvador(p: CoordenadaWGS84): boolean {
  return Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat > 12.9 && p.lat < 14.6 && p.lng > -90.3 && p.lng < -87.4;
}

export function areaPoligonoWGS84(vertices: CoordenadaWGS84[]): number {
  if (vertices.length < 3) return 0;
  const origen = vertices[0];
  return areaShoelace(vertices.map((v) => wgs84APlano(origen, v)));
}

/**
 * Centroide geométrico de un polígono en WGS84 (RN-G3): punto donde se ancla la etiqueta del lote.
 * Si el polígono es degenerado, devuelve el promedio de los vértices.
 */
export function centroidePoligono(vertices: CoordenadaWGS84[]): CoordenadaWGS84 | null {
  if (vertices.length === 0) return null;
  const origen = vertices[0];
  const planos = vertices.map((v) => wgs84APlano(origen, v));

  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < planos.length; i++) {
    const [x1, y1] = planos[i];
    const [x2, y2] = planos[(i + 1) % planos.length];
    const cruz = x1 * y2 - x2 * y1;
    a2 += cruz;
    cx += (x1 + x2) * cruz;
    cy += (y1 + y2) * cruz;
  }

  if (Math.abs(a2) < 1e-9) {
    const n = vertices.length;
    return {
      lat: vertices.reduce((s, v) => s + v.lat, 0) / n,
      lng: vertices.reduce((s, v) => s + v.lng, 0) / n,
    };
  }
  return planoAWGS84(origen, cx / (3 * a2), cy / (3 * a2));
}

export type NivelAviso = 'ok' | 'advertencia' | 'error';

export interface AvisoGeometria {
  nivel: NivelAviso;
  mensaje: string;
}

/** Evalúa error de cierre (RN-G2) y diferencia de área con la escritura (RN-G3). */
export function evaluarGeometria(
  resultado: Pick<ResultadoPoligonal, 'errorCierreM' | 'precision' | 'areaM2'> & { tieneTramos: boolean },
  areaEscrituraM2: number
): AvisoGeometria[] {
  const avisos: AvisoGeometria[] = [];

  if (resultado.tieneTramos) {
    if (resultado.errorCierreM < 0.0005) {
      avisos.push({ nivel: 'ok', mensaje: 'Cierre exacto: el polígono vuelve al mojón de partida.' });
    } else if (resultado.precision >= PRECISION_MINIMA_CIERRE) {
      avisos.push({
        nivel: 'ok',
        mensaje: `Cierre correcto: ${resultado.errorCierreM.toFixed(3)} m (1/${formatearPrecision(resultado.precision)}).`,
      });
    } else {
      avisos.push({
        nivel: 'advertencia',
        mensaje: `El polígono no cierra: error de ${resultado.errorCierreM.toFixed(2)} m (1/${formatearPrecision(
          resultado.precision
        )}, se exige 1/${PRECISION_MINIMA_CIERRE}). Revise rumbos y distancias.`,
      });
    }
  }

  if (areaEscrituraM2 > 0 && resultado.areaM2 > 0) {
    const diferencia = Math.abs(resultado.areaM2 - areaEscrituraM2) / areaEscrituraM2;
    const texto = `Área calculada ${resultado.areaM2.toFixed(2)} m² vs escritura ${areaEscrituraM2.toFixed(2)} m² (${(
      diferencia * 100
    ).toFixed(2)} %).`;
    avisos.push({
      nivel:
        diferencia <= TOLERANCIA_AREA_OK ? 'ok' : diferencia <= TOLERANCIA_AREA_MAX ? 'advertencia' : 'error',
      mensaje: texto,
    });
  }

  return avisos;
}

function formatearPrecision(precision: number): string {
  return Number.isFinite(precision) ? Math.round(precision).toLocaleString('es-SV') : '∞';
}

function planoAWGS84(origen: CoordenadaWGS84, este: number, norte: number): CoordenadaWGS84 {
  return {
    lat: Number((origen.lat + (norte / RADIO_TIERRA) * R2D).toFixed(7)),
    lng: Number((origen.lng + (este / (RADIO_TIERRA * Math.cos(origen.lat * D2R))) * R2D).toFixed(7)),
  };
}

function wgs84APlano(origen: CoordenadaWGS84, p: CoordenadaWGS84): [number, number] {
  return [
    (p.lng - origen.lng) * D2R * RADIO_TIERRA * Math.cos(origen.lat * D2R),
    (p.lat - origen.lat) * D2R * RADIO_TIERRA,
  ];
}

function areaShoelace(puntos: [number, number][]): number {
  if (puntos.length < 3) return 0;
  let suma = 0;
  for (let i = 0; i < puntos.length; i++) {
    const [x1, y1] = puntos[i];
    const [x2, y2] = puntos[(i + 1) % puntos.length];
    suma += x1 * y2 - x2 * y1;
  }
  return Math.abs(suma) / 2;
}
