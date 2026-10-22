/**
 * Verificación de los tramos leídos por Gemini (RN-G2, RN-G3).
 *
 * Un escaneo con páginas desordenadas hace que cada lectura confunda 2 o 3 tramos, y no siempre los mismos (caso real
 * 2026-10-03: "once punto cero dos" leído como 1.02 abrió el polígono 10 m; en otra lectura, minutos 35 → 30 y 52 → 50
 * en tramos cortos apenas movían el cierre 3 mm). Por eso la descripción se lee varias veces y, en cada tramo donde las
 * lecturas no coinciden, se elige: primero una versión con la que el polígono cuadre (cierre y área de la escritura),
 * luego la que más se repite entre lecturas y, en empate, la que mejor cierra.
 */
import {
  azimutDeRumbo,
  calcularPoligonal,
  PRECISION_MINIMA_CIERRE,
  TOLERANCIA_AREA_OK,
  TramoRumbo,
} from '@/shared/utils/geoElSalvador';

/** Origen cualquiera: el cierre, el perímetro y el área no dependen de la ubicación. */
const ORIGEN_REFERENCIA = { lat: 13.7, lng: -89.2 };
/** Máximo de combinaciones a probar (con 3 lecturas y 10 tramos en duda son 59,049). */
const COMBINACIONES_MAXIMAS = 200_000;
/** Combinaciones con mejor cierre que se evalúan completas (además de la que más se repite). */
const FINALISTAS = 25;

export interface EvaluacionTramos {
  errorCierreM: number;
  precision: number;
  areaM2: number;
}

export interface TramosReconciliados {
  tramos: TramoRumbo[];
  evaluacion: EvaluacionTramos;
  /** Tramos (desde 1) que cambiaron respecto de la primera lectura. */
  corregidos: number[];
  /** Tramos (desde 1) en los que las lecturas no coincidían. */
  enDuda: number[];
}

export function evaluarTramos(tramos: TramoRumbo[]): EvaluacionTramos {
  const { errorCierreM, precision, areaM2 } = calcularPoligonal(ORIGEN_REFERENCIA, tramos);
  return { errorCierreM, precision, areaM2 };
}

/** El polígono cierra (≥ 1/1000) y, si se conoce el área de la escritura, coincide dentro del 2 %. */
export function tramosCuadran(evaluacion: EvaluacionTramos, areaEscrituraM2: number): boolean {
  const areaOk =
    !(areaEscrituraM2 > 0) || Math.abs(evaluacion.areaM2 - areaEscrituraM2) / areaEscrituraM2 <= TOLERANCIA_AREA_OK;
  return evaluacion.precision >= PRECISION_MINIMA_CIERRE && areaOk;
}

const claveTramo = (t: TramoRumbo) => `${t.inicio}${t.grados}-${t.minutos}-${t.segundos}${t.fin}${t.distancia}`;

/**
 * Combina varias lecturas de los mismos tramos. Solo usa las lecturas con la cantidad de tramos esperada
 * (la declarada por el documento o, si no se conoce, la más frecuente). Devuelve null si no hay ninguna.
 */
export function reconciliarTramos(
  lecturas: TramoRumbo[][],
  areaEscrituraM2: number,
  tramosEsperados?: number
): TramosReconciliados | null {
  const conTramos = lecturas.filter((l) => l.length >= 3);
  if (conTramos.length === 0) return null;

  // La cantidad más frecuente; en empate, la de la lectura más antigua
  const frecuencia = new Map<number, number>();
  for (const l of conTramos) frecuencia.set(l.length, (frecuencia.get(l.length) ?? 0) + 1);
  const masFrecuente = conTramos
    .map((l) => l.length)
    .reduce((mejor, n) => ((frecuencia.get(n) ?? 0) > (frecuencia.get(mejor) ?? 0) ? n : mejor));
  const largo = tramosEsperados && frecuencia.has(tramosEsperados) ? tramosEsperados : masFrecuente;
  const validas = conTramos.filter((l) => l.length === largo);
  const primera = validas[0];

  // Candidatos por tramo (las versiones distintas que dieron las lecturas) y cuántas lecturas dieron cada una
  const candidatos: { tramo: TramoRumbo; votos: number }[][] = primera.map((_, i) => {
    const vistos = new Map<string, { tramo: TramoRumbo; votos: number }>();
    for (const l of validas) {
      const c = vistos.get(claveTramo(l[i]));
      if (c) c.votos++;
      else vistos.set(claveTramo(l[i]), { tramo: l[i], votos: 1 });
    }
    return [...vistos.values()];
  });
  const enDuda = candidatos.flatMap((c, i) => (c.length > 1 ? [i] : []));
  const combinaciones = enDuda.reduce((total, i) => total * candidatos[i].length, 1);
  const masVotada = enDuda.map((i) => candidatos[i].reduce((m, c, k) => (c.votos > candidatos[i][m].votos ? k : m), 0));

  let elegidas: number[][];
  if (enDuda.length === 0) {
    elegidas = [[]];
  } else if (combinaciones > COMBINACIONES_MAXIMAS) {
    // Demasiadas dudas para probarlas todas: cada lectura completa y la combinación más votada
    elegidas = [
      masVotada,
      ...validas.map((l) => enDuda.map((i) => candidatos[i].findIndex((c) => claveTramo(c.tramo) === claveTramo(l[i])))),
    ];
  } else {
    // El cierre de una combinación es la suma de los vectores (Este, Norte) de sus tramos
    const vector = (t: TramoRumbo): [number, number] => {
      const az = (azimutDeRumbo(t) * Math.PI) / 180;
      return [t.distancia * Math.sin(az), t.distancia * Math.cos(az)];
    };
    const base = primera.reduce<[number, number]>((s, t, i) => {
      if (enDuda.includes(i)) return s;
      const [e, n] = vector(t);
      return [s[0] + e, s[1] + n];
    }, [0, 0]);
    const vectores = enDuda.map((i) => candidatos[i].map((c) => vector(c.tramo)));
    const mejores: { cierre: number; eleccion: number[] }[] = [];
    const eleccion = enDuda.map(() => 0);
    for (let n = 0; n < combinaciones; n++) {
      let e = base[0];
      let no = base[1];
      for (let j = 0; j < enDuda.length; j++) {
        e += vectores[j][eleccion[j]][0];
        no += vectores[j][eleccion[j]][1];
      }
      const cierre = Math.hypot(e, no);
      if (mejores.length < FINALISTAS || cierre < mejores[mejores.length - 1].cierre) {
        mejores.push({ cierre, eleccion: [...eleccion] });
        mejores.sort((a, b) => a.cierre - b.cierre);
        if (mejores.length > FINALISTAS) mejores.pop();
      }
      // Siguiente combinación (contador en base mixta)
      for (let j = 0; j < eleccion.length; j++) {
        if (++eleccion[j] < candidatos[enDuda[j]].length) break;
        eleccion[j] = 0;
      }
    }
    elegidas = [masVotada, ...mejores.map((m) => m.eleccion)];
  }

  // Preferencia: que cuadre; después, más votos entre lecturas; después, mejor cierre
  let mejor: { tramos: TramoRumbo[]; evaluacion: EvaluacionTramos; clave: [number, number, number] } | null = null;
  for (const eleccion of elegidas) {
    const tramos = [...primera];
    let votos = 0;
    enDuda.forEach((i, j) => {
      tramos[i] = candidatos[i][eleccion[j]].tramo;
      votos += candidatos[i][eleccion[j]].votos;
    });
    const evaluacion = evaluarTramos(tramos);
    const clave: [number, number, number] = [tramosCuadran(evaluacion, areaEscrituraM2) ? 0 : 1, -votos, evaluacion.errorCierreM];
    if (!mejor || clave[0] < mejor.clave[0] || (clave[0] === mejor.clave[0] && (clave[1] < mejor.clave[1] || (clave[1] === mejor.clave[1] && clave[2] < mejor.clave[2])))) {
      mejor = { tramos, evaluacion, clave };
    }
  }

  const resultado = mejor!;
  return {
    tramos: resultado.tramos,
    evaluacion: resultado.evaluacion,
    corregidos: resultado.tramos.flatMap((t, i) => (claveTramo(t) !== claveTramo(primera[i]) ? [i + 1] : [])),
    enDuda: enDuda.map((i) => i + 1),
  };
}
