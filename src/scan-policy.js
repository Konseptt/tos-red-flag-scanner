import OpenAI from "openai";
import { AppError } from "./security.js";

export async function scanPolicyForRedFlags(policyText, sourceUrl, options = {}) {
  const mode = normalizeScanMode(options.mode);
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new AppError(500, "Missing NVIDIA_API_KEY on the server.");
  }

  const client = new OpenAI({
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey,
    timeout: 30_000
  });

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: "moonshotai/kimi-k3",
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
      temperature: 1,
      top_p: 0.95,
      max_tokens: 1024,
      stream: false
    });
  } catch {
    throw new AppError(502, "Analysis service failed. Please retry in a moment.");
  }

  const rawContent = completion.choices[0]?.message?.content;
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
