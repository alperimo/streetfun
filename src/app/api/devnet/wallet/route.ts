import { NextResponse } from "next/server";

// Never serialize a Solana private key into an HTTP response, even on localhost.
export async function GET() {
  return NextResponse.json({ error: "Connect a browser wallet configured for Devnet." }, { status: 410 });
}
