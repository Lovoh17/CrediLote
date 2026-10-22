/**
 * Aplicación de pagos a cuotas y numeración de folios (RN-C1, RN-C3, RN-C4 de 03.2).
 * Funciones puras: los montos se operan en centavos enteros.
 */
import { Cuota, EstadoCuota } from '@/shared/types';

const aCentavos = (monto: number) => Math.round(monto * 100);
const aMonto = (centavos: number) => centavos / 100;

/** Monto pagado de una cuota (los registros antiguos marcados PAGADO sin monto cuentan como completos). */
export function pagadoDeCuota(c: Cuota): number {
  if (c.montoPagado !== undefined) return c.montoPagado;
  return c.estado === 'PAGADO' ? c.montoCuota : 0;
}

export function pendienteDeCuota(c: Cuota): number {
  return aMonto(Math.max(0, aCentavos(c.montoCuota) - aCentavos(pagadoDeCuota(c))));
}

/** Saldo total pendiente de un conjunto de cuotas (normalmente las de un contrato). */
export function pendienteTotal(cuotas: Cuota[]): number {
  return aMonto(cuotas.reduce((acc, c) => acc + aCentavos(pendienteDeCuota(c)), 0));
}

export function estadoSegunPagado(montoCuota: number, montoPagado: number): EstadoCuota {
  if (aCentavos(montoPagado) >= aCentavos(montoCuota)) return 'PAGADO';
  return aCentavos(montoPagado) > 0 ? 'ABONO_PARCIAL' : 'PENDIENTE';
}

export interface ResultadoAplicacion {
  aplicaciones: { cuotaId: string; monto: number }[];
  /** Monto que excede todo lo pendiente (debe rechazarse). */
  sobrante: number;
}

/**
 * RN-C1 (sin recargos, modelo v1): el pago cubre primero la cuota pendiente más antigua y, si sobra,
 * las siguientes en orden. Un pago menor que la cuota queda como abono parcial.
 */
export function aplicarPago(cuotas: Cuota[], monto: number): ResultadoAplicacion {
  let disponible = aCentavos(monto);
  const aplicaciones: ResultadoAplicacion['aplicaciones'] = [];

  [...cuotas]
    .filter((c) => pendienteDeCuota(c) > 0)
    .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento) || a.numeroCuota - b.numeroCuota)
    .forEach((c) => {
      if (disponible <= 0) return;
      const aplicar = Math.min(disponible, aCentavos(pendienteDeCuota(c)));
      aplicaciones.push({ cuotaId: c.id, monto: aMonto(aplicar) });
      disponible -= aplicar;
    });

  return { aplicaciones, sobrante: aMonto(Math.max(0, disponible)) };
}

// ---------------------------------------------------------------------------
// Folios (D5): PREFIJO-AAAA-NNNN por proyecto y año; las entregas usan PREFIJO-ENT-AAAA-NNNN.
// ---------------------------------------------------------------------------

/** Prefijo de 2 a 5 letras a partir de las iniciales del nombre del proyecto (p. ej. "Sucesión Lino Marín" → "SLM"). */
export function prefijoDeProyecto(nombre: string): string {
  const palabras = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((p) => p.length > 2 || /^\d+$/.test(p));
  const iniciales = palabras.map((p) => p[0]).join('').slice(0, 5);
  if (iniciales.length >= 2) return iniciales;
  const letras = nombre.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase();
  return (letras.slice(0, 3) || 'REC').padEnd(2, 'X');
}

export type TipoFolio = 'RECIBO' | 'ENTREGA';

export function claveContadorFolio(proyectoId: string, tipo: TipoFolio, anio: number): string {
  return `${proyectoId}|${tipo}|${anio}`;
}

export function formatearFolio(prefijo: string, tipo: TipoFolio, anio: number, numero: number): string {
  const correlativo = String(numero).padStart(4, '0');
  return tipo === 'ENTREGA' ? `${prefijo}-ENT-${anio}-${correlativo}` : `${prefijo}-${anio}-${correlativo}`;
}
