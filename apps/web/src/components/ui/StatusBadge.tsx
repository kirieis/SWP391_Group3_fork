import React from 'react';
import {
  CheckCircle2,
  Clock,
  XCircle,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import { resolveStatusTone, type StatusTone } from './status';

export interface StatusBadgeProps {
  // Trạng thái theo chuỗi tự do hoặc nghiệp vụ
  status?: string;
  // Hoặc ghi đè trực tiếp tone và nhãn
  tone?: StatusTone;
  label?: React.ReactNode;
  icon?: React.ReactNode;
  showDot?: boolean;
  className?: string;
}

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-success-bg text-success-text border-success-border',
  warning: 'bg-warning-bg text-warning-text border-warning-border',
  danger: 'bg-danger-bg text-danger-text border-danger-border',
  neutral: 'bg-neutral-bg text-neutral-text border-neutral-border',
};

const DOT_COLORS: Record<StatusTone, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  neutral: 'bg-slate-400',
};

// Huy hiệu trạng thái: luôn bao gồm icon/dot + nhãn chữ (không dùng màu đơn độc)
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  tone,
  label,
  icon,
  showDot = false,
  className = '',
}) => {
  const resolvedTone = tone || resolveStatusTone(status);
  const displayLabel = label ?? status ?? 'N/A';

  const renderIcon = () => {
    if (icon) return icon;
    if (showDot) {
      return (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT_COLORS[resolvedTone]}`}
          aria-hidden="true"
        />
      );
    }
    switch (resolvedTone) {
      case 'success':
        return <CheckCircle2 size={13} className="shrink-0" aria-hidden="true" />;
      case 'warning':
        return status?.includes('CHECKING') || status?.includes('RUNNING') || status?.includes('PENDING') ? (
          <Loader2 size={13} className="animate-spin shrink-0" aria-hidden="true" />
        ) : (
          <Clock size={13} className="shrink-0" aria-hidden="true" />
        );
      case 'danger':
        return <XCircle size={13} className="shrink-0" aria-hidden="true" />;
      case 'neutral':
      default:
        return <HelpCircle size={13} className="shrink-0" aria-hidden="true" />;
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${TONE_CLASSES[resolvedTone]} ${className}`}
    >
      {renderIcon()}
      <span>{displayLabel}</span>
    </span>
  );
};
