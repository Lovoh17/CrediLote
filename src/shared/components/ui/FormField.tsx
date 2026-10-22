import React from 'react';
import { twMerge } from 'tailwind-merge';

export interface FormFieldProps {
  label?: React.ReactNode;
  required?: boolean;
  helpText?: React.ReactNode;
  error?: string;
  badge?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  required = false,
  helpText,
  error,
  badge,
  htmlFor,
  className,
  children,
}) => {
  return (
    <div className={twMerge('space-y-1.5', className)}>
      {(label || badge) && (
        <div className="flex items-center justify-between gap-2">
          {label && (
            <label
              htmlFor={htmlFor}
              className="block text-xs font-semibold text-slate-700 tracking-tight"
            >
              {label}
              {required && <span className="text-red-500 ml-1 font-bold">*</span>}
            </label>
          )}
          {badge && <div className="shrink-0">{badge}</div>}
        </div>
      )}

      <div>{children}</div>

      {error ? (
        <p className="text-[11px] font-medium text-red-600 flex items-center gap-1 mt-1">
          {error}
        </p>
      ) : helpText ? (
        <p className="text-[11px] text-slate-500 mt-1">{helpText}</p>
      ) : null}
    </div>
  );
};
