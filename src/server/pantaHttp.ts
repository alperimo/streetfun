import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createServerSupabaseClient } from "./supabase";
import { invalid, object, PantaError, unavailable } from "./pantaValidation";

export function pantaJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store", ...(status === 429 ? { "Retry-After": "60" } : {}) } });
}
export function pantaFailure(error: unknown) {
  const err = error instanceof PantaError ? error : unavailable();
  // Do not echo provider errors, request bodies, credentials or RPC URLs.
  return pantaJson({ error: err.message, code: err.code }, err.status);
}
/** Shared database budget also caps callers rotating/spoofing wallets or client IPs. */
export async function pantaLimit() {
  const db = createServerSupabaseClient();
  if (!db) throw unavailable();
  const key = createHash("sha256").update("streetfun:panta:public-api:v1").digest("hex");
  const { data, error } = await db.rpc("consume_panta_request_budget", { p_bucket: key });
  if (error || typeof data !== "boolean") throw unavailable();
  if (!data) throw new PantaError("RATE_LIMITED", 429, "Prediction requests are busy. Please try again shortly.");
}
export async function pantaBody(req: NextRequest, fields: string[]): Promise<Record<string, unknown>> {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) throw new PantaError("INVALID_ORIGIN", 403, "This request must come from StreetFun.");
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) invalid();
  const declared = Number(req.headers.get("content-length"));
  if (declared > 8192) throw new PantaError("REQUEST_TOO_LARGE", 413, "Request is too large.");
  if (!req.body) invalid();
  const reader = req.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  const timer = setTimeout(() => { void reader.cancel(); }, 5000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); throw new PantaError("REQUEST_TOO_LARGE", 413, "Request is too large."); }
      chunks.push(value);
    }
    let body: Record<string, unknown>;
    try { body = object(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { invalid(); }
    if (Object.keys(body).some(key => !fields.includes(key))) invalid();
    return body;
  } finally { clearTimeout(timer); }
}
export function pantaQuery(req: NextRequest, allowed: string[]) {
  if (req.url.length > 512) invalid();
  const params = req.nextUrl.searchParams;
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length !== 1) invalid();
  return params;
}
