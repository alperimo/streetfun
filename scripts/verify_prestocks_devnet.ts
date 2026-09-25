import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import {
  createProvider,
  protocolAdmin,
  loadProgram,
  airdropSol,
  mintToAta,
  deriveGlobalConfigPda,
  deriveCurvePda,
  deriveTokenVaultPda,
  deriveQuoteVaultPda,
  deriveTreasuryVaultPda,
  getTestQuoteMint,
  safeGetOrCreateAta,
  safeGetAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  BN,
} from "../tests/helpers";
import { getPreStocksCatalog, PRESTOCKS_DEVNET_MINTS } from "../src/server/prestocks";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("🚀 Starting PreStocks Official Devnet Verification...");
  
  // 1. Fetch live PreStocks API
  console.log("\n[1/4] Querying https://prestocks.com/api/prestocks live endpoint...");
  const catalog = await getPreStocksCatalog();
  console.log(`Fetched ${catalog.length} PreStocks assets successfully!`);
  const spacex = catalog.find((a) => a.symbol === "SPACEX");
  if (!spacex) throw new Error("SpaceX not found in PreStocks catalog");
  console.log("PreStocks SpaceX Mark Price:", `$${spacex.currentStockPriceUsd}`, "| Mark Valuation:", `$${((spacex.markValuation || 0) / 1e9).toFixed(2)}B`);

  const provider = createProvider(protocolAdmin);
  const program = loadProgram(provider);
  const [globalConfigPda] = deriveGlobalConfigPda();

  const quoteMint = await getTestQuoteMint(provider.connection, protocolAdmin);
  const equityMintAddress = PRESTOCKS_DEVNET_MINTS["SPACEX"];
  const equityMint = new PublicKey(equityMintAddress);
  console.log("\n[2/4] Collateral Equity Mint (PreStocks SpaceX):", equityMint.toBase58());

  // Generate new meme token backed by PreStocks SpaceX
  const memeMintKeypair = Keypair.generate();
  const memeMint = memeMintKeypair.publicKey;
  const [curvePda] = deriveCurvePda(memeMint);
  const [tokenVaultPda] = deriveTokenVaultPda(curvePda);
  const [quoteVaultPda] = deriveQuoteVaultPda(curvePda);
  const [treasuryVaultPda] = deriveTreasuryVaultPda(curvePda);

  console.log(`\n[3/4] Launching $STAR (Starlink Meme) backed by PreStocks SpaceX on Solana Devnet...`);
  console.log(`Meme Mint: ${memeMint.toBase58()}`);
  console.log(`Curve PDA: ${curvePda.toBase58()}`);

  const launchTx = await (program.methods as any)
    .launchStonk({
      name: "Starlink Fleet",
      symbol: "STAR",
      uri: "https://streetfun.xyz/metadata/star.json",
      meteoraDammV2Pool: null,
    })
    .accounts({
      creator: protocolAdmin.publicKey,
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
    .signers([protocolAdmin, memeMintKeypair])
    .rpc();

  console.log(`✅ Launch Successful! Tx: ${launchTx}`);
  console.log(`Solscan: https://solscan.io/tx/${launchTx}?cluster=devnet`);

  // Verify curve state on-chain
  const curveAcc = await (program.account as any).curveAccount.fetch(curvePda);
  console.log(`On-Chain Verification: Target Equity = ${curveAcc.targetEquityMint.toBase58()}, Graduated = ${curveAcc.isGraduated}`);

  // 4. Execute a Buy trade on the new PreStocks token
  console.log("\n[4/4] Executing a buy trade on $STAR bonding curve...");
  const traderAlice = Keypair.generate();
  await airdropSol(provider.connection, traderAlice.publicKey, 0.1);

  const config = await (program.account as any).globalConfig.fetch(globalConfigPda);
  const feeRecipientAta = await safeGetOrCreateAta(
    provider.connection,
    protocolAdmin,
    quoteMint,
    config.protocolFeeRecipient
  );

  const aliceQuoteAta = await mintToAta(
    provider.connection,
    protocolAdmin,
    quoteMint,
    traderAlice.publicKey,
    15 * 1_000_000, // 15 USDC
    protocolAdmin
  );

  const aliceTokenAta = await safeGetOrCreateAta(
    provider.connection,
    traderAlice,
    memeMint,
    traderAlice.publicKey
  );

  const buyTx = await (program.methods as any)
    .buyCurve({
      quoteAmountIn: new BN(10 * 1_000_000), // 10 USDC
      minTokensOut: new BN(1),
    })
    .accounts({
      buyer: traderAlice.publicKey,
      globalConfig: globalConfigPda,
      memeMint: memeMint,
      curve: curvePda,
      tokenVault: tokenVaultPda,
      quoteVault: quoteVaultPda,
      buyerQuoteAccount: aliceQuoteAta.address,
      buyerTokenAccount: aliceTokenAta.address,
      protocolFeeAccount: feeRecipientAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([traderAlice])
    .rpc();

  console.log(`✅ Buy Successful! Tx: ${buyTx}`);
  console.log(`Solscan: https://solscan.io/tx/${buyTx}?cluster=devnet`);

  const aliceTokenAcc = await safeGetAccount(provider.connection, aliceTokenAta.address);
  console.log(`Tokens received by Alice: ${(Number(aliceTokenAcc.amount) / 1e6).toLocaleString()} $STAR`);

  const result = {
    test: "PRESTOCKS_OFFICIAL_DEVNET_VERIFICATION",
    prestocksApiUrl: "https://prestocks.com/api/prestocks",
    backingAsset: {
      name: spacex.name,
      symbol: spacex.symbol,
      markPriceUsd: spacex.currentStockPriceUsd,
      valuationUsd: spacex.markValuation,
      devnetCollateralMint: equityMint.toBase58(),
    },
    launchedToken: {
      name: "Starlink Fleet",
      symbol: "STAR",
      mint: memeMint.toBase58(),
      curvePda: curvePda.toBase58(),
    },
    signatures: {
      launchStonk: launchTx,
      buyCurve: buyTx,
    },
    timestamp: new Date().toISOString(),
  };

  const outPath = path.resolve(
    "/Users/alperenf/.gemini/antigravity/brain/eee7d099-16e6-4871-acc0-9f8aff898880",
    "prestocks_devnet_verification.json"
  );
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\n🎉 PreStocks E2E Verification Complete! Result written to prestocks_devnet_verification.json`);
}

main().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});
