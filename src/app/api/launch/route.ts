import { NextResponse } from "next/server";
import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import idl from "@/idl/streetfun.json";
import { PROGRAM_ID, USDC_MINT, VERIFIED_TESSERA_PRE_IPO_ASSETS } from "@/sdk/constants";
import { getCurvePda, getGlobalConfigPda, getQuoteVaultPda, getTokenVaultPda, getTreasuryVaultPda } from "@/sdk/pda";
import { createServerSupabaseClient } from "@/lib/supabase";
import { TokenMetadata } from "@/lib/types";

export const dynamic = "force-dynamic";

function getAdminKeypair(): Keypair {
  const keypairPath = path.resolve(process.env.HOME || "", ".config/solana/id.json");
  if (fs.existsSync(keypairPath)) {
    const raw = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  throw new Error("Admin Solana keypair not found at ~/.config/solana/id.json");
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
      return NextResponse.json({ error: "Missing required fields (name, symbol, targetEquitySymbol)" }, { status: 400 });
    }

    const targetEquity = VERIFIED_TESSERA_PRE_IPO_ASSETS.find(
      (a) => a.symbol === targetEquitySymbol || a.ticker === targetEquitySymbol
    ) || VERIFIED_TESSERA_PRE_IPO_ASSETS[1]; // default OpenAI

    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const admin = getAdminKeypair();

    const wallet = createNodeWallet(admin);
    const provider = new anchor.AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    const program = new anchor.Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, provider);

    const memeMint = Keypair.generate();
    const [globalConfigPda] = getGlobalConfigPda(PROGRAM_ID);
    const [curvePda] = getCurvePda(memeMint.publicKey, PROGRAM_ID);
    const [tokenVaultPda] = getTokenVaultPda(curvePda, PROGRAM_ID);
    const [quoteVaultPda] = getQuoteVaultPda(curvePda, PROGRAM_ID);
    const [treasuryVaultPda] = getTreasuryVaultPda(curvePda, PROGRAM_ID);

    const creator = creatorPublicKey ? new PublicKey(creatorPublicKey) : admin.publicKey;
    const targetEquityMint = new PublicKey(targetEquity.mintAddress);

    console.log(`[API /api/launch] Launching ${name} ($${symbol}) backed by ${targetEquity.name}...`);
    const tx = await (program.methods as any)
      .launchStonk({
        name,
        symbol: symbol.toUpperCase(),
        uri: avatarUrl || "https://street.fun/api/metadata/token",
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

    // Index metadata in Supabase if available
    try {
      const supabase = createServerSupabaseClient();
      if (supabase) {
        await supabase.from("tokens").upsert({
          mint: memeMint.publicKey.toBase58(),
          name,
          symbol: symbol.toUpperCase(),
          target_equity_symbol: targetEquity.symbol,
          target_equity_mint: targetEquity.mintAddress,
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
    const graduationThresholdUsd = Number(config.graduationThreshold.toString()) / 1_000_000;

    const token: TokenMetadata = {
      mint: memeMint.publicKey.toBase58(),
      name,
      symbol: symbol.toUpperCase(),
      description: description || "Live Solana Devnet equity-backed token.",
      avatarUrl: avatarUrl || "/generated/streetfun-logo.png",
      creator: creator.toBase58(),
      createdAt: "Just now",
      marketCapUsd: 0,
      priceUsd: 0.00003,
      priceChange24h: 0,
      volume24hUsd: 0,
      targetEquity: {
        symbol: targetEquity.symbol,
        name: targetEquity.name,
        mintAddress: targetEquity.mintAddress,
        issuer: targetEquity.issuer,
        custodian: targetEquity.custodian,
        legalFramework: targetEquity.legalFramework,
        proofOfReserve: targetEquity.proofOfReserve,
        logoUrl: targetEquity.logoUrl,
        stockPriceUsd: targetEquity.currentStockPriceUsd,
        isPreIpo: targetEquity.isPreIpo,
      },
      bondingCurve: {
        realQuoteReservesUsd: 0,
        graduationThresholdUsd,
        progressPct: 0,
        virtualQuoteReserves: config.initialVirtualQuoteReserves.toString(),
        virtualTokenReserves: config.initialVirtualTokenReserves.toString(),
        realTokenReserves: "0",
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
    return NextResponse.json({ error: err.message || "Failed to launch token" }, { status: 500 });
  }
}
