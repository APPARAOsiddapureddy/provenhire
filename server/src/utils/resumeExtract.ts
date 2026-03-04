import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export async function extractTextFromFile(buffer: Buffer, mimetype: string): Promise<string> {
  const mime = mimetype?.toLowerCase() || "";
  if (mime.includes("pdf") || buffer[0] === 0x25 && buffer[1] === 0x50) {
    return extractFromPdf(buffer);
  }
  if (
    mime.includes("word") ||
    mime.includes("document") ||
    mime.includes("msword") ||
    mime.includes("opendocument")
  ) {
    return extractFromDoc(buffer);
  }
  return extractFromText(buffer);
}

async function extractFromPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    await parser.destroy();
    return (result as { text?: string }).text ?? "";
  } catch (e) {
    await parser.destroy().catch(() => {});
    throw e;
  }
}

async function extractFromDoc(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

function extractFromText(buffer: Buffer): Promise<string> {
  return Promise.resolve(buffer.toString("utf-8"));
}
