import { NextResponse } from "next/server";
import { TradeStoreService } from "@/services/indexer/tradeStore";
import { solanaTokenService } from "@/services/solana/solanaTokenService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const prices = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true"
      ? await TradeStoreService.getInstance().getLatestPrices()
      : Object.fromEntries((await solanaTokenService.getTokens()).map((token) => [
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
