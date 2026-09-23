import { NextResponse } from "next/server";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import BN from "bn.js";
import idl from "@/idl/streetfun.json";
import { PROGRAM_ID } from "@/sdk/constants";
import { getCurvePda, getTreasuryVaultPda } from "@/sdk/pda";
import { solanaTokenService } from "@/services/solana/solanaTokenService";

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
    const { mint, memeAmount } = body;
    if (!mint || !memeAmount || memeAmount <= 0) {
      return NextResponse.json({ error: "Invalid redeem parameters" }, { status: 400 });
    }

    const rpcUrl = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const admin = getAdminKeypair();

    const wallet = createNodeWallet(admin);
    const provider = new anchor.AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    const program = new anchor.Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, provider);

    const memeMint = new PublicKey(mint);
    const [curvePda] = getCurvePda(memeMint, PROGRAM_ID);
    const [treasuryVaultPda] = getTreasuryVaultPda(curvePda, PROGRAM_ID);

    const curveData = await (program.account as any).curveAccount.fetch(curvePda);
    if (!curveData.isGraduated) {
      return NextResponse.json({ error: "Bonding curve has not graduated yet." }, { status: 400 });
    }

    const targetEquityMint = curveData.targetEquityMint as PublicKey;
    const redeemerMemeAta = await getOrCreateAssociatedTokenAccount(connection, admin, memeMint, admin.publicKey);
    const redeemerEquityAta = await getOrCreateAssociatedTokenAccount(connection, admin, targetEquityMint, admin.publicKey);

    const tokensToBurn = new BN(Math.round(memeAmount * 1_000_000));

    const tx = await (program.methods as any)
      .burnAndRedeem({
        memeTokensToBurn: tokensToBurn,
        minEquityTokensOut: new BN(1),
      })
      .accounts({
        redeemer: admin.publicKey,
        memeMint,
        targetEquityMint,
        curve: curvePda,
        treasuryVault: treasuryVaultPda,
        redeemerTokenAccount: redeemerMemeAta.address,
        redeemerEquityAccount: redeemerEquityAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([admin])
      .rpc();

    console.log(`[API /api/redeem] Redeem confirmed! Tx: ${tx}`);
    const updatedToken = await solanaTokenService.getToken(mint);

    return NextResponse.json({
      success: true,
      txSignature: tx,
      message: "Tokens burned and collateral shares redeemed on Solana Devnet!",
      updatedToken,
    });
  } catch (err: any) {
    console.error("[API /api/redeem] Error:", err);
    return NextResponse.json({ error: err.message || "Redeem failed" }, { status: 500 });
  }
}
