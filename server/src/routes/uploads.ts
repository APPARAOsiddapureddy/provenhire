import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import { requireAuth } from "../middleware/auth.js";

const ALLOWED_EXT = /\.(pdf|doc|docx|txt|odt|png|jpg|jpeg|gif|webp)$/i;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, "uploads"),
  filename: (_req, file, cb) => {
    const orig = (file.originalname || "").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, "_");
    const ext = ALLOWED_EXT.exec(orig)?.[0] || ".bin";
    const safeName = `${crypto.randomUUID()}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({ storage });

export const uploadsRouter = Router();

uploadsRouter.post("/", requireAuth, upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Missing file" });
    const url = `/uploads/${req.file.filename}`;
    return res.json({ url });
  } catch (e) {
    console.error("[uploads]", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Upload failed" });
  }
});
