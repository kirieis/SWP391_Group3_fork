import React from 'react';
import {
  Info,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react';

export type AlertTone = 'info' | 'warning' | 'danger' | 'success';

export interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

const TONE_CONFIG: Record<
  AlertTone,
  { container: string; iconClass: string; icon: React.ComponentType<{ size: number; className?: string }> }
> = {
  info: {
    container: 'bg-brand-50 border-brand-100 text-brand-700',
    iconClass: 'text-brand-600',
    icon: Info,
  },
  warning: {
    container: 'bg-warning-bg border-warning-border text-warning-text',
    iconClass: 'text-amber-600',
    icon: AlertTriangle,
  },
  danger: {
    container: 'bg-danger-bg border-danger-border text-danger-text',
    iconClass: 'text-rose-600',
    icon: AlertCircle,
  },
  success: {
    container: 'bg-success-bg border-success-border text-success-text',
    iconClass: 'text-emerald-600',
    icon: CheckCircle2,
  },
};

// Hộp thông báo chuẩn hóa theo ngữ cảnh thông tin, cảnh báo, lỗi
export const Alert: React.FC<AlertProps> = ({
  tone = 'info',
  title,
  children,
  onClose,
  className = '',
}) => {
  const config = TONE_CONFIG[tone];
  const IconComponent = config.icon;

  return (
    <div
      role="alert"
      className={`rounded-xl border p-3.5 text-sm flex items-start gap-3 transition-colors ${config.container} ${className}`}
    >
      <IconComponent size={18} className={`shrink-0 mt-0.5 ${config.iconClass}`} />
      <div className="flex-1 min-w-0">
        {title && <h4 className="font-semibold mb-0.5">{title}</h4>}
        <div className="text-[13px] leading-relaxed">{children}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="p-1 -mr-1 -mt-1 rounded-lg hover:bg-black/5 transition opacity-70 hover:opacity-100 shrink-0"
          aria-label="Dismiss alert"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
};
