import React from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger-outline' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-700 border border-transparent shadow-sm',
  secondary:
    'bg-surface text-ink hover:bg-neutral-bg active:bg-slate-200 border border-line shadow-sm',
  ghost:
    'bg-transparent text-ink-2 hover:text-ink hover:bg-neutral-bg active:bg-slate-200 border border-transparent',
  'danger-outline':
    'bg-surface border border-danger-border text-danger-text hover:bg-danger-bg active:bg-rose-100 shadow-sm',
  danger:
    'bg-danger-text text-white hover:opacity-95 active:opacity-90 border border-transparent shadow-sm',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-10 min-h-[40px] px-4 text-sm rounded-xl gap-2',
  lg: 'h-11 min-h-[44px] px-5 text-[15px] rounded-xl gap-2.5',
};

// Nút bấm chuẩn hóa theo Calm academic-tech với đầy đủ interaction states và tap target
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`inline-flex items-center justify-center font-medium transition-all duration-150 ease-out select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${
          VARIANT_CLASSES[variant]
        } ${SIZE_CLASSES[size]} ${
          isDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'
        } ${className}`}
        {...props}
      >
        {isLoading ? (
          <Spinner
            size={size === 'sm' ? 'xs' : 'sm'}
            className={variant === 'primary' || variant === 'danger' ? 'text-white' : 'text-brand-600'}
          />
        ) : (
          leftIcon
        )}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
