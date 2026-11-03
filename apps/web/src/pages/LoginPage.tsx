import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { ShieldAlert, AlertCircle, Loader2, GraduationCap, School } from 'lucide-react';
import { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import { isTokenExpired } from '../utils/auth';
import { AitaLogo } from '../components/AitaLogo';

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

const TEXTS = {
  welcome: 'Sign in',
  subWelcome: 'Choose your workspace to continue to AITA-Intelligent.',
  chooseRole: 'CHOOSE YOUR WORKSPACE',
  student: 'Student',
  studentBadge: 'Learning & Submission',
  studentDesc: 'Submit .zip assignments, track real-time Sandbox test runs, and review AI-powered feedback.',
  lecturer: 'Lecturer',
  lecturerBadge: 'Teaching & Management',
  lecturerDesc: 'Manage classes, generate assignments with AI Syllabus Wizard, and review AST plagiarism.',
  signInWithGoogle: 'Sign in with Google',
  signingIn: 'Authenticating with Google...',
  domainHint: 'Only @fpt.edu.vn (Student) and @fe.edu.vn (Lecturer) accounts are accepted',
  footerSecurity: 'Secure Google authentication · AITA-Intelligent learning & teaching workspace',
  devMode: 'Development Mode',
  loginAsStudentDev: 'Mock Student Login',
  loginAsLecturerDev: 'Mock Lecturer Login',
  errorInvalidDomain: 'Invalid email domain. Please sign in with an official @fpt.edu.vn or @fe.edu.vn email.',
  errorGoogleFail: 'Google sign-in failed. Please try again.',
  errorPopupClosed: 'The Google sign-in popup was closed before completion.',
  errorPopupBlocked: 'Popup blocked by browser. Please allow popups for this site.',
  sessionExpired: 'Your session has expired. Please sign in again.',
  clientIdMissing: 'Google Client ID is not configured in the environment.',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [selectedRole, setSelectedRole] = useState<Role>('STUDENT');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string>(() =>
    searchParams.get('reason') === 'expired' ? TEXTS.sessionExpired : ''
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
      } catch {
        /* ignore */
      }
    }
  }, [navigate, searchParams]);

  const handleGoogleToken = async (accessToken: string, rolePreference: Role) => {
    setIsAuthenticating(true);
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
      setIsAuthenticating(false);
      setError(TEXTS.errorGoogleFail);
      return;
    }

    if (!googleUser || !googleUser.email) {
      setIsAuthenticating(false);
      setError(TEXTS.errorGoogleFail);
      return;
    }

    // Client-side domain check (allows fpt.edu.vn, fe.edu.vn, and gmail.com for test/dev)
    const emailLower = googleUser.email.toLowerCase();
    const isDomainAllowed =
      emailLower.endsWith('@fpt.edu.vn') ||
      emailLower.endsWith('@fe.edu.vn') ||
      emailLower.endsWith('@gmail.com');

    if (!isDomainAllowed) {
      setIsAuthenticating(false);
      setError(TEXTS.errorInvalidDomain);
      return;
    }

    const res = await apiRequest<AuthResponseData>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({
        credential: 'google_access_token',
        access_token: accessToken,
        email: googleUser.email,
        name: googleUser.name,
        role: rolePreference,
      }),
    });

    setIsAuthenticating(false);
    if (res.success && res.data) {
      localStorage.setItem('aita_token', res.data.token);
      localStorage.setItem('aita_user', JSON.stringify(res.data.user));
      // Always redirect based on actual verified role from database
      if (res.data.user.role === 'LECTURER' || res.data.user.role === 'ADMIN') {
        navigate('/lecturer/dashboard');
      } else {
        navigate('/dashboard');
      }
    } else {
      setError(res.message || TEXTS.errorGoogleFail);
    }
  };

  const loginWithGoogleOAuth = useGoogleLogin({
    flow: 'implicit',
    onSuccess: (tokenResponse) => {
      handleGoogleToken(tokenResponse.access_token, selectedRole);
    },
    onError: (err) => {
      console.error('Google OAuth error:', err);
      setError(TEXTS.errorGoogleFail);
    },
    onNonOAuthError: (err) => {
      console.error('Non-OAuth error:', err);
      if (err.type === 'popup_closed') {
        setError(TEXTS.errorPopupClosed);
      } else if (err.type === 'popup_failed_to_open') {
        setError(TEXTS.errorPopupBlocked);
      }
    },
  });

  const handleCtaClick = () => {
    setError('');
    if (IS_PLACEHOLDER) {
      setError(TEXTS.clientIdMissing);
      return;
    }
    loginWithGoogleOAuth();
  };

  const handleDevLogin = async (role: Role) => {
    if (!ENABLE_DEV_LOGIN) return;
    setIsAuthenticating(true);
    setError('');
    const mockEmail = role === 'STUDENT' ? 'student.dev@fpt.edu.vn' : 'lecturer.dev@fe.edu.vn';
    const res = await apiRequest<AuthResponseData>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential: 'mock_local_dev_token', email: mockEmail, role }),
    });
    setIsAuthenticating(false);
    if (res.success && res.data) {
      localStorage.setItem('aita_token', res.data.token);
      localStorage.setItem('aita_user', JSON.stringify(res.data.user));
      if (res.data.user.role === 'LECTURER' || res.data.user.role === 'ADMIN') {
        navigate('/lecturer/dashboard');
      } else {
        navigate('/dashboard');
      }
    } else {
      setError(res.message || TEXTS.errorGoogleFail);
    }
  };

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
          background: #f8fafc;
          padding: 24px 16px;
          font-family: 'Inter', system-ui, sans-serif;
        }

        .lp-card {
          background: #ffffff;
          border-radius: 24px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 20px 40px -10px rgba(15,23,42,0.08);
          padding: 44px 44px 36px;
          width: 100%;
          max-width: 500px;
          border: 1px solid #e2e8f0;
          position: relative;
        }

        @media (max-width: 520px) {
          .lp-card { padding: 32px 20px 28px; }
        }

        /* Brand logo header (centered) */
        .lp-logo-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          margin-bottom: 24px;
        }

        .lp-logo-icon {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .lp-logo-text { line-height: 1.25; }
        .lp-logo-text .main { font-size: 19px; color: #0f172a; font-weight: 800; letter-spacing: -0.3px; }
        .lp-logo-text .sub { font-size: 11px; color: #64748b; font-weight: 600; letter-spacing: 0.3px; margin-top: 2px; }

        .lp-divider { height: 1px; background: #f1f5f9; margin-bottom: 24px; }

        .lp-heading { font-size: 26px; font-weight: 800; color: #0f172a; margin-bottom: 6px; }
        .lp-sub { font-size: 13px; color: #64748b; margin-bottom: 22px; line-height: 1.5; }

        /* Error Banner */
        .lp-error {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 12px;
          padding: 11px 14px;
          margin-bottom: 18px;
        }
        .lp-error span { font-size: 12px; color: #b91c1c; line-height: 1.5; font-weight: 500; }

        .lp-role-label {
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        /* Segmented Control */
        .segmented-control {
          display: flex;
          background: #f1f5f9;
          padding: 4px;
          border-radius: 14px;
          border: 1px solid #e2e8f0;
          margin-bottom: 12px;
          gap: 4px;
        }

        .segmented-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: 10px;
          border: none;
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          color: #64748b;
          background: transparent;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .segmented-tab:hover:not(.active) {
          color: #0f172a;
          background: rgba(255, 255, 255, 0.6);
        }

        .segmented-tab.active {
          background: #ffffff;
          font-weight: 700;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
        }

        .segmented-tab.active.tab-student {
          color: #2563eb;
        }

        .segmented-tab.active.tab-lecturer {
          color: #ea580c;
        }

        /* Dynamic Role Description Card */
        .role-desc-card {
          border-radius: 12px;
          padding: 12px 14px;
          margin-bottom: 22px;
          transition: all 0.2s ease;
          border: 1px solid;
        }
        .role-desc-card.student {
          background: #eff6ff;
          border-color: #bfdbfe;
        }
        .role-desc-card.lecturer {
          background: #fff7ed;
          border-color: #fed7aa;
        }
        .role-desc-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 3px;
        }
        .role-desc-card.student .role-desc-title { color: #1d4ed8; }
        .role-desc-card.lecturer .role-desc-title { color: #c2410c; }
        .role-desc-text {
          font-size: 12px;
          color: #475569;
          line-height: 1.5;
        }

        /* Single Google CTA Button (Brand compliant: White bg, subtle border) */
        .btn-google-cta {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 13px 20px;
          border: 1.5px solid #d1d5db;
          border-radius: 14px;
          background: #ffffff;
          color: #1f2937;
          font-family: inherit;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
        }

        .btn-google-cta:hover:not(:disabled) {
          background: #f8fafc;
          border-color: #94a3b8;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          transform: translateY(-1px);
        }

        .btn-google-cta:disabled {
          opacity: 0.65;
          cursor: not-allowed;
          transform: none;
        }

        .domain-hint {
          margin-top: 10px;
          text-align: center;
          font-size: 12px;
          color: #64748b;
          line-height: 1.5;
        }

        /* Dev mode box */
        .dev-box {
          margin-top: 20px;
          padding: 12px 14px;
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 12px;
        }
        .dev-box-header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
        .dev-box-header span { font-size: 11px; font-weight: 700; color: #92400e; text-transform: uppercase; letter-spacing: 0.4px; }
        .dev-btns { display: flex; gap: 8px; }
        .dev-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 10px;
          border-radius: 8px;
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

        /* Unified Footer: FPT logo shown only once */
        .lp-footer {
          margin-top: 24px;
          padding-top: 18px;
          border-top: 1px solid #f1f5f9;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          text-align: center;
        }

        .lp-footer-sub {
          font-size: 12px;
          color: #64748b;
          line-height: 1.5;
        }
      `}</style>

      <div className="lp-root">
        <div className="lp-card">
          {/* Logo AITA-Intelligent (Centered per SRS Mockup 01) */}
          <div className="lp-logo-row">
            <div className="lp-logo-icon">
              <AitaLogo size={46} />
            </div>
            <div className="lp-logo-text">
              <div className="main">AITA-Intelligent</div>
              <div className="sub">AI-Powered Teaching Assistant</div>
            </div>
          </div>

          <div className="lp-divider" />

          <h1 className="lp-heading">{TEXTS.welcome}</h1>
          <p className="lp-sub">{TEXTS.subWelcome}</p>

          {/* Error Message */}
          {error && (
            <div className="lp-error">
              <ShieldAlert size={16} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Segmented Control for Workspace Selection */}
          <div className="lp-role-label">{TEXTS.chooseRole}</div>

          <div className="segmented-control" role="tablist">
            <button
              type="button"
              id="tab-select-student"
              role="tab"
              aria-selected={selectedRole === 'STUDENT'}
              className={`segmented-tab tab-student ${selectedRole === 'STUDENT' ? 'active' : ''}`}
              onClick={() => setSelectedRole('STUDENT')}
            >
              <GraduationCap size={15} />
              <span>{TEXTS.student}</span>
            </button>
            <button
              type="button"
              id="tab-select-lecturer"
              role="tab"
              aria-selected={selectedRole === 'LECTURER'}
              className={`segmented-tab tab-lecturer ${selectedRole === 'LECTURER' ? 'active' : ''}`}
              onClick={() => setSelectedRole('LECTURER')}
            >
              <School size={15} />
              <span>{TEXTS.lecturer}</span>
            </button>
          </div>

          {/* Dynamic description according to chosen role */}
          <div className={`role-desc-card ${selectedRole === 'STUDENT' ? 'student' : 'lecturer'}`}>
            <div className="role-desc-title">
              {selectedRole === 'STUDENT' ? TEXTS.studentBadge : TEXTS.lecturerBadge}
            </div>
            <div className="role-desc-text">
              {selectedRole === 'STUDENT' ? TEXTS.studentDesc : TEXTS.lecturerDesc}
            </div>
          </div>

          {/* Single Brand-Compliant Google CTA Button */}
          <button
            id="btn-login-google-cta"
            className="btn-google-cta"
            onClick={handleCtaClick}
            disabled={isAuthenticating}
          >
            {isAuthenticating ? (
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#64748b' }} />
            ) : (
              <GoogleIcon size={19} />
            )}
            <span>{isAuthenticating ? TEXTS.signingIn : TEXTS.signInWithGoogle}</span>
          </button>

          {/* Domain Hint Text (SRS Mockup 01) */}
          <div className="domain-hint">
            {TEXTS.domainHint}
          </div>

          {/* Development Mode Quick Login (only in dev environment) */}
          {ENABLE_DEV_LOGIN && (
            <div className="dev-box">
              <div className="dev-box-header">
                <AlertCircle size={13} style={{ color: '#d97706' }} />
                <span>{TEXTS.devMode}</span>
              </div>
              <div className="dev-btns">
                <button
                  id="btn-login-student-dev"
                  className="dev-btn dev-btn-s"
                  onClick={() => handleDevLogin('STUDENT')}
                  disabled={isAuthenticating}
                >
                  <GraduationCap size={13} /> {TEXTS.loginAsStudentDev}
                </button>
                <button
                  id="btn-login-lecturer-dev"
                  className="dev-btn dev-btn-l"
                  onClick={() => handleDevLogin('LECTURER')}
                  disabled={isAuthenticating}
                >
                  <School size={13} /> {TEXTS.loginAsLecturerDev}
                </button>
              </div>
            </div>
          )}

          {/* Footer: Single FPT University Brand Logo + Security Note */}
          <div className="lp-footer">
            <FptFooterLogo />
            <div className="lp-footer-sub">
              {TEXTS.footerSecurity}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** Official Google Multi-color Logo */
function GoogleIcon({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

/** Official FPT University 3-color brand logo (Rendered once in footer) */
function FptFooterLogo() {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <svg height={20} viewBox="0 0 94 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Blue F */}
        <g transform="skewX(-18)">
          <rect x="8" y="1" width="22" height="30" rx="7" fill="#005BAB" />
          <text x="19" y="22" fill="#ffffff" fontSize="18" fontWeight="900" fontFamily="system-ui, -apple-system, sans-serif" textAnchor="middle">
            F
          </text>
        </g>
        {/* Orange P */}
        <g transform="skewX(-18)">
          <rect x="35" y="1" width="22" height="30" rx="7" fill="#F37024" />
          <text x="46" y="22" fill="#ffffff" fontSize="18" fontWeight="900" fontFamily="system-ui, -apple-system, sans-serif" textAnchor="middle">
            P
          </text>
        </g>
        {/* Green T */}
        <g transform="skewX(-18)">
          <rect x="62" y="1" width="22" height="30" rx="7" fill="#00A14B" />
          <text x="73" y="22" fill="#ffffff" fontSize="18" fontWeight="900" fontFamily="system-ui, -apple-system, sans-serif" textAnchor="middle">
            T
          </text>
        </g>
      </svg>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#005BAB', letterSpacing: '0.2px' }}>
        FPT University
      </span>
    </div>
  );
}
