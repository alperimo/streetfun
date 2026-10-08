import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import bs58 from "bs58";
import { readPantaSession } from "@/server/pantaSession";
import { bindingFromSession } from "@/server/pantaMarket";
import { pantaRequest } from "@/server/pantaService";
import { getServerConnection, assertConfiguredCluster } from "@/server/rpc";
import { invalid, object, PantaError, unavailable } from "@/server/pantaValidation";
import { pantaBody, pantaFailure, pantaJson, pantaLimit } from "@/server/pantaHttp";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    const body = await pantaBody(req, ["signature", "orderToken"]);
    if (typeof body.signature !== "string" || body.signature.length > 88) invalid();
    try { if (bs58.decode(body.signature).length !== 64) invalid(); } catch { invalid(); }
    const signature = body.signature;
    const session = readPantaSession(body.orderToken, "order");
    await bindingFromSession(session);
    await pantaLimit();
    const connection = getServerConnection(); await assertConfiguredCluster(connection);
    const tx = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!tx || !tx.meta) {
      const statuses = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
      if (statuses.value[0]?.err) throw new PantaError("TRANSACTION_FAILED", 409, "The prediction transaction failed on-chain.");
      if (!statuses.value[0] && await connection.getBlockHeight("confirmed") > Number(session.lastValidBlockHeight))
        throw new PantaError("TRANSACTION_EXPIRED", 409, "The prediction transaction expired without confirmation. Review a fresh quote.");
      return pantaJson({ status: "pending", signature }, 202);
    }
    if (tx.meta.err) throw new PantaError("TRANSACTION_FAILED", 409, "The prediction transaction failed on-chain.");
    const message = tx.transaction.message;
    if (createHash("sha256").update(message.serialize()).digest("hex") !== session.messageHash ||
        message.staticAccountKeys[0]?.toBase58() !== session.wallet || message.header.numRequiredSignatures !== 1)
      throw new PantaError("TRANSACTION_MISMATCH", 409, "Transaction does not match the prediction order.");
    if (session.action === "buy") {
      const submitted = object(await pantaRequest("/primaryordersubmit/", { orderId: session.orderId, signature, wallet: session.wallet }));
      if (submitted.orderId !== session.orderId || submitted.signature !== signature || !["submitted", "confirmed"].includes(String(submitted.status))) throw unavailable();
    }
    // Panta independently verifies instruction kind, wallet, market and quote amounts; idempotent by signature.
    const report = object(await pantaRequest("/trades/", { signature, wallet: session.wallet, marketId: session.marketId,
      ...(session.action === "buy" ? { quoteId: session.quoteId, clientOrderId: session.orderId } : {}) }));
    if (report.status !== "processed" || report.signature !== signature || report.wallet !== session.wallet ||
        report.marketId !== session.marketId || report.kind !== session.action ||
        (session.action === "buy" && report.side !== session.side)) throw unavailable();
    return pantaJson({ status: "confirmed", signature, kind: session.action });
  } catch (error) { return pantaFailure(error); }
}
