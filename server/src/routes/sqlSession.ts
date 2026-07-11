import { Router } from "express";
import {
  getSqlSessionController,
  runSqlTestsController,
  submitSqlSessionController,
  submitSqlTaskController,
  updateSqlSessionController,
} from "../controllers/sqlSession.controller.js";
import { requireAuth, requireJobSeeker } from "../middleware/auth.js";
import { sqlSessionRunLimiter, sqlSessionSubmitLimiter, sqlSessionUpdateLimiter } from "../middleware/sqlSessionRateLimit.js";

export const sqlSessionRouter = Router();

sqlSessionRouter.use(requireAuth, requireJobSeeker);

sqlSessionRouter.get("/:id", getSqlSessionController);
sqlSessionRouter.patch("/:id", sqlSessionUpdateLimiter, updateSqlSessionController);
sqlSessionRouter.post("/:id/run-tests", sqlSessionRunLimiter, runSqlTestsController);
sqlSessionRouter.post("/:id/questions/:taskId/submit", sqlSessionSubmitLimiter, submitSqlTaskController);
sqlSessionRouter.post("/:id/submit", sqlSessionSubmitLimiter, submitSqlSessionController);
