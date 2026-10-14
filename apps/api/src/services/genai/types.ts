// ==============================================================================
// GENAI TYPES — Định nghĩa kiểu dữ liệu cho toàn bộ phân hệ GenAI
// Owner: Huy (Phân hệ 3)
// Tham chiếu SRS: US-08, US-15, NFR-17, R-02
// ==============================================================================

/**
 * Tên các AI Provider được hỗ trợ.
 * Mỗi provider tương ứng với 1 file trong thư mục providers/.
 */
export type ProviderName = "groq" | "cerebras" | "gemini";

/**
 * Interface trừu tượng mà mọi AI Provider phải implement.
 * Đây là nền tảng của Strategy Pattern — cho phép Gateway
 * chuyển đổi provider mà không cần sửa logic nghiệp vụ.
 */
export interface AIProvider {
  /** Tên định danh của provider (dùng cho logging và metrics) */
  readonly name: ProviderName;

  /**
   * Gửi một yêu cầu chat completion đến provider.
   * @throws AIProviderError khi gặp lỗi mạng, timeout, hoặc rate limit
   */
  chat(request: AIRequest): Promise<AIResponse>;

  /**
   * Kiểm tra provider có đang hoạt động bình thường không.
   * Gateway gọi hàm này trước khi quyết định dùng provider nào.
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Dữ liệu đầu vào cho một request AI.
 */
export interface AIRequest {
  /** Prompt hệ thống — định hướng vai trò và format output của AI */
  systemPrompt: string;

  /** Prompt từ người dùng — chứa dữ liệu cần xử lý (source code, mô tả đề bài, stderr...) */
  userPrompt: string;

  /** Số token tối đa cho phần trả lời của AI. Mặc định: 2048 */
  maxTokens?: number;

  /**
   * Độ "sáng tạo" của AI (0.0 - 1.0).
   * Với scoring prompts (chấm điểm) nên đặt thấp (0.1-0.2) để kết quả ổn định.
   * Với generation prompts (sinh đề bài) có thể đặt cao hơn (0.5-0.7).
   */
  temperature?: number;

  /** Ép model trả về JSON object thuần nếu provider hỗ trợ */
  jsonMode?: boolean;
}

/**
 * Dữ liệu trả về sau khi AI xử lý thành công.
 */
export interface AIResponse {
  /** Nội dung text trả về từ AI (có thể là JSON string cần parse thêm) */
  content: string;

  /** Provider nào đã thực sự xử lý request này */
  provider: ProviderName;

  /** Model cụ thể đã được sử dụng (vd: "llama-3.3-70b-versatile") */
  model: string;

  /** Thời gian xử lý tính từ lúc gửi request đến khi nhận response (ms) */
  latencyMs: number;

  /** Thống kê token sử dụng — dùng cho benchmark và theo dõi quota */
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
}

// ==============================================================================
// Error Types
// ==============================================================================

/**
 * Mã lỗi chuẩn hóa cho toàn bộ phân hệ GenAI.
 * Gateway dùng mã này để quyết định có nên fallback hay không.
 */
export type AIErrorCode =
  | "RATE_LIMITED"       // HTTP 429 — cần chuyển sang provider/key khác
  | "TIMEOUT"            // Request vượt quá AI_REQUEST_TIMEOUT_MS
  | "SERVER_ERROR"       // HTTP 5xx từ provider
  | "AUTH_ERROR"         // API key sai hoặc hết hạn
  | "INVALID_RESPONSE"   // AI trả về response không parse được
  | "NETWORK_ERROR"      // Lỗi kết nối mạng
  | "UNKNOWN";           // Lỗi không xác định

/**
 * Custom Error class cho phân hệ GenAI.
 * Chứa thêm thông tin errorCode và provider để Gateway xử lý logic fallback.
 */
export class AIProviderError extends Error {
  public readonly errorCode: AIErrorCode;
  public readonly provider: ProviderName;
  public readonly statusCode?: number;

  constructor(
    message: string,
    errorCode: AIErrorCode,
    provider: ProviderName,
    statusCode?: number
  ) {
    super(message);
    this.name = "AIProviderError";
    this.errorCode = errorCode;
    this.provider = provider;
    this.statusCode = statusCode;
  }

  /**
   * Kiểm tra lỗi này có phải loại "nên thử lại" (retryable) hay không.
   * RATE_LIMITED, TIMEOUT, SERVER_ERROR, NETWORK_ERROR → nên retry/fallback.
   * AUTH_ERROR, INVALID_RESPONSE → không nên retry (sẽ lỗi lặp lại).
   */
  get isRetryable(): boolean {
    return ["RATE_LIMITED", "TIMEOUT", "SERVER_ERROR", "NETWORK_ERROR"].includes(
      this.errorCode
    );
  }
}

// ==============================================================================
// Gateway Config Types
// ==============================================================================

/**
 * Cấu hình cho AI Gateway, đọc từ biến môi trường.
 */
export interface GatewayConfig {
  primaryProvider: ProviderName;
  fallbackProvider: ProviderName;
  requestTimeoutMs: number;
  maxRetriesPerProvider: number;
  totalDeadlineMs?: number;
  timeoutGroqMs?: number;
  timeoutCerebrasMs?: number;
  timeoutGeminiMs?: number;
  enableGemini?: boolean;
}

// ==============================================================================
// Benchmark Types
// ==============================================================================

/**
 * Kết quả benchmark cho 1 lần chạy thử (single run).
 */
export interface BenchmarkRun {
  provider: ProviderName;
  model: string;
  promptLabel: string;
  latencyMs: number;
  tokensPerSecond: number;
  tokenUsage: { prompt: number; completion: number; total: number };
  success: boolean;
  errorMessage?: string;
}

/**
 * Kết quả benchmark tổng hợp cho 1 provider.
 */
export interface BenchmarkSummary {
  provider: ProviderName;
  model: string;
  totalRuns: number;
  successfulRuns: number;
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgTokensPerSecond: number;
}

// ==============================================================================
// Job Types — Format truyền qua Redis Queue (Contract với dev Thịnh)
// Tham chiếu: docs/api-contracts/genai-queue-contract.md (chốt Tuần 4)
// ==============================================================================

/**
 * Loại job AI mà Gateway có thể xử lý.
 */
export type AIJobType =
  | "AI_CLEAN_CODE_REVIEW"    // US-15: Chấm Clean Code
  | "AI_ERROR_EXPLANATION"     // NFR-17: Giải thích lỗi biên dịch
  | "AI_ASSIGNMENT_GENERATION"; // US-08: Sinh đề bài

/**
 * Trạng thái kết quả AI trả về cho pipeline.
 * COMPLETED = AI chấm xong bình thường.
 * AI_REVIEW_PENDING = Cả 2 provider đều fail → bỏ qua bước AI, chấm bằng test case + AST.
 */
export type AIReviewStatus = "COMPLETED" | "AI_REVIEW_PENDING";
