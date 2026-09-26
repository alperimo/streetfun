import { NextRequest, NextResponse } from "next/server";
import { decodeDbcPoolInitialization, decodeStreetfunInstructions, indexConfirmedTransaction, readConfirmedTransaction } from "@/server/indexTransaction";
import { assertConfiguredCluster, getServerConnection } from "@/server/rpc";
import { solanaTokenService } from "@/server/tokenData";
import { InvalidCurveTradeError } from "@/services/indexer/parseCurveTrade";
import { createServerSupabaseClient } from "@/server/supabase";
import { getNetworkAssetCatalog } from "@/server/assetCatalog";

export async function POST(req: NextRequest) {
  try {
    const { signature, mint: requestedMint, targetEquitySymbol, name, symbol, avatarUrl } = await req.json();
    if (typeof requestedMint !== "string") throw new InvalidCurveTradeError("A token mint is required.");
    if (avatarUrl && (typeof avatarUrl !== "string" || !/^https:\/\//i.test(avatarUrl))) throw new InvalidCurveTradeError("The token image URL must use HTTPS.");
    const connection = getServerConnection();
    const genesisHash = await assertConfiguredCluster(connection);
    const tx = await readConfirmedTransaction(connection, signature);
    const launch = decodeStreetfunInstructions(tx).find(entry =>
      entry.name.replace(/_/g, "").toLowerCase() === "registerdbclaunch" &&
      entry.instruction.accounts[2]?.toBase58() === requestedMint
    );
    if (!launch) throw new InvalidCurveTradeError("No confirmed Meteora DBC launch registration for this mint.");
    const mint = new (await import("@solana/web3.js")).PublicKey(requestedMint);
    const initialized = decodeDbcPoolInitialization(tx, mint);
    if (initialized.name !== name || initialized.symbol !== symbol) throw new InvalidCurveTradeError("Launch name or symbol does not match the confirmed DBC metadata.");
    const metadataUri = new URL(initialized.uri);
    if (metadataUri.pathname !== `/api/metadata/${requestedMint}`) throw new InvalidCurveTradeError("The confirmed DBC metadata URI does not resolve to this StreetFun launch.");
    const targetMint = launch.instruction.accounts[3]?.toBase58();
    if (!targetMint) throw new InvalidCurveTradeError("Confirmed DBC launch is missing its collateral mint.");
    const assets = await getNetworkAssetCatalog(connection, "all", genesisHash);
    const asset: any = assets.find((entry: any) => entry.mintAddress === targetMint);
    if (!asset || asset.symbol !== targetEquitySymbol) throw new InvalidCurveTradeError("Selected collateral symbol does not match its mapped live mint.");
    await indexConfirmedTransaction(connection, signature, undefined, requestedMint);
    const db = createServerSupabaseClient();
    if (!db) throw new Error("Live metadata index is not configured.");
    const { data: updated, error } = await db.from("tokens").update({
      name: initialized.name, symbol: initialized.symbol,
      target_equity_symbol: asset.symbol, target_equity_mint: targetMint,
      avatar_url: avatarUrl || null,
      updated_at: new Date().toISOString(),
    }).eq("mint", requestedMint).select("mint").maybeSingle();
    if (error) throw new Error("Confirmed launch metadata could not be saved.");
    if (!updated) throw new Error("Confirmed DBC launch was indexed, but its Supabase metadata row is missing.");
    solanaTokenService.invalidate();
    const token = await solanaTokenService.getToken(requestedMint);
    if (!token) throw new Error("Launch confirmed, but the live market snapshot is pending.");
    return NextResponse.json({ success: true, signature, token });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Launch confirmation unavailable." },
      { status: error instanceof InvalidCurveTradeError ? 422 : 503 }
    );
  }
}
