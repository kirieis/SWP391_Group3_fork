import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { HelpCircle } from 'lucide-react';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

// Trạng thái trống sạch sẽ, yên tĩnh và chỉ dẫn người dùng rõ ràng
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = HelpCircle,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 sm:p-12 ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-neutral-bg border border-line text-ink-3 flex items-center justify-center mb-4">
        <Icon size={24} />
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && (
        <p className="text-sm text-ink-3 max-w-sm mt-1 mb-5">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};
