import React, { forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: 'sm' | 'md';
  error?: boolean | string;
  options?: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ size = 'md', error, options, children, className, disabled, ...props }, ref) => {
    const isError = Boolean(error);

    const sizeStyles = {
      sm: 'text-xs py-1.5 pl-3 pr-8',
      md: 'text-sm py-2 pl-3 pr-9',
    };

    return (
      <div className="relative w-full rounded-lg shadow-2xs">
        <select
          ref={ref}
          disabled={disabled}
          className={twMerge(
            'w-full bg-white text-slate-900 border rounded-lg appearance-none transition-all duration-150',
            'focus:outline-none focus:ring-2 cursor-pointer',
            isError
              ? 'border-red-400 text-red-900 focus:border-red-500 focus:ring-red-500/20'
              : 'border-slate-300 hover:border-slate-400 focus:border-emerald-500 focus:ring-emerald-500/20',
            disabled && 'bg-slate-50 text-slate-500 border-slate-200 cursor-not-allowed',
            sizeStyles[size],
            className
          )}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>
    );
  }
);

Select.displayName = 'Select';
