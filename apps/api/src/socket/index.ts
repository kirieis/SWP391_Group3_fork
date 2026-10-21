import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";

// Defines grading step types per SRS section 6.7.3
export type GradingStep =
  | "QUEUED"
  | "BUILDING"
  | "RUNNING_TESTS"
  | "AST_ANALYSIS"
  | "AI_REVIEW"
  | "COMPLETE"
  | "FAILED";

export interface GradingProgressPayload {
  submissionId: string;
  step: GradingStep;
  progressPercent: number; // 0 - 100
  message: string;
  data?: any;
}

let io: Server | null = null;

/**
 * Initializes the WebSocket Server (Socket.io) attached to the HTTP Server
 */
export function initSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: "*", // Allow all frontend origins (e.g. Vite port 5173) to connect
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket: Socket) => {
    console.log(`[WebSocket] Client connected: ${socket.id}`);

    // Client (student) joins the listening room for a specific submission
    socket.on("join_submission", (submissionId: string) => {
      socket.join(`submission_${submissionId}`);
      console.log(`[WebSocket] Client ${socket.id} joined room: submission_${submissionId}`);
      socket.emit("joined", { submissionId, message: "Connected to submission stream" });
    });

    // Leave room
    socket.on("leave_submission", (submissionId: string) => {
      socket.leave(`submission_${submissionId}`);
      console.log(`[WebSocket] Client ${socket.id} left room: submission_${submissionId}`);
    });

    socket.on("disconnect", () => {
      console.log(`[WebSocket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

/**
 * Utility function for other modules (Sandbox, Queue, AST) to emit grading progress events to the client
 */
export function emitGradingProgress(payload: GradingProgressPayload) {
  if (!io) {
    console.warn("[WebSocket] Socket.io not initialized yet.");
    return;
  }
  io.to(`submission_${payload.submissionId}`).emit("grading_progress", payload);
}

export function getSocketServer(): Server | null {
  return io;
}
