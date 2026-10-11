import "dotenv/config";
import http from "http";
import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initSocketServer, emitGradingProgress } from "./socket/index.js";
import authRoutes from "./routes/auth.routes.js";
import classRoutes from "./routes/class.routes.js";
import assignmentRoutes from "./routes/assignment.routes.js";
import submissionRoutes from "./routes/submission.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";



// Nạp biến môi trường từ file .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Cấu hình Middleware
app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/classes", classRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Hỗ trợ alias chuẩn ADR-001: POST /api/internal/submissions/:id/ast-check
app.use("/api/internal/submissions", submissionRoutes);

// Endpoint kiểm tra sức khỏe hệ thống (Health Check)
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "AITA-Intelligent Backend API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// Endpoint test giả lập phát sự kiện WebSocket tiến trình chấm (Dùng để test giao diện wireframe 6.7.3)
app.post("/api/test-socket/:submissionId", (req: Request, res: Response) => {
  const { submissionId } = req.params;
  const { step = "RUNNING_TESTS", percent = 50, message = "Executing Test Case 3/5 in Sandbox..." } = req.body;

  emitGradingProgress({
    submissionId,
    step: step as any,
    progressPercent: percent,
    message,
  });

  res.json({ success: true, message: `Emitted step ${step} to submission_${submissionId}` });
});

// Tạo HTTP server và gắn Socket.io
const httpServer = http.createServer(app);
initSocketServer(httpServer);

// Khởi động server
httpServer.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 AITA Backend API Server running on port ${PORT}`);
  console.log(`🔌 WebSocket Server (Socket.io) is active`);
  console.log(`👉 Health check: http://localhost:${PORT}/health`);
  console.log(`===================================================`);
});

export { app, httpServer };
