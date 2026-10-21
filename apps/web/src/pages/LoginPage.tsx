import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { ShieldAlert, AlertCircle, Loader2, GraduationCap, School } from 'lucide-react';
import { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import { isTokenExpired } from '../utils/auth';

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

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const IS_PLACEHOLDER =
  !GOOGLE_CLIENT_ID ||
  GOOGLE_CLIENT_ID === 'placeholder' ||
  GOOGLE_CLIENT_ID.startsWith('your_google_client_id');

const ENABLE_DEV_LOGIN =
  import.meta.env.DEV === true &&
  import.meta.env.VITE_ENABLE_DEV_LOGIN === 'true';

type Role = 'STUDENT' | 'LECTURER';

function useGoogleOAuth(role: Role, onSuccess: (token: string, role: Role) => void, onError: (msg: string) => void) {
  return useGoogleLogin({
    flow: 'implicit',
    onSuccess: (tokenResponse) => { onSuccess(tokenResponse.access_token, role); },
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

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState<Role | null>(null);
  const [error, setError] = useState<string>(() =>
    searchParams.get('reason') === 'expired' ? 'Your session has expired. Please sign in again.' : ''
  );

  useEffect(() => {
    if (searchParams.get('reason') === 'expired') return;
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
      } catch { /* ignore */ }
    }
  }, [navigate, searchParams]);

  const handleGoogleToken = async (accessToken: string, role: Role) => {
    setLoading(role);
    setError('');
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
      setError('Unable to retrieve your Google account information.');
      return;
    }

    if (!googleUser) {
      setLoading(null);
      setError('Unable to retrieve your Google email address.');
      return;
    }

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
  const loginStudent = useGoogleOAuth('STUDENT', handleGoogleToken, handleError);
  const loginLecturer = useGoogleOAuth('LECTURER', handleGoogleToken, handleError);

  const handleDevLogin = async (role: Role) => {
    if (!ENABLE_DEV_LOGIN) return;
    setLoading(role);
    setError('');
    const mockEmail = role === 'STUDENT' ? 'student.dev@fpt.edu.vn' : 'lecturer.dev@fe.edu.vn';
    const res = await apiRequest<AuthResponseData>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential: 'mock_local_dev_token', email: mockEmail, role }),
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

  const handleStudentClick = () => {
    setError('');
    if (IS_PLACEHOLDER) { setError('Google Client ID is not configured.'); return; }
    loginStudent();
  };

  const handleLecturerClick = () => {
    setError('');
    if (IS_PLACEHOLDER) { setError('Google Client ID is not configured.'); return; }
    loginLecturer();
  };

  const isLoading = loading !== null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; font-family: 'Inter', system-ui, sans-serif; }
        @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        

        .lp-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f5f7fb;
          padding: 24px 16px;
          font-family: 'Inter', system-ui, sans-serif;
        }

        @media (max-width: 520px) { .lp-card { padding: 32px 22px 28px; } }

        .lp-card {
          background: #ffffff;
          border-radius: 20px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.07), 0 20px 48px -8px rgba(0,0,0,0.12);
          padding: 48px 48px 40px;
          width: 100%;
          max-width: 520px;
          border: 1px solid #e2e8f0;
        }

        .lp-logo-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 28px;
        }
        .lp-logo-icon {
          width: 44px;
          height: 44px;
          background: linear-gradient(135deg, #f97316, #fb923c);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 4px 14px rgba(249,115,22,0.3);
        }
        .lp-logo-icon span { color:#fff; font-weight:800; font-size:15px; letter-spacing:0.5px; }
        .lp-logo-text { line-height: 1.3; }
        .lp-logo-text .sub { font-size: 10px; color: #9ca3af; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; }
        .lp-logo-text .main { font-size: 15px; color: #111827; font-weight: 800; }

        .lp-divider { height: 1px; background: #f1f5f9; margin-bottom: 28px; }

        .lp-heading { font-size: 28px; font-weight: 800; color: #0f172a; margin-bottom: 6px; }
        .lp-sub { font-size: 14px; color: #6b7280; margin-bottom: 28px; line-height: 1.5; }

        .lp-role-label {
          font-size: 10px;
          font-weight: 700;
          color: #94a3b8;
          letter-spacing: 1px;
          text-transform: uppercase;
          margin-bottom: 10px;
        }

        .lp-error {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 10px;
          padding: 10px 12px;
          margin-bottom: 18px;
        }
        .lp-error span { font-size: 12px; color: #b91c1c; line-height: 1.5; }

        .btn-student {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 13px 20px;
          border: none;
          border-radius: 12px;
          background: #2563eb;
          color: #fff;
          font-family: inherit;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
          box-shadow: 0 2px 12px rgba(37,99,235,0.3);
          margin-bottom: 10px;
        }
        .btn-student:hover:not(:disabled) { background: #1d4ed8; box-shadow: 0 4px 20px rgba(37,99,235,0.4); transform: translateY(-1px); }
        .btn-student:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

        .btn-lecturer {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 12px 20px;
          border: 1.5px solid #e5e7eb;
          border-radius: 12px;
          background: #fff;
          color: #374151;
          font-family: inherit;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s, transform 0.1s;
        }
        .btn-lecturer:hover:not(:disabled) { border-color: #f97316; background: #fff7ed; color: #c2410c; transform: translateY(-1px); }
        .btn-lecturer:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

        .lp-footer { margin-top: 28px; text-align: center; font-size: 11px; color: #d1d5db; }

        .dev-box {
          margin-top: 20px;
          padding: 14px;
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 12px;
        }
        .dev-box-header { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
        .dev-box-header span { font-size: 11px; font-weight: 700; color: #92400e; text-transform: uppercase; letter-spacing: 0.4px; }
        .dev-btns { display: flex; gap: 8px; }
        .dev-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 9px;
          font-family: inherit;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }
        .dev-btn-s { background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; }
        .dev-btn-s:hover { background: #dbeafe; }
        .dev-btn-l { background: #fff7ed; border: 1px solid #fed7aa; color: #c2410c; }
        .dev-btn-l:hover { background: #ffedd5; }
      `}</style>

      <div className="lp-root">
        <div className="lp-card">
          {/* Logo */}
          <div className="lp-logo-row">
            <div className="lp-logo-icon"><span>FPT</span></div>
            <div className="lp-logo-text">
              <div className="sub">FPT University</div>
              <div className="main">AITA-Intelligent</div>
            </div>
          </div>

          <div className="lp-divider" />

          <h1 className="lp-heading">Sign in</h1>
          <p className="lp-sub">Choose how you use AITA-Intelligent to continue.</p>

          {error && (
            <div className="lp-error">
              <ShieldAlert size={15} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          <div className="lp-role-label">Choose your workspace</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22 }}>
            <div style={{ border: '1px solid #dbeafe', background: '#eff6ff', borderRadius: 12, padding: '14px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 5 }}>Student</div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>Submit assignments, track grading progress, and review results.</div>
            </div>
            <div style={{ border: '1px solid #fed7aa', background: '#fff7ed', borderRadius: 12, padding: '14px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#c2410c', marginBottom: 5 }}>Lecturer</div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>Manage classes, create assignments, and review submissions.</div>
            </div>
          </div>

          <button id="btn-login-student-google" className="btn-student" onClick={handleStudentClick} disabled={isLoading}>
            {loading === 'STUDENT' ? (
              <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <GoogleIcon size={18} />
            )}
            Sign in with Google — Student
          </button>

          <button id="btn-login-lecturer-google" className="btn-lecturer" onClick={handleLecturerClick} disabled={isLoading}>
            {loading === 'LECTURER' ? (
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <GoogleIcon size={17} />
            )}
            Sign in with Google — Lecturer
          </button>

          {/* Dev mode */}
          {ENABLE_DEV_LOGIN && (
            <div className="dev-box">
              <div className="dev-box-header">
                <AlertCircle size={13} style={{ color: '#d97706' }} />
                <span>Development Mode</span>
              </div>
              <div className="dev-btns">
                <button id="btn-login-student-dev" className="dev-btn dev-btn-s" onClick={() => handleDevLogin('STUDENT')} disabled={isLoading}>
                  <GraduationCap size={13} /> Student
                </button>
                <button id="btn-login-lecturer-dev" className="dev-btn dev-btn-l" onClick={() => handleDevLogin('LECTURER')} disabled={isLoading}>
                  <School size={13} /> Lecturer
                </button>
              </div>
            </div>
          )}

          <div className="lp-footer" style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.6 }}>
            Secure Google sign-in · One workspace for teaching and learning<br />
            SWP391 · Group 3 · Milestone 3
          </div>
        </div>
      </div>
    </>
  );
}

function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
