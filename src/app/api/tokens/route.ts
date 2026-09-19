import { NextResponse } from "next/server";
import { getLiveTokens } from "@/services/tokens/liveTokens";

export const dynamic = "force-dynamic";

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
    console.error("[Tokens API] Error:", err);
    return NextResponse.json(
      { error: "Live Solana market data is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
