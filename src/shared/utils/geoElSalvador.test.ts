import { describe, it, expect } from 'vitest';
import {
  lambertElSalvadorToWGS84,
  parseRumbo,
  azimutDeRumbo,
  calcularPoligonal,
  evaluarGeometria,
  centroidePoligono,
  RumboInvalidoError,
  TramoRumbo,
} from './geoElSalvador';
import { normalizarTramo } from '@/modules/contracts/services/contractExtractor';

/** Distancia aproximada en metros entre dos puntos cercanos. */
function distanciaM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dy = (a.lat - b.lat) * 110574;
  const dx = (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

describe('lambertElSalvadorToWGS84 (RN-G1)', () => {
  // Valores de referencia calculados con la definición oficial (Lambert 1SP, k0 = 0.99996704).
  it.each([
    [550000, 250000, 13.3688345, -88.5384111],
    [450000, 320000, 14.0015528, -89.4628326],
  ])('E %d / N %d coincide con la definición oficial a menos de 0.5 m', (este, norte, lat, lng) => {
    const r = lambertElSalvadorToWGS84(este, norte);
    expect(distanciaM(r, { lat, lng })).toBeLessThan(0.5);
  });
});

describe('parseRumbo (RN-G2)', () => {
  it.each([
    [`Sur 64°32'05" Este`, 115.465],
    [`Norte 10°00'00" Oeste`, 350],
    [`Sur 45°00'00" Oeste`, 225],
    [`N 10 00 00 W`, 350],
    [`Norte 80° Poniente`, 280],
    [`Norte 80° Oriente`, 80],
    [`N 10°00' O`, 350],
    [`Sur 12°15' Este`, 167.75],
  ])('%s → azimut %d°', (texto, esperado) => {
    expect(azimutDeRumbo(parseRumbo(texto))).toBeCloseTo(esperado, 3);
  });

  it.each(['rumbo ilegible', 'Norte sesenta grados Este', 'N 95° E', 'Sur 10°75\' Oeste'])(
    'rechaza "%s" en lugar de devolver 0°',
    (texto) => {
      expect(() => parseRumbo(texto)).toThrow(RumboInvalidoError);
    }
  );
});

describe('normalizarTramo', () => {
  it('acepta el formato descompuesto con "O" o "W" para Oeste', () => {
    const t = normalizarTramo({ inicio: 'S', grados: 9, minutos: 16, segundos: 26, fin: 'O', distancia: 13.6 });
    expect(t.fin).toBe('W');
  });

  it('acepta el formato antiguo con rumbo en texto', () => {
    const t = normalizarTramo({ rumbo: `Norte 88°25'53" Oeste`, distancia: 6.04 });
    expect(t).toMatchObject({ inicio: 'N', grados: 88, minutos: 25, segundos: 53, fin: 'W' });
  });

  it('rechaza distancias no válidas', () => {
    expect(() => normalizarTramo({ inicio: 'N', grados: 1, fin: 'E', distancia: 0 })).toThrow();
  });
});

describe('calcularPoligonal (RN-G2, RN-G3)', () => {
  const t = (inicio: 'N' | 'S', g: number, m: number, s: number, fin: 'E' | 'W', distancia: number): TramoRumbo => ({
    inicio,
    grados: g,
    minutos: m,
    segundos: s,
    fin,
    distancia,
  });

  it('reproduce el ejemplo de 03.2: rectángulo de 340 m² que cierra exacto', () => {
    const r = calcularPoligonal({ lat: 13.692, lng: -89.218 }, [
      t('N', 10, 0, 0, 'E', 20),
      t('S', 80, 0, 0, 'E', 17),
      t('S', 10, 0, 0, 'W', 20),
      t('N', 80, 0, 0, 'W', 17),
    ]);
    expect(r.vertices).toHaveLength(4);
    expect(r.errorCierreM).toBeLessThan(0.001);
    expect(r.areaM2).toBeCloseTo(340, 1);
    expect(r.vertices[1].lat).toBeCloseTo(13.6921769, 6);
    expect(r.vertices[1].lng).toBeCloseTo(-89.2179679, 6);
  });

  // Regresión: 22 tramos de una escritura real de segregación (8 con rumbo "Oeste").
  // Origen desplazado y sin datos personales. Área según escritura: 1,319.67 m².
  const escritura: TramoRumbo[] = [
    t('S', 64, 32, 5, 'E', 11.42), t('S', 60, 34, 38, 'E', 3.02), t('S', 66, 15, 30, 'E', 6.93),
    t('S', 60, 19, 19, 'E', 2.87), t('S', 66, 10, 46, 'E', 11.48),
    t('S', 9, 16, 26, 'W', 13.6), t('S', 86, 33, 24, 'W', 12.89), t('S', 15, 11, 51, 'E', 12.94),
    t('S', 13, 38, 7, 'E', 7.8),
    t('N', 88, 25, 53, 'W', 6.04), t('N', 86, 22, 14, 'W', 7.31), t('N', 86, 4, 51, 'W', 4.93),
    t('N', 87, 37, 52, 'W', 8.88), t('N', 68, 31, 52, 'W', 1.89), t('N', 71, 27, 54, 'W', 5.25),
    t('N', 16, 8, 5, 'E', 7.94), t('N', 20, 48, 30, 'E', 7.18), t('N', 6, 0, 38, 'E', 3.76),
    t('N', 14, 22, 48, 'E', 10.55), t('N', 14, 32, 36, 'E', 9.59), t('N', 8, 34, 39, 'E', 3.39),
    t('N', 8, 29, 26, 'E', 4.92),
  ];

  it('la escritura de 22 tramos cierra a ~1.4 cm y da 1,319.88 m²', () => {
    const r = calcularPoligonal({ lat: 13.7, lng: -89.2 }, escritura);
    expect(r.vertices).toHaveLength(22);
    expect(r.perimetroM).toBeCloseTo(164.58, 2);
    expect(r.errorCierreM).toBeCloseTo(0.014, 3);
    expect(r.precision).toBeGreaterThan(1000);
    expect(r.areaM2).toBeCloseTo(1319.88, 1);

    const avisos = evaluarGeometria({ ...r, tieneTramos: true }, 1319.67);
    expect(avisos.every((a) => a.nivel === 'ok')).toBe(true);
  });

  it('los mismos tramos escritos como texto dan el mismo resultado', () => {
    const fin = (f: 'E' | 'W') => (f === 'E' ? 'Este' : 'Oeste');
    const comoTexto = escritura.map((x) =>
      normalizarTramo({
        rumbo: `${x.inicio === 'N' ? 'Norte' : 'Sur'} ${x.grados}°${x.minutos}'${x.segundos}" ${fin(x.fin)}`,
        distancia: x.distancia,
      })
    );
    const r = calcularPoligonal({ lat: 13.7, lng: -89.2 }, comoTexto);
    expect(r.errorCierreM).toBeCloseTo(0.014, 3);
    expect(r.areaM2).toBeCloseTo(1319.88, 1);
  });

  it('el centroide del rectángulo de 340 m² está en su centro', () => {
    const r = calcularPoligonal({ lat: 13.692, lng: -89.218 }, [
      t('N', 10, 0, 0, 'E', 20),
      t('S', 80, 0, 0, 'E', 17),
      t('S', 10, 0, 0, 'W', 20),
      t('N', 80, 0, 0, 'W', 17),
    ]);
    const c = centroidePoligono(r.vertices)!;
    // Punto medio de la diagonal entre el vértice 1 y el 3
    const medio = {
      lat: (r.vertices[0].lat + r.vertices[2].lat) / 2,
      lng: (r.vertices[0].lng + r.vertices[2].lng) / 2,
    };
    expect(distanciaM(c, medio)).toBeLessThan(0.05);
  });

  it('advierte cuando el polígono no cierra (un tramo mal leído)', () => {
    const conError = escritura.map((x, i) => (i === 5 ? { ...x, fin: 'E' as const } : x));
    const r = calcularPoligonal({ lat: 13.7, lng: -89.2 }, conError);
    const avisos = evaluarGeometria({ ...r, tieneTramos: true }, 1319.67);
    expect(r.precision).toBeLessThan(1000);
    expect(avisos.some((a) => a.nivel === 'advertencia')).toBe(true);
  });
});
