import { describe, it, expect } from 'vitest';
import { validarDUI, formatearDUI, validarNIT, validarTelefonoSV } from './validaciones';

describe('validarDUI (RN-I3)', () => {
  it.each(['04512378-8', '00000000-0', '045123788'])('acepta %s', (dui) => {
    expect(validarDUI(dui).valido).toBe(true);
  });

  it('rechaza un dígito verificador incorrecto e indica el esperado', () => {
    const r = validarDUI('04512378-9');
    expect(r.valido).toBe(false);
    expect(r.mensaje).toContain('8');
  });

  it.each(['0451237-8', 'ABCDEFGH-1', ''])('rechaza el formato "%s"', (dui) => {
    expect(validarDUI(dui).valido).toBe(false);
  });

  it('formatea 9 dígitos como 00000000-0', () => {
    expect(formatearDUI('045123788')).toBe('04512378-8');
  });
});

describe('validarNIT', () => {
  it('acepta 0614-010190-101-3', () => expect(validarNIT('0614-010190-101-3').valido).toBe(true));
  it('rechaza formato incompleto', () => expect(validarNIT('0614-010190-101').valido).toBe(false));
});

describe('validarTelefonoSV', () => {
  it.each(['+503 7450-2211', '7450-2211', '22223333', '+50361234567'])('acepta %s', (tel) => {
    expect(validarTelefonoSV(tel).valido).toBe(true);
  });
  it.each(['+504 9450-2211', '1234-5678', '7450-221'])('rechaza %s', (tel) => {
    expect(validarTelefonoSV(tel).valido).toBe(false);
  });
});
