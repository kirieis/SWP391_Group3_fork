import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { isTokenExpired, getStoredUser, type StoredUser } from '../utils/auth';

interface RouteGuardProps {
  children: ReactNode;
  allowedRoles?: ('STUDENT' | 'LECTURER' | 'ADMIN')[];
}

export default function RouteGuard({ children, allowedRoles }: RouteGuardProps) {
  const location = useLocation();
  const token = localStorage.getItem('aita_token');
  const [user, setUser] = useState<StoredUser | null>(getStoredUser);

  // All hooks phải được gọi trước các early return (Rules of Hooks)
  // 2. Xác thực phiên làm việc định kỳ / khôi phục phiên qua GET /api/auth/me
  // Chỉ thực sự gọi API khi token hợp lệ (kiểm tra bằng biến tokenIsValid bên dưới)
  useEffect(() => {
    // Nếu token không hợp lệ thì không cần xác thực (sẽ redirect ở dưới)
    if (!token || isTokenExpired(token)) return;

    let isMounted = true;
    const verifySession = async () => {
      const res = await apiRequest<StoredUser>('/auth/me');
      if (!isMounted) return;
      if (res.success && res.data) {
        localStorage.setItem('aita_user', JSON.stringify(res.data));
        setUser(res.data);
      } else if (res.status === 401) {
        localStorage.removeItem('aita_token');
        localStorage.removeItem('aita_user');
        window.location.href = '/login?reason=expired';
        return;
      }
    };

    verifySession();
    return () => {
      isMounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1. Kiểm tra nhanh token hợp lệ trước khi render
  if (!token || isTokenExpired(token)) {
    localStorage.removeItem('aita_token');
    localStorage.removeItem('aita_user');
    const reason = token ? '?reason=expired' : '';
    return <Navigate to={`/login${reason}`} replace state={{ from: location }} />;
  }

  const currentRole = user?.role || 'STUDENT';

  // Điều hướng phân quyền theo SRS:
  // - Student vào nhầm trang giảng viên (/lecturer/*) -> đẩy về /dashboard
  // - Lecturer vào nhầm trang sinh viên (/dashboard) -> đẩy về /lecturer/dashboard
  if (allowedRoles && allowedRoles.length > 0) {
    if (!allowedRoles.includes(currentRole)) {
      if (currentRole === 'STUDENT') {
        return <Navigate to="/dashboard" replace />;
      } else {
        return <Navigate to="/lecturer/dashboard" replace />;
      }
    }
  }

  return <>{children}</>;
}
