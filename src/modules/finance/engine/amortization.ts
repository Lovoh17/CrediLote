import { Cuota, SistemaAmortizacion } from '@/shared/types';

export interface ParametrosAmortizacion {
  precioTotal: number;
  prima: number;
  plazoMeses: number;
  tasaInteresAnual: number; // Porcentaje anual (ej. 12 para 12%)
  sistema: SistemaAmortizacion;
  fechaInicio: string; // YYYY-MM-DD (fecha de firma)
  diaCortePago?: number;
  contratoId?: string;
}

export interface ResumenFinanciero {
  precioTotal: number;
  prima: number;
  porcentajePrima: number;
  saldoFinanciar: number;
  plazoMeses: number;
  cuotaMensualInicial: number;
  totalIntereses: number;
  costoTotalFinanciamiento: number;
}

// ---------------------------------------------------------------------------
// Fechas (RN-F4): se operan como año/mes/día, sin new Date('YYYY-MM-DD'), que usa UTC
// y en El Salvador (UTC-6) corre los vencimientos un día.
// ---------------------------------------------------------------------------

const diasDelMes = (anio: number, mes: number) => new Date(anio, mes, 0).getDate(); // mes 1-12

/**
 * Fecha que cae `meses` meses después de `fechaISO`, en el día `dia`
 * (o el último día del mes si ese mes es más corto). Devuelve "YYYY-MM-DD".
 */
export function fechaVencimiento(fechaISO: string, meses: number, dia: number): string {
  const [anio, mes] = fechaISO.split('-').map(Number);
  const indice = anio * 12 + (mes - 1) + meses;
  const a = Math.floor(indice / 12);
  const m = (indice % 12) + 1;
  const d = Math.min(Math.max(1, Math.round(dia)), diasDelMes(a, m));
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Redondeo (RN-F3): todo en centavos enteros, mitad hacia arriba.
// ---------------------------------------------------------------------------

const aCentavos = (monto: number) => Math.round(monto * 100);
const redondearCentavos = (valorEnCentavos: number) => Math.round(valorEnCentavos);

export function calcularResumenFinanciero(params: ParametrosAmortizacion): ResumenFinanciero {
  const { precioTotal, prima, plazoMeses } = params;
  const saldoFinanciar = Math.max(0, precioTotal - prima);
  const porcentajePrima = precioTotal > 0 ? (prima / precioTotal) * 100 : 0;

  const cuotas = generarTablaAmortizacion(params);
  const totalIntereses = cuotas.reduce((acc, c) => acc + aCentavos(c.abonoInteres), 0) / 100;
  const cuotaMensualInicial = cuotas.length > 0 ? cuotas[0].montoCuota : 0;

  return {
    precioTotal,
    prima,
    porcentajePrima,
    saldoFinanciar,
    plazoMeses,
    cuotaMensualInicial,
    totalIntereses,
    costoTotalFinanciamiento: (aCentavos(prima) + aCentavos(saldoFinanciar) + aCentavos(totalIntereses)) / 100,
  };
}

/**
 * Tabla de amortización según RN-F1 a RN-F4 de 03.2:
 * - Francés: cuota fija redondeada una vez; interés del periodo redondeado; capital = cuota − interés.
 * - Alemán y Directo: capital fijo redondeado.
 * - La última cuota toma exactamente el saldo restante (absorbe las diferencias de redondeo).
 * - Con tasa 0 el Francés equivale al Directo.
 */
export function generarTablaAmortizacion(params: ParametrosAmortizacion): Cuota[] {
  const {
    precioTotal,
    prima,
    plazoMeses,
    tasaInteresAnual,
    sistema,
    fechaInicio,
    diaCortePago = 15,
    contratoId = 'temp-id',
  } = params;

  const n = Math.floor(plazoMeses);
  const saldoInicial = aCentavos(Math.max(0, precioTotal - prima));
  if (saldoInicial <= 0 || n <= 0) return [];

  const i = sistema === 'DIRECTO_SIN_INTERES' ? 0 : Math.max(0, tasaInteresAnual) / 1200;

  // Cuota fija (Francés) o capital fijo (Alemán / Directo), en centavos
  const cuotaFija =
    sistema === 'FRANCES' && i > 0
      ? redondearCentavos((saldoInicial * (i * Math.pow(1 + i, n))) / (Math.pow(1 + i, n) - 1))
      : 0;
  const capitalFijo = redondearCentavos(saldoInicial / n);

  const cuotas: Cuota[] = [];
  let saldo = saldoInicial;

  for (let t = 1; t <= n; t++) {
    const interes = redondearCentavos(saldo * i);
    let capital = sistema === 'FRANCES' && i > 0 ? cuotaFija - interes : capitalFijo;
    if (t === n || capital > saldo) capital = saldo;
    if (capital < 0) capital = 0;
    saldo -= capital;

    cuotas.push({
      id: `${contratoId}-c${t}`,
      contratoId,
      numeroCuota: t,
      fechaVencimiento: fechaVencimiento(fechaInicio, t, diaCortePago),
      montoCuota: (capital + interes) / 100,
      abonoCapital: capital / 100,
      abonoInteres: interes / 100,
      saldoInsoluto: saldo / 100,
      estado: 'PENDIENTE',
    });
  }

  return cuotas;
}
