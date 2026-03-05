import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { authRouter } from "./routes/auth.js";
import { interviewRouter } from "./routes/interview.js";
import { aiRouter } from "./routes/ai.js";
import { jobsRouter } from "./routes/jobs.js";
import { verificationRouter } from "./routes/verification.js";
import { notificationsRouter } from "./routes/notifications.js";
import { uploadsRouter } from "./routes/uploads.js";
import { usersRouter } from "./routes/users.js";
import { proctoringRouter } from "./routes/proctoring.js";
import { appealsRouter } from "./routes/appeals.js";
import { executeRouter } from "./routes/execute.js";
import { adminRouter } from "./routes/admin.js";
import { interviewerApplicationRouter } from "./routes/interviewer-application.js";
import { expertRouter } from "./routes/expert.js";

export function createApp() {
  const app = express();

  // CORS: explicit middleware first — reflect request origin (required for preflight from Vercel)
  app.use((req, res, next) => {
    const origin = req.headers.origin || "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
    next();
  });

  app.use(
    cors({
      origin: true, // reflect request origin
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      optionsSuccessStatus: 204,
    })
  );
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "2mb" }));
  app.use(pinoHttp());
  app.use("/uploads", express.static("uploads"));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/ping", (_req, res) => {
    res.json({ ping: "pong", timestamp: new Date().toISOString() });
  });

  app.get("/status", (_req, res) => {
    res.json({ status: "running", service: "provenhire-api" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/interview", interviewRouter);
  app.use("/api/ai", aiRouter);
  app.use("/api/jobs", jobsRouter);
  app.use("/api/verification", verificationRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/uploads", uploadsRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/proctoring", proctoringRouter);
  app.use("/api/appeals", appealsRouter);
  app.use("/api/execute", executeRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/interviewer-application", interviewerApplicationRouter);
  app.use("/api/expert", expertRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err?.statusCode ?? 500;
    const message = err?.message ?? "Unexpected server error";
    res.status(status).json({ error: message });
  });

  return app;
}
