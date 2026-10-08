import { NextResponse } from "next/server";
import { solanaTokenService } from "@/server/tokenData";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const prices = Object.fromEntries((await solanaTokenService.getTokens()).map((token) => [
          token.mint,
          { priceUsd: token.priceUsd, marketCapUsd: token.marketCapUsd },
        ]));

    return NextResponse.json({
      success: true,
      prices,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
