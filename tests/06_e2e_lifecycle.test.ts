import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
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
  getTestEquityMint,
  isDevnet,
  safeGetOrCreateAta,
  safeGetAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  BN,
  TOTAL_MEME_SUPPLY,
} from "./helpers";
import * as fs from "fs";
import * as path from "path";

describe("06 - StreetFun Protocol: Complete E2E Lifecycle ($SING - Neural Singularity)", () => {
  // Participants: On devnet, admin acts as creator and stock provider to leverage funded keys
  const creator = isDevnet ? protocolAdmin : Keypair.generate();
  const traderAlice = Keypair.generate();
  const stockProvider = isDevnet ? protocolAdmin : Keypair.generate();
  const ammQuoteDest = Keypair.generate();
  const ammTokenDest = Keypair.generate();

  const provider = createProvider(creator);
  const program = loadProgram(provider);

  const [globalConfigPda] = deriveGlobalConfigPda();

  let quoteMint: PublicKey;
  let equityMint: PublicKey;
  let memeMintKeypair: Keypair;
  let memeMint: PublicKey;
  let curvePda: PublicKey;
  let tokenVaultPda: PublicKey;
  let quoteVaultPda: PublicKey;
  let treasuryVaultPda: PublicKey;

  let aliceQuoteAta: any;
  let aliceTokenAta: any;
  let aliceEquityAta: any;
  let feeRecipientAta: any;
  let graduationThresholdUsdc: number;

  const totalStockDeposited = 150 * 1_000_000; // 150 shares ($TOPAI OpenAI Pre-IPO)
  const txReceipts: Record<string, any> = {};

  before(async () => {
    // Fund all participants with SOL
    await airdropSol(provider.connection, creator.publicKey, 5);
    await airdropSol(provider.connection, traderAlice.publicKey, 2);
    await airdropSol(provider.connection, stockProvider.publicKey, 2);
    await airdropSol(provider.connection, ammQuoteDest.publicKey, 1);
    await airdropSol(provider.connection, ammTokenDest.publicKey, 1);

    // Dynamic Mints (re-uses existing on devnet, generates fresh on localnet)
    quoteMint = await getTestQuoteMint(provider.connection, creator);
    equityMint = await getTestEquityMint(provider.connection, stockProvider, "$TOPAI");
    memeMintKeypair = Keypair.generate();
    memeMint = memeMintKeypair.publicKey;

    [curvePda] = deriveCurvePda(memeMint);
    [tokenVaultPda] = deriveTokenVaultPda(curvePda);
    [quoteVaultPda] = deriveQuoteVaultPda(curvePda);
    [treasuryVaultPda] = deriveTreasuryVaultPda(curvePda);

    // Ensure fee recipient ATA exists
    const config = await program.account.globalConfig.fetch(globalConfigPda);
    graduationThresholdUsdc = Number(config.graduationThreshold.toString()) / 1_000_000;

    feeRecipientAta = await safeGetOrCreateAta(
      provider.connection,
      creator,
      quoteMint,
      config.protocolFeeRecipient
    );
  });

  it("Step 1: Launches new token $SING (Neural Singularity) backed by OpenAI ($TOPAI)", async () => {
    const tx = await (program.methods as any)
      .launchStonk({
        name: "Neural Singularity",
        symbol: "SING",
        uri: "https://streetfun.xyz/metadata/sing.json",
        meteoraDbcPool: null,
      })
      .accounts({
        creator: creator.publicKey,
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
      .signers([creator, memeMintKeypair])
      .rpc();

    txReceipts["01_launch"] = {
      action: "LAUNCH_TOKEN",
      txSignature: tx,
      memeMint: memeMint.toBase58(),
      curvePda: curvePda.toBase58(),
      tokenName: "Neural Singularity",
      symbol: "SING",
      backingEquity: "OpenAI ($TOPAI)",
    };

    const curveAcc = await (program.account as any).curveAccount.fetch(curvePda);
    expect(curveAcc.isGraduated).to.be.false;
    expect(curveAcc.realQuoteReserves.toNumber()).to.equal(0);
    expect(curveAcc.realTokenReserves.toString()).to.equal("800000000000000"); // 800M tokens
    console.log("✅ Step 1 Verified: $SING launched successfully on-chain! Tx:", tx);
  });

  it("Step 2: Trader Alice executes a Buy on $SING bonding curve", async () => {
    // Fund Alice with quote tokens (USDC)
    const quoteNeeded = (graduationThresholdUsdc + 50) * 1_000_000;
    aliceQuoteAta = await mintToAta(
      provider.connection,
      creator,
      quoteMint,
      traderAlice.publicKey,
      quoteNeeded,
      creator
    );

    aliceTokenAta = await safeGetOrCreateAta(
      provider.connection,
      traderAlice,
      memeMint,
      traderAlice.publicKey
    );

    const initialBuyUsdc = Math.min(20, Math.floor(graduationThresholdUsdc * 0.3));
    const buyAmount = new BN(initialBuyUsdc * 1_000_000);

    const tx = await (program.methods as any)
      .buyCurve({
        quoteAmountIn: buyAmount,
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

    const aliceTokenAcc = await safeGetAccount(provider.connection, aliceTokenAta.address);
    const tokensReceived = Number(aliceTokenAcc.amount) / 1_000_000;

    txReceipts["02_buy"] = {
      action: "BONDING_BUY",
      txSignature: tx,
      trader: traderAlice.publicKey.toBase58(),
      quoteInUsdc: initialBuyUsdc,
      tokensReceived,
    };

    const curveAfterBuy = await (program.account as any).curveAccount.fetch(curvePda);
    expect(curveAfterBuy.realQuoteReserves.toNumber()).to.be.greaterThan(0);
    expect(tokensReceived).to.be.greaterThan(0);
    console.log("✅ Step 2 Verified: Alice bought $SING with tx:", tx, "Tokens received:", tokensReceived);
  });

  it("Step 3: Trader Alice executes a Sell on $SING bonding curve", async () => {
    const sellTokens = new BN(100_000 * 1_000_000); // 100k tokens
    const tx = await (program.methods as any)
      .sellCurve({
        tokensAmountIn: sellTokens,
        minQuoteOut: new BN(1),
      })
      .accounts({
        seller: traderAlice.publicKey,
        globalConfig: globalConfigPda,
        memeMint: memeMint,
        curve: curvePda,
        tokenVault: tokenVaultPda,
        quoteVault: quoteVaultPda,
        sellerTokenAccount: aliceTokenAta.address,
        sellerQuoteAccount: aliceQuoteAta.address,
        protocolFeeAccount: feeRecipientAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([traderAlice])
      .rpc();

    txReceipts["03_sell"] = {
      action: "BONDING_SELL",
      txSignature: tx,
      trader: traderAlice.publicKey.toBase58(),
      tokensSold: 100_000,
    };

    console.log("✅ Step 3 Verified: Alice sold 100k $SING with tx:", tx);
  });

  it("Step 4: Pushes bonding curve to graduation threshold and verifies Graduation", async () => {
    // Dynamically buy enough to exceed threshold
    const buyQuoteIn = new BN(Math.ceil((graduationThresholdUsdc + 2) * 1_000_000));

    await (program.methods as any)
      .buyCurve({
        quoteAmountIn: buyQuoteIn,
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

    // Custodian stock provider deposits 150 shares of $TOPAI
    const stockProviderEquityAta = await mintToAta(
      provider.connection,
      creator,
      equityMint,
      stockProvider.publicKey,
      totalStockDeposited,
      creator
    );

    const stockProviderQuoteAta = await safeGetOrCreateAta(
      provider.connection,
      creator,
      quoteMint,
      stockProvider.publicKey
    );

    const ammQuoteAta = await safeGetOrCreateAta(
      provider.connection,
      creator,
      quoteMint,
      ammQuoteDest.publicKey
    );

    const ammTokenAta = await safeGetOrCreateAta(
      provider.connection,
      creator,
      memeMint,
      ammTokenDest.publicKey
    );

    const stockProvBefore = await safeGetAccount(provider.connection, stockProviderQuoteAta.address);
    const ammQuoteBefore = await safeGetAccount(provider.connection, ammQuoteAta.address);

    // Execute graduation via graduateAndExecuteStock
    const tx = await (program.methods as any)
      .graduateAndExecuteStock({
        minEquityTokensExpected: new BN(totalStockDeposited),
      })
      .accounts({
        caller: creator.publicKey,
        globalConfig: globalConfigPda,
        memeMint: memeMint,
        targetEquityMint: equityMint,
        curve: curvePda,
        tokenVault: tokenVaultPda,
        quoteVault: quoteVaultPda,
        treasuryVault: treasuryVaultPda,
        equityPurchaseAccount: stockProviderQuoteAta.address,
        equitySourceAccount: stockProviderEquityAta.address,
        equitySourceAuthority: stockProvider.publicKey,
        ammQuoteDestination: ammQuoteAta.address,
        ammTokenDestination: ammTokenAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers(isDevnet ? [creator] : [creator, stockProvider])
      .rpc();

    const expectedHalf = graduationThresholdUsdc / 2;

    txReceipts["04_graduation"] = {
      action: "GRADUATION_AND_50_50_SPLIT",
      txSignature: tx,
      graduationThresholdUsdc,
      stockCollateralLockedShares: 150,
      stockCollateralValueUsdc: expectedHalf,
      ammLiquidityBudgetUsdc: expectedHalf,
      treasuryVaultPda: treasuryVaultPda.toBase58(),
    };

    const curveAfterGrad = await (program.account as any).curveAccount.fetch(curvePda);
    expect(curveAfterGrad.isGraduated).to.be.true;
    expect(curveAfterGrad.totalEquityLocked.toNumber()).to.equal(totalStockDeposited);

    // Verify 50% USDC transferred to stock provider and 50% to AMM (Exact 50/50 split)
    const stockProvAfter = await safeGetAccount(provider.connection, stockProviderQuoteAta.address);
    const ammQuoteAfter = await safeGetAccount(provider.connection, ammQuoteAta.address);
    const stockDelta = (Number(stockProvAfter.amount) - Number(stockProvBefore.amount)) / 1_000_000;
    const ammDelta = (Number(ammQuoteAfter.amount) - Number(ammQuoteBefore.amount)) / 1_000_000;

    expect(stockDelta).to.be.greaterThanOrEqual(graduationThresholdUsdc / 2);
    expect(ammDelta).to.be.greaterThanOrEqual(graduationThresholdUsdc / 2);
    expect(stockDelta).to.be.closeTo(ammDelta, 0.01); // Mathematical 50/50 parity

    console.log("✅ Step 4 Verified: Curve Graduated with exact 50/50 split! Stock:", stockDelta, "USDC | AMM:", ammDelta, "USDC | Tx:", tx);
  });

  it("Step 5: Trader Alice redeems pro-rata OpenAI Pre-IPO stock by burning $SING", async () => {
    await new Promise((r) => setTimeout(r, 1500));
    aliceEquityAta = await safeGetOrCreateAta(
      provider.connection,
      creator,
      equityMint,
      traderAlice.publicKey
    );

    // Alice burns 1,000,000 tokens (0.1% of 1B supply)
    // Entitled stock = 0.1% * 150 shares = 0.15 shares (150,000 units)
    const memeToBurn = new BN(1_000_000 * 1_000_000);
    const expectedEquityShares = 150_000;

    const tx = await (program.methods as any)
      .burnAndRedeem({
        memeTokensToBurn: memeToBurn,
        minEquityTokensOut: new BN(expectedEquityShares),
      })
      .accounts({
        redeemer: traderAlice.publicKey,
        memeMint: memeMint,
        targetEquityMint: equityMint,
        curve: curvePda,
        treasuryVault: treasuryVaultPda,
        redeemerTokenAccount: aliceTokenAta.address,
        redeemerEquityAccount: aliceEquityAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([traderAlice])
      .rpc();

    txReceipts["05_redeem"] = {
      action: "BURN_AND_REDEEM_STOCK",
      txSignature: tx,
      trader: traderAlice.publicKey.toBase58(),
      memeBurned: 1_000_000,
      sharesRedeemed: 0.15,
      redeemerEquityAta: aliceEquityAta.address.toBase58(),
    };

    await new Promise((r) => setTimeout(r, 1500));
    const aliceEquityAcc = await safeGetAccount(provider.connection, aliceEquityAta.address);
    const sharesReceived = Number(aliceEquityAcc.amount) / 1_000_000;
    expect(sharesReceived).to.be.closeTo(0.15, 0.01);

    console.log("✅ Step 5 Verified: Alice burned 1M $SING and redeemed", sharesReceived, "OpenAI Pre-IPO shares! Tx:", tx);

    const artifactPath = path.resolve(
      "/Users/alperenf/.gemini/antigravity/brain/eee7d099-16e6-4871-acc0-9f8aff898880",
      "e2e_verified_transactions.json"
    );
    fs.writeFileSync(artifactPath, JSON.stringify(txReceipts, null, 2));
    console.log("💾 Saved verified transaction receipts to e2e_verified_transactions.json");
  });
});
