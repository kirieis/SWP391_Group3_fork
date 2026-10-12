import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.tsx'

// Đọc Google Client ID từ biến môi trường Vite
// Nếu chưa cấu hình → LoginPage sẽ tự động vào Dev Mode
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'placeholder';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={googleClientId}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
)
