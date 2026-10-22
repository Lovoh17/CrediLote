import React from 'react';
import { twMerge } from 'tailwind-merge';
import { Inbox } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (item: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export interface DataGridProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string | number;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  emptyAction?: React.ReactNode;
  isLoading?: boolean;
  className?: string;
  stickyHeader?: boolean;
  striped?: boolean;
  compact?: boolean;
  onRowClick?: (item: T) => void;
}

export function DataGrid<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'No hay registros disponibles.',
  emptyIcon,
  emptyAction,
  isLoading = false,
  className,
  stickyHeader = false,
  striped = false,
  compact = false,
  onRowClick,
}: DataGridProps<T>) {
  return (
    <div
      className={twMerge(
        'overflow-x-auto border border-slate-200/90 rounded-xl bg-white shadow-2xs',
        className
      )}
    >
      <table className="min-w-full divide-y divide-slate-200/90 text-sm">
        <thead
          className={twMerge(
            'bg-slate-50 text-slate-600 font-semibold text-[11px] tracking-wider uppercase select-none',
            stickyHeader && 'sticky top-0 z-10 shadow-2xs backdrop-blur-xs bg-slate-50/95'
          )}
        >
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={twMerge(
                  compact ? 'px-3 py-2.5' : 'px-4 py-3',
                  'text-left whitespace-nowrap',
                  col.align === 'center' && 'text-center',
                  col.align === 'right' && 'text-right',
                  col.className
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-800 tabular-nums">
          {isLoading ? (
            <tr>
              <td colSpan={columns.length} className="px-6 py-14 text-center text-slate-400">
                <span className="inline-block w-6 h-6 border-2 border-slate-300 border-t-emerald-600 rounded-full animate-spin mb-2" />
                <p className="text-xs font-medium text-slate-500">Cargando información...</p>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-6 py-12 text-center text-slate-400">
                <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2.5">
                    {emptyIcon || <Inbox className="w-5 h-5 text-slate-400" />}
                  </div>
                  <p className="text-xs font-medium text-slate-600 mb-1">{emptyMessage}</p>
                  {emptyAction && <div className="mt-2">{emptyAction}</div>}
                </div>
              </td>
            </tr>
          ) : (
            data.map((item, idx) => (
              <tr
                key={keyExtractor(item, idx)}
                onClick={() => onRowClick && onRowClick(item)}
                className={twMerge(
                  'transition-colors duration-100',
                  striped && idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white',
                  onRowClick
                    ? 'cursor-pointer hover:bg-slate-50/80 active:bg-slate-100/70'
                    : 'hover:bg-slate-50/40'
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={twMerge(
                      compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 whitespace-nowrap text-xs sm:text-sm',
                      col.align === 'center' && 'text-center',
                      col.align === 'right' && 'text-right',
                      col.className
                    )}
                  >
                    {col.render ? col.render(item, idx) : (item as any)[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
