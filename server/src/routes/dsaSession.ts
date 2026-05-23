import { Router } from "express";
import { z } from "zod";
import { DSA_API_LANGUAGES } from "../constants/dsa.js";
import { requireAuth, requireJobSeeker, type AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import { autoFinalizeDsaSession } from "../services/dsaAutoFinalize.service.js";
import { bufferCodeDraft, bufferFollowUpAnswers, bufferSessionState, getFollowUpAnswers } from "../services/dsaDraftBuffer.service.js";
import { getPublicDsaFollowUps, gradeAndPersistDsaFollowUps } from "../services/dsaFollowUps.service.js";
import {
  assertQuestionInSession,
  createOrGetDsaSession,
  DSA_FOLLOW_UP_MINUTES,
  getCurrentDsaSession,
  getDsaSessionSnapshot,
  requireActiveDsaSession,
} from "../services/dsaSession.service.js";

export const dsaSessionRouter = Router();

dsaSessionRouter.use(requireAuth, requireJobSeeker);

function isRoundExpired(session: { expTime: Date; pausedTime: Date | null }): boolean {
  return !session.pausedTime && session.expTime.getTime() <= Date.now();
}

function namedError(name: string, message: string): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

async function sendSnapshotOrFinalized(req: AuthedRequest, res: any) {
  const snapshot = await getCurrentDsaSession(req.user!.id);
  if (!snapshot) return res.status(404).json({ error: "No active DSA session." });
  if (snapshot.session.expired) {
    const finalized = await autoFinalizeDsaSession(snapshot.session.id);
    return res.json({ ...snapshot, autoFinalize: finalized });
  }
  return res.json(snapshot);
}

dsaSessionRouter.post("/", async (req: AuthedRequest, res) => {
  try {
    const snapshot = await createOrGetDsaSession(req.user!.id);
    if (snapshot.session.expired) {
      const finalized = await autoFinalizeDsaSession(snapshot.session.id);
      return res.json({ ...snapshot, autoFinalize: finalized });
    }
    return res.json(snapshot);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Could not create DSA session." });
  }
});

dsaSessionRouter.get("/", async (req: AuthedRequest, res) => {
  try {
    return await sendSnapshotOrFinalized(req, res);
  } catch (err) {
    console.error("[dsa/session:get]", err);
    return res.status(500).json({ error: "Could not load DSA session." });
  }
});

dsaSessionRouter.patch("/", async (req: AuthedRequest, res) => {
  const schema = z.object({ activeQId: z.string().min(1).nullable().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid session patch", details: parsed.error.flatten() });
  try {
    const session = await requireActiveDsaSession(req.user!.id);
    if (parsed.data.activeQId) assertQuestionInSession(session, parsed.data.activeQId);
    await bufferSessionState({
      roundSessionId: session.id,
      userId: req.user!.id,
      activeQId: parsed.data.activeQId ?? session.activeQId,
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Could not update DSA session." });
  }
});

dsaSessionRouter.put("/code", async (req: AuthedRequest, res) => {
  const schema = z.object({
    questionId: z.string().min(1),
    language: z.enum(DSA_API_LANGUAGES as unknown as [string, ...string[]]),
    code: z.string().max(100_000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid code draft", details: parsed.error.flatten() });
  try {
    const session = await requireActiveDsaSession(req.user!.id);
    assertQuestionInSession(session, parsed.data.questionId);
    if (isRoundExpired(session)) return res.status(410).json({ error: "DSA session has expired." });
    await bufferCodeDraft({
      roundSessionId: session.id,
      userId: req.user!.id,
      questionId: parsed.data.questionId,
      language: parsed.data.language,
      code: parsed.data.code,
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Could not save code draft." });
  }
});

dsaSessionRouter.post("/follow-up/:questionId/start", async (req: AuthedRequest, res) => {
  const params = z.object({ questionId: z.string().min(1) }).safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: "Invalid question id" });
  try {
    const session = await requireActiveDsaSession(req.user!.id);
    assertQuestionInSession(session, params.data.questionId);
    if (isRoundExpired(session)) return res.status(410).json({ error: "DSA session has expired." });

    const followUpSession = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dsa_followup:${session.id}`}))`;

      const freshSession = await tx.dsaRoundSession.findUnique({ where: { id: session.id } });
      if (!freshSession || freshSession.userId !== req.user!.id) {
        throw namedError("DSA_SESSION_NOT_FOUND", "No active DSA session.");
      }
      if (isRoundExpired(freshSession)) {
        throw namedError("DSA_SESSION_EXPIRED", "DSA session has expired.");
      }

      const activeExisting = freshSession.activeFollowUpId
        ? await tx.dsaFollowUpSession.findUnique({ where: { id: freshSession.activeFollowUpId } })
        : null;
      const followUpSession = activeExisting && activeExisting.questionId !== params.data.questionId
        ? activeExisting
        : await (async () => {
            const officialSubmission = await tx.dsaSubmission.findFirst({
              where: {
                userId: req.user!.id,
                roundSessionId: session.id,
                questionId: params.data.questionId,
                isOfficial: true,
              },
              select: { id: true },
            });
            if (!officialSubmission) {
              throw namedError("FOLLOW_UP_CODE_SUBMISSION_REQUIRED", "Submit the coding solution before answering follow-up questions.");
            }
            return tx.dsaFollowUpSession.upsert({
              where: { roundSessionId_questionId: { roundSessionId: session.id, questionId: params.data.questionId } },
              create: {
                roundSessionId: session.id,
                userId: req.user!.id,
                questionId: params.data.questionId,
                expTime: new Date(Date.now() + DSA_FOLLOW_UP_MINUTES * 60 * 1000),
              },
              update: {},
            });
          })();

      await tx.dsaRoundSession.update({
        where: { id: session.id },
        data: {
          pausedTime: freshSession.pausedTime ?? new Date(),
          activeFollowUpId: followUpSession.id,
        },
      });

      return followUpSession;
    });

    const answers = (await getFollowUpAnswers(session.id, followUpSession.questionId)) ?? {};
    return res.json({
      id: followUpSession.id,
      questionId: followUpSession.questionId,
      expTime: followUpSession.expTime.toISOString(),
      secondsRemaining: Math.max(0, Math.ceil((followUpSession.expTime.getTime() - Date.now()) / 1000)),
      answers,
      followUps: await getPublicDsaFollowUps(followUpSession.questionId),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "DSA_SESSION_EXPIRED") return res.status(410).json({ error: err.message });
    if (err instanceof Error && err.name === "FOLLOW_UP_CODE_SUBMISSION_REQUIRED") return res.status(409).json({ error: err.message });
    return res.status(400).json({ error: err instanceof Error ? err.message : "Could not start follow-ups." });
  }
});

dsaSessionRouter.patch("/follow-up/:questionId", async (req: AuthedRequest, res) => {
  const params = z.object({ questionId: z.string().min(1) }).safeParse(req.params);
  const body = z.object({ answers: z.record(z.string()) }).safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ error: "Invalid follow-up answer draft." });
  try {
    const session = await requireActiveDsaSession(req.user!.id);
    assertQuestionInSession(session, params.data.questionId);
    const followUp = await prisma.dsaFollowUpSession.findUnique({
      where: { roundSessionId_questionId: { roundSessionId: session.id, questionId: params.data.questionId } },
      select: { id: true },
    });
    if (!followUp) return res.status(404).json({ error: "Follow-up session has not started." });
    await bufferFollowUpAnswers({
      roundSessionId: session.id,
      userId: req.user!.id,
      questionId: params.data.questionId,
      answers: body.data.answers,
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Could not save follow-up answers." });
  }
});

dsaSessionRouter.post("/follow-up/:questionId/submit", async (req: AuthedRequest, res) => {
  const params = z.object({ questionId: z.string().min(1) }).safeParse(req.params);
  const body = z.object({
    answers: z.record(z.string()).optional(),
    timedOut: z.boolean().optional(),
  }).safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ error: "Invalid follow-up submit payload." });
  try {
    const session = await requireActiveDsaSession(req.user!.id);
    assertQuestionInSession(session, params.data.questionId);
    const answers = body.data.answers ?? (await getFollowUpAnswers(session.id, params.data.questionId)) ?? {};
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dsa_followup:${session.id}`}))`;

      const followUp = await tx.dsaFollowUpSession.findUnique({
        where: { roundSessionId_questionId: { roundSessionId: session.id, questionId: params.data.questionId } },
      });
      if (!followUp) throw namedError("FOLLOW_UP_NOT_STARTED", "Follow-up session has not started.");

      await tx.dsaFollowUpSession.update({
        where: { id: followUp.id },
        data: { answers, pausedTime: body.data.timedOut ? followUp.expTime : null },
      });

      const result = await gradeAndPersistDsaFollowUps({
        userId: req.user!.id,
        roundSessionId: session.id,
        questionId: params.data.questionId,
        answers,
        allowIncomplete: body.data.timedOut === true,
        db: tx,
      });

      const freshSession = await tx.dsaRoundSession.findUnique({ where: { id: session.id } });
      if (freshSession?.pausedTime) {
        const pauseEnd = body.data.timedOut && followUp.expTime.getTime() < Date.now() ? followUp.expTime : new Date();
        const pausedMs = Math.max(0, pauseEnd.getTime() - freshSession.pausedTime.getTime());
        await tx.dsaRoundSession.update({
          where: { id: session.id },
          data: {
            expTime: new Date(freshSession.expTime.getTime() + pausedMs),
            pausedTime: null,
            activeFollowUpId: null,
          },
        });
      }

      return result;
    });

    return res.json({ questionId: params.data.questionId, ...result });
  } catch (err) {
    if (err instanceof Error && err.name === "FOLLOW_UP_NOT_STARTED") return res.status(404).json({ error: err.message });
    if (err instanceof Error && err.name === "FOLLOW_UP_INCOMPLETE") return res.status(400).json({ error: err.message });
    if (err instanceof Error && err.name === "FOLLOW_UP_CODE_SUBMISSION_REQUIRED") return res.status(409).json({ error: err.message });
    return res.status(400).json({ error: err instanceof Error ? err.message : "Could not submit follow-ups." });
  }
});
