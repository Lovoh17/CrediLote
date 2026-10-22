/**
 * Validaciones de identificación y contacto de El Salvador (RN-I3 del vault).
 */

export interface ResultadoValidacion {
  valido: boolean;
  mensaje?: string;
}

const OK: ResultadoValidacion = { valido: true };

/**
 * DUI: formato 00000000-0 con dígito verificador.
 * dv = (10 − (Σ dₖ · (10 − k)) mod 10) mod 10, con pesos del 9 al 2.
 */
export function validarDUI(dui: string): ResultadoValidacion {
  const limpio = dui.trim();
  const match = limpio.match(/^(\d{8})-?(\d)$/);
  if (!match) return { valido: false, mensaje: 'El DUI debe tener el formato 00000000-0.' };

  const [, cuerpo, dv] = match;
  const suma = cuerpo.split('').reduce((acc, d, i) => acc + Number(d) * (9 - i), 0);
  const esperado = (10 - (suma % 10)) % 10;
  if (Number(dv) !== esperado) {
    return { valido: false, mensaje: `El dígito verificador del DUI no coincide (debería ser ${esperado}). Revise el número.` };
  }
  return OK;
}

/** Normaliza un DUI de 9 dígitos al formato 00000000-0. */
export function formatearDUI(dui: string): string {
  const digitos = dui.replace(/\D/g, '');
  return digitos.length === 9 ? `${digitos.slice(0, 8)}-${digitos.slice(8)}` : dui.trim();
}

/** NIT de persona jurídica: 0000-000000-000-0. */
export function validarNIT(nit: string): ResultadoValidacion {
  return /^\d{4}-\d{6}-\d{3}-\d$/.test(nit.trim())
    ? OK
    : { valido: false, mensaje: 'El NIT debe tener el formato 0000-000000-000-0.' };
}

/** Teléfono de El Salvador: +503 seguido de 8 dígitos que empiezan en 2, 6 o 7. */
export function validarTelefonoSV(telefono: string): ResultadoValidacion {
  const digitos = telefono.replace(/\D/g, '');
  const local = digitos.startsWith('503') && digitos.length === 11 ? digitos.slice(3) : digitos;
  return /^[267]\d{7}$/.test(local)
    ? OK
    : { valido: false, mensaje: 'El teléfono debe tener 8 dígitos (+503 0000-0000) y empezar con 2, 6 o 7.' };
}
