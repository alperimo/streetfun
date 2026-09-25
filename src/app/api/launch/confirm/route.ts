import { NextRequest, NextResponse } from "next/server";
import { decodeStreetfunInstructions, indexConfirmedTransaction, readConfirmedTransaction } from "@/server/indexTransaction";
import { getServerConnection } from "@/server/rpc";
import { solanaTokenService } from "@/server/tokenData";
import { InvalidCurveTradeError } from "@/services/indexer/parseCurveTrade";

export async function POST(req: NextRequest) {
  try {
    const { signature, mint } = await req.json();
    const connection = getServerConnection();
    const tx = await readConfirmedTransaction(connection, signature);
    const launch = decodeStreetfunInstructions(tx).find(entry =>
      entry.name.replace(/_/g, "").toLowerCase() === "launchstonk" &&
      entry.instruction.accounts[2]?.toBase58() === mint
    );
    if (!launch) throw new InvalidCurveTradeError("No confirmed launch for this mint.");
    await indexConfirmedTransaction(connection, signature);
    const token = await solanaTokenService.getToken(mint);
    if (!token) throw new Error("Launch confirmed, but the live market snapshot is pending.");
    return NextResponse.json({ success: true, signature, token });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Launch confirmation unavailable." },
      { status: error instanceof InvalidCurveTradeError ? 422 : 503 }
    );
  }
}
