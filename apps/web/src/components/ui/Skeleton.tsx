import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

// Khung xương tải dữ liệu (chỉ dùng CSS pulse thuần)
export const Skeleton: React.FC<SkeletonProps> = ({ className = '', ...props }) => {
  return (
    <div
      className={`animate-pulse bg-slate-200/80 rounded-xl ${className}`}
      aria-hidden="true"
      {...props}
    />
  );
};
