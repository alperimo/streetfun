import { NextResponse } from "next/server";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import BN from "bn.js";
import idl from "@/idl/streetfun.json";
import { PROGRAM_ID, USDC_MINT } from "@/sdk/constants";
import { getCurvePda, getGlobalConfigPda, getQuoteVaultPda, getTokenVaultPda, getTreasuryVaultPda } from "@/sdk/pda";
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

export async function executeGraduation(mint: string) {
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
  const [treasuryVaultPda] = getTreasuryVaultPda(curvePda, PROGRAM_ID);

  const curveData = await (program.account as any).curveAccount.fetch(curvePda);
  if (curveData.isGraduated) {
    const updatedToken = await solanaTokenService.getToken(mint);
    return { success: true, message: "Curve is already graduated", updatedToken };
  }

  const targetEquityMint = curveData.targetEquityMint as PublicKey;
  const adminEquityAta = await getOrCreateAssociatedTokenAccount(connection, admin, targetEquityMint, admin.publicKey);
  const equityPurchaseAta = await getOrCreateAssociatedTokenAccount(connection, admin, USDC_MINT, admin.publicKey);
  const ammQuoteDest = await getOrCreateAssociatedTokenAccount(connection, admin, USDC_MINT, Keypair.generate().publicKey);
  const ammTokenDest = await getOrCreateAssociatedTokenAccount(connection, admin, memeMint, Keypair.generate().publicKey);

  // Deposit 100 shares into treasury vault
  const sharesToLock = new BN(100 * 1_000_000);

  const tx = await (program.methods as any)
    .graduateAndExecuteStock({
      minEquityTokensExpected: sharesToLock,
    })
    .accounts({
      caller: admin.publicKey,
      globalConfig: globalConfigPda,
      memeMint,
      targetEquityMint,
      curve: curvePda,
      tokenVault: tokenVaultPda,
      quoteVault: quoteVaultPda,
      treasuryVault: treasuryVaultPda,
      equityPurchaseAccount: equityPurchaseAta.address,
      equitySourceAccount: adminEquityAta.address,
      equitySourceAuthority: admin.publicKey,
      ammQuoteDestination: ammQuoteDest.address,
      ammTokenDestination: ammTokenDest.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([admin])
    .rpc();

  console.log(`[API /api/graduate] Graduation confirmed! Tx: ${tx}`);
  const updatedToken = await solanaTokenService.getToken(mint);

  return {
    success: true,
    txSignature: tx,
    message: "Curve graduated! Target equity shares locked into on-chain treasury vault.",
    updatedToken,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { mint } = body;
    if (!mint) return NextResponse.json({ error: "Missing mint" }, { status: 400 });

    const result = await executeGraduation(mint);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[API /api/graduate] Error:", err);
    return NextResponse.json({ error: err.message || "Graduation failed" }, { status: 500 });
  }
}
