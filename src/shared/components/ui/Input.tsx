import React, { forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md';
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
  error?: boolean | string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      size = 'md',
      leftIcon,
      rightIcon,
      leftAddon,
      rightAddon,
      error,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const isError = Boolean(error);

    const sizeStyles = {
      sm: 'text-xs py-1.5 px-3',
      md: 'text-sm py-2 px-3',
    };

    const hasLeft = Boolean(leftIcon || leftAddon);
    const hasRight = Boolean(rightIcon || rightAddon);

    return (
      <div className="relative flex items-stretch w-full rounded-lg shadow-2xs">
        {leftAddon && (
          <span className="inline-flex items-center px-3 border border-r-0 border-slate-300 bg-slate-50 text-slate-500 text-xs font-medium rounded-l-lg select-none">
            {leftAddon}
          </span>
        )}

        <div className="relative flex-1 flex items-center">
          {leftIcon && !leftAddon && (
            <div className="absolute left-3 flex items-center pointer-events-none text-slate-400">
              {leftIcon}
            </div>
          )}

          <input
            ref={ref}
            disabled={disabled}
            className={twMerge(
              'w-full bg-white text-slate-900 border rounded-lg transition-all duration-150',
              'placeholder:text-slate-400 placeholder:font-normal',
              'focus:outline-none focus:ring-2',
              isError
                ? 'border-red-400 text-red-900 focus:border-red-500 focus:ring-red-500/20'
                : 'border-slate-300 hover:border-slate-400 focus:border-emerald-500 focus:ring-emerald-500/20',
              disabled && 'bg-slate-50 text-slate-500 border-slate-200 cursor-not-allowed',
              sizeStyles[size],
              hasLeft && !leftAddon && 'pl-9',
              hasRight && !rightAddon && 'pr-9',
              leftAddon && 'rounded-l-none',
              rightAddon && 'rounded-r-none',
              className
            )}
            {...props}
          />

          {rightIcon && !rightAddon && (
            <div className="absolute right-3 flex items-center pointer-events-none text-slate-400">
              {rightIcon}
            </div>
          )}
        </div>

        {rightAddon && (
          <span className="inline-flex items-center px-3 border border-l-0 border-slate-300 bg-slate-50 text-slate-500 text-xs font-medium rounded-r-lg select-none">
            {rightAddon}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
