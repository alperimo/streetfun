import { createHash } from "node:crypto";
import { unavailable, PantaError } from "./pantaValidation";

const API_URL = "https://live-api.panta.market/api/v1";
// Reject the credential exposed in commit 664a515, even if it remains in deployment env.
const RETIRED_KEY_HASH = "551f0f76a6ccefa653a2a2608d40ccc9d4b0b238aa604df7ad0341bccdd5d1da";
export function pantaCredentials() {
  const key = process.env.PANTA_API_KEY;
  const url = process.env.PANTA_API_URL || API_URL;
  if (url !== API_URL || !key || !/^pk_(test|live)_[A-Za-z0-9]+$/.test(key) ||
      createHash("sha256").update(key).digest("hex") === RETIRED_KEY_HASH) throw unavailable();
  return { key, url };
}
/** Timeout, bounded JSON response, no redirects, sanitized errors, no financial fallbacks. */
export async function pantaRequest(path: string, body?: Record<string, unknown>): Promise<unknown> {
  const { key, url } = pantaCredentials();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10_000);
  try {
    const res = await fetch(`${url}${path}`, {
      method: body ? "POST" : "GET", redirect: "error", cache: "no-store", signal: abort.signal,
      headers: { "X-Api-Key": key, "Content-Type": "application/json", Accept: "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      await res.body?.cancel();
      if (res.status === 429) throw new PantaError("RATE_LIMITED", 429, "Please wait before requesting another prediction quote.");
      if ([400, 404, 409, 410, 422].includes(res.status))
        throw new PantaError("PANTA_REQUEST_REJECTED", 409, "Panta could not complete this request. Refresh the market and try again.");
      throw unavailable();
    }
    if (!res.headers.get("content-type")?.includes("application/json") || !res.body) throw unavailable();
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 256_000) { await reader.cancel(); throw unavailable(); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof PantaError) throw error;
    throw unavailable();
  } finally { clearTimeout(timer); }
}
