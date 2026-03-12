import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { authRouter } from "./routes/auth.js";
import { interviewRouter } from "./routes/interview.js";
import { aiRouter } from "./routes/ai.js";
import { jobsRouter } from "./routes/jobs.js";
import { verificationRouter } from "./routes/verification.js";
import { notificationsRouter } from "./routes/notifications.js";
import { uploadsRouter, UPLOADS_DIR } from "./routes/uploads.js";
import { usersRouter } from "./routes/users.js";
import { proctoringRouter } from "./routes/proctoring.js";
import { proctorRouter } from "./routes/proctor.js";
import { appealsRouter } from "./routes/appeals.js";
import { executeRouter } from "./routes/execute.js";
import { adminRouter } from "./routes/admin.js";
import { featureFlagsRouter } from "./routes/feature-flags.js";
import { interviewerApplicationRouter } from "./routes/interviewer-application.js";
import { expertRouter } from "./routes/expert.js";

export function createApp() {
  const app = express();

  // CORS: allow Vercel frontend and reflect request origin (fixes preflight from provenhire.vercel.app)
  const allowedOrigins = [
    "https://provenhire.vercel.app",
    "http://localhost:5173",
    "http://localhost:8080",
  ];
  const isAllowedOrigin = (o: string) =>
    allowedOrigins.includes(o) || o.endsWith(".vercel.app") || o.startsWith("http://localhost:");
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allow = !origin || isAllowedOrigin(origin);
    res.setHeader("Access-Control-Allow-Origin", allow && origin ? origin : (allowedOrigins[0] as string));
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
      origin: (o, cb) => cb(null, true),
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      optionsSuccessStatus: 204,
    })
  );
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "2mb" }));
  app.use(pinoHttp());
  app.use("/uploads", express.static(UPLOADS_DIR));
  const proctorScreenshotsDir = process.env.PROCTOR_SCREENSHOTS_DIR || path.join(process.cwd(), "..", "proctoring");
  app.use("/proctoring", express.static(proctorScreenshotsDir));

  app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

  app.get("/ping", (_req, res) => {
    res.json({ ping: "pong", timestamp: new Date().toISOString() });
  });

  app.get("/status", (_req, res) => {
    res.json({ status: "running", service: "provenhire-api" });
  });

  app.get("/diagnostic", async (_req, res) => {
    const jwtOk = !!process.env.JWT_SECRET;
    const resendConfigured = !!process.env.RESEND_API_KEY;
    const gmailConfigured = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
    const emailConfigured = resendConfigured || gmailConfigured;
    let dbOk = false;
    let emailVerificationTableOk = false;
    try {
      const { prisma } = await import("./config/prisma.js");
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
      await prisma.emailVerificationCode.findFirst({ take: 1 });
      emailVerificationTableOk = true;
    } catch (e) {
      // ignore
    }
    res.json({
      ok: jwtOk && dbOk,
      emailVerificationTableOk,
      emailConfigured,
      emailProviders: {
        resend: resendConfigured ? "configured" : "missing",
        gmail: gmailConfigured ? "configured" : "missing",
      },
      jwt: jwtOk ? "configured" : "missing",
      database: dbOk ? "connected" : "unavailable",
    });
  });

  // Lightweight warmup endpoint — wakes Render from cold start and warms DB connection
  app.get("/api/health", async (_req, res) => {
    try {
      const { prisma } = await import("./config/prisma.js");
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      /* ignore */
    }
    res.status(200).json({ ok: true });
  });

  app.get("/api", (_req, res) => {
    res.json({
      ok: true,
      message: "ProvenHire API is reachable",
      routes: [
        "/api/auth",
        "/api/interview",
        "/api/ai",
        "/api/jobs",
        "/api/verification",
        "/api/notifications",
        "/api/uploads",
        "/api/users",
        "/api/proctoring",
        "/api/proctor",
        "/api/appeals",
        "/api/execute",
        "/api/admin",
        "/api/interviewer-application",
        "/api/expert",
      ],
    });
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
  app.use("/api/proctor", proctorRouter);
  app.use("/api/appeals", appealsRouter);
  app.use("/api/execute", executeRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/feature-flags", featureFlagsRouter);
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
