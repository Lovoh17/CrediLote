import { describe, it, expect, vi } from 'vitest';

// La revisión de geometría es lógica pura; Leaflet (que necesita el navegador) solo lo usa el mapa del componente
vi.mock('leaflet', () => ({ default: {} }));

const { calcularGeometriaFormulario } = await import('./DescripcionTecnica');
const { calcularPoligonal, lambertElSalvadorToWGS84 } = await import('@/shared/utils/geoElSalvador');

// Rectángulo ficticio de 17 × 20 m (340 m²)
const TRAMOS = [
  { inicio: 'N' as const, grados: 0, minutos: 0, segundos: 0, fin: 'E' as const, distancia: 17 },
  { inicio: 'N' as const, grados: 90, minutos: 0, segundos: 0, fin: 'E' as const, distancia: 20 },
  { inicio: 'S' as const, grados: 0, minutos: 0, segundos: 0, fin: 'E' as const, distancia: 17 },
  { inicio: 'S' as const, grados: 90, minutos: 0, segundos: 0, fin: 'W' as const, distancia: 20 },
];
const PRIMERA = { lat: 13.35, lng: -87.98 };

type Datos = Parameters<typeof calcularGeometriaFormulario>[0];
const datos = (parcial: Partial<Datos>): Datos => ({ codigoLote: 'PORCIÓN 1', areaM2: 340, tramos: [], coordenadas: [], ...parcial });

describe('calcularGeometriaFormulario: el primer punto con coordenadas es el punto de partida', () => {
  it('con tramos y una latitud/longitud, dibuja desde esa primera coordenada', () => {
    const g = calcularGeometriaFormulario(datos({ tramos: TRAMOS, coordenadas: [PRIMERA] }));
    expect(g.origen).toEqual(PRIMERA);
    expect(g.vertices).toHaveLength(4);
    expect(g.vertices[0]).toEqual(PRIMERA);
    expect(g.requiereConfirmacion).toBe(false);
  });

  it('al corregir un tramo, recalcula desde la misma primera coordenada', () => {
    const coordenadas = calcularPoligonal(PRIMERA, TRAMOS).vertices;
    const corregidos = TRAMOS.map((t, i) => (i === 1 ? { ...t, distancia: 21 } : t));
    const g = calcularGeometriaFormulario(datos({ tramos: corregidos, coordenadas, areaM2: 357 }));
    expect(g.vertices[0]).toEqual(PRIMERA);
    expect(g.poligonal!.vertices[1]).toEqual(coordenadas[1]);
  });

  it('con el punto Lambert y la tabla de vértices pero sin tramos, usa la tabla', () => {
    const P1 = { norte: 250120.5, este: 580340.25 };
    const tabla = [P1, { norte: 250137.5, este: 580340.25 }, { norte: 250137.5, este: 580360.25 }].map((p) =>
      lambertElSalvadorToWGS84(p.este, p.norte)
    );
    const g = calcularGeometriaFormulario(datos({ puntoPartida: P1, coordenadas: tabla }));
    expect(g.vertices).toHaveLength(3);
    expect(g.avisos.map((a) => a.mensaje).join(' ')).not.toMatch(/Solo hay punto de partida/);
  });

  it('sin ninguna coordenada, no dibuja y explica que falta la del primer punto', () => {
    const g = calcularGeometriaFormulario(datos({ tramos: TRAMOS, referenciaPartida: 'vértice Nor Poniente' }));
    expect(g.vertices).toEqual([]);
    expect(g.avisos.map((a) => a.mensaje).join(' ')).toMatch(/no trae las coordenadas del primer punto \(vértice Nor Poniente\), donde empieza el tramo 1/);
  });
});
