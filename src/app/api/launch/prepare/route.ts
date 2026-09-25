import * as anchor from "@coral-xyz/anchor";
import { DynamicBondingCurveClient, deriveDbcPoolAddress, deriveDbcTokenVaultAddress } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { hasTransferHookExtension } from "@meteora-ag/cp-amm-sdk";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import idl from "@/idl/streetfun.json";
import { METEORA_DBC_PROGRAM_ID, PROGRAM_ID, USDC_MINT } from "@/sdk/constants";
import { getDbcLaunchPda, getGlobalConfigPda } from "@/sdk/pda";
import { getPreStocksAvailability, getPreStocksCatalog } from "@/server/prestocks";
import { assertStreetFunDbcConfig, getDbcClient, getDbcConfigAddress } from "@/server/meteoraDbc";
import { getServerConnection, assertConfiguredCluster } from "@/server/rpc";
import { getTesseraAvailability, getTesseraCatalog } from "@/server/tessera";

export const dynamic = "force-dynamic";

function key(value: unknown, field: string): PublicKey {
  if (typeof value !== "string") throw new Error(`Missing ${field}.`);
  try { return new PublicKey(value); }
  catch { throw new Error(`Invalid ${field}.`); }
}

function metadataBaseUrl(request: NextRequest): URL {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  const origin = configured || request.headers.get("origin") || new URL(request.url).origin;
  const url = new URL(origin);
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    throw new Error("Token metadata needs a public HTTPS app URL.");
  }
  return url;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const caller = key(body?.caller, "caller");
    const memeMint = key(body?.mint, "mint");
    const targetEquitySymbol = typeof body?.targetEquitySymbol === "string" ? body.targetEquitySymbol : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const symbol = typeof body?.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
    const avatarUrl = typeof body?.avatarUrl === "string" ? body.avatarUrl.trim() : "";
    if (!name || name.length > 32 || !symbol || symbol.length > 10) {
      return NextResponse.json({ error: "Token name and symbol exceed the Meteora metadata limits." }, { status: 400 });
    }
    if (avatarUrl && !/^https:\/\//i.test(avatarUrl)) {
      return NextResponse.json({ error: "The token image URL must use HTTPS." }, { status: 400 });
    }

    const connection = getServerConnection();
    await assertConfiguredCluster(connection);
    const [tesseraRaw, preStocksRaw] = await Promise.all([
      getTesseraCatalog().catch(() => []),
      getPreStocksCatalog().catch(() => []),
    ]);
    const [tesseraAssets, preStocksAssets] = await Promise.all([
      getTesseraAvailability(connection, tesseraRaw),
      getPreStocksAvailability(connection, preStocksRaw),
    ]);
    const asset = [...tesseraAssets, ...preStocksAssets].find(item => item.symbol === targetEquitySymbol);
    if (!asset?.launchEnabled) {
      return NextResponse.json({ error: "This backing asset has no live, verified settlement route on the configured cluster." }, { status: 409 });
    }
    const equityMint = new PublicKey(asset.mintAddress);
    const equityTokenProgram = new PublicKey(asset.tokenProgram!);
    if ((await hasTransferHookExtension(connection, equityMint)).hasTransferHook) {
      return NextResponse.json({ error: "This collateral mint has a transfer hook that the DAMM v2 settlement route cannot safely execute." }, { status: 409 });
    }

    const configAddress = getDbcConfigAddress();
    const dbcClient = getDbcClient(connection);
    await assertStreetFunDbcConfig(dbcClient, configAddress);
    const pool = deriveDbcPoolAddress(USDC_MINT, memeMint, configAddress);
    const quoteVault = deriveDbcTokenVaultAddress(pool, USDC_MINT);
    const [globalConfig] = getGlobalConfigPda(PROGRAM_ID);
    const [dbcLaunch] = getDbcLaunchPda(memeMint, PROGRAM_ID);
    const appUrl = metadataBaseUrl(request);
    const uri = new URL(`/api/metadata/${memeMint.toBase58()}`, appUrl).toString();
    if (uri.length > 200) return NextResponse.json({ error: "The configured app URL exceeds Meteora's on-chain metadata URI limit." }, { status: 400 });

    const dbcPoolTransaction = await dbcClient.creator.createPool({
      name,
      symbol,
      uri,
      payer: caller,
      poolCreator: caller,
      config: configAddress,
      baseMint: memeMint,
    });
    const readOnlyWallet: any = {
      publicKey: caller,
      signTransaction: async () => { throw new Error("A wallet signature is required."); },
      signAllTransactions: async () => { throw new Error("A wallet signature is required."); },
    };
    const program = new anchor.Program(
      { ...idl, address: PROGRAM_ID.toBase58() } as any,
      new anchor.AnchorProvider(connection, readOnlyWallet, { commitment: "confirmed" }),
    );
    const registerInstruction = await (program.methods as any).registerDbcLaunch().accounts({
      creator: caller,
      globalConfig,
      memeMint,
      targetEquityMint: equityMint,
      quoteMint: USDC_MINT,
      dbcConfig: configAddress,
      dbcPool: pool,
      dbcQuoteVault: quoteVault,
      dbcLaunch,
      treasuryVault: getAssociatedTokenAddressSync(equityMint, dbcLaunch, true, equityTokenProgram),
      partnerQuoteAccount: getAssociatedTokenAddressSync(USDC_MINT, globalConfig, true, TOKEN_PROGRAM_ID),
      tokenProgram: TOKEN_PROGRAM_ID,
      equityTokenProgram,
    }).instruction();

    const latest = await connection.getLatestBlockhash("confirmed");
    const transaction = new Transaction().add(...dbcPoolTransaction.instructions, registerInstruction);
    transaction.feePayer = caller;
    transaction.recentBlockhash = latest.blockhash;
    const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
    if (serialized.length > 1232) {
      return NextResponse.json({ error: "This launch requires more than one transaction on this cluster; atomic DBC registration is unavailable." }, { status: 413 });
    }
    if (!transaction.signatures.some(signature => signature.publicKey.equals(memeMint))) {
      throw new Error("Meteora's pool initializer did not include the new mint signer.");
    }
    if (!transaction.instructions.some(ix => ix.programId.equals(METEORA_DBC_PROGRAM_ID))) {
      throw new Error("The prepared transaction does not initialize a Meteora DBC pool.");
    }

    return NextResponse.json({
      success: true,
      transaction: serialized.toString("base64"),
      lastValidBlockHeight: latest.lastValidBlockHeight,
      pool: pool.toBase58(),
      config: configAddress.toBase58(),
      targetEquityMint: equityMint.toBase58(),
      metadataUri: uri,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[DBC launch prepare]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Meteora DBC launch preparation failed." }, { status: 503 });
  }
}
