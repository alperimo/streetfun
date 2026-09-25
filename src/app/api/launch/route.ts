import { NextResponse } from "next/server";

/** Launch transactions must be signed by the wallet that pays for the mint. */
export async function POST() {
  return NextResponse.json(
    { error: "Use the connected wallet to sign a launch transaction.", code: "WALLET_SIGNATURE_REQUIRED" },
    { status: 410 }
  );
}
