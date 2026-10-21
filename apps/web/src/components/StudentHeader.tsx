import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, GraduationCap } from 'lucide-react';

export interface StudentHeaderProps {
  user?: { fullName?: string; email?: string } | null;
  className?: string;
}

// Header dùng chung chuẩn hóa cho phân hệ Sinh viên: sticky, căn chỉnh cùng container nội dung (max-w-7xl)
export const StudentHeader: React.FC<StudentHeaderProps> = ({ user, className = '' }) => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('aita_token');
    localStorage.removeItem('aita_user');
    navigate('/login', { replace: true });
  };

  return (
    <header className={`sticky top-0 z-30 bg-surface/95 backdrop-blur-md border-b border-line ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Nhãn Logo & Cổng sinh viên */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-accent text-white flex items-center justify-center font-black text-sm tracking-wide shrink-0 shadow-xs">
            FPT
          </div>
          <div className="min-w-0 flex items-center gap-2.5">
            <span className="font-semibold text-base text-ink tracking-tight truncate">
              AITA-Intelligent
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-100">
              <GraduationCap size={13} />
              <span>Student Portal</span>
            </span>
          </div>
        </div>

        {/* Khối tài khoản & Nút Đăng xuất */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 border border-brand-100 flex items-center justify-center text-xs font-bold uppercase shrink-0">
              {user?.fullName?.charAt(0) || 'SV'}
            </div>
            <div className="hidden md:flex flex-col text-left min-w-0 max-w-[160px]">
              <span className="text-xs font-semibold text-ink truncate" title={user?.fullName || 'Student'}>
                {user?.fullName || 'Student'}
              </span>
              <span className="text-[11px] text-ink-3 truncate" title={user?.email || 'student@fpt.edu.vn'}>
                {user?.email || 'student@fpt.edu.vn'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="p-2 text-ink-3 hover:text-rose-600 hover:bg-neutral-bg rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </header>
  );
};
