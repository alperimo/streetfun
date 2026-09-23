import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import BN from "bn.js";

const PROGRAM_ID = new PublicKey("6ZiovCkRxRJgUaCS9uftFk3eVnGDsbnDXgUV1XHybH52");
const GLOBAL_CONFIG_SEED = Buffer.from("global-config");
const CURVE_SEED = Buffer.from("curve");
const TOKEN_VAULT_SEED = Buffer.from("token-vault");
const QUOTE_VAULT_SEED = Buffer.from("quote-vault");
const TREASURY_VAULT_SEED = Buffer.from("treasury-vault");

async function main() {
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
  console.log(`[Test Buy & Graduate] Connecting to ${rpcUrl}...`);
  const connection = new Connection(rpcUrl, "confirmed");

  const keypairPath = path.resolve(process.env.HOME || "", ".config/solana/id.json");
  const keypairRaw = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(keypairRaw));

  const mintsCache = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), ".devnet-mints.json"), "utf-8"));
  const usdcMint = new PublicKey(mintsCache.USDC);
  const topaiMint = new PublicKey(mintsCache.TOPAI);

  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const idlPath = path.resolve(process.cwd(), "src/idl/streetfun.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const program = new anchor.Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, provider);

  const [globalConfigPda] = PublicKey.findProgramAddressSync([GLOBAL_CONFIG_SEED], PROGRAM_ID);

  // Use the token launched in the previous test
  const memeMint = new PublicKey("7TUcDnopkaCxUfr8D7LDT6imx9aMMZUGqmfKj4UgZyFU");
  const [curvePda] = PublicKey.findProgramAddressSync([CURVE_SEED, memeMint.toBuffer()], PROGRAM_ID);
  const [tokenVaultPda] = PublicKey.findProgramAddressSync([TOKEN_VAULT_SEED, curvePda.toBuffer()], PROGRAM_ID);
  const [quoteVaultPda] = PublicKey.findProgramAddressSync([QUOTE_VAULT_SEED, curvePda.toBuffer()], PROGRAM_ID);
  const [treasuryVaultPda] = PublicKey.findProgramAddressSync([TREASURY_VAULT_SEED, curvePda.toBuffer()], PROGRAM_ID);

  console.log(`[Test Buy & Graduate] Admin: ${admin.publicKey.toBase58()}`);
  console.log(`[Test Buy & Graduate] Meme Mint: ${memeMint.toBase58()}`);

  // Get ATAs for buyer
  const buyerUsdcAta = await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, admin.publicKey);
  const buyerMemeAta = await getOrCreateAssociatedTokenAccount(connection, admin, memeMint, admin.publicKey);
  const globalConfigData = await (program.account as any).globalConfig.fetch(globalConfigPda);
  const protocolFeeAta = await getOrCreateAssociatedTokenAccount(
    connection,
    admin,
    usdcMint,
    globalConfigData.protocolFeeRecipient
  );

  console.log(`[Test Buy & Graduate] Buying 61 USDC to exceed $60 threshold...`);
  const buyAmount = new BN(61 * 1_000_000); // 61 USDC

  const buyTx = await (program.methods as any)
    .buyCurve({
      quoteAmountIn: buyAmount,
      minTokensOut: new BN(1), // minimal slippage check for test
    })
    .accounts({
      buyer: admin.publicKey,
      globalConfig: globalConfigPda,
      memeMint: memeMint,
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

  console.log(`[Test Buy & Graduate] Buy Tx: ${buyTx}`);
  console.log(`[Test Buy & Graduate] Solscan: https://solscan.io/tx/${buyTx}?cluster=devnet`);

  const curveAfterBuy = await (program.account as any).curveAccount.fetch(curvePda);
  console.log(`[Test Buy & Graduate] Curve after buy:`, {
    realQuoteReserves: `${(Number(curveAfterBuy.realQuoteReserves.toString()) / 1e6).toFixed(2)} USDC`,
    graduationThreshold: `${(Number(globalConfigData.graduationThreshold.toString()) / 1e6).toFixed(2)} USDC`,
  });

  // Now Graduate!
  console.log(`\n[Test Buy & Graduate] Curve ready to graduate! Executing graduate_and_execute_stock...`);

  // Ensure admin has OpenAI shares in an ATA to provide to the treasury vault
  const adminTopaiAta = await getOrCreateAssociatedTokenAccount(connection, admin, topaiMint, admin.publicKey);
  // Ensure destination accounts exist
  const equityPurchaseAta = await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, admin.publicKey);
  const ammQuoteDestination = await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, Keypair.generate().publicKey);
  const ammTokenDestination = await getOrCreateAssociatedTokenAccount(connection, admin, memeMint, Keypair.generate().publicKey);

  const graduateTx = await (program.methods as any)
    .graduateAndExecuteStock({
      minEquityTokensExpected: new BN(1),
    })
    .accounts({
      caller: admin.publicKey,
      globalConfig: globalConfigPda,
      memeMint: memeMint,
      targetEquityMint: topaiMint,
      curve: curvePda,
      tokenVault: tokenVaultPda,
      quoteVault: quoteVaultPda,
      treasuryVault: treasuryVaultPda,
      equityPurchaseAccount: equityPurchaseAta.address,
      equitySourceAccount: adminTopaiAta.address,
      equitySourceAuthority: admin.publicKey,
      ammQuoteDestination: ammQuoteDestination.address,
      ammTokenDestination: ammTokenDestination.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([admin])
    .rpc();

  console.log(`[Test Buy & Graduate] GRADUATION SUCCESS! Tx: ${graduateTx}`);
  console.log(`[Test Buy & Graduate] Solscan: https://solscan.io/tx/${graduateTx}?cluster=devnet`);

  const curveGraduated = await (program.account as any).curveAccount.fetch(curvePda);
  console.log(`[Test Buy & Graduate] Graduated Curve Data:`, {
    isGraduated: curveGraduated.isGraduated,
    graduatedAt: new Date(Number(curveGraduated.graduatedAt.toString()) * 1000).toISOString(),
    totalEquityLocked: curveGraduated.totalEquityLocked.toString(),
  });

  // Now Test Burn & Redeem!
  console.log(`\n[Test Buy & Graduate] Testing burn_and_redeem...`);
  const memeTokensToBurn = new BN(1_000_000 * 1_000_000); // 1M tokens
  const redeemTx = await (program.methods as any)
    .burnAndRedeem({
      memeTokensToBurn: memeTokensToBurn,
      minEquityTokensOut: new BN(1),
    })
    .accounts({
      redeemer: admin.publicKey,
      memeMint: memeMint,
      targetEquityMint: topaiMint,
      curve: curvePda,
      treasuryVault: treasuryVaultPda,
      redeemerTokenAccount: buyerMemeAta.address,
      redeemerEquityAccount: adminTopaiAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([admin])
    .rpc();

  console.log(`[Test Buy & Graduate] REDEEM SUCCESS! Tx: ${redeemTx}`);
  console.log(`[Test Buy & Graduate] Solscan: https://solscan.io/tx/${redeemTx}?cluster=devnet`);
}

main().catch((err) => {
  console.error("[Test Buy & Graduate] Error:", err);
  process.exit(1);
});
