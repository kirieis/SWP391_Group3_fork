import React from 'react';

// Props cho Card nguyên thủy
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  // Có hiệu ứng nổi nhẹ khi rê chuột (cho card có tương tác click) hay không
  hoverable?: boolean;
}

// Component thẻ giao diện dùng chung theo design token: bo góc 16px, viền line, nền surface
export const Card: React.FC<CardProps> = ({
  hoverable = false,
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`rounded-2xl bg-surface border border-line shadow-sm p-5 sm:p-6 transition-all duration-150 ease-out ${
        hoverable ? 'hover:shadow-md hover:border-slate-300' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
