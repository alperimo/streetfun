import { NextResponse } from "next/server";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import bs58 from "bs58";
import idl from "@/idl/streetfun.json";
import { PROGRAM_ID, USDC_MINT } from "@/sdk/constants";
import {
  getCurvePda,
  getGlobalConfigPda,
  getQuoteVaultPda,
  getTokenVaultPda,
  getTreasuryVaultPda,
} from "@/sdk/pda";
import { getTesseraAvailability, getTesseraCatalog } from "@/server/tessera";
import { getPreStocksAvailability, getPreStocksCatalog } from "@/server/prestocks";
import { getServerConnection } from "@/server/rpc";
import { createServerSupabaseClient } from "@/server/supabase";
import type { TokenMetadata } from "@/lib/types";

export const dynamic = "force-dynamic";

function getAdminKeypair(): Keypair {
  const envKey = process.env.ADMIN_PRIVATE_KEY || process.env.SOLANA_PRIVATE_KEY;
  if (envKey) {
    try {
      if (envKey.startsWith("[")) {
        return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(envKey)));
      }
      return Keypair.fromSecretKey(bs58.decode(envKey));
    } catch {}
  }
  const keypairPath = path.resolve(process.env.HOME || "", ".config/solana/id.json");
  if (fs.existsSync(keypairPath)) {
    const raw = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  throw new Error("Admin Solana keypair not found at ~/.config/solana/id.json or in ADMIN_PRIVATE_KEY");
}

function createNodeWallet(admin: Keypair) {
  return {
    publicKey: admin.publicKey,
    payer: admin,
    signTransaction: async (tx: any) => {
      tx.partialSign(admin);
      return tx;
    },
    signAllTransactions: async (txs: any[]) => {
      return txs.map((tx) => {
        tx.partialSign(admin);
        return tx;
      });
    },
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, symbol, description, avatarUrl, targetEquitySymbol, creatorPublicKey } = body;

    if (!name || !symbol || !targetEquitySymbol) {
      return NextResponse.json(
        { error: "Missing required fields (name, symbol, targetEquitySymbol)" },
        { status: 400 }
      );
    }

    const connection = getServerConnection();
    const [prestocksCatalog, tesseraCatalog] = await Promise.all([
      getPreStocksCatalog().catch(() => []),
      getTesseraCatalog().catch(() => []),
    ]);

    const targetUpper = targetEquitySymbol.toUpperCase().replace(/^\$/, "");
    const selectedPreStocks = prestocksCatalog.find(
      (a) => a.symbol.toUpperCase() === targetUpper || a.ticker.toUpperCase() === targetUpper
    );
    const selectedTessera = tesseraCatalog.find(
      (a) => a.symbol === targetEquitySymbol || a.ticker === targetEquitySymbol || a.symbol.toUpperCase().includes(targetUpper)
    );

    const selected = selectedPreStocks || selectedTessera;
    if (!selected) {
      return NextResponse.json({ error: "Unknown Pre-IPO collateral asset." }, { status: 422 });
    }

    const availableAsset = selectedPreStocks
      ? (await getPreStocksAvailability(connection, [selectedPreStocks]))[0]
      : (await getTesseraAvailability(connection, [selectedTessera!]))[0];

    if (!availableAsset.launchEnabled) {
      return NextResponse.json(
        {
          error: availableAsset.unavailableReason || "Asset unavailable for launch on current cluster.",
          code: "COLLATERAL_LAUNCH_UNAVAILABLE",
          mint: availableAsset.mintAddress,
        },
        { status: 503 }
      );
    }

    const admin = getAdminKeypair();
    const wallet = createNodeWallet(admin);
    const provider = new anchor.AnchorProvider(connection, wallet as any, {
      commitment: "confirmed",
    });
    const program = new anchor.Program(
      { ...idl, address: PROGRAM_ID.toBase58() } as any,
      provider
    );

    const memeMint = Keypair.generate();
    const [globalConfigPda] = getGlobalConfigPda(PROGRAM_ID);
    const [curvePda] = getCurvePda(memeMint.publicKey, PROGRAM_ID);
    const [tokenVaultPda] = getTokenVaultPda(curvePda, PROGRAM_ID);
    const [quoteVaultPda] = getQuoteVaultPda(curvePda, PROGRAM_ID);
    const [treasuryVaultPda] = getTreasuryVaultPda(curvePda, PROGRAM_ID);

    const creator = creatorPublicKey ? new PublicKey(creatorPublicKey) : admin.publicKey;
    const targetEquityMint = new PublicKey(availableAsset.mintAddress);

    console.log(
      `[API /api/launch] Launching ${name} ($${symbol.toUpperCase()}) backed by ${availableAsset.name} (${availableAsset.mintAddress})...`
    );

    const tx = await (program.methods as any)
      .launchStonk({
        name,
        symbol: symbol.toUpperCase(),
        uri: avatarUrl || "https://streetfun.xyz/metadata/default.json",
        meteoraDbcPool: null,
      })
      .accounts({
        creator,
        globalConfig: globalConfigPda,
        memeMint: memeMint.publicKey,
        targetEquityMint,
        curve: curvePda,
        tokenVault: tokenVaultPda,
        quoteMint: USDC_MINT,
        quoteVault: quoteVaultPda,
        treasuryVault: treasuryVaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([admin, memeMint])
      .rpc();

    console.log(`[API /api/launch] On-chain launch confirmed! Tx: ${tx}`);

    // Index metadata into Supabase
    try {
      const supabase = createServerSupabaseClient();
      if (supabase) {
        await supabase.from("tokens").upsert({
          mint: memeMint.publicKey.toBase58(),
          name,
          symbol: symbol.toUpperCase(),
          target_equity_symbol: availableAsset.symbol,
          target_equity_mint: availableAsset.mintAddress,
          creator: creator.toBase58(),
          description: description || null,
          avatar_url: avatarUrl || null,
          created_at: new Date().toISOString(),
          is_graduated: false,
        });
      }
    } catch (err: any) {
      console.warn("[API /api/launch] Supabase indexing note:", err.message);
    }

    const config = await (program.account as any).globalConfig.fetch(globalConfigPda);
    const graduationThresholdUsd =
      Number(config.graduationThreshold.toString()) / 1_000_000;

    const token: TokenMetadata = {
      mint: memeMint.publicKey.toBase58(),
      name,
      symbol: symbol.toUpperCase(),
      description: description || `Decentralized culture coin backed by ${availableAsset.name}.`,
      avatarUrl: avatarUrl || "/generated/streetfun-logo.png",
      creator: creator.toBase58(),
      createdAt: "Just now",
      marketCapUsd: 0,
      priceUsd: 0.00003,
      priceChange24h: 0,
      volume24hUsd: 0,
      targetEquity: {
        symbol: availableAsset.symbol,
        name: availableAsset.name,
        mintAddress: availableAsset.mintAddress,
        issuer: availableAsset.issuer,
        custodian: availableAsset.custodian,
        legalFramework: availableAsset.legalFramework,
        proofOfReserve: availableAsset.proofOfReserve,
        logoUrl: availableAsset.logoUrl,
        stockPriceUsd: availableAsset.currentStockPriceUsd,
        isPreIpo: availableAsset.isPreIpo,
      },
      bondingCurve: {
        realQuoteReservesUsd: 0,
        graduationThresholdUsd,
        progressPct: 0,
        virtualQuoteReserves: config.initialVirtualQuoteReserves.toString(),
        virtualTokenReserves: config.initialVirtualTokenReserves.toString(),
        realTokenReserves: "800000000000000",
        quoteMint: USDC_MINT.toBase58(),
        isGraduated: false,
        dynamicFeeBps: Number(config.protocolFeeBps),
        equityPurchaseBudgetUsd: graduationThresholdUsd / 2,
        ammLiquidityBudgetUsd: graduationThresholdUsd / 2,
      },
      treasury: {
        totalEquityLocked: 0,
        totalEquityValueUsd: 0,
        vaultPda: treasuryVaultPda.toBase58(),
        proofOfReserveVerified: false,
      },
      dataSource: "onchain",
      lastUpdatedAt: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, txSignature: tx, token });
  } catch (err: any) {
    console.error("[API /api/launch] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to launch token" },
      { status: 500 }
    );
  }
}
