import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-3xl',
    '3xl': 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto print:static print:z-auto print:overflow-visible">
      <div className="flex min-h-full items-center justify-center p-4 text-center print:p-0 print:block">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs transition-opacity print:hidden"
          onClick={onClose}
        />

        {/* Modal Dialog */}
        <div
          className={twMerge(
            'w-full transform overflow-hidden rounded-2xl bg-white text-left align-middle shadow-2xl transition-all border border-slate-200 z-10',
            'print:shadow-none print:border-0 print:rounded-none print:p-0 print:max-w-none print:static',
            sizeClasses[size]
          )}
        >
          {/* Header */}
          {(title || description) && (
            <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/50 print:hidden">
              <div>
                {title && <h3 className="text-base font-semibold text-slate-900">{title}</h3>}
                {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Content */}
          <div className="p-6 print:p-0">{children}</div>

          {/* Footer */}
          {footer && (
            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2 print:hidden">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
