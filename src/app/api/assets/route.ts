import { NextResponse } from "next/server";
import { getNetworkAssetCatalog, type AssetProviderFilter } from "@/server/assetCatalog";
import { getServerConnection } from "@/server/rpc";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const requestedProvider = searchParams.get("provider") || "all";
    if (!["all", "prestocks", "tessera"].includes(requestedProvider)) {
      return NextResponse.json({ error: "Unsupported asset provider." }, { status: 400 });
    }
    const provider = requestedProvider as AssetProviderFilter;
    const connection = getServerConnection();
    const assets = await getNetworkAssetCatalog(connection, provider);

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
