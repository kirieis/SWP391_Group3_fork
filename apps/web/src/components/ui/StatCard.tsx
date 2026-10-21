import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type StatTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  className?: string;
}

const TONE_STYLES: Record<StatTone, { chip: string; valueText: string }> = {
  brand: {
    chip: 'bg-brand-50 text-brand-700 border-brand-100',
    valueText: 'text-ink',
  },
  success: {
    chip: 'bg-success-bg text-success-text border-success-border',
    valueText: 'text-ink',
  },
  warning: {
    chip: 'bg-warning-bg text-warning-text border-warning-border',
    valueText: 'text-ink',
  },
  danger: {
    chip: 'bg-danger-bg text-danger-text border-danger-border',
    valueText: 'text-danger-text',
  },
  neutral: {
    chip: 'bg-neutral-bg text-neutral-text border-neutral-border',
    valueText: 'text-ink',
  },
};

// Card hiển thị chỉ số thống kê với icon chip màu dịu và số dạng tabular-nums
export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  caption,
  icon: Icon,
  tone = 'brand',
  className = '',
}) => {
  const styles = TONE_STYLES[tone] || TONE_STYLES.brand;

  return (
    <div
      className={`rounded-2xl bg-surface border border-line shadow-sm p-5 flex flex-col justify-between transition-all duration-150 ease-out min-w-0 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-medium text-ink-3 tracking-wide">{label}</span>
        {Icon && (
          <div
            className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${styles.chip}`}
          >
            <Icon size={18} />
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className={`text-3xl font-semibold tabular-nums tracking-tight ${styles.valueText}`}>
          {value}
        </div>
        {caption && <div className="text-xs text-ink-3 mt-1.5">{caption}</div>}
      </div>
    </div>
  );
};
