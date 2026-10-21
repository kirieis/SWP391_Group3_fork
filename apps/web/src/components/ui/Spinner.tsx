import React from 'react';
import { Loader2 } from 'lucide-react';

export interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  ariaLabel?: string;
}

const SIZE_MAP = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 28,
};

// Vòng xoay tải dữ liệu đồng nhất
export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  className = '',
  ariaLabel = 'Loading...',
}) => {
  return (
    <Loader2
      size={SIZE_MAP[size]}
      className={`animate-spin text-brand-600 ${className}`}
      aria-label={ariaLabel}
      role="status"
    />
  );
};
