import { Router } from "express";
import { dsaSessionRuntimeRouter } from "./dsaSessionRuntime.js";
import { mcqSessionRouter } from "./mcqSession.js";
import { sqlSessionRouter } from "./sqlSession.js";

export const sessionRouter = Router();

sessionRouter.use("/mcq", mcqSessionRouter);
sessionRouter.use("/dsa", dsaSessionRuntimeRouter);
sessionRouter.use("/sql", sqlSessionRouter);
