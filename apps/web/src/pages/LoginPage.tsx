import { useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { GraduationCap, School, ShieldAlert, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { apiRequest } from '../services/api';

// ---------------------------------------------------------------------------
// Kiểm tra Google Client ID đã được cấu hình thật chưa
// ---------------------------------------------------------------------------
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const IS_PLACEHOLDER =
  !GOOGLE_CLIENT_ID ||
  GOOGLE_CLIENT_ID === 'placeholder' ||
  GOOGLE_CLIENT_ID.startsWith('your_google_client_id');

type Role = 'STUDENT' | 'LECTURER';

// ---------------------------------------------------------------------------
// Hook: Đăng nhập bằng Google OAuth thật (access_token flow)
// useGoogleLogin mở popup chọn tài khoản Google → trả về access_token
// Backend dùng access_token để lấy thông tin user từ Google UserInfo API
// ---------------------------------------------------------------------------
function useGoogleOAuth(role: Role, onSuccess: (token: string, role: Role) => void, onError: (msg: string) => void) {
  return useGoogleLogin({
    flow: 'implicit', // Popup chọn tài khoản → trả về access_token
    onSuccess: (tokenResponse) => {
      onSuccess(tokenResponse.access_token, role);
    },
    onError: (error) => {
      console.error('Google OAuth error:', error);
      onError('Đăng nhập Google thất bại. Vui lòng thử lại.');
    },
    onNonOAuthError: (error) => {
      console.error('Non-OAuth error:', error);
      if (error.type === 'popup_closed') {
        onError('Bạn đã đóng cửa sổ đăng nhập Google.');
      } else if (error.type === 'popup_failed_to_open') {
        onError('Không thể mở popup Google. Vui lòng cho phép popup trong trình duyệt.');
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Component chính
// ---------------------------------------------------------------------------
export default function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<Role | null>(null);
  const [error, setError] = useState('');

  // Xử lý sau khi Google trả về access_token
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
      setError('Không thể lấy thông tin tài khoản Google. Vui lòng thử lại.');
      return;
    }

    if (!googleUser) {
      setLoading(null);
      setError('Không lấy được thông tin tài khoản Google.');
      return;
    }

    // Bước 2: Gửi access_token + email lên backend để xác thực domain và cấp JWT
    const res = await apiRequest('/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        credential: 'google_access_token', // Phân biệt với mock_local_dev_token
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
      setError(res.message || 'Đăng nhập không thành công.');
    }
  };

  const handleError = (msg: string) => setError(msg);

  // Hai hook riêng biệt cho Sinh viên và Giảng viên
  const loginStudent = useGoogleOAuth('STUDENT', handleGoogleToken, handleError);
  const loginLecturer = useGoogleOAuth('LECTURER', handleGoogleToken, handleError);

  // Dev Mode: Không cần Google OAuth thật
  const handleDevLogin = async (role: Role) => {
    setLoading(role);
    setError('');

    const mockEmail =
      role === 'STUDENT' ? 'student.dev@fpt.edu.vn' : 'lecturer.dev@fe.edu.vn';

    const res = await apiRequest('/auth/google', {
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
      setError(res.message || 'Đăng nhập không thành công.');
    }
  };

  const handleStudentClick = () => {
    setError('');
    if (IS_PLACEHOLDER) {
      handleDevLogin('STUDENT');
    } else {
      loginStudent();
    }
  };

  const handleLecturerClick = () => {
    setError('');
    if (IS_PLACEHOLDER) {
      handleDevLogin('LECTURER');
    } else {
      loginLecturer();
    }
  };

  const isLoading = loading !== null;

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
      }}
    >
      {/* Ambient glow */}
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

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 420 }}>
        {/* Card */}
        <div
          style={{
            background: 'rgba(15,23,42,0.85)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: 24,
            padding: '40px 36px',
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
          <p style={{ color: '#94a3b8', fontSize: 14, margin: '0 0 32px', lineHeight: 1.6 }}>
            Nền tảng Trợ lý Giảng dạy &amp; Phân tích Cú pháp AST
          </p>

          {/* Dev Mode Banner */}
          {IS_PLACEHOLDER && (
            <div
              style={{
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.3)',
                borderRadius: 12,
                padding: '10px 14px',
                marginBottom: 24,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                textAlign: 'left',
              }}
            >
              <AlertCircle size={16} style={{ color: '#f59e0b', marginTop: 1, flexShrink: 0 }} />
              <div>
                <p style={{ color: '#fbbf24', fontWeight: 700, fontSize: 12, margin: '0 0 2px' }}>
                  Chế độ Dev Local — Không dùng Google thật
                </p>
                <p style={{ color: '#d97706', fontSize: 11, margin: 0, lineHeight: 1.5 }}>
                  Chưa cấu hình{' '}
                  <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.3)', padding: '0 3px', borderRadius: 3 }}>
                    VITE_GOOGLE_CLIENT_ID
                  </code>{' '}
                  trong <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.3)', padding: '0 3px', borderRadius: 3 }}>
                    apps/web/.env
                  </code>. Xem hướng dẫn tại{' '}
                  <code style={{ fontFamily: 'monospace' }}>docs/06_Tutorial/README.md</code>.
                </p>
              </div>
            </div>
          )}

          {/* Error */}
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

          {/* Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Sinh viên */}
            <button
              id="btn-login-student"
              onClick={handleStudentClick}
              disabled={isLoading}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: '14px 20px',
                borderRadius: 14,
                border: '1px solid rgba(99,102,241,0.5)',
                background:
                  loading === 'STUDENT'
                    ? 'rgba(99,102,241,0.25)'
                    : 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(79,70,229,0.15) 100%)',
                color: '#e0e7ff',
                fontWeight: 700,
                fontSize: 15,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading && loading !== 'STUDENT' ? 0.5 : 1,
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 16px rgba(99,102,241,0.2)',
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'linear-gradient(135deg, rgba(99,102,241,0.35) 0%, rgba(79,70,229,0.3) 100%)';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow =
                    '0 8px 24px rgba(99,102,241,0.35)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isLoading) {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(79,70,229,0.15) 100%)';
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow =
                    '0 4px 16px rgba(99,102,241,0.2)';
                }
              }}
            >
              {loading === 'STUDENT' ? (
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              ) : IS_PLACEHOLDER ? (
                <GraduationCap size={18} style={{ color: '#818cf8' }} />
              ) : (
                <GoogleIcon />
              )}
              <span>
                {loading === 'STUDENT'
                  ? 'Đang xác thực...'
                  : IS_PLACEHOLDER
                  ? 'Sinh viên — Dev Mode (không cần Google)'
                  : 'Đăng nhập với Google — Sinh viên'}
              </span>
            </button>

            {/* Giảng viên */}
            <button
              id="btn-login-lecturer"
              onClick={handleLecturerClick}
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
                background:
                  loading === 'LECTURER'
                    ? 'rgba(245,158,11,0.18)'
                    : 'rgba(245,158,11,0.1)',
                color: '#fde68a',
                fontWeight: 600,
                fontSize: 13,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading && loading !== 'LECTURER' ? 0.5 : 1,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(245,158,11,0.2)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(245,158,11,0.6)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isLoading) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(245,158,11,0.1)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(245,158,11,0.35)';
                }
              }}
            >
              {loading === 'LECTURER' ? (
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              ) : IS_PLACEHOLDER ? (
                <School size={16} style={{ color: '#f59e0b' }} />
              ) : (
                <GoogleIcon size={16} />
              )}
              <span>
                {loading === 'LECTURER'
                  ? 'Đang xác thực...'
                  : IS_PLACEHOLDER
                  ? 'Giảng viên — Dev Mode (@fe.edu.vn)'
                  : 'Đăng nhập với Google — Giảng viên'}
              </span>
            </button>
          </div>

          {/* Domain policy */}
          {!IS_PLACEHOLDER && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                marginTop: 20,
                color: '#64748b',
                fontSize: 12,
              }}
            >
              <ShieldCheck size={13} style={{ color: '#22c55e' }} />
              <span>
                Chỉ chấp nhận{' '}
                <strong style={{ color: '#94a3b8' }}>@fpt.edu.vn</strong> /{' '}
                <strong style={{ color: '#94a3b8' }}>@fe.edu.vn</strong>
              </span>
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              marginTop: 28,
              paddingTop: 20,
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
