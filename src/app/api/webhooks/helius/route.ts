import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getServerConnection, assertConfiguredCluster } from "@/server/rpc";
import { indexConfirmedTransaction } from "@/server/indexTransaction";
import { InvalidCurveTradeError } from "@/services/indexer/parseCurveTrade";

export const maxDuration = 60;
export async function POST(req: NextRequest) {
  const secret = process.env.HELIUS_WEBHOOK_SECRET;
  const supplied = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (!secret || Buffer.byteLength(supplied) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))) {
    return NextResponse.json({ error: "Unauthorized webhook caller" }, { status: 401 });
  }
  let payload;
  try { payload = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!Array.isArray(payload) || payload.length > 100) return NextResponse.json({ error: "Expected up to 100 transactions" }, { status: 400 });
  const connection = getServerConnection();
  let processedCount = 0, skippedCount = 0, retryCount = 0;
  if (payload.length) {
    try { await assertConfiguredCluster(connection); }
    catch { return NextResponse.json({ error: "RPC cluster unavailable" }, { status: 503 }); }
  }
  // Helius raw and enhanced payloads have different signature locations.
  for (let offset = 0; offset < payload.length; offset += 4) {
    await Promise.all(payload.slice(offset, offset + 4).map(async event => {
      const signature = event?.signature ?? event?.transaction?.signatures?.[0];
      try {
        await indexConfirmedTransaction(connection, signature, event?.slot);
        processedCount++;
      } catch (error) {
        if (error instanceof InvalidCurveTradeError) skippedCount++;
        else { retryCount++; console.warn("[Helius] Delivery needs retry:", error instanceof Error ? error.name : "Index error"); }
      }
    }));
  }
  return NextResponse.json({ success: retryCount === 0, processedCount, skippedCount, retryCount }, { status: retryCount ? 503 : 200 });
}
