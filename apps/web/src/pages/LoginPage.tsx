import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { GraduationCap, School, ShieldAlert, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import { isTokenExpired } from '../utils/auth';

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
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
      }}
    >
      {/* Hiệu ứng nền */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          background:
            'radial-gradient(ellipse 80% 60% at 20% 20%, rgba(99,102,241,0.15) 0%, transparent 60%),' +
            'radial-gradient(ellipse 60% 50% at 80% 80%, rgba(245,158,11,0.1) 0%, transparent 60%)',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 440 }}>
        {/* Card đăng nhập */}
        <div
          style={{
            background: 'rgba(15,23,42,0.88)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: 24,
            padding: '38px 32px',
            boxShadow:
              '0 0 0 1px rgba(255,255,255,0.04) inset,' +
              '0 32px 64px rgba(0,0,0,0.5)',
            textAlign: 'center',
          }}
        >
          {/* Logo FPT */}
          <div
            style={{
              width: 68,
              height: 68,
              background: 'linear-gradient(135deg, #f97316 0%, #f59e0b 100%)',
              borderRadius: 18,
              margin: '0 auto 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(249,115,22,0.4)',
            }}
          >
            <span style={{ color: '#fff', fontWeight: 900, fontSize: 22, letterSpacing: 1 }}>
              FPT
            </span>
          </div>

          <h1 style={{ color: '#f8fafc', fontWeight: 800, fontSize: 24, margin: '0 0 8px' }}>
            AITA-Intelligent
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 28px', lineHeight: 1.6 }}>
            Teaching Assistant &amp; AST Analysis Platform
          </p>

          {/* Thông báo lỗi nếu có */}
          {error && (
            <div
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 12,
                padding: '10px 14px',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                textAlign: 'left',
              }}
            >
              <ShieldAlert size={16} style={{ color: '#f87171', flexShrink: 0 }} />
              <span style={{ color: '#fca5a5', fontSize: 13 }}>{error}</span>
            </div>
          )}

          {/* TUYẾN CHÍNH: Đăng nhập Google thật (Primary Path) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Student - Google */}
            <button
              id="btn-login-student-google"
              onClick={handleStudentGoogleClick}
              disabled={isLoading}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: '13px 20px',
                borderRadius: 14,
                border: '1px solid rgba(99,102,241,0.5)',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(79,70,229,0.15) 100%)',
                color: '#e0e7ff',
                fontWeight: 700,
                fontSize: 14,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading && loading !== 'STUDENT' ? 0.5 : 1,
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 16px rgba(99,102,241,0.2)',
              }}
            >
              {loading === 'STUDENT' ? (
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <GoogleIcon size={18} />
              )}
              <span>Sign in with Google — Student</span>
            </button>

            {/* Lecturer - Google */}
            <button
              id="btn-login-lecturer-google"
              onClick={handleLecturerGoogleClick}
              disabled={isLoading}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: '12px 20px',
                borderRadius: 14,
                border: '1px solid rgba(245,158,11,0.35)',
                background: 'rgba(245,158,11,0.1)',
                color: '#fde68a',
                fontWeight: 600,
                fontSize: 13,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading && loading !== 'LECTURER' ? 0.5 : 1,
                transition: 'all 0.2s ease',
              }}
            >
              {loading === 'LECTURER' ? (
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <GoogleIcon size={16} />
              )}
              <span>Sign in with Google — Lecturer</span>
            </button>
          </div>

          {/* Quy định Domain FPT */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              marginTop: 18,
              color: '#64748b',
              fontSize: 12,
            }}
          >
            <ShieldCheck size={13} style={{ color: '#22c55e' }} />
            <span>
              Accepted domains{' '}
              <strong style={{ color: '#94a3b8' }}>@fpt.edu.vn</strong> &amp;{' '}
              <strong style={{ color: '#94a3b8' }}>@fe.edu.vn</strong>
            </span>
          </div>

          {/* CHẾ ĐỘ DEV MODE (Chỉ hiển thị khi import.meta.env.DEV === true && VITE_ENABLE_DEV_LOGIN === 'true') */}
          {ENABLE_DEV_LOGIN && (
            <div
              style={{
                marginTop: 24,
                paddingTop: 20,
                borderTop: '1px dashed rgba(245,158,11,0.25)',
              }}
            >
              <div
                style={{
                  background: 'rgba(245,158,11,0.08)',
                  border: '1px solid rgba(245,158,11,0.25)',
                  borderRadius: 14,
                  padding: '14px',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <AlertCircle size={14} style={{ color: '#f59e0b' }} />
                  <span style={{ color: '#fbbf24', fontSize: 12, fontWeight: 700 }}>
                    Local development mode (VITE_ENABLE_DEV_LOGIN=true)
                  </span>
                </div>
                <p style={{ color: '#94a3b8', fontSize: 11, margin: '0 0 12px', lineHeight: 1.4 }}>
                  Use this mode to quickly test the UI without configuring a real Google Client ID:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    id="btn-login-student-dev"
                    onClick={() => handleDevLogin('STUDENT')}
                    disabled={isLoading}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      borderRadius: 10,
                      background: 'rgba(99,102,241,0.15)',
                      border: '1px solid rgba(99,102,241,0.3)',
                      color: '#a5b4fc',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <GraduationCap size={15} />
                    <span>Student — Dev Mode</span>
                  </button>

                  <button
                    id="btn-login-lecturer-dev"
                    onClick={() => handleDevLogin('LECTURER')}
                    disabled={isLoading}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      borderRadius: 10,
                      background: 'rgba(245,158,11,0.12)',
                      border: '1px solid rgba(245,158,11,0.3)',
                      color: '#fcd34d',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <School size={15} />
                    <span>Lecturer — Dev Mode</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              marginTop: 24,
              paddingTop: 16,
              borderTop: '1px solid rgba(255,255,255,0.06)',
              color: '#475569',
              fontSize: 11,
            }}
          >
            SWP391 · Group 3 · Milestone 3 — Full Pipeline Integration
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// Google "G" logo SVG component
function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
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
