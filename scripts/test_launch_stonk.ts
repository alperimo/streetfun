import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new PublicKey("6ZiovCkRxRJgUaCS9uftFk3eVnGDsbnDXgUV1XHybH52");
const GLOBAL_CONFIG_SEED = Buffer.from("global-config");
const CURVE_SEED = Buffer.from("curve");
const TOKEN_VAULT_SEED = Buffer.from("token-vault");
const QUOTE_VAULT_SEED = Buffer.from("quote-vault");
const TREASURY_VAULT_SEED = Buffer.from("treasury-vault");

async function main() {
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
  console.log(`[Test Launch] Connecting to ${rpcUrl}...`);
  const connection = new Connection(rpcUrl, "confirmed");

  const keypairPath = path.resolve(process.env.HOME || "", ".config/solana/id.json");
  const keypairRaw = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(keypairRaw));
  console.log(`[Test Launch] Admin: ${admin.publicKey.toBase58()}`);

  const mintsCache = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), ".devnet-mints.json"), "utf-8"));
  const usdcMint = new PublicKey(mintsCache.USDC);
  const topaiMint = new PublicKey(mintsCache.TOPAI); // OpenAI Pre-IPO

  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const idlPath = path.resolve(process.cwd(), "src/idl/streetfun.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const program = new anchor.Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, provider);

  const [globalConfigPda] = PublicKey.findProgramAddressSync([GLOBAL_CONFIG_SEED], PROGRAM_ID);

  // Generate new meme token mint
  const memeMint = Keypair.generate();
  console.log(`[Test Launch] New Meme Mint: ${memeMint.publicKey.toBase58()}`);

  const [curvePda] = PublicKey.findProgramAddressSync(
    [CURVE_SEED, memeMint.publicKey.toBuffer()],
    PROGRAM_ID
  );
  const [tokenVaultPda] = PublicKey.findProgramAddressSync(
    [TOKEN_VAULT_SEED, curvePda.toBuffer()],
    PROGRAM_ID
  );
  const [quoteVaultPda] = PublicKey.findProgramAddressSync(
    [QUOTE_VAULT_SEED, curvePda.toBuffer()],
    PROGRAM_ID
  );
  const [treasuryVaultPda] = PublicKey.findProgramAddressSync(
    [TREASURY_VAULT_SEED, curvePda.toBuffer()],
    PROGRAM_ID
  );

  console.log(`[Test Launch] Curve PDA: ${curvePda.toBase58()}`);
  console.log(`[Test Launch] Token Vault PDA: ${tokenVaultPda.toBase58()}`);
  console.log(`[Test Launch] Quote Vault PDA: ${quoteVaultPda.toBase58()}`);
  console.log(`[Test Launch] Treasury Vault PDA: ${treasuryVaultPda.toBase58()}`);

  console.log(`[Test Launch] Launching OpenAI Meme Token ($TOPAI)...`);
  const tx = await (program.methods as any)
    .launchStonk({
      name: "OpenAI Autonomous Intelligence",
      symbol: "TOPAI",
      uri: "https://street.fun/api/metadata/topai",
      meteoraDbcPool: null,
    })
    .accounts({
      creator: admin.publicKey,
      globalConfig: globalConfigPda,
      memeMint: memeMint.publicKey,
      targetEquityMint: topaiMint,
      curve: curvePda,
      tokenVault: tokenVaultPda,
      quoteMint: usdcMint,
      quoteVault: quoteVaultPda,
      treasuryVault: treasuryVaultPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([admin, memeMint])
    .rpc();

  console.log(`[Test Launch] SUCCESS! Tx Signature: ${tx}`);
  console.log(`[Test Launch] Explorer: https://solscan.io/tx/${tx}?cluster=devnet`);

  // Verify curve account
  const curveData = await (program.account as any).curveAccount.fetch(curvePda);
  console.log(`[Test Launch] On-Chain Curve Data:`, {
    creator: curveData.creator.toBase58(),
    memeMint: curveData.memeMint.toBase58(),
    targetEquityMint: curveData.targetEquityMint.toBase58(),
    virtualQuoteReserves: curveData.virtualQuoteReserves.toString(),
    virtualTokenReserves: curveData.virtualTokenReserves.toString(),
    realQuoteReserves: curveData.realQuoteReserves.toString(),
    isGraduated: curveData.isGraduated,
  });
}

main().catch((err) => {
  console.error("[Test Launch] Error:", err);
  process.exit(1);
});
