import { describe, it, expect } from 'vitest';
import { generarTablaAmortizacion, calcularResumenFinanciero, fechaVencimiento } from './amortization';

// Caso de referencia de 03.2: $20,400 − prima $4,400 = $16,000 a 36 meses, 12 % anual, firma 2026-09-15, día 15.
const base = {
  precioTotal: 20400,
  prima: 4400,
  plazoMeses: 36,
  tasaInteresAnual: 12,
  fechaInicio: '2026-09-15',
  diaCortePago: 15,
};

const fila = (c: { montoCuota: number; abonoCapital: number; abonoInteres: number; saldoInsoluto: number }) => [
  c.montoCuota,
  c.abonoCapital,
  c.abonoInteres,
  c.saldoInsoluto,
];

describe('Sistema Francés (RN-F3) — tabla de 03.2', () => {
  const t = generarTablaAmortizacion({ ...base, sistema: 'FRANCES' });
  it('cuota fija de 531.43 y filas de referencia', () => {
    expect(t).toHaveLength(36);
    expect(fila(t[0])).toEqual([531.43, 371.43, 160.0, 15628.57]);
    expect(fila(t[1])).toEqual([531.43, 375.14, 156.29, 15253.43]);
    expect(fila(t[2])).toEqual([531.43, 378.9, 152.53, 14874.53]);
    expect(fila(t[34])).toEqual([531.43, 520.96, 10.47, 526.11]);
    expect(fila(t[35])).toEqual([531.37, 526.11, 5.26, 0]);
  });
  it('intereses totales 3,131.42', () => {
    expect(calcularResumenFinanciero({ ...base, sistema: 'FRANCES' }).totalIntereses).toBe(3131.42);
  });
});

describe('Sistema Alemán — tabla de 03.2', () => {
  const t = generarTablaAmortizacion({ ...base, sistema: 'ALEMAN' });
  it('capital fijo de 444.44 y última cuota 449.05', () => {
    expect(fila(t[0])).toEqual([604.44, 444.44, 160.0, 15555.56]);
    expect(fila(t[1])).toEqual([600.0, 444.44, 155.56, 15111.12]);
    expect(fila(t[2])).toEqual([595.55, 444.44, 151.11, 14666.68]);
    expect(fila(t[35])).toEqual([449.05, 444.6, 4.45, 0]);
  });
  it('intereses totales 2,960.03', () => {
    expect(calcularResumenFinanciero({ ...base, sistema: 'ALEMAN' }).totalIntereses).toBe(2960.03);
  });
});

describe('Crédito Directo y tasa cero (RN-F2)', () => {
  it('35 cuotas de 444.44 y la última de 444.60, sin intereses', () => {
    const t = generarTablaAmortizacion({ ...base, sistema: 'DIRECTO_SIN_INTERES' });
    expect(t.slice(0, 35).every((c) => c.montoCuota === 444.44 && c.abonoInteres === 0)).toBe(true);
    expect(t[35].montoCuota).toBe(444.6);
    expect(t[35].saldoInsoluto).toBe(0);
  });
  it('Francés con tasa 0 equivale al Directo', () => {
    const f = generarTablaAmortizacion({ ...base, sistema: 'FRANCES', tasaInteresAnual: 0 });
    const d = generarTablaAmortizacion({ ...base, sistema: 'DIRECTO_SIN_INTERES' });
    expect(f.map((c) => c.montoCuota)).toEqual(d.map((c) => c.montoCuota));
  });
  it('8 cuotas de 1,125.00 para un saldo de 9,000', () => {
    const t = generarTablaAmortizacion({ ...base, precioTotal: 14000, prima: 5000, plazoMeses: 8, sistema: 'DIRECTO_SIN_INTERES' });
    expect(t.map((c) => c.montoCuota)).toEqual(Array(8).fill(1125));
  });
});

describe('Fechas de vencimiento (RN-F4)', () => {
  it('con día de corte 15 vencen el 15 (no el 16) a partir del mes siguiente a la firma', () => {
    const t = generarTablaAmortizacion({ ...base, sistema: 'FRANCES' });
    expect(t[0].fechaVencimiento).toBe('2026-10-15');
    expect(t[3].fechaVencimiento).toBe('2027-01-15');
    expect(t[35].fechaVencimiento).toBe('2029-09-15');
  });
  it('día de corte 31: en meses cortos cae en el último día del mes', () => {
    expect([1, 2, 3, 4].map((k) => fechaVencimiento('2026-12-31', k, 31))).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
    ]);
    expect(fechaVencimiento('2027-12-31', 2, 31)).toBe('2028-02-29'); // año bisiesto
  });
  it('no depende de la zona horaria', () => {
    const anterior = process.env.TZ;
    process.env.TZ = 'America/El_Salvador';
    try {
      expect(fechaVencimiento('2026-09-15', 1, 15)).toBe('2026-10-15');
    } finally {
      process.env.TZ = anterior;
    }
  });
});
