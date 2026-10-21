import React from 'react';
import { AlertCircle } from 'lucide-react';

export interface FormFieldProps {
  label?: string;
  htmlFor?: string;
  error?: React.ReactNode;
  helper?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

// Khung trường nhập liệu chuẩn với nhãn trên, chú thích phụ và thông báo lỗi rõ ràng
export const FormField: React.FC<FormFieldProps> = ({
  label,
  htmlFor,
  error,
  helper,
  required = false,
  className = '',
  children,
}) => {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="text-sm font-medium text-ink flex items-center gap-1 select-none"
        >
          <span>{label}</span>
          {required && <span className="text-danger-text">*</span>}
        </label>
      )}

      {children}

      {error ? (
        <div className="flex items-center gap-1.5 text-xs text-danger-text mt-0.5">
          <AlertCircle size={13} className="shrink-0" />
          <span>{error}</span>
        </div>
      ) : helper ? (
        <p className="text-xs text-ink-3 mt-0.5">{helper}</p>
      ) : null}
    </div>
  );
};
