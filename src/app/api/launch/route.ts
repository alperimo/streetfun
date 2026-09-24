import { NextResponse } from "next/server";
import { getTesseraAvailability, getTesseraCatalog } from "@/server/tessera";
import { getServerConnection } from "@/server/rpc";

export async function POST(request: Request) {
  try {
    const { targetEquitySymbol } = await request.json();
    if (typeof targetEquitySymbol !== "string") {
      return NextResponse.json({ error: "Select a Tessera asset." }, { status: 400 });
    }
    const assets = await getTesseraCatalog();
    const selected = assets.find(asset => asset.symbol === targetEquitySymbol || asset.ticker === targetEquitySymbol);
    if (!selected) return NextResponse.json({ error: "Unknown Tessera asset." }, { status: 422 });
    const [asset] = await getTesseraAvailability(getServerConnection(), [selected]);
    // A mint existing somewhere is insufficient: the deployed contract must support
    // its token program and atomically settle the promised graduation allocation.
    return NextResponse.json({ error: asset.unavailableReason, code: "TESSERA_LAUNCH_UNAVAILABLE", mint: asset.mintAddress }, { status: 503 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof SyntaxError ? "Invalid request body." : "Verified Tessera launch is unavailable." }, { status: error instanceof SyntaxError ? 400 : 503 });
  }
}
