import { NextResponse } from "next/server";
import { getLiveTokens } from "@/services/tokens/liveTokens";

export const dynamic = "force-dynamic";

function isConnectionFailure(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return [message, cause instanceof Error ? cause.message : String(cause || "")]
    .join(" ")
    .toLowerCase()
    .includes("econnrefused");
}

export async function GET() {
  try {
    const tokens = await getLiveTokens();
    return NextResponse.json(
      {
        success: true,
        tokens,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err: any) {
    const unavailable = isConnectionFailure(err);
    console.error("[Tokens API] Error:", unavailable ? "RPC endpoint is unavailable" : err);
    return NextResponse.json(
      {
        error: unavailable
          ? "The configured Solana RPC endpoint is unavailable. Start the validator or update SOLANA_RPC."
          : "Live Solana market data is unavailable.",
        code: unavailable ? "RPC_UNAVAILABLE" : "TOKENS_UNAVAILABLE",
        retryable: true,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
