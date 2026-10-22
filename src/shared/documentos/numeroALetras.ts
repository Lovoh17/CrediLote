/**
 * Monto en letras para recibos, al estilo de los documentos salvadoreños:
 * 1125    → "UN MIL CIENTO VEINTICINCO 00/100 DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA"
 * 531.43  → "QUINIENTOS TREINTA Y UN 43/100 DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA"
 */

const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const ESPECIALES: Record<number, string> = {
  10: 'DIEZ', 11: 'ONCE', 12: 'DOCE', 13: 'TRECE', 14: 'CATORCE', 15: 'QUINCE',
  16: 'DIECISÉIS', 17: 'DIECISIETE', 18: 'DIECIOCHO', 19: 'DIECINUEVE',
  20: 'VEINTE', 21: 'VEINTIUN', 22: 'VEINTIDÓS', 23: 'VEINTITRÉS', 24: 'VEINTICUATRO',
  25: 'VEINTICINCO', 26: 'VEINTISÉIS', 27: 'VEINTISIETE', 28: 'VEINTIOCHO', 29: 'VEINTINUEVE',
};
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function decenas(n: number): string {
  if (n < 10) return UNIDADES[n];
  if (ESPECIALES[n]) return ESPECIALES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`;
}

function centenas(n: number): string {
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  return [CENTENAS[c], decenas(resto)].filter(Boolean).join(' ');
}

/** Entero (0 a 999,999,999) en letras. Los miles se escriben "UN MIL", como en los documentos notariales. */
export function enteroALetras(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999) throw new Error(`Número fuera de rango: ${n}`);
  if (n === 0) return 'CERO';

  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];

  if (millones > 0) partes.push(millones === 1 ? 'UN MILLÓN' : `${centenas(millones)} MILLONES`);
  if (miles > 0) partes.push(`${centenas(miles)} MIL`);
  if (resto > 0) partes.push(centenas(resto));

  return partes.join(' ');
}

/** Monto en dólares en letras, con los centavos en formato NN/100. */
export function montoEnLetras(monto: number): string {
  const centavosTotales = Math.round(Math.abs(monto) * 100);
  const entero = Math.floor(centavosTotales / 100);
  const centavos = String(centavosTotales % 100).padStart(2, '0');
  return `${enteroALetras(entero)} ${centavos}/100 DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA`;
}
