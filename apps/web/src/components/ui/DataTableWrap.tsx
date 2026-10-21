import React from 'react';

export interface DataTableWrapProps {
  children: React.ReactNode;
  minWidth?: string;
  className?: string;
}

// Khung chứa bảng dữ liệu hỗ trợ cuộn ngang linh hoạt trên thiết bị di động
export const DataTableWrap: React.FC<DataTableWrapProps> = ({
  children,
  minWidth = 'min-w-[640px]',
  className = '',
}) => {
  return (
    <div className={`w-full overflow-x-auto rounded-xl border border-line bg-surface ${className}`}>
      <div className={minWidth}>{children}</div>
    </div>
  );
};
