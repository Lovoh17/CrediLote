import { EstadoLote, EstadoCuota, EstadoNegociacion } from '@/shared/types';

/**
 * Fuente única de verdad para los colores e información visual de estados en CrediLote.
 * Alimenta tanto el mapa Leaflet (hex), los Badges (clases Tailwind), los filtros y los gráficos.
 */

export interface EstadoLoteConfig {
  label: string;
  hex: string;
  badgeVariant: 'available' | 'reserved' | 'sold' | 'info';
  badgeClasses: string;
  dotClass: string;
  filterButtonActiveClass: string;
}

export const ESTADOS_LOTE: Record<EstadoLote, EstadoLoteConfig> = {
  DISPONIBLE: {
    label: 'Disponible',
    hex: '#10B981', // emerald-500
    badgeVariant: 'available',
    badgeClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
    filterButtonActiveClass: 'bg-emerald-600 text-white shadow-sm',
  },
  RESERVADO: {
    label: 'Reservado',
    hex: '#F59E0B', // amber-500
    badgeVariant: 'reserved',
    badgeClasses: 'bg-amber-50 text-amber-700 border-amber-200',
    dotClass: 'bg-amber-500',
    filterButtonActiveClass: 'bg-amber-500 text-white shadow-sm',
  },
  VENDIDO: {
    label: 'Vendido',
    hex: '#EF4444', // red-500 (unificado)
    badgeVariant: 'sold',
    badgeClasses: 'bg-red-50 text-red-700 border-red-200',
    dotClass: 'bg-red-500',
    filterButtonActiveClass: 'bg-red-500 text-white shadow-sm',
  },
  FINIQUITADO: {
    label: 'Finiquitado',
    hex: '#3B82F6', // blue-500
    badgeVariant: 'info',
    badgeClasses: 'bg-blue-50 text-blue-700 border-blue-200',
    dotClass: 'bg-blue-500',
    filterButtonActiveClass: 'bg-blue-600 text-white shadow-sm',
  },
};

/** Colores hex para marcadores y polígonos de Leaflet (mantiene compatibilidad) */
export const COLORES_ESTADO_LOTE: Record<EstadoLote, string> = {
  DISPONIBLE: ESTADOS_LOTE.DISPONIBLE.hex,
  RESERVADO: ESTADOS_LOTE.RESERVADO.hex,
  VENDIDO: ESTADOS_LOTE.VENDIDO.hex,
  FINIQUITADO: ESTADOS_LOTE.FINIQUITADO.hex,
};

export interface EstadoCuotaConfig {
  label: string;
  badgeVariant: 'available' | 'reserved' | 'overdue' | 'neutral';
  badgeClasses: string;
  dotClass: string;
}

export const ESTADOS_CUOTA: Record<EstadoCuota, EstadoCuotaConfig> = {
  PENDIENTE: {
    label: 'Pendiente',
    badgeVariant: 'reserved',
    badgeClasses: 'bg-amber-50 text-amber-700 border-amber-200',
    dotClass: 'bg-amber-500',
  },
  PAGADO: {
    label: 'Pagado',
    badgeVariant: 'available',
    badgeClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
  },
  EN_MORA: {
    label: 'En mora',
    badgeVariant: 'overdue',
    badgeClasses: 'bg-red-50 text-red-700 border-red-200 font-semibold',
    dotClass: 'bg-red-600',
  },
  ABONO_PARCIAL: {
    label: 'Abono parcial',
    badgeVariant: 'reserved',
    badgeClasses: 'bg-orange-50 text-orange-700 border-orange-200',
    dotClass: 'bg-orange-500',
  },
};

export interface EstadoNegociacionConfig {
  label: string;
  colorDot: string;
  badgeClasses: string;
}

export const ESTADOS_NEGOCIACION: Record<EstadoNegociacion, EstadoNegociacionConfig> = {
  EN_NEGOCIACION: {
    label: 'En negociación',
    colorDot: 'bg-blue-500',
    badgeClasses: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  ESPERANDO_PROMESA: {
    label: 'Esperando promesa',
    colorDot: 'bg-amber-500',
    badgeClasses: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  CONVERTIDA: {
    label: 'Convertida en venta',
    colorDot: 'bg-emerald-500',
    badgeClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  CANCELADA: {
    label: 'Cancelada',
    colorDot: 'bg-slate-400',
    badgeClasses: 'bg-slate-100 text-slate-600 border-slate-200',
  },
};

export function getEstadoLoteConfig(estado: EstadoLote): EstadoLoteConfig {
  return ESTADOS_LOTE[estado] ?? ESTADOS_LOTE.DISPONIBLE;
}

export function getEstadoCuotaConfig(estado: EstadoCuota): EstadoCuotaConfig {
  return ESTADOS_CUOTA[estado] ?? ESTADOS_CUOTA.PENDIENTE;
}

export function getEstadoNegociacionConfig(estado: EstadoNegociacion): EstadoNegociacionConfig {
  return ESTADOS_NEGOCIACION[estado] ?? ESTADOS_NEGOCIACION.EN_NEGOCIACION;
}
