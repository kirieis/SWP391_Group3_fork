// Các hàm tiện ích xác thực phiên - tách ra file riêng để tương thích với React Fast Refresh
// (Không thể export hàm và component trong cùng một file)

export interface StoredUser {
  id?: string;
  email?: string;
  fullName?: string;
  role?: 'STUDENT' | 'LECTURER' | 'ADMIN';
  [key: string]: unknown;
}

// Giải mã JWT Payload để kiểm tra thời hạn (exp) mà không cần thêm thư viện ngoài
export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const parsed = JSON.parse(jsonPayload);
    if (!parsed.exp) return false;
    // Kiểm tra hết hạn (exp tính bằng giây, Date.now() tính bằng ms)
    return parsed.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export function getStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem('aita_user');
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
}
