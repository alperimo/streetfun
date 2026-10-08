import { createHmac, timingSafeEqual } from "node:crypto";
import { invalid, unavailable } from "./pantaValidation";

export function issuePantaSession(payload: Record<string, unknown>, now = Date.now()): string {
  const secret = process.env.PANTA_SESSION_SECRET;
  if (!secret || !/^[a-f0-9]{64,128}$/i.test(secret)) throw unavailable();
  const data = Buffer.from(JSON.stringify({ ...payload, issuedAt: now })).toString("base64url");
  const signature = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}
export function readPantaSession(token: unknown, kind: "quote" | "order" | "claim", now = Date.now()): Record<string, unknown> {
  const secret = process.env.PANTA_SESSION_SECRET;
  if (!secret || !/^[a-f0-9]{64,128}$/i.test(secret)) throw unavailable();
  if (typeof token !== "string" || token.length > 6000) invalid();
  const [data, mac, extra] = token.split(".");
  if (!data || !mac || extra || !/^[A-Za-z0-9_-]+$/.test(mac)) invalid();
  const supplied = Buffer.from(mac, "base64url");
  const expected = createHmac("sha256", secret).update(data).digest();
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) invalid();
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")); } catch { invalid(); }
  if (!payload || payload.kind !== kind || typeof payload.expires !== "number" || typeof payload.issuedAt !== "number" ||
      !Number.isSafeInteger(payload.expires) || payload.expires <= now || payload.issuedAt > now || now - payload.issuedAt > 86400_000) invalid();
  return payload;
}
