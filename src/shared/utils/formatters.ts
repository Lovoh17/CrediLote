// Utilidades de formateo para el sistema CrediLote

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  const symbol = currency === 'USD' ? '$' : currency;
  return `${symbol} ${Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(dateString: string | undefined): string {
  if (!dateString) return '-';
  // Las fechas "YYYY-MM-DD" se interpretan como fecha local: new Date('YYYY-MM-DD') usa UTC y en
  // El Salvador (UTC-6) mostraría el día anterior (RN-F4).
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  const date = soloFecha
    ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
    : new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('es-HN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * Fecha de hoy "YYYY-MM-DD" según el reloj local. new Date().toISOString() usa UTC: en El Salvador (UTC-6),
 * después de las 6 p. m. devolvería la fecha de mañana (RN-F4).
 */
export function hoyISO(ahora: Date = new Date()): string {
  const dosDigitos = (n: number) => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}-${dosDigitos(ahora.getMonth() + 1)}-${dosDigitos(ahora.getDate())}`;
}

export function formatArea(m2: number): string {
  const formatted = Number(m2 || 0).toLocaleString('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const varas = (m2 * 1.430828).toLocaleString('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} m² (${varas} v²)`;
}

export function formatPercentage(value: number): string {
  return `${(value || 0).toFixed(2)}%`;
}
