import React from 'react';
import { twMerge } from 'tailwind-merge';

export interface PropertyProps {
  label: string;
  value: React.ReactNode;
  helpText?: string;
  className?: string;
}

export const Property: React.FC<PropertyProps> = ({ label, value, helpText, className }) => (
  <div className={twMerge('py-2.5 sm:grid sm:grid-cols-3 sm:gap-4 items-baseline', className)}>
    <dt className="text-xs font-medium text-slate-500">{label}</dt>
    <dd className="mt-1 text-sm text-slate-900 sm:col-span-2 sm:mt-0 font-medium">
      {value}
      {helpText && <p className="text-xs text-slate-400 font-normal mt-0.5">{helpText}</p>}
    </dd>
  </div>
);

export const PropertyList: React.FC<React.HTMLAttributes<HTMLDListElement>> = ({
  children,
  className,
  ...props
}) => (
  <dl className={twMerge('divide-y divide-slate-100', className)} {...props}>
    {children}
  </dl>
);
