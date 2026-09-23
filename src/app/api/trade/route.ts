import { NextResponse } from "next/server";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import BN from "bn.js";
import idl from "@/idl/streetfun.json";
import { PROGRAM_ID, USDC_MINT } from "@/sdk/constants";
import { getCurvePda, getGlobalConfigPda, getQuoteVaultPda, getTokenVaultPda } from "@/sdk/pda";
import { solanaTokenService } from "@/services/solana/solanaTokenService";
import { executeGraduation } from "../graduate/route";

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
    const { mint, tradeMode, amount } = body;

    if (!mint || !tradeMode || !amount || amount <= 0) {
      return NextResponse.json({ error: "Invalid trade parameters" }, { status: 400 });
    }

    const rpcUrl = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const admin = getAdminKeypair();

    const wallet = createNodeWallet(admin);
    const provider = new anchor.AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    const program = new anchor.Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, provider);

    const memeMint = new PublicKey(mint);
    const [globalConfigPda] = getGlobalConfigPda(PROGRAM_ID);
    const [curvePda] = getCurvePda(memeMint, PROGRAM_ID);
    const [tokenVaultPda] = getTokenVaultPda(curvePda, PROGRAM_ID);
    const [quoteVaultPda] = getQuoteVaultPda(curvePda, PROGRAM_ID);

    const globalConfigData = await (program.account as any).globalConfig.fetch(globalConfigPda);

    const buyerUsdcAta = await getOrCreateAssociatedTokenAccount(connection, admin, USDC_MINT, admin.publicKey);
    const buyerMemeAta = await getOrCreateAssociatedTokenAccount(connection, admin, memeMint, admin.publicKey);
    const protocolFeeAta = await getOrCreateAssociatedTokenAccount(
      connection,
      admin,
      USDC_MINT,
      globalConfigData.protocolFeeRecipient
    );

    let tx = "";
    if (tradeMode === "buy") {
      // Top up admin USDC if needed
      if (Number(buyerUsdcAta.amount) < amount * 1_000_000) {
        await mintTo(connection, admin, USDC_MINT, buyerUsdcAta.address, admin.publicKey, 100_000n * 1_000_000n);
      }

      const quoteAmountIn = new BN(Math.round(amount * 1_000_000));
      tx = await (program.methods as any)
        .buyCurve({
          quoteAmountIn,
          minTokensOut: new BN(1),
        })
        .accounts({
          buyer: admin.publicKey,
          globalConfig: globalConfigPda,
          memeMint,
          curve: curvePda,
          tokenVault: tokenVaultPda,
          quoteVault: quoteVaultPda,
          buyerQuoteAccount: buyerUsdcAta.address,
          buyerTokenAccount: buyerMemeAta.address,
          protocolFeeAccount: protocolFeeAta.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();
    } else {
      const memeAmountIn = new BN(Math.round(amount * 1_000_000));
      tx = await (program.methods as any)
        .sellCurve({
          memeAmountIn,
          minQuoteOut: new BN(1),
        })
        .accounts({
          seller: admin.publicKey,
          globalConfig: globalConfigPda,
          memeMint,
          curve: curvePda,
          tokenVault: tokenVaultPda,
          quoteVault: quoteVaultPda,
          sellerTokenAccount: buyerMemeAta.address,
          sellerQuoteAccount: buyerUsdcAta.address,
          protocolFeeAccount: protocolFeeAta.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();
    }

    console.log(`[API /api/trade] Trade executed! Mode: ${tradeMode}, Amount: ${amount}, Tx: ${tx}`);

    // Fetch updated token
    const updatedToken = await solanaTokenService.getToken(mint);

    // If trade was a buy and pushed reserves to or past threshold, auto-graduate!
    if (
      tradeMode === "buy" &&
      updatedToken?.bondingCurve &&
      !updatedToken.bondingCurve.isGraduated &&
      updatedToken.bondingCurve.realQuoteReservesUsd >= updatedToken.bondingCurve.graduationThresholdUsd
    ) {
      console.log(`[API /api/trade] Threshold reached ($${updatedToken.bondingCurve.realQuoteReservesUsd} >= $${updatedToken.bondingCurve.graduationThresholdUsd}). Auto-graduating ${mint}...`);
      try {
        const gradResult = await executeGraduation(mint);
        if (gradResult.updatedToken) {
          return NextResponse.json({
            success: true,
            txSignature: tx,
            message: `Buy order confirmed & Token Graduated! Pre-IPO shares locked into Treasury Vault.`,
            updatedToken: gradResult.updatedToken,
          });
        }
      } catch (gradErr: any) {
        console.warn("[API /api/trade] Auto-graduation note:", gradErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      txSignature: tx,
      message: `${tradeMode.toUpperCase()} order confirmed on Solana Devnet!`,
      updatedToken,
    });
  } catch (err: any) {
    console.error("[API /api/trade] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to execute trade" }, { status: 500 });
  }
}
