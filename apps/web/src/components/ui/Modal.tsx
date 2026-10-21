import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  maxWidth?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

// Khung cửa sổ modal nổi chuẩn hóa với hiệu ứng làm mờ nền và khóa cuộn trang
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  maxWidth = 'max-w-lg',
  children,
  footer,
  className = '',
}) => {
  // Lắng nghe phím ESC để đóng modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Khóa cuộn màn hình phía sau khi mở modal
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs transition-opacity duration-150 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidth} bg-surface rounded-2xl border border-line shadow-xl flex flex-col max-h-[90dvh] overflow-hidden transition-all duration-150 scale-100 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header modal */}
        {(title || subtitle) && (
          <div className="px-5 sm:px-6 py-4 border-b border-line flex items-start justify-between gap-4 shrink-0">
            <div>
              {typeof title === 'string' ? (
                <h3 className="text-lg font-semibold text-ink">{title}</h3>
              ) : (
                title
              )}
              {subtitle && <p className="text-xs text-ink-3 mt-0.5">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 -mr-1 rounded-xl text-ink-3 hover:text-ink hover:bg-neutral-bg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Nội dung có thể cuộn */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 overscroll-contain">{children}</div>

        {/* Footer nếu có */}
        {footer && (
          <div className="px-5 sm:px-6 py-4 border-t border-line bg-slate-50/50 flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
