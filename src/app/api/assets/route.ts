import { NextResponse } from "next/server";
import { getTesseraAvailability, getTesseraCatalog } from "@/server/tessera";
import { getServerConnection } from "@/server/rpc";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const assets = await getTesseraAvailability(getServerConnection(), await getTesseraCatalog());
    return NextResponse.json({ assets }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Verified Tessera assets are unavailable." }, { status: 503 });
  }
}
