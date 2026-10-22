import { describe, it, expect } from 'vitest';
import { Cuota } from '@/shared/types';
import {
  aplicarPago,
  pendienteDeCuota,
  pendienteTotal,
  estadoSegunPagado,
  prefijoDeProyecto,
  formatearFolio,
} from './pagos';

const cuota = (n: number, monto: number, extra: Partial<Cuota> = {}): Cuota => ({
  id: `c${n}`,
  contratoId: 'k',
  numeroCuota: n,
  fechaVencimiento: `2027-${String(n).padStart(2, '0')}-15`,
  montoCuota: monto,
  abonoCapital: monto,
  abonoInteres: 0,
  saldoInsoluto: 0,
  estado: 'PENDIENTE',
  ...extra,
});

describe('aplicarPago (RN-C1)', () => {
  const cuotas = [cuota(1, 1125), cuota(2, 1125), cuota(3, 1125)];

  it('pago exacto cubre la cuota más antigua', () => {
    expect(aplicarPago(cuotas, 1125)).toEqual({ aplicaciones: [{ cuotaId: 'c1', monto: 1125 }], sobrante: 0 });
  });

  it('pago parcial queda como abono en la cuota más antigua', () => {
    expect(aplicarPago(cuotas, 500).aplicaciones).toEqual([{ cuotaId: 'c1', monto: 500 }]);
  });

  it('pago mayor cubre la siguiente cuota', () => {
    expect(aplicarPago(cuotas, 1500).aplicaciones).toEqual([
      { cuotaId: 'c1', monto: 1125 },
      { cuotaId: 'c2', monto: 375 },
    ]);
  });

  it('empieza por la más antigua aunque haya abonos parciales previos', () => {
    const conAbono = [cuota(1, 1125, { montoPagado: 1000, estado: 'ABONO_PARCIAL' }), cuota(2, 1125)];
    expect(aplicarPago(conAbono, 300).aplicaciones).toEqual([
      { cuotaId: 'c1', monto: 125 },
      { cuotaId: 'c2', monto: 175 },
    ]);
  });

  it('informa el sobrante cuando el pago excede todo lo pendiente', () => {
    expect(aplicarPago([cuota(1, 100)], 150).sobrante).toBe(50);
  });

  it('las cuotas antiguas marcadas PAGADO sin monto cuentan como completas', () => {
    const antiguas = [cuota(1, 1125, { estado: 'PAGADO' }), cuota(2, 1125)];
    expect(pendienteDeCuota(antiguas[0])).toBe(0);
    expect(pendienteTotal(antiguas)).toBe(1125);
    expect(aplicarPago(antiguas, 1125).aplicaciones).toEqual([{ cuotaId: 'c2', monto: 1125 }]);
  });
});

describe('estadoSegunPagado', () => {
  it.each([
    [1125, 0, 'PENDIENTE'],
    [1125, 0.01, 'ABONO_PARCIAL'],
    [1125, 1124.99, 'ABONO_PARCIAL'],
    [1125, 1125, 'PAGADO'],
  ])('cuota %d con %d pagado → %s', (monto, pagado, estado) => {
    expect(estadoSegunPagado(monto, pagado)).toBe(estado);
  });
});

describe('folios (D5)', () => {
  it('prefijo por iniciales', () => {
    expect(prefijoDeProyecto('Sucesión Lino Marín')).toBe('SLM');
    expect(prefijoDeProyecto('Residencial Campestre El Roble')).toBe('RCR');
    expect(prefijoDeProyecto('Proyecto principal')).toBe('PP');
  });
  it('formato de recibo y de entrega', () => {
    expect(formatearFolio('SLM', 'RECIBO', 2026, 1)).toBe('SLM-2026-0001');
    expect(formatearFolio('SLM', 'ENTREGA', 2026, 12)).toBe('SLM-ENT-2026-0012');
    expect(formatearFolio('SLM', 'RECIBO', 2026, 12345)).toBe('SLM-2026-12345');
  });
});
