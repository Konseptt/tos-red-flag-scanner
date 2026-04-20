import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { AppError } from "./security.js";

export async function extractPdfTextFromBuffer(pdfBuffer) {
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
    throw new AppError(400, "Uploaded file payload is invalid.");
  }

  try {
    const result = await pdfParse(pdfBuffer);
    const text = collapseWhitespace(String(result?.text || ""));
    return text.slice(0, 24_000);
  } catch {
    throw new AppError(422, "Could not read text from this PDF.");
  }
}

function collapseWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}
