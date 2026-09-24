import { NextResponse } from "next/server";

/** Never load or spend a server wallet from a public HTTP endpoint. */
export async function POST() {
  return NextResponse.json({ error: "Graduation is unavailable: atomic Tessera acquisition and verified Meteora DLMM settlement are not implemented.", code: "SETTLEMENT_UNAVAILABLE" }, { status: 503 });
}
