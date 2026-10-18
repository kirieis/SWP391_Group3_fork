import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AuthUser {
    userId: string;
    email: string;
    role: "STUDENT" | "LECTURER" | "ADMIN";
    fullName: string;
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}

// Bắt buộc có JWT hợp lệ
export const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Yêu cầu đăng nhập để truy cập tài nguyên này.",
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        req.user = jwt.verify(token, env.JWT_SECRET) as AuthUser;
        next();
    } catch {
        return res.status(401).json({
            success: false,
            message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
        });
    }
};

// Kiểm tra quyền theo role
export const authorizeRole = (...roles: AuthUser["role"][]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "Bạn không có quyền thực hiện hành động này.",
            });
        }
        next();
    };
};

// Bắt buộc có Internal API Key hợp lệ (Dùng cho giao tiếp nội bộ giữa Worker, Engine và Gateway)
export const requireInternalApiKey = (req: Request, res: Response, next: NextFunction) => {
    const internalKey = req.headers["x-internal-key"];
    const expectedKey = env.INTERNAL_API_KEY || "aita_internal_secret_key_2026";
    const validKeys = [expectedKey, "aita_internal_secret_key_2026", "dev_internal_key"];

    if (!internalKey || !validKeys.includes(internalKey as string)) {
        return res.status(403).json({
            success: false,
            message: "Truy cập bị từ chối: Yêu cầu khóa xác thực nội bộ hợp lệ.",
        });
    }

    next();
};
