import { NextResponse } from "next/server";

/** Never load or spend a server wallet from a public HTTP endpoint. */
export async function POST() {
  return NextResponse.json({ error: "Trades require a transaction signed by the connected wallet.", code: "WALLET_SIGNATURE_REQUIRED" }, { status: 410 });
}
