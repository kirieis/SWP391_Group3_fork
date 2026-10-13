// Cấu hình URL Backend API
// Ưu tiên biến môi trường VITE_API_URL (README), mặc định localhost:5000
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export type ApiErrorType = 'NETWORK_ERROR' | 'UNAUTHORIZED' | 'BUSINESS_ERROR';

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    message?: string;
    errorType?: ApiErrorType;
    status?: number;
}

// Hàm gọi API dùng chung với phân loại 3 loại lỗi rõ ràng: mất kết nối, 401 hết hạn, và lỗi nghiệp vụ
export async function apiRequest<T = unknown>(
    endpoint: string,
    options: RequestInit = {}
): Promise<ApiResponse<T>> {
    const token = localStorage.getItem("aita_token");

    const headers: Record<string, string> = {
        ...(options.headers as Record<string, string>),
    };

    // Nếu body không phải là FormData (file upload) thì thêm Content-Type JSON
    if (!(options.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
    }

    // Tự động gắn Token nếu đã đăng nhập
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers,
        });

        let data: Record<string, unknown> | null = null;
        try {
            data = (await response.json()) as Record<string, unknown>;
        } catch {
            data = null;
        }

        // Lỗi 401 Unauthorized: Hết hạn phiên làm việc
        if (response.status === 401) {
            localStorage.removeItem("aita_token");
            localStorage.removeItem("aita_user");
            // Tránh redirect lặp vô tận nếu người dùng đang ở sẵn trang /login
            if (!window.location.pathname.startsWith("/login")) {
                window.location.href = "/login?reason=expired";
            }
            return {
                success: false,
                errorType: 'UNAUTHORIZED',
                status: 401,
                message: (data?.message as string) || "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
            };
        }

        // Lỗi nghiệp vụ (Business error: 400, 403, 404, 429, 500, ...)
        if (!response.ok) {
            return {
                success: false,
                errorType: 'BUSINESS_ERROR',
                status: response.status,
                message: (data?.message as string) || `Máy chủ phản hồi mã lỗi ${response.status}.`,
            };
        }

        return (data as unknown as ApiResponse<T>) || { success: true };
    } catch (error: unknown) {
        // Lỗi mạng / Mất kết nối tới Backend
        console.error("Lỗi kết nối API:", error);
        return {
            success: false,
            errorType: 'NETWORK_ERROR',
            message: "Không thể kết nối tới máy chủ Backend (Port 5000). Vui lòng kiểm tra lại dịch vụ mạng.",
        };
    }
}
