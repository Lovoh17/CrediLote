import React from 'react';
import { twMerge } from 'tailwind-merge';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'elevated' | 'outline' | 'flat';
  interactive?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'outline',
  interactive = false,
  className,
  ...props
}) => {
  const variantStyles = {
    elevated: 'bg-white shadow-xs border border-slate-200/80 ring-1 ring-slate-900/5',
    outline: 'bg-white border border-slate-200/90 shadow-2xs',
    flat: 'bg-slate-50/80 border border-slate-200/60',
  };

  const interactiveStyles = interactive
    ? 'hover:border-slate-300 hover:shadow-xs transition-all duration-150 cursor-pointer'
    : '';

  return (
    <div
      className={twMerge(
        'rounded-xl overflow-hidden',
        variantStyles[variant],
        interactiveStyles,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className,
  ...props
}) => (
  <div
    className={twMerge(
      'px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white',
      className
    )}
    {...props}
  >
    {children}
  </div>
);

export const CardBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className,
  ...props
}) => (
  <div className={twMerge('p-6', className)} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className,
  ...props
}) => (
  <div
    className={twMerge(
      'px-6 py-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between',
      className
    )}
    {...props}
  >
    {children}
  </div>
);
