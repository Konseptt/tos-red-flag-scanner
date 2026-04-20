import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { AppError, validatePolicyUrl } from "./src/security.js";
import { fetchPolicyText } from "./src/fetch-policy-text.js";
import { extractPdfTextFromBuffer } from "./src/pdf-text.js";
import { computeReadability } from "./src/readability.js";
import { scanPolicyForRedFlags } from "./src/scan-policy.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const hasPdfMime = String(file.mimetype || "").toLowerCase() === "application/pdf";
    const hasPdfName = String(file.originalname || "").toLowerCase().endsWith(".pdf");
    if (!hasPdfMime && !hasPdfName) {
      callback(new AppError(400, "Only PDF uploads are allowed."));
      return;
    }
    callback(null, true);
  }
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        mediaSrc: ["'self'", "https:", "data:"]
      }
    }
  })
);

app.use(express.json({ limit: "250kb" }));

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.use(
  express.static(path.join(__dirname, "public"), {
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-store");
    }
  })
);

app.post("/api/scan", upload.single("policyFile"), async (req, res) => {
  const requestId = crypto.randomUUID();
  try {
    const urlValue = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    const pastedText = typeof req.body?.policyText === "string" ? req.body.policyText.trim() : "";
    const scanMode = req.body?.scanMode === "strict" ? "strict" : "broad";
    const uploadedPdf = req.file;
    const selectedInputCount = Number(Boolean(urlValue)) + Number(Boolean(uploadedPdf)) + Number(Boolean(pastedText));

    if (!selectedInputCount) {
      throw new AppError(400, "Provide one input: policy URL, PDF upload, or pasted text.");
    }

    if (selectedInputCount > 1) {
      throw new AppError(400, "Choose one input method only: URL, PDF, or pasted text.");
    }

    let policyText = "";
    let sourceLabel = "";
    let sourceType = "unknown";

    if (uploadedPdf) {
      policyText = await extractPdfTextFromBuffer(uploadedPdf.buffer);
      sourceLabel = `PDF: ${uploadedPdf.originalname || "uploaded-file.pdf"}`;
      sourceType = "pdf";
    } else if (urlValue) {
      const parsedUrl = await validatePolicyUrl(urlValue);
      policyText = await fetchPolicyText(parsedUrl);
      sourceLabel = parsedUrl.toString();
      sourceType = "url";
    } else {
      policyText = pastedText.slice(0, 24_000);
      sourceLabel = "Pasted text";
      sourceType = "text";
    }

    if (policyText.length < 500) {
      return res.status(422).json({
        error:
          "The content is too short to analyze. Use a fuller Terms/Privacy page or a complete PDF."
      });
    }

    const report = await scanPolicyForRedFlags(policyText, sourceLabel, { mode: scanMode });
    const readability = computeReadability(policyText);

    return res.json({
      ...report,
      readability
    });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    const message =
      status >= 500
        ? "Failed to scan this document right now. Please try again."
        : error?.message || "Invalid request";

    logAudit("scan_failed", {
      requestId,
      statusCode: status,
      scanMode: req.body?.scanMode === "strict" ? "strict" : "broad",
      sourceType: req.file ? "pdf" : req.body?.url ? "url" : req.body?.policyText ? "text" : "unknown",
      inputLength: estimateInputLength(req),
      errorName: error?.name || "UnknownError",
      errorMessage: String(error?.message || "Unknown error").slice(0, 220)
    });

    return res.status(status).json({ error: message });
  }
});

app.use((error, _req, res, next) => {
  if (!error) {
    next();
    return;
  }

  logAudit("scan_failed", {
    requestId: crypto.randomUUID(),
    statusCode: Number(error?.statusCode || 400),
    sourceType: _req.file ? "pdf" : _req.body?.url ? "url" : _req.body?.policyText ? "text" : "unknown",
    scanMode: _req.body?.scanMode === "strict" ? "strict" : "broad",
    inputLength: estimateInputLength(_req),
    errorName: error?.name || "UnknownError",
    errorMessage: String(error?.message || "Unknown error").slice(0, 220)
  });

  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    res.status(400).json({ error: "PDF exceeds the 5MB size limit." });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  next(error);
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`ToS scanner running at http://localhost:${port}`);
});

function logAudit(event, metadata) {
  const entry = {
    ts: new Date().toISOString(),
    event,
    ...metadata
  };
  console.log(JSON.stringify(entry));
}

function estimateInputLength(req) {
  if (typeof req.body?.policyText === "string") return req.body.policyText.length;
  if (typeof req.body?.url === "string") return req.body.url.length;
  if (req.file?.size) return req.file.size;
  return 0;
}
