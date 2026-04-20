import test from "node:test";
import assert from "node:assert/strict";
import { computeReadability } from "../src/readability.js";

test("readability returns expected shape", () => {
  const result = computeReadability(
    "We may terminate access. You agree to arbitration and waive jury trial rights."
  );

  assert.equal(typeof result.score, "number");
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.ok(["plain", "moderate", "complex", "very complex"].includes(result.level));
  assert.equal(typeof result.warning, "string");
  assert.equal(typeof result.metrics.wordCount, "number");
});

test("denser legal language yields higher complexity", () => {
  const plain = computeReadability("You can cancel anytime. We keep your data safe.");
  const dense = computeReadability(
    "Notwithstanding anything herein, you indemnify and hold harmless all affiliates, " +
      "accept exclusive arbitration, and consent to jurisdiction thereof."
  );

  assert.ok(dense.score > plain.score);
});
