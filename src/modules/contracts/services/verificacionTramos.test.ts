import { describe, it, expect, vi } from 'vitest';
import type { TramoRumbo } from '@/shared/utils/geoElSalvador';
import { evaluarTramos, reconciliarTramos, tramosCuadran } from './verificacionTramos';
import { extraerDatosDeDocumento } from './contractExtractor';

/** Tramos de un polígono ficticio a partir de sus vértices [Este, Norte] en metros (rumbo en grados decimales). */
function tramosDesde(puntos: [number, number][]): TramoRumbo[] {
  return puntos.map(([e1, n1], i) => {
    const [e2, n2] = puntos[(i + 1) % puntos.length];
    const az = ((Math.atan2(e2 - e1, n2 - n1) * 180) / Math.PI + 360) % 360;
    const [inicio, angulo, fin]: [TramoRumbo['inicio'], number, TramoRumbo['fin']] =
      az <= 90 ? ['N', az, 'E'] : az <= 180 ? ['S', 180 - az, 'E'] : az <= 270 ? ['S', az - 180, 'W'] : ['N', 360 - az, 'W'];
    return { inicio, grados: angulo, minutos: 0, segundos: 0, fin, distancia: Math.hypot(e2 - e1, n2 - n1) };
  });
}

// Terreno ficticio de 6 lados
const CORRECTOS = tramosDesde([[0, 0], [30, 5], [55, -10], [50, -45], [20, -50], [-5, -30]]);
const AREA = evaluarTramos(CORRECTOS).areaM2;
const conCambio = (i: number, cambio: Partial<TramoRumbo>) => CORRECTOS.map((t, j) => (j === i ? { ...t, ...cambio } : t));
// Errores típicos de lectura: "once punto cero dos" leído como 1.02 y minutos mal leídos
const LECTURA_A = conCambio(1, { distancia: CORRECTOS[1].distancia / 10 });
const LECTURA_B = conCambio(4, { minutos: 30 });

describe('reconciliarTramos: combina lecturas del mismo documento', () => {
  it('los tramos correctos cierran y cuadran con el área; una lectura con un error no', () => {
    expect(tramosCuadran(evaluarTramos(CORRECTOS), AREA)).toBe(true);
    expect(tramosCuadran(evaluarTramos(LECTURA_A), AREA)).toBe(false);
    expect(tramosCuadran(evaluarTramos(LECTURA_B), AREA)).toBe(false);
  });

  it('con dos lecturas que fallan en tramos distintos, recupera los tramos correctos', () => {
    const r = reconciliarTramos([LECTURA_A, LECTURA_B], AREA)!;
    expect(r.tramos).toEqual(CORRECTOS);
    expect(r.corregidos).toEqual([2]);
    expect(r.enDuda).toEqual([2, 5]);
    expect(tramosCuadran(r.evaluacion, AREA)).toBe(true);
  });

  it('usa las lecturas con la cantidad de tramos que declara el documento', () => {
    const incompleta = CORRECTOS.slice(0, 5);
    const r = reconciliarTramos([incompleta, LECTURA_A, LECTURA_B], AREA, 6)!;
    expect(r.tramos).toEqual(CORRECTOS);
  });

  it('si todas las lecturas coinciden en el mismo error, no inventa una corrección', () => {
    const r = reconciliarTramos([LECTURA_A, LECTURA_A], AREA)!;
    expect(r.corregidos).toEqual([]);
    expect(tramosCuadran(r.evaluacion, AREA)).toBe(false);
  });
});

describe('extraerDatosDeDocumento: relee la descripción técnica si los tramos no cuadran', () => {
  const documento = { base64: 'AAAA', mimeType: 'application/pdf' };
  const respuestaGemini = (datos: unknown) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(datos) }] } }] }), { status: 200 });
  const saturado = () => new Response('{"error":{"code":503}}', { status: 503 });
  const principal = (tramos: TramoRumbo[]) => ({
    tipoDocumento: 'PROMESA_COMPRAVENTA',
    precioPactado: 14000,
    primaEntregada: 5000,
    plazoMeses: 12,
    diaCortePago: 15,
    areaM2: AREA,
    tramosRumbosYDistancias: tramos,
  });
  /** Gemini simulado: la lectura principal y las de solo tramos tienen colas de respuestas distintas. */
  const simular = (principales: (() => Response)[], soloTramos: (() => Response)[]) => {
    const llamadas: string[] = [];
    const fn = vi.fn(async (_url: string, init: RequestInit) => {
      const esTramos = String(init.body).includes('Transcribe la descripción técnica');
      llamadas.push(esTramos ? 'tramos' : 'principal');
      return ((esTramos ? soloTramos : principales).shift() ?? saturado)();
    });
    return { llamadas, opciones: { modelos: ['m1'], intentosPorModelo: 1, esperar: async () => {}, fetch: fn as unknown as typeof fetch } };
  };
  const tramosGemini = (tramos: TramoRumbo[]) => () => respuestaGemini({ tramosRumbosYDistancias: tramos });

  it('lee los tramos dos veces a la vez; si no coinciden, una tercera desempata y avisa qué tramos revisar', async () => {
    const { llamadas, opciones } = simular([() => respuestaGemini(principal(LECTURA_A))], [tramosGemini(LECTURA_B), tramosGemini(CORRECTOS)]);
    const progreso: string[] = [];
    const r = await extraerDatosDeDocumento(documento, (m) => progreso.push(m), opciones);
    expect(llamadas).toEqual(['principal', 'tramos', 'tramos']);
    expect(r.tramos).toEqual(CORRECTOS);
    expect(r.precioPactado).toBe(14000);
    expect(r.avisos!.join(' ')).toMatch(/Se leyó la descripción técnica 3 veces: los tramos 2, 5 no coincidían entre lecturas/);
    expect(progreso.join(' ')).toMatch(/lectura 3 de 3/);
  });

  it('un error de minutos que casi no mueve el cierre se corrige porque las otras lecturas coinciden', async () => {
    const casiIgual = conCambio(2, { segundos: 5 });
    expect(tramosCuadran(evaluarTramos(casiIgual), AREA)).toBe(true); // el cierre solo no lo detecta
    const { opciones } = simular([() => respuestaGemini(principal(casiIgual))], [tramosGemini(CORRECTOS), tramosGemini(CORRECTOS)]);
    const r = await extraerDatosDeDocumento(documento, undefined, opciones);
    expect(r.tramos).toEqual(CORRECTOS);
    expect(r.avisos!.join(' ')).toMatch(/el tramo 3 no coincidía entre lecturas/);
  });

  it('si las dos primeras lecturas coinciden y cuadran, no hay tercera ni aviso', async () => {
    const { llamadas, opciones } = simular([() => respuestaGemini(principal(CORRECTOS))], [tramosGemini(CORRECTOS)]);
    const r = await extraerDatosDeDocumento(documento, undefined, opciones);
    expect(llamadas).toEqual(['principal', 'tramos']);
    expect(r.tramos).toEqual(CORRECTOS);
    expect(r.avisos!.join(' ')).not.toMatch(/lecturas|releer/);
  });

  it('si Gemini no responde para releer, devuelve la primera lectura con un aviso', async () => {
    const { opciones } = simular([() => respuestaGemini(principal(LECTURA_A))], []);
    const r = await extraerDatosDeDocumento(documento, undefined, opciones);
    expect(r.tramos).toEqual(LECTURA_A);
    expect(r.avisos!.join(' ')).toMatch(/no se pudo releer la descripción técnica/);
  });
});
