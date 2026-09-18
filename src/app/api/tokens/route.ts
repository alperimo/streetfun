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
          "Cache-Control": "public, s-maxage=2, stale-while-revalidate=5",
        },
      }
    );
  } catch (err: any) {
    console.error("[Tokens API] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

