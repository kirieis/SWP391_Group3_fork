
import { Router } from "express";
import { getPlagiarismMatch } from "../controllers/plagiarism.controller.js";
import {
    authenticateJWT,
    authorizeRole,
} from "../middlewares/auth.middleware.js";

const router = Router();

router.get(
    "/matches/:matchId",
    authenticateJWT,
    authorizeRole("LECTURER", "ADMIN"),
    getPlagiarismMatch,
);

export default router;
