import React, { forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean | string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, className, disabled, rows = 3, ...props }, ref) => {
    const isError = Boolean(error);

    return (
      <div className="relative w-full rounded-lg shadow-2xs">
        <textarea
          ref={ref}
          rows={rows}
          disabled={disabled}
          className={twMerge(
            'w-full bg-white text-slate-900 border rounded-lg text-xs sm:text-sm p-3 transition-all duration-150',
            'placeholder:text-slate-400 placeholder:font-normal',
            'focus:outline-none focus:ring-2',
            isError
              ? 'border-red-400 text-red-900 focus:border-red-500 focus:ring-red-500/20'
              : 'border-slate-300 hover:border-slate-400 focus:border-emerald-500 focus:ring-emerald-500/20',
            disabled && 'bg-slate-50 text-slate-500 border-slate-200 cursor-not-allowed',
            className
          )}
          {...props}
        />
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
