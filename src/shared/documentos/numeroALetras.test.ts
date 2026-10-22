import { describe, it, expect } from 'vitest';
import { enteroALetras, montoEnLetras } from './numeroALetras';

describe('enteroALetras', () => {
  it.each([
    [0, 'CERO'],
    [1, 'UN'],
    [15, 'QUINCE'],
    [21, 'VEINTIUN'],
    [22, 'VEINTIDÓS'],
    [31, 'TREINTA Y UN'],
    [100, 'CIEN'],
    [101, 'CIENTO UN'],
    [531, 'QUINIENTOS TREINTA Y UN'],
    [1000, 'UN MIL'],
    [1125, 'UN MIL CIENTO VEINTICINCO'],
    [5000, 'CINCO MIL'],
    [14000, 'CATORCE MIL'],
    [20400, 'VEINTE MIL CUATROCIENTOS'],
    [21000, 'VEINTIUN MIL'],
    [100000, 'CIEN MIL'],
    [1319, 'UN MIL TRESCIENTOS DIECINUEVE'],
    [1_000_000, 'UN MILLÓN'],
    [2_225_861, 'DOS MILLONES DOSCIENTOS VEINTICINCO MIL OCHOCIENTOS SESENTA Y UN'],
  ])('%d → %s', (n, letras) => {
    expect(enteroALetras(n)).toBe(letras);
  });

  it('rechaza números fuera de rango', () => {
    expect(() => enteroALetras(-1)).toThrow();
    expect(() => enteroALetras(1.5)).toThrow();
  });
});

describe('montoEnLetras', () => {
  it('formato de recibo con centavos NN/100', () => {
    expect(montoEnLetras(1125)).toBe('UN MIL CIENTO VEINTICINCO 00/100 DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA');
    expect(montoEnLetras(531.43)).toBe('QUINIENTOS TREINTA Y UN 43/100 DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA');
    expect(montoEnLetras(0.05)).toBe('CERO 05/100 DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA');
  });
});
