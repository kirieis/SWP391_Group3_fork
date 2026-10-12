import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../prisma.js";
import { env } from "../config/env.js";

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);
const EMAIL_REGEX = /^[^@\s]+@(fpt|fe)\.edu\.vn$/;

export const loginWithGoogle = async (req: Request, res: Response) => {
    try {
        const { credential, email: mockEmail, access_token, name: googleName } = req.body;

        let email = "";
        let fullName = "";

        // =========================================================================
        // 1. CHẾ ĐỘ DEV LOGIN NHANH (Chỉ cho phép khi KHÔNG PHẢI là Production)
        // =========================================================================
        if (credential === "mock_local_dev_token" && mockEmail) {
            if (process.env.NODE_ENV === "production") {
                return res.status(403).json({
                    success: false,
                    message: "Chế độ đăng nhập thử nghiệm bị vô hiệu hóa trên môi trường Production.",
                });
            }
            email = mockEmail.trim().toLowerCase();
            fullName = email.split("@")[0].toUpperCase();

        // =========================================================================
        // 2. GOOGLE ACCESS TOKEN FLOW (Frontend dùng @react-oauth/google)
        //    Frontend nhận access_token → gọi Google UserInfo API lấy email
        //    Backend nhận lại email đã xác thực để validate domain
        // =========================================================================
        } else if (credential === "google_access_token" && access_token && mockEmail) {
            // Xác minh access_token với Google UserInfo API
            let verifiedEmail = "";
            let verifiedName = "";
            try {
                const userInfoResponse = await fetch(
                    `https://www.googleapis.com/oauth2/v3/userinfo`,
                    { headers: { Authorization: `Bearer ${access_token}` } }
                );
                if (!userInfoResponse.ok) {
                    return res.status(401).json({
                        success: false,
                        message: "Google access_token không hợp lệ hoặc đã hết hạn.",
                    });
                }
                const userInfo = await userInfoResponse.json();
                verifiedEmail = (userInfo.email || "").trim().toLowerCase();
                verifiedName = userInfo.name || verifiedEmail.split("@")[0];
            } catch {
                return res.status(401).json({
                    success: false,
                    message: "Không thể xác thực với Google. Vui lòng thử lại.",
                });
            }

            // Đảm bảo email từ Google khớp email frontend gửi (chống giả mạo)
            if (verifiedEmail !== mockEmail.trim().toLowerCase()) {
                return res.status(403).json({
                    success: false,
                    message: "Email không khớp với tài khoản Google đã chọn.",
                });
            }
            email = verifiedEmail;
            fullName = googleName || verifiedName;

        } else {
            // =====================================================================
            // 3. XÁC THỰC GOOGLE ID TOKEN THẬT (dự phòng cho tương lai)
            // =====================================================================
            if (!credential || typeof credential !== "string") {
                return res.status(400).json({ success: false, message: "Thiếu Google credential." });
            }

            let payload;
            try {
                const ticket = await googleClient.verifyIdToken({
                    idToken: credential,
                    audience: env.GOOGLE_CLIENT_ID,
                });
                payload = ticket.getPayload();
            } catch (err) {
                return res.status(401).json({ success: false, message: "Google token không hợp lệ." });
            }

            if (!payload?.email || !payload.email_verified) {
                return res.status(401).json({ success: false, message: "Email Google chưa được xác minh." });
            }

            email = payload.email.trim().toLowerCase();
            fullName = payload.name || email.split("@")[0];
        }


        // 3. Kiểm tra domain FPT theo SRS mục 6.7.1
        if (!EMAIL_REGEX.test(email)) {
            return res.status(403).json({
                success: false,
                message: "Vui lòng sử dụng tài khoản email FPT Education (@fpt.edu.vn hoặc @fe.edu.vn) để đăng nhập.",
            });
        }

        // 4. Phân loại Role mặc định theo domain
        const defaultRole: "STUDENT" | "LECTURER" = email.endsWith("@fe.edu.vn") ? "LECTURER" : "STUDENT";
        const code = email.split("@")[0].toUpperCase();

        // 5. Tìm hoặc tạo user trong DB (khớp tên quan hệ studentProfile/lecturerProfile/adminProfile)
        let user = await prisma.user.findUnique({
            where: { email },
            include: { studentProfile: true, lecturerProfile: true, adminProfile: true },
        });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    email,
                    fullName,
                    role: defaultRole,
                    ...(defaultRole === "STUDENT" && {
                        studentProfile: { create: { studentCode: code } },
                    }),
                    ...(defaultRole === "LECTURER" && {
                        lecturerProfile: { create: { lecturerCode: code } },
                    }),
                },
                include: { studentProfile: true, lecturerProfile: true, adminProfile: true },
            });
        }

        // 6. Ký JWT Token
        const token = jwt.sign(
            { userId: user.id, email: user.email, fullName: user.fullName, role: user.role },
            env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        return res.json({
            success: true,
            message: "Đăng nhập thành công!",
            data: {
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                    role: user.role,
                    student: user.studentProfile,
                    lecturer: user.lecturerProfile,
                    admin: user.adminProfile,
                },
            },
        });
    } catch (error) {
        console.error("Lỗi đăng nhập:", error);
        return res.status(500).json({ success: false, message: "Lỗi máy chủ nội bộ khi đăng nhập." });
    }
};

export const getCurrentUser = async (req: Request, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: "Chưa xác thực." });
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            include: { studentProfile: true, lecturerProfile: true, adminProfile: true },
        });

        if (!user) {
            return res.status(404).json({ success: false, message: "Không tìm thấy người dùng." });
        }

        return res.json({
            success: true,
            data: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                student: user.studentProfile,
                lecturer: user.lecturerProfile,
                admin: user.adminProfile,
            },
        });
    } catch (error) {
        console.error("Lỗi getCurrentUser:", error);
        return res.status(500).json({ success: false, message: "Lỗi máy chủ." });
    }
};
