import axios from "axios";
import { AppError } from "./security.js";

const invokeUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
const stream = false;

export async function scanPolicyForRedFlags(policyText, sourceUrl, options = {}) {
  const mode = normalizeScanMode(options.mode);
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new AppError(500, "Missing NVIDIA_API_KEY on the server.");
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: stream ? "text/event-stream" : "application/json"
  };

  const payload = {
    model: "meta/llama-4-maverick-17b-128e-instruct",
    messages: [
      {
        role: "system",
        content:
          "You are a contract risk analyst. Return strict JSON only and never include markdown fences."
      },
      {
        role: "user",
        content: createPrompt(policyText, sourceUrl, mode)
      }
    ],
    max_tokens: 850,
    temperature: mode === "strict" ? 0.1 : 0.4,
    top_p: 1.0,
    frequency_penalty: 0.0,
    presence_penalty: 0.0,
    stream
  };

  let response;
  try {
    response = await axios.post(invokeUrl, payload, {
      headers,
      responseType: stream ? "stream" : "json",
      timeout: 30_000
    });
  } catch {
    throw new AppError(502, "Analysis service failed. Please retry in a moment.");
  }

  const rawContent = response?.data?.choices?.[0]?.message?.content;
  if (!rawContent || typeof rawContent !== "string") {
    throw new AppError(502, "Analysis service returned an empty response.");
  }

  const parsed = safeJsonParse(rawContent);
  if (!parsed || !Array.isArray(parsed.flags)) {
    throw new AppError(502, "Analysis response format was invalid.");
  }

  const normalizedFlags = parsed.flags
    .slice(0, 5)
    .map((item) => ({
      title: cleanText(item?.title),
      severity: normalizeSeverity(item?.severity),
      whyItMatters: cleanText(item?.whyItMatters),
      plainEnglish: cleanText(item?.plainEnglish),
      quote: cleanText(item?.quote),
      clauseType: cleanText(item?.clauseType)
    }))
    .filter((item) => item.title && item.whyItMatters && item.plainEnglish);

  if (!normalizedFlags.length) {
    throw new AppError(502, "Could not extract usable risk flags from the analysis output.");
  }

  return {
    sourceUrl,
    scanMode: mode,
    overallRisk: normalizeSeverity(parsed.overallRisk),
    flags: normalizedFlags
  };
}

function createPrompt(policyText, sourceUrl, mode) {
  const modeRules =
    mode === "strict"
      ? [
          "- STRICT MODE: Include only high-confidence, concretely risky clauses.",
          "- Exclude speculative or weak concerns.",
          "- Prioritize clauses likely to impact money, legal rights, or privacy."
        ].join("\n")
      : [
          "- BROAD MODE: Include both concrete high-risk and plausible medium-risk concerns.",
          "- Surface suspicious wording patterns that may become user-harmful."
        ].join("\n");

  return `
Analyze this Terms of Service or Privacy Policy and extract exactly five concerning clauses.

Source URL: ${sourceUrl}

Return strict JSON with this shape:
{
  "overallRisk": "low|medium|high|critical",
  "flags": [
    {
      "title": "short name",
      "severity": "low|medium|high|critical",
      "clauseType": "e.g. forced arbitration, auto-renewal, data sharing",
      "quote": "exact short quote from policy",
      "plainEnglish": "what this means for a normal person",
      "whyItMatters": "1-2 sentence risk impact"
    }
  ]
}

Rules:
- Exactly 5 flags.
- Prefer highest risk clauses over common boilerplate.
- Use plain, non-legal language.
- If uncertain, say what is uncertain.
- Output JSON only, no markdown.
${modeRules}

Policy text:
${policyText}
`;
}

function safeJsonParse(raw) {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function cleanText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 320);
}

function normalizeSeverity(value) {
  const normalized = String(value || "").toLowerCase().trim();
  if (["low", "medium", "high", "critical"].includes(normalized)) {
    return normalized;
  }
  return "medium";
}

function normalizeScanMode(value) {
  return value === "strict" ? "strict" : "broad";
}
