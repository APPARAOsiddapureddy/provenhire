import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { requireAuth } from "../middleware/auth.js";
import { isObjectStorageConfigured, uploadObject } from "../services/storage.service.js";

const ALLOWED_EXT = /\.(pdf|doc|docx|txt|odt|png|jpg|jpeg|gif|webp|webm|ogg|m4a|mp3|wav)$/i;

const VERIFICATION_DOC_EXT = /\.(pdf|jpg|jpeg|png)$/i;
const MAX_VERIFICATION_DOC_BYTES = 5 * 1024 * 1024; // 5MB

// Use absolute path so uploads work regardless of cwd (dev, prod, Render)
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function safeExtension(file: Express.Multer.File): string {
  const orig = (file.originalname || "").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, "_");
  let ext = ALLOWED_EXT.exec(orig)?.[0];
  if (!ext) {
    const mime = (file.mimetype || "").toLowerCase();
    if (mime.includes("webm")) ext = ".webm";
    else if (mime.includes("ogg")) ext = ".ogg";
    else if (mime.includes("mpeg") || mime.includes("mp3")) ext = ".mp3";
    else if (mime.includes("wav")) ext = ".wav";
    else if (mime.includes("mp4") || mime.includes("m4a")) ext = ".m4a";
  }
  return ext || ".bin";
}

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const verificationDocUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VERIFICATION_DOC_BYTES },
  fileFilter: (_req, file, cb) => {
    const ok =
      /\.(pdf|jpg|jpeg|png)$/i.test(file.originalname || "") ||
      (file.mimetype && /^(application\/pdf|image\/(jpeg|png))$/i.test(file.mimetype));
    cb(null, !!ok);
  },
});

export { UPLOADS_DIR };

export const uploadsRouter = Router();

uploadsRouter.post("/", requireAuth, memoryUpload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file?.buffer) return res.status(400).json({ error: "Missing file" });

    const ext = safeExtension(file);
    const objectKey = `uploads/${crypto.randomUUID()}${ext}`;

    if (isObjectStorageConfigured()) {
      const url = await uploadObject(file.buffer, objectKey, file.mimetype || "application/octet-stream");
      return res.json({ url });
    }

    ensureUploadsDir();
    const localName = path.basename(objectKey);
    fs.writeFileSync(path.join(UPLOADS_DIR, localName), file.buffer);
    return res.json({ url: `/uploads/${localName}` });
  } catch (e) {
    console.error("[uploads]", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Upload failed" });
  }
});

uploadsRouter.post(
  "/recruiter-verification-document",
  requireAuth,
  verificationDocUpload.single("file"),
  async (req, res) => {
    try {
      const file = req.file;
      if (!file?.buffer) {
        return res.status(400).json({ error: "Missing file. Accepted formats: PDF, JPG, PNG. Max size: 5MB." });
      }
      const ext =
        (file.originalname && VERIFICATION_DOC_EXT.exec(file.originalname)?.[0]) ||
        (file.mimetype?.includes("pdf") ? ".pdf" : ".jpg");
      const objectKey = `recruiter-verification/recruiter-doc-${crypto.randomUUID()}${ext}`;

      if (isObjectStorageConfigured()) {
        const url = await uploadObject(
          file.buffer,
          objectKey,
          file.mimetype || "application/octet-stream"
        );
        return res.json({ url });
      }

      ensureUploadsDir();
      const localName = path.basename(objectKey);
      fs.writeFileSync(path.join(UPLOADS_DIR, localName), file.buffer);
      return res.json({ url: `/uploads/${localName}` });
    } catch (e) {
      console.error("[uploads/recruiter-verification-document]", e);
      return res.status(500).json({ error: e instanceof Error ? e.message : "Upload failed" });
    }
  }
);
