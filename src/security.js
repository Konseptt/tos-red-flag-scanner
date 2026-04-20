import dns from "node:dns/promises";
import net from "node:net";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
  }
}

export async function validatePolicyUrl(rawUrl, resolve = dns.lookup) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new AppError(400, "A policy URL is required.");
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new AppError(400, "Please enter a valid URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new AppError(400, "Only HTTP(S) URLs are supported.");
  }

  if (parsed.username || parsed.password) {
    throw new AppError(400, "Credentials in URL are not allowed.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(hostname) || hostname.endsWith(".local")) {
    throw new AppError(400, "Local or internal URLs are blocked.");
  }

  const resolution = await resolve(hostname, { all: true });
  const addresses = Array.isArray(resolution) ? resolution : [resolution];

  for (const entry of addresses) {
    const ip = entry?.address;
    if (!ip || isPrivateOrLocalIp(ip)) {
      throw new AppError(400, "Private/internal network URLs are blocked.");
    }
  }

  return parsed;
}

function isPrivateOrLocalIp(ip) {
  const family = net.isIP(ip);
  if (family === 4) {
    return isPrivateV4(ip);
  }

  if (family === 6) {
    const normalized = ip.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80")
    );
  }

  return true;
}

function isPrivateV4(ip) {
  const [a, b] = ip.split(".").map(Number);
  if ([a, b].some(Number.isNaN)) return true;

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
  return false;
}
