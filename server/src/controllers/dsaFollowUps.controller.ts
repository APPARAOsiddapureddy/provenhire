import type { Response } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../middleware/auth.js";
import {
  getPublicDsaFollowUps,
  gradeAndPersistDsaFollowUps,
} from "../services/dsaFollowUps.service.js";

const ParamsSchema = z.object({
  questionId: z.string().min(1),
});

const SubmitFollowUpsSchema = z.object({
  answers: z.union([
    z.record(z.string().min(1)),
    z.array(
      z.object({
        followUpQuestionId: z.string().min(1),
        selectedOptionText: z.string().min(1).optional(),
        selectedOptionKey: z.string().min(1).optional(),
        selectedOption: z.string().min(1).optional(),
      }).refine(
        (row) => row.selectedOptionText || row.selectedOptionKey || row.selectedOption,
        { message: "A selected option is required" },
      ),
    ),
  ]),
});

export async function getDsaFollowUps(req: AuthedRequest, res: Response) {
  const parsedParams = ParamsSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ error: "Invalid question id", details: parsedParams.error.flatten() });
  }

  const followUps = await getPublicDsaFollowUps(parsedParams.data.questionId);
  return res.json({
    questionId: parsedParams.data.questionId,
    followUps,
  });
}

export async function submitDsaFollowUps(req: AuthedRequest, res: Response) {
  const parsedParams = ParamsSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ error: "Invalid question id", details: parsedParams.error.flatten() });
  }

  const parsedBody = SubmitFollowUpsSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({ error: "Invalid follow-up answers", details: parsedBody.error.flatten() });
  }

  try {
    const result = await gradeAndPersistDsaFollowUps({
      userId: req.user!.id,
      questionId: parsedParams.data.questionId,
      answers: parsedBody.data.answers,
    });
    return res.json({
      questionId: parsedParams.data.questionId,
      ...result,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "FOLLOW_UP_CODE_SUBMISSION_REQUIRED") {
      return res.status(409).json({ error: err.message });
    }
    if (err instanceof Error && err.name === "FOLLOW_UP_INCOMPLETE") {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof Error && /No follow-up questions configured/i.test(err.message)) {
      return res.status(404).json({ error: err.message });
    }
    console.error("[verification/followUps]", err);
    return res.status(500).json({ error: "Failed to validate follow-up answers." });
  }
}
