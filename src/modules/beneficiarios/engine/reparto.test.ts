import { describe, it, expect } from 'vitest';
import {
  porcentajesIguales,
  porcentajesValidos,
  calcularDistribucion,
  gastosPendientesDeContrato,
  gastosPendientesDeNegociacionesCanceladas,
  calcularSaldos,
  calcularSaldosPorVenta,
} from './reparto';
import { Beneficiario, DistribucionCobro, GastoVenta, Liquidacion } from '@/shared/types';

const siete = porcentajesIguales(7);
const beneficiarios = siete.map((porcentaje, i) => ({ id: `b${i + 1}`, porcentaje }));

describe('porcentajes (RN-B4)', () => {
  it('7 partes iguales: todas iguales (≈ 14.2857 %) y suman 100', () => {
    expect(new Set(siete).size).toBe(1);
    expect(siete[0]).toBeCloseTo(14.2857, 4);
    expect(siete.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 9);
  });

  it('valida que los activos sumen 100 y sean mayores que 0', () => {
    const lista = siete.map((porcentaje) => ({ porcentaje, activo: true }));
    expect(porcentajesValidos(lista)).toBe(true);
    expect(porcentajesValidos([{ porcentaje: 60, activo: true }, { porcentaje: 30, activo: true }])).toBe(false);
    expect(porcentajesValidos([{ porcentaje: 100, activo: true }, { porcentaje: 50, activo: false }])).toBe(true);
  });
});

describe('calcularDistribucion (RN-B2, RN-B3) — ejemplo del plan 04.3', () => {
  it('prima de 5,000 con gastos de 1,000: reembolsa y reparte 4,000', () => {
    const r = calcularDistribucion({
      monto: 5000,
      gastosPendientes: [
        { gastoId: 'g1', pendiente: 600 },
        { gastoId: 'g2', pendiente: 400 },
      ],
      beneficiarios,
      indiceRotacion: 0,
    });
    expect(r.reembolsos).toEqual([
      { gastoId: 'g1', monto: 600 },
      { gastoId: 'g2', monto: 400 },
    ]);
    expect(r.neto).toBe(4000);
    expect(r.partes.map((p) => p.monto)).toEqual([571.43, 571.43, 571.43, 571.43, 571.43, 571.43, 571.42]);
    expect(r.siguienteIndiceRotacion).toBe(6);
  });

  it('las cuotas siguientes rotan el centavo sobrante', () => {
    const c1 = calcularDistribucion({ monto: 1250, gastosPendientes: [], beneficiarios, indiceRotacion: 6 });
    expect(c1.partes.map((p) => p.monto)).toEqual([178.57, 178.57, 178.57, 178.57, 178.57, 178.57, 178.58]);
    const c2 = calcularDistribucion({
      monto: 1250,
      gastosPendientes: [],
      beneficiarios,
      indiceRotacion: c1.siguienteIndiceRotacion,
    });
    expect(c2.partes[0].monto).toBe(178.58);
  });

  it('si el cobro no alcanza para los gastos, no hay reparto y el saldo queda pendiente', () => {
    const r = calcularDistribucion({
      monto: 500,
      gastosPendientes: [{ gastoId: 'g1', pendiente: 800 }],
      beneficiarios,
      indiceRotacion: 0,
    });
    expect(r.reembolsos).toEqual([{ gastoId: 'g1', monto: 500 }]);
    expect(r.neto).toBe(0);
    expect(r.partes).toEqual([]);
  });

  it('respeta porcentajes distintos', () => {
    const r = calcularDistribucion({
      monto: 1000,
      gastosPendientes: [],
      beneficiarios: [
        { id: 'a', porcentaje: 50 },
        { id: 'b', porcentaje: 30 },
        { id: 'c', porcentaje: 20 },
      ],
      indiceRotacion: 0,
    });
    expect(r.partes.map((p) => p.monto)).toEqual([500, 300, 200]);
  });

  it('la suma de partes y reembolsos es siempre igual al cobro', () => {
    for (const monto of [0.01, 1, 99.99, 1234.56, 5000, 14000]) {
      const r = calcularDistribucion({
        monto,
        gastosPendientes: [{ gastoId: 'g', pendiente: 37.5 }],
        beneficiarios,
        indiceRotacion: 3,
      });
      const total = r.reembolsos.reduce((a, x) => a + x.monto, 0) + r.partes.reduce((a, x) => a + x.monto, 0);
      expect(Math.round(total * 100)).toBe(Math.round(monto * 100));
    }
  });
});

describe('gastos pendientes y saldos por persona', () => {
  const gasto = (id: string, monto: number, aCargoDe: 'SUCESION' | 'COMPRADOR', fecha: string): GastoVenta => ({
    id,
    proyectoId: 'p',
    loteId: 'l',
    contratoId: 'k',
    categoria: 'GESTION_VENTA',
    descripcion: '',
    monto,
    fecha,
    aCargoDe,
    responsable: id === 'g1' ? { tipo: 'BENEFICIARIO', beneficiarioId: 'b1' } : { tipo: 'EXTERNO', nombre: 'Gestor Ficticio' },
    createdAt: fecha,
  });
  const gastos = [gasto('g1', 600, 'SUCESION', '2026-01-02'), gasto('g2', 400, 'SUCESION', '2026-01-01'), gasto('g3', 300, 'COMPRADOR', '2026-01-01')];

  it('ignora los gastos del comprador y ordena por fecha', () => {
    expect(gastosPendientesDeContrato(gastos, [], 'k')).toEqual([
      { gastoId: 'g2', pendiente: 400 },
      { gastoId: 'g1', pendiente: 600 },
    ]);
  });

  it('descuenta lo ya reembolsado', () => {
    const d: DistribucionCobro = {
      id: 'd',
      proyectoId: 'p',
      contratoId: 'k',
      loteId: 'l',
      origen: 'PRIMA',
      fecha: '2026-01-03',
      montoCobrado: 700,
      reembolsos: [
        { gastoId: 'g2', monto: 400 },
        { gastoId: 'g1', monto: 300 },
      ],
      neto: 0,
      partes: [],
      createdAt: '',
    };
    expect(gastosPendientesDeContrato(gastos, [d], 'k')).toEqual([{ gastoId: 'g1', pendiente: 300 }]);
  });

  it('gastos de negociaciones: abiertas no se reembolsan; canceladas por la sucesión sí', () => {
    const neg = (id: string, negociacionId: string, aCargoDe: 'SUCESION' | 'RESPONSABLE'): GastoVenta => ({
      ...gasto(id, 50, 'SUCESION', '2026-01-05'),
      contratoId: undefined,
      loteId: undefined,
      negociacionId,
      aCargoDe,
    });
    const lista = [neg('n1', 'abierta', 'SUCESION'), neg('n2', 'cancelada-suc', 'SUCESION'), neg('n3', 'cancelada-resp', 'RESPONSABLE')];
    expect(gastosPendientesDeContrato(lista, [], 'k')).toEqual([]);
    expect(gastosPendientesDeNegociacionesCanceladas(lista, [], new Set(['cancelada-suc']))).toEqual([
      { gastoId: 'n2', pendiente: 50 },
    ]);
  });

  it('un reparto anulado no cuenta como reembolso', () => {
    const anulada: DistribucionCobro = {
      id: 'd', proyectoId: 'p', contratoId: 'k', loteId: 'l', origen: 'CUOTA', fecha: '', montoCobrado: 400,
      reembolsos: [{ gastoId: 'g2', monto: 400 }], neto: 0, partes: [], anulada: true, createdAt: '',
    };
    expect(gastosPendientesDeContrato(gastos, [anulada], 'k')[0]).toEqual({ gastoId: 'g2', pendiente: 400 });
  });

  it('saldo = repartido + reembolsos − entregado', () => {
    const bens: Beneficiario[] = [
      { id: 'b1', proyectoId: 'p', nombreCompleto: 'Beneficiario Uno', porcentaje: 100, activo: true, orden: 0, createdAt: '' },
    ];
    const d: DistribucionCobro = {
      id: 'd',
      proyectoId: 'p',
      contratoId: 'k',
      loteId: 'l',
      origen: 'PRIMA',
      fecha: '',
      montoCobrado: 2000,
      reembolsos: [
        { gastoId: 'g1', monto: 600 },
        { gastoId: 'g2', monto: 400 },
      ],
      neto: 1000,
      partes: [{ beneficiarioId: 'b1', monto: 1000 }],
      createdAt: '',
    };
    const liq: Liquidacion[] = [
      { id: 'x', proyectoId: 'p', destinatario: { tipo: 'BENEFICIARIO', beneficiarioId: 'b1' }, monto: 250, fecha: '', metodo: 'EFECTIVO', createdAt: '' },
    ];
    const saldos = calcularSaldos(bens, gastos, [d], liq);
    const uno = saldos.find((s) => s.clave === 'B:b1')!;
    expect(uno).toMatchObject({ repartido: 1000, reembolsos: 600, entregado: 250, pendiente: 1350 });
    const gestor = saldos.find((s) => s.nombre === 'Gestor Ficticio')!;
    expect(gestor).toMatchObject({ reembolsos: 400, pendiente: 400 });
  });

  it('saldos por lote vendido: cada venta por separado y las entregas sin venta a la más antigua', () => {
    const bens: Beneficiario[] = [
      { id: 'b1', proyectoId: 'p', nombreCompleto: 'Beneficiario Uno', porcentaje: 50, activo: true, orden: 0, createdAt: '' },
      { id: 'b2', proyectoId: 'p', nombreCompleto: 'Beneficiario Dos', porcentaje: 50, activo: true, orden: 1, createdAt: '' },
    ];
    const reparto = (id: string, contratoId: string, fecha: string, neto: number, reembolsos: DistribucionCobro['reembolsos'] = []): DistribucionCobro => ({
      id, proyectoId: 'p', contratoId, loteId: `l-${contratoId}`, origen: 'PRIMA', fecha, montoCobrado: neto + reembolsos.reduce((a, r) => a + r.monto, 0),
      reembolsos, neto, partes: [{ beneficiarioId: 'b1', monto: neto / 2 }, { beneficiarioId: 'b2', monto: neto / 2 }], createdAt: fecha,
    });
    const repartos = [reparto('dB', 'kB', '2026-10-02', 600), reparto('dA', 'kA', '2026-09-01', 1000, [{ gastoId: 'g1', monto: 600 }])];
    const entrega = (id: string, monto: number, contratoId?: string): Liquidacion => ({
      id, proyectoId: 'p', contratoId, loteId: contratoId && `l-${contratoId}`, destinatario: { tipo: 'BENEFICIARIO', beneficiarioId: 'b1' },
      monto, fecha: '2026-10-03', metodo: 'EFECTIVO', createdAt: `2026-10-03T0${id.length}:00:00Z`,
    });

    // Una entrega del lote B no toca el saldo del lote A
    const conVenta = calcularSaldosPorVenta(bens, gastos, repartos, [entrega('e', 300, 'kB')]);
    expect(conVenta.map((v) => v.contratoId)).toEqual(['kA', 'kB']); // en el orden del primer cobro
    const [ventaA, ventaB] = conVenta;
    expect(ventaA.saldos.map((x) => x.clave)).toEqual(['B:b1', 'B:b2']); // el gestor no adelantó gastos del lote B
    expect(ventaA.saldos[0]).toMatchObject({ repartido: 500, reembolsos: 600, entregado: 0, pendiente: 1100 });
    expect(ventaB.saldos[0]).toMatchObject({ repartido: 300, entregado: 300, pendiente: 0 });
    expect(ventaB).toMatchObject({ repartido: 600, entregado: 300, pendiente: 300 });

    // Una entrega sin venta (registro anterior) llena primero el lote más antiguo
    const sinVenta = calcularSaldosPorVenta(bens, gastos, repartos, [entrega('ee', 1250)]);
    expect(sinVenta[0].saldos[0]).toMatchObject({ entregado: 1100, pendiente: 0 });
    expect(sinVenta[1].saldos[0]).toMatchObject({ entregado: 150, pendiente: 150 });

    // La suma de las ventas es igual al saldo total de la persona
    const total = calcularSaldos(bens, gastos, repartos, [entrega('ee', 1250)]).find((x) => x.clave === 'B:b1')!;
    expect(sinVenta.reduce((a, v) => a + v.saldos[0].pendiente, 0)).toBeCloseTo(total.pendiente, 2);
  });
});
