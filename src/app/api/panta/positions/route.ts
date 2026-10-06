import { NextRequest, NextResponse } from "next/server";
import { PantaClient } from "@/server/pantaService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get("wallet");
    const marketId = searchParams.get("marketId");

    if (!wallet) {
      return NextResponse.json(
        { error: "Wallet address is required" },
        { status: 400 }
      );
    }

    const positions = await PantaClient.getPositions(wallet);

    // If specific marketId filtered
    const filtered = marketId
      ? positions.filter((p) => p.marketId === marketId)
      : positions;

    return NextResponse.json({
      wallet,
      positions: filtered,
    });
  } catch (err: any) {
    console.error("[api/panta/positions] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to retrieve positions" },
      { status: 500 }
    );
  }
}
