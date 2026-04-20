const LEGAL_TERMS = [
  "herein",
  "hereunder",
  "thereof",
  "notwithstanding",
  "indemnify",
  "waiver",
  "arbitration",
  "liability",
  "jurisdiction",
  "terminate",
  "assign",
  "covenant"
];

export function computeReadability(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const words = (clean.match(/\b[\w'-]+\b/g) || []).map((word) => word.toLowerCase());
  const sentences = clean.split(/[.!?]+/).filter((segment) => segment.trim().length > 0);

  const wordCount = words.length;
  const sentenceCount = Math.max(sentences.length, 1);
  const avgSentenceLength = wordCount / sentenceCount;
  const longWordCount = words.filter((word) => word.length >= 10).length;
  const legalTermCount = words.filter((word) => LEGAL_TERMS.includes(word)).length;

  const longWordDensity = ratio(longWordCount, wordCount);
  const legalTermDensity = ratio(legalTermCount, wordCount);

  // Heuristic score from 0-100 where larger means more legal/complex language.
  const complexityScore = clamp(
    Math.round(
      avgSentenceLength * 1.35 + longWordDensity * 130 + legalTermDensity * 170
    ),
    0,
    100
  );

  const level = complexityLevel(complexityScore);
  const warning = readabilityWarning(level);

  return {
    score: complexityScore,
    level,
    warning,
    metrics: {
      wordCount,
      avgSentenceLength: round(avgSentenceLength, 1),
      legalTermDensity: round(legalTermDensity * 100, 1)
    }
  };
}

function complexityLevel(score) {
  if (score >= 70) return "very complex";
  if (score >= 52) return "complex";
  if (score >= 36) return "moderate";
  return "plain";
}

function readabilityWarning(level) {
  if (level === "very complex") {
    return "Heavy legalese detected. Review each risky clause carefully before agreeing.";
  }
  if (level === "complex") {
    return "This policy uses dense legal language. Read with extra caution.";
  }
  if (level === "moderate") {
    return "Moderate legal complexity. Check key rights and billing terms closely.";
  }
  return "Relatively plain language overall, but still verify important clauses.";
}

function ratio(numerator, denominator) {
  if (!denominator) return 0;
  return numerator / denominator;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
