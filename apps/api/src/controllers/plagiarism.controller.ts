
import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { prisma } from "../prisma.js";

const SOURCE_EXTENSIONS: Record<string, string[]> = {
    JAVA: [".java"],
    PYTHON: [".py"],
    "C#": [".cs"],
    CSHARP: [".cs"],
    CSH: [".cs"],
};

function extractSourceCode(fileUrl: string, language: string): string {
    // Submission uploads are stored under the API working directory.
    const filename = path.basename(fileUrl);
    const zipPath = path.join(
        process.cwd(),
        "uploads",
        "submissions",
        filename,
    );

    if (!fs.existsSync(zipPath)) {
        throw new Error("Không tìm thấy file ZIP của bài nộp.");
    }

    const zip = new AdmZip(zipPath);
    const extensions =
        SOURCE_EXTENSIONS[language.toUpperCase()] ??
        [".java", ".py", ".cs"];

    const sourceEntries = zip.getEntries()
        .filter((entry) => {
            if (entry.isDirectory) return false;

            const entryPath = entry.entryName.replace(/\\/g, "/");

            // Skip generated files and common dependency directories.
            if (
                entryPath.split("/").some((part) =>
                    ["node_modules", ".git", "bin", "obj", "build", "dist"]
                        .includes(part.toLowerCase())
                )
            ) {
                return false;
            }

            return extensions.includes(
                path.extname(entry.name).toLowerCase(),
            );
        })
        .sort((a, b) => a.entryName.localeCompare(b.entryName));

    if (sourceEntries.length === 0) {
        throw new Error(
            `Không tìm thấy file mã nguồn ${extensions.join(", ")} trong ZIP.`,
        );
    }

    const MAX_SOURCE_BYTES = 1024 * 1024;
    let totalBytes = 0;

    const files: string[] = [];

    for (const entry of sourceEntries) {
        const data = entry.getData();
        totalBytes += data.length;

        if (totalBytes > MAX_SOURCE_BYTES) {
            throw new Error(
                "Tổng mã nguồn vượt quá giới hạn đọc 1 MB.",
            );
        }

        files.push(
            `// File: ${entry.entryName}\n${data.toString("utf8")}`,
        );
    }

    return files.join("\n\n");
}

export const getPlagiarismMatch = async (
    req: Request,
    res: Response,
) => {
    try {
        const { matchId } = req.params;
        const user = req.user;

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Vui lòng đăng nhập.",
            });
        }

        const match = await prisma.plagiarismMatch.findUnique({
            where: { id: matchId },
            include: {
                submission1: {
                    include: {
                        student: {
                            include: {
                                user: {
                                    select: {
                                        fullName: true,
                                    },
                                },
                            },
                        },
                        assignment: {
                            include: {
                                class: {
                                    select: {
                                        lecturerId: true,
                                    },
                                },
                            },
                        },
                    },
                },
                submission2: {
                    include: {
                        student: {
                            include: {
                                user: {
                                    select: {
                                        fullName: true,
                                    },
                                },
                            },
                        },
                        assignment: {
                            include: {
                                class: {
                                    select: {
                                        lecturerId: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!match) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy cặp bài đối chiếu.",
            });
        }

        const sub1 = match.submission1;
        const sub2 = match.submission2;

        // Both submissions must belong to the same assignment.
        if (sub1.assignmentId !== sub2.assignmentId) {
            return res.status(409).json({
                success: false,
                message: "Hai bài nộp không thuộc cùng một bài tập.",
            });
        }

        // Lecturers may only inspect classes they manage.
        const lecturerId = sub1.assignment.class.lecturerId;

        if (user.role !== "ADMIN" && lecturerId !== user.userId) {
            return res.status(403).json({
                success: false,
                message: "Bạn không có quyền xem cặp bài đối chiếu này.",
            });
        }

        const language = sub1.assignment.language;

        if (language !== sub2.assignment.language) {
            return res.status(409).json({
                success: false,
                message: "Ngôn ngữ của hai bài nộp không khớp.",
            });
        }

        let code1: string;
        let code2: string;

        try {
            code1 = extractSourceCode(sub1.fileUrl, language);
            code2 = extractSourceCode(sub2.fileUrl, language);
        } catch (error) {
            return res.status(422).json({
                success: false,
                message: error instanceof Error
                    ? error.message
                    : "Không thể đọc mã nguồn bài nộp.",
            });
        }

        return res.json({
            success: true,
            data: {
                id: match.id,
                similarityPercent: match.similarityPercent,
                level: match.level,
                mode: match.mode,
                matchedFragments: match.matchedFragments,
                submission1: {
                    id: sub1.id,
                    studentCode: sub1.student.studentCode,
                    fullName: sub1.student.user.fullName,
                    code: code1,
                },
                submission2: {
                    id: sub2.id,
                    studentCode: sub2.student.studentCode,
                    fullName: sub2.student.user.fullName,
                    code: code2,
                },
            },
        });
    } catch (error) {
        console.error("Lỗi getPlagiarismMatch:", error);

        return res.status(500).json({
            success: false,
            message: "Lỗi máy chủ khi lấy dữ liệu đối chiếu.",
        });
    }
};
