import { NextRequest, NextResponse } from "next/server";
import { PantaClient } from "@/server/pantaService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { wallet, marketId } = body;

    if (!wallet || !marketId) {
      return NextResponse.json(
        { error: "Wallet and marketId are required" },
        { status: 400 }
      );
    }

    try {
      const claimBuild = await PantaClient.buildClaimWin({ wallet, marketId });
      return NextResponse.json(claimBuild);
    } catch (apiErr: any) {
      return NextResponse.json(
        { error: apiErr.message || "Claim is currently not available for this market" },
        { status: 400 }
      );
    }
  } catch (err: any) {
    console.error("[api/panta/claim/build] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
