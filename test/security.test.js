import test from "node:test";
import assert from "node:assert/strict";
import { validatePolicyUrl } from "../src/security.js";

test("accepts valid https policy URL", async () => {
  const url = await validatePolicyUrl(
    "https://example.com/privacy",
    async () => [{ address: "93.184.216.34" }]
  );

  assert.equal(url.hostname, "example.com");
});

test("rejects non-http scheme", async () => {
  await assert.rejects(
    () =>
      validatePolicyUrl("file:///etc/passwd", async () => [
        { address: "93.184.216.34" }
      ]),
    /Only HTTP\(S\) URLs are supported/
  );
});

test("rejects localhost hostnames", async () => {
  await assert.rejects(
    () => validatePolicyUrl("http://localhost:3000", async () => [{ address: "::1" }]),
    /Local or internal URLs are blocked/
  );
});

test("rejects private ip address targets", async () => {
  await assert.rejects(
    () =>
      validatePolicyUrl("https://internal.example", async () => [
        { address: "10.0.2.15" }
      ]),
    /Private\/internal network URLs are blocked/
  );
});
