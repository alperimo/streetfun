import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import BN from "bn.js";
import * as fs from "fs";
import * as path from "path";

const RPC_URL = process.env.SOLANA_RPC_URL || "http://127.0.0.1:8899";
const PROGRAM_ID = new PublicKey("6ZiovCkRxRJgUaCS9uftFk3eVnGDsbnDXgUV1XHybH52");

function getWalletKeypair(): Keypair {
  const walletPath =
    process.env.ANCHOR_WALLET ||
    path.resolve(process.env.HOME || "", ".config/solana/id.json");
  if (fs.existsSync(walletPath)) {
    const raw = JSON.parse(fs.readFileSync(walletPath, "utf8"));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  return Keypair.generate();
}

async function runDemo() {
  console.log("================================================================================");
  console.log("🚀 STREETFUN LOCALNET END-TO-END DEMO");
  console.log("================================================================================");
  console.log(`Connecting to Solana RPC: ${RPC_URL}`);

  const connection = new Connection(RPC_URL, "confirmed");
  const payer = getWalletKeypair();
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idlPath = path.resolve(process.cwd(), "target/idl/streetfun.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const program: any = new anchor.Program(idl, provider);

  console.log(`Payer wallet: ${payer.publicKey.toBase58()}`);

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Payer SOL Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

  // 1. Global Config
  const [globalConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global-config")],
    PROGRAM_ID
  );
  console.log(`\n1. Global Config PDA: ${globalConfigPda.toBase58()}`);

  const existingConfig = await connection.getAccountInfo(globalConfigPda);
  if (!existingConfig) {
    console.log("Initializing Global Config (1% fee, 60k graduation threshold)...");
    const initTx = await program.methods
      .initializeGlobalConfig({
        protocolFeeBps: 100,
        graduationFeeBps: 150,
        graduationThreshold: new BN(60_000 * 1_000_000),
        initialVirtualQuoteReserves: new BN(30_000 * 1_000_000),
        initialVirtualTokenReserves: new BN("1073000000000000"),
      })
      .accounts({
        admin: payer.publicKey,
        protocolFeeRecipient: payer.publicKey,
        globalConfig: globalConfigPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(`✅ Global Config initialized! Tx: ${initTx}`);
  } else {
    console.log("✅ Global Config already active.");
  }

  const config = await program.account.globalConfig.fetch(globalConfigPda);
  console.log(`   Protocol Fee Recipient: ${config.protocolFeeRecipient.toBase58()}`);

  // 2. USDC Mock Mint
  console.log("\n2. Minting Mock USDC for local testing...");
  const quoteMint = await createMint(connection, payer, payer.publicKey, null, 6);
  console.log(`Mock USDC Mint: ${quoteMint.toBase58()}`);

  const payerQuoteAta = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    quoteMint,
    payer.publicKey
  );
  await mintTo(connection, payer, quoteMint, payerQuoteAta.address, payer, 100_000 * 1_000_000);
  console.log(`✅ Minted 100,000 USDC to ${payerQuoteAta.address.toBase58()}`);

  // Protocol fee account for the designated recipient
  const feeRecipientAta = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    quoteMint,
    config.protocolFeeRecipient
  );

  // 3. Mock Equity Mint ($SPCX)
  console.log("\n3. Creating Mock SpaceX ($SPCX) Equity Mint...");
  const equityMint = await createMint(connection, payer, payer.publicKey, null, 6);
  console.log(`Mock SpaceX Equity Mint: ${equityMint.toBase58()}`);

  // 4. Launch Stonk: $MARS
  console.log("\n4. Launching Tokenized Meme Stonk: $MARS tied to $SPCX...");
  const memeMintKeypair = Keypair.generate();
  const memeMint = memeMintKeypair.publicKey;

  const [curvePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("curve"), memeMint.toBuffer()],
    PROGRAM_ID
  );
  const [tokenVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token-vault"), curvePda.toBuffer()],
    PROGRAM_ID
  );
  const [quoteVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("quote-vault"), curvePda.toBuffer()],
    PROGRAM_ID
  );
  const [treasuryVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury-vault"), curvePda.toBuffer()],
    PROGRAM_ID
  );

  const launchTx = await program.methods
    .launchStonk({
      name: "Mars Colonization Token",
      symbol: "MARS",
      uri: "https://streetfun.xyz/metadata/mars.json",
      meteoraDbcPool: null,
    })
    .accounts({
      creator: payer.publicKey,
      globalConfig: globalConfigPda,
      memeMint: memeMint,
      targetEquityMint: equityMint,
      curve: curvePda,
      tokenVault: tokenVaultPda,
      quoteMint: quoteMint,
      quoteVault: quoteVaultPda,
      treasuryVault: treasuryVaultPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([memeMintKeypair])
    .rpc();

  console.log(`✅ Token Launched successfully! Tx: ${launchTx}`);
  console.log(`   Meme Mint: ${memeMint.toBase58()}`);
  console.log(`   Curve PDA: ${curvePda.toBase58()}`);
  console.log(`   Token Vault: ${tokenVaultPda.toBase58()}`);
  console.log(`   Quote Vault: ${quoteVaultPda.toBase58()}`);
  console.log(`   Treasury Vault: ${treasuryVaultPda.toBase58()}`);

  // 5. Buy on bonding curve: 5,000 USDC
  console.log("\n5. Executing live buy of $5,000 USDC on bonding curve...");
  const payerTokenAta = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    memeMint,
    payer.publicKey
  );

  const buyTx = await program.methods
    .buyCurve({
      quoteAmountIn: new BN(5_000 * 1_000_000),
      minTokensOut: new BN(1),
    })
    .accounts({
      buyer: payer.publicKey,
      globalConfig: globalConfigPda,
      memeMint: memeMint,
      curve: curvePda,
      tokenVault: tokenVaultPda,
      quoteVault: quoteVaultPda,
      buyerQuoteAccount: payerQuoteAta.address,
      buyerTokenAccount: payerTokenAta.address,
      protocolFeeAccount: feeRecipientAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log(`✅ Buy confirmed on-chain! Tx: ${buyTx}`);

  const tokenBalance = await connection.getTokenAccountBalance(payerTokenAta.address);
  console.log(`   Buyer $MARS Balance: ${tokenBalance.value.uiAmountString} MARS`);

  const curveState = await program.account.curveAccount.fetch(curvePda);
  console.log(`   Curve Real Quote Reserves: $${curveState.realQuoteReserves.toNumber() / 1_000_000} USDC`);
  console.log(`   Curve Progress: ${((curveState.realQuoteReserves.toNumber() / 60_000_000_000) * 100).toFixed(2)}% to Graduation`);

  console.log("\n================================================================================");
  console.log("✨ LOCALNET DEMO COMPLETED SUCCESSFULLY!");
  console.log("================================================================================");
}

runDemo().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
