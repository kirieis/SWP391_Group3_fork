import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  breadcrumb?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

// Tiêu đề đầu trang chuẩn hóa theo phân cấp typography Calm academic-tech
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  breadcrumb,
  action,
  className = '',
}) => {
  return (
    <div className={`flex flex-col gap-2 mb-6 ${className}`}>
      {breadcrumb && (
        <div className="text-xs text-ink-3 flex items-center gap-1.5 font-medium">
          {breadcrumb}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 border border-brand-100 flex items-center justify-center shrink-0">
              <Icon size={20} />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-semibold text-ink tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-ink-3 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="flex items-center gap-2.5 shrink-0">{action}</div>}
      </div>
    </div>
  );
};
