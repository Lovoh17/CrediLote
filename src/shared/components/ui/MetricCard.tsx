import React from 'react';
import { Card } from './Card';
import { clsx } from 'clsx';

export interface MetricCardProps {
  label: string;
  value: string | number;
  helpText?: string;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  helpText,
  change,
  trend = 'neutral',
  icon,
}) => {
  return (
    <Card variant="elevated" className="p-5 hover:border-slate-300 transition-all duration-150">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        {icon && (
          <div className="p-2 bg-slate-50 border border-slate-100 rounded-lg text-slate-700 shrink-0 shadow-2xs">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{value}</span>
      </div>

      {(helpText || change) && (
        <div className="mt-2.5 flex items-center gap-2 text-xs">
          {change && (
            <span
              className={clsx(
                'font-medium px-1.5 py-0.5 rounded text-[11px] tabular-nums',
                trend === 'up' && 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
                trend === 'down' && 'bg-red-50 text-red-700 border border-red-200/60',
                trend === 'neutral' && 'bg-slate-100 text-slate-600 border border-slate-200/60'
              )}
            >
              {change}
            </span>
          )}
          {helpText && <span className="text-slate-500 text-xs truncate">{helpText}</span>}
        </div>
      )}
    </Card>
  );
};
