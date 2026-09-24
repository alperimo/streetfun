import { NextResponse } from "next/server";
import { getTesseraAvailability, getTesseraCatalog } from "@/server/tessera";
import { getPreStocksAvailability, getPreStocksCatalog } from "@/server/prestocks";
import { getServerConnection } from "@/server/rpc";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const provider = searchParams.get("provider") || "all";
    const connection = getServerConnection();

    let assets: any[] = [];

    if (provider === "prestocks") {
      const prestocksRaw = await getPreStocksCatalog();
      assets = await getPreStocksAvailability(connection, prestocksRaw);
    } else if (provider === "tessera") {
      const tesseraRaw = await getTesseraCatalog();
      assets = await getTesseraAvailability(connection, tesseraRaw);
    } else {
      // Return both
      const [prestocksRaw, tesseraRaw] = await Promise.all([
        getPreStocksCatalog().catch(() => []),
        getTesseraCatalog().catch(() => []),
      ]);
      const [prestocksAvailable, tesseraAvailable] = await Promise.all([
        getPreStocksAvailability(connection, prestocksRaw).catch(() => []),
        getTesseraAvailability(connection, tesseraRaw).catch(() => []),
      ]);
      assets = [...prestocksAvailable, ...tesseraAvailable];
    }

    return NextResponse.json(
      { assets, provider },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Verified Pre-IPO collateral assets are unavailable." },
      { status: 503 }
    );
  }
}
