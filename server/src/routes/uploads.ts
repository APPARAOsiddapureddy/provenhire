import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, "uploads"),
  filename: (_req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`;
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
