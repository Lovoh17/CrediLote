import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { EstadoLote, EstadoCuota } from '@/shared/types';
import { getEstadoLoteConfig, getEstadoCuotaConfig } from '@/shared/theme/status';

export type BadgeVariant =
  | 'available'
  | 'reserved'
  | 'sold'
  | 'overdue'
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  estadoLote?: EstadoLote;
  estadoCuota?: EstadoCuota;
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant,
  estadoLote,
  estadoCuota,
  size = 'md',
  dot = false,
  className,
  ...props
}) => {
  // Si se provee estado de lote o cuota, se autocalcula la variante
  let effectiveVariant: BadgeVariant = variant ?? 'neutral';
  let defaultText = children;

  if (estadoLote) {
    const config = getEstadoLoteConfig(estadoLote);
    effectiveVariant = config.badgeVariant;
    if (!defaultText) defaultText = config.label;
  } else if (estadoCuota) {
    const config = getEstadoCuotaConfig(estadoCuota);
    effectiveVariant = config.badgeVariant;
    if (!defaultText) defaultText = config.label;
  }

  const variantStyles: Record<BadgeVariant, string> = {
    available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    reserved: 'bg-amber-50 text-amber-700 border-amber-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    sold: 'bg-red-50 text-red-700 border-red-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
    overdue: 'bg-red-50 text-red-700 border-red-200 font-semibold',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
  };

  const dotStyles: Record<BadgeVariant, string> = {
    available: 'bg-emerald-500',
    success: 'bg-emerald-500',
    reserved: 'bg-amber-500',
    warning: 'bg-amber-500',
    sold: 'bg-red-500',
    danger: 'bg-red-500',
    overdue: 'bg-red-600',
    neutral: 'bg-slate-400',
    info: 'bg-blue-500',
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5',
  };

  return (
    <span
      className={twMerge(
        'inline-flex items-center gap-1.5 font-medium border rounded-md transition-colors tabular-nums',
        variantStyles[effectiveVariant] ?? variantStyles.neutral,
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={clsx('w-1.5 h-1.5 rounded-full shrink-0', dotStyles[effectiveVariant] ?? dotStyles.neutral)}
        />
      )}
      {defaultText}
    </span>
  );
};
