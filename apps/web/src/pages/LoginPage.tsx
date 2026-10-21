import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import {
  GraduationCap,
  School,
  ShieldCheck,
  Code2,
  Cpu,
  BarChart3,
  AlertTriangle,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import { isTokenExpired } from '../utils/auth';
import { Alert, Spinner } from '../components/ui';

// Kiểu trả về từ API đăng nhập
interface AuthResponseData {
  token: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: 'STUDENT' | 'LECTURER' | 'ADMIN';
    [key: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// Biến môi trường và cờ kiểm tra Dev Mode
// ---------------------------------------------------------------------------
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const IS_PLACEHOLDER =
  !GOOGLE_CLIENT_ID ||
  GOOGLE_CLIENT_ID === 'placeholder' ||
  GOOGLE_CLIENT_ID.startsWith('your_google_client_id');

// Dev Mode chỉ được kích hoạt khi CẢ HAI điều kiện thỏa mãn:
// 1. import.meta.env.DEV === true (chỉ trong môi trường development, không phải production build)
// 2. VITE_ENABLE_DEV_LOGIN === 'true'
const ENABLE_DEV_LOGIN =
  import.meta.env.DEV === true &&
  import.meta.env.VITE_ENABLE_DEV_LOGIN === 'true';

type Role = 'STUDENT' | 'LECTURER';

// ---------------------------------------------------------------------------
// Hook: Đăng nhập bằng Google OAuth thật (access_token flow)
// ---------------------------------------------------------------------------
function useGoogleOAuth(role: Role, onSuccess: (token: string, role: Role) => void, onError: (msg: string) => void) {
  return useGoogleLogin({
    flow: 'implicit',
    onSuccess: (tokenResponse) => {
      onSuccess(tokenResponse.access_token, role);
    },
    onError: (error) => {
      console.error('Google OAuth error:', error);
      onError('Google sign-in failed. Please try again.');
    },
    onNonOAuthError: (error) => {
      console.error('Non-OAuth error:', error);
      if (error.type === 'popup_closed') {
        onError('You closed the Google sign-in window.');
      } else if (error.type === 'popup_failed_to_open') {
        onError('Unable to open the Google popup. Check your browser popup permissions.');
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Component chính
// ---------------------------------------------------------------------------
export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState<Role | null>(null);
  const [error, setError] = useState<string>(() =>
    searchParams.get('reason') === 'expired' ? 'Your session has expired. Please sign in again.' : ''
  );

  // 1. Khôi phục phiên hoặc tự động chuyển hướng nếu token hợp lệ
  useEffect(() => {
    if (searchParams.get('reason') === 'expired') {
      return;
    }

    const token = localStorage.getItem('aita_token');
    const rawUser = localStorage.getItem('aita_user');
    if (token && rawUser && !isTokenExpired(token)) {
      try {
        const user = JSON.parse(rawUser);
        if (user.role === 'LECTURER' || user.role === 'ADMIN') {
          navigate('/lecturer/dashboard', { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
      } catch {
        // Parse lỗi -> bỏ qua
      }
    }
  }, [navigate, searchParams]);

  // Xử lý sau khi Google trả về access_token thật
  const handleGoogleToken = async (accessToken: string, role: Role) => {
    setLoading(role);
    setError('');

    // Bước 1: Lấy thông tin user từ Google UserInfo API
    let googleUser: { email: string; name: string } | null = null;
    try {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userInfoRes.ok) {
        const info = await userInfoRes.json();
        googleUser = { email: info.email, name: info.name || info.email };
      }
    } catch {
      setLoading(null);
      setError('Unable to retrieve your Google account information. Check your network connection.');
      return;
    }

    if (!googleUser) {
      setLoading(null);
      setError('Unable to retrieve your Google email address.');
      return;
    }

    // Bước 2: Gửi access_token + email lên backend để xác thực domain FPT và cấp JWT
    const res = await apiRequest<AuthResponseData>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        credential: 'google_access_token',
        access_token: accessToken,
        email: googleUser.email,
        name: googleUser.name,
        role,
      }),
    });

    setLoading(null);

    if (res.success && res.data) {
      localStorage.setItem('aita_token', res.data.token);
      localStorage.setItem('aita_user', JSON.stringify(res.data.user));

      if (res.data.user.role === 'LECTURER' || res.data.user.role === 'ADMIN') {
        navigate('/lecturer/dashboard');
      } else {
        navigate('/dashboard');
      }
    } else {
      setError(res.message || 'Login failed.');
    }
  };

  const handleError = (msg: string) => setError(msg);

  // Hook Google OAuth chính thức
  const loginStudent = useGoogleOAuth('STUDENT', handleGoogleToken, handleError);
  const loginLecturer = useGoogleOAuth('LECTURER', handleGoogleToken, handleError);

  // Dev Mode: Đăng nhập nhanh nội bộ dev
  const handleDevLogin = async (role: Role) => {
    if (!ENABLE_DEV_LOGIN) return;

    setLoading(role);
    setError('');

    const mockEmail =
      role === 'STUDENT' ? 'student.dev@fpt.edu.vn' : 'lecturer.dev@fe.edu.vn';

    const res = await apiRequest<AuthResponseData>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        credential: 'mock_local_dev_token',
        email: mockEmail,
        role,
      }),
    });

    setLoading(null);

    if (res.success && res.data) {
      localStorage.setItem('aita_token', res.data.token);
      localStorage.setItem('aita_user', JSON.stringify(res.data.user));

      if (res.data.user.role === 'LECTURER' || res.data.user.role === 'ADMIN') {
        navigate('/lecturer/dashboard');
      } else {
        navigate('/dashboard');
      }
    } else {
      setError(res.message || 'Login failed.');
    }
  };

  const handleStudentGoogleClick = () => {
    setError('');
    if (IS_PLACEHOLDER) {
      setError('A valid Google Client ID has not been configured in VITE_GOOGLE_CLIENT_ID.');
      return;
    }
    loginStudent();
  };

  const handleLecturerGoogleClick = () => {
    setError('');
    if (IS_PLACEHOLDER) {
      setError('A valid Google Client ID has not been configured in VITE_GOOGLE_CLIENT_ID.');
      return;
    }
    loginLecturer();
  };

  const isLoading = loading !== null;

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4 sm:p-6 lg:p-8">
      {/* Bố cục chia đôi trên màn hình lớn (>= lg), xếp chồng trên màn hình nhỏ */}
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 rounded-3xl overflow-hidden border border-line shadow-sm bg-surface">
        
        {/* Panel Thương hiệu bên trái (Gradient xanh tím sâu - duy nhất trong hệ thống) */}
        <div
          className="lg:col-span-5 p-8 lg:p-12 flex flex-col justify-between text-white"
          style={{
            background: 'linear-gradient(145deg, #1e1b4b 0%, #0f172a 100%)',
          }}
        >
          <div>
            {/* Logo FPT */}
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center font-black text-white text-xl tracking-wider shadow-md shadow-orange-500/30">
                FPT
              </div>
              <div>
                <span className="text-xl font-bold tracking-tight text-white block">
                  AITA-Intelligent
                </span>
                <span className="text-xs text-indigo-200/80">FPT Education Platform</span>
              </div>
            </div>

            <h2 className="text-2xl lg:text-3xl font-semibold text-white tracking-tight leading-snug mb-3">
              Teaching Assistant &amp; AST Analysis Platform
            </h2>
            <p className="text-sm text-indigo-200/90 leading-relaxed mb-8">
              Automated code grading, AST structural similarity analysis, and intelligent feedback for FPT programming courses.
            </p>

            {/* Các điểm nổi bật của nền tảng */}
            <div className="space-y-4 pt-4 border-t border-indigo-900/60">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0 mt-0.5">
                  <Code2 size={16} />
                </div>
                <div className="text-xs text-indigo-100">
                  <strong className="block text-white font-medium mb-0.5">Automated Sandbox Testing</strong>
                  Real-time unit testing execution with score calculation.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0 mt-0.5">
                  <Cpu size={16} />
                </div>
                <div className="text-xs text-indigo-100">
                  <strong className="block text-white font-medium mb-0.5">AST Structural Analysis</strong>
                  Similarity checking as a reference for lecturer review.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0 mt-0.5">
                  <BarChart3 size={16} />
                </div>
                <div className="text-xs text-indigo-100">
                  <strong className="block text-white font-medium mb-0.5">Performance Analytics</strong>
                  Tracking submission rates and class performance insights.
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-indigo-900/60 text-xs text-indigo-300/70">
            FPT University Academic Portal
          </div>
        </div>

        {/* Khung đăng nhập bên phải */}
        <div className="lg:col-span-7 p-6 sm:p-10 lg:p-12 flex flex-col justify-between bg-surface">
          <div className="max-w-md mx-auto w-full">
            <div className="mb-8">
              <h1 className="text-2xl font-semibold text-ink tracking-tight">Sign in to your account</h1>
              <p className="text-sm text-ink-3 mt-1.5">
                Choose your role to authenticate with your official FPT Google account.
              </p>
            </div>

            {/* Thông báo lỗi nếu có */}
            {error && (
              <Alert tone="danger" className="mb-6" onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            {/* Các nút bấm Google đồng bộ phong cách viền trắng/xám hiện đại */}
            <div className="flex flex-col gap-3.5">
              {/* Nút Sinh viên */}
              <button
                id="btn-login-student-google"
                type="button"
                onClick={handleStudentGoogleClick}
                disabled={isLoading}
                className="w-full h-12 px-5 rounded-xl border border-line bg-surface hover:bg-slate-50 active:bg-slate-100 text-ink text-sm font-medium flex items-center justify-center gap-3 transition-colors shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading === 'STUDENT' ? (
                  <Spinner size="sm" />
                ) : (
                  <GoogleIcon size={18} />
                )}
                <span>Sign in with Google — Student</span>
              </button>

              {/* Nút Giảng viên */}
              <button
                id="btn-login-lecturer-google"
                type="button"
                onClick={handleLecturerGoogleClick}
                disabled={isLoading}
                className="w-full h-12 px-5 rounded-xl border border-line bg-surface hover:bg-slate-50 active:bg-slate-100 text-ink text-sm font-medium flex items-center justify-center gap-3 transition-colors shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading === 'LECTURER' ? (
                  <Spinner size="sm" />
                ) : (
                  <GoogleIcon size={18} />
                )}
                <span>Sign in with Google — Lecturer</span>
              </button>
            </div>

            {/* Quy định Domain hợp lệ */}
            <div className="flex items-center justify-center gap-2 mt-5 text-xs text-ink-3">
              <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
              <span>
                Accepted domains: <strong className="text-ink-2 font-medium">@fpt.edu.vn</strong> &amp; <strong className="text-ink-2 font-medium">@fe.edu.vn</strong>
              </span>
            </div>

            {/* Khung Dev Mode (Dành riêng cho môi trường development cục bộ) */}
            {ENABLE_DEV_LOGIN && (
              <div className="mt-8 pt-6 border-t border-line">
                <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-4 text-left">
                  <div className="flex items-center gap-2 mb-1.5 text-amber-800 text-xs font-semibold">
                    <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                    <span>Local Development Mode</span>
                  </div>
                  <p className="text-xs text-amber-900/80 mb-3 leading-relaxed">
                    Bypass OAuth popup with mock credentials for local testing:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      id="btn-login-student-dev"
                      type="button"
                      onClick={() => handleDevLogin('STUDENT')}
                      disabled={isLoading}
                      className="h-9 px-3 rounded-lg border border-amber-300 bg-white hover:bg-amber-100/70 text-amber-900 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                    >
                      <GraduationCap size={14} />
                      <span>Student (Dev)</span>
                    </button>
                    <button
                      id="btn-login-lecturer-dev"
                      type="button"
                      onClick={() => handleDevLogin('LECTURER')}
                      disabled={isLoading}
                      className="h-9 px-3 rounded-lg border border-amber-300 bg-white hover:bg-amber-100/70 text-amber-900 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                    >
                      <School size={14} />
                      <span>Lecturer (Dev)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Dòng chân trang */}
          <div className="mt-8 pt-4 border-t border-line text-center text-xs text-ink-3">
            SWP391 · Group 3 · Milestone 3 — Full Pipeline Integration
          </div>
        </div>

      </div>
    </div>
  );
}

// Biểu tượng Google chính hãng chuẩn SVG
function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
