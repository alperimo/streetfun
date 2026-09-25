import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
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

describe("06 - StreetFun Protocol: Lifecycle Safety (test collateral)", () => {
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
  let graduationThresholdQuote: number;

  const totalStockDeposited = 150 * 1_000_000; // 150 test-equity units
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
    equityMint = await getTestEquityMint(provider.connection, stockProvider);
    memeMintKeypair = Keypair.generate();
    memeMint = memeMintKeypair.publicKey;

    [curvePda] = deriveCurvePda(memeMint);
    [tokenVaultPda] = deriveTokenVaultPda(curvePda);
    [quoteVaultPda] = deriveQuoteVaultPda(curvePda);
    [treasuryVaultPda] = deriveTreasuryVaultPda(curvePda);

    // Ensure fee recipient ATA exists
    const config = await program.account.globalConfig.fetch(globalConfigPda);
    graduationThresholdQuote = Number(config.graduationThreshold.toString()) / 1_000_000;

    feeRecipientAta = await safeGetOrCreateAta(
      provider.connection,
      creator,
      quoteMint,
      config.protocolFeeRecipient
    );
  });

  it("Step 1: Launches new token $SING (Neural Singularity) backed by the test equity mint", async () => {
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
        equityTokenProgram: TOKEN_PROGRAM_ID,
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
      backingEquity: "Test equity fixture mint",
    };

    const curveAcc = await (program.account as any).curveAccount.fetch(curvePda);
    expect(curveAcc.isGraduated).to.be.false;
    expect(curveAcc.realQuoteReserves.toNumber()).to.equal(0);
    expect(curveAcc.realTokenReserves.toString()).to.equal("800000000000000"); // 800M tokens
    console.log("✅ Step 1 Verified: $SING launched successfully on-chain! Tx:", tx);
  });

  it("Step 2: Trader Alice executes a Buy on $SING bonding curve", async () => {
    // Fund Alice with the test-owned quote mint. This is not real USDC.
    const quoteNeeded = (graduationThresholdQuote * 2 + 50) * 1_000_000;
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

    const initialBuyQuote = Math.min(20, Math.floor(graduationThresholdQuote * 0.3));
    const buyAmount = new BN(initialBuyQuote * 1_000_000);

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
      quoteInTestUnits: initialBuyQuote,
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

  it("Step 4: Reaches the threshold but refuses unverified graduation settlement", async () => {
    // Buy the remaining net quote reserve needed to clear the threshold, including fees.
    const [config, curveBeforeGraduation] = await Promise.all([
      (program.account as any).globalConfig.fetch(globalConfigPda),
      (program.account as any).curveAccount.fetch(curvePda),
    ]);
    const thresholdUnits = BigInt(config.graduationThreshold.toString());
    const currentReserveUnits = BigInt(curveBeforeGraduation.realQuoteReserves.toString());
    const netQuoteNeeded = thresholdUnits + 1_000_000n - currentReserveUnits;
    const feeDenominator = 10_000n - BigInt(config.protocolFeeBps);
    const buyQuoteUnits =
      netQuoteNeeded > 0n
        ? (netQuoteNeeded * 10_000n + feeDenominator - 1n) / feeDenominator
        : 1n;
    const buyQuoteIn = new BN(buyQuoteUnits.toString());

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

    // Test equity provider deposits 150 shares of the test-only mint.
    const stockProviderEquityAta = await mintToAta(
      provider.connection,
      creator,
      equityMint,
      stockProvider.publicKey,
      totalStockDeposited,
      stockProvider
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
    const curveAtThreshold = await (program.account as any).curveAccount.fetch(curvePda);
    expect(BigInt(curveAtThreshold.realQuoteReserves.toString()) >= thresholdUnits).to.equal(true);
    const treasuryBefore = await safeGetAccount(provider.connection, treasuryVaultPda);
    const ammTokenBefore = await safeGetAccount(provider.connection, ammTokenAta.address);

    // The finalizer is permissionless, but graduation stays closed until the
    // Tessera acquisition and real Meteora DLMM settlement can be verified.
    let graduationAttemptSignature: string | null = null;
    try {
      await (program.methods as any)
        .graduateAndExecuteStock({ minEquityTokensExpected: new BN(totalStockDeposited) })
        .accounts({
          caller: traderAlice.publicKey,
          globalConfig: globalConfigPda,
          memeMint,
          targetEquityMint: equityMint,
          curve: curvePda,
          tokenVault: tokenVaultPda,
          quoteVault: quoteVaultPda,
          treasuryVault: treasuryVaultPda,
          equityPurchaseAccount: stockProviderQuoteAta.address,
          equitySourceAccount: stockProviderEquityAta.address,
          ammQuoteDestination: ammQuoteAta.address,
          ammTokenDestination: ammTokenAta.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          equityTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([traderAlice])
        .rpc();
      expect.fail("Graduation must fail closed until both settlement legs are verified");
    } catch (err: any) {
      graduationAttemptSignature =
        typeof err?.signature === "string"
          ? err.signature
          : typeof err?.transactionSignature === "string"
            ? err.transactionSignature
            : null;
      expect(err.toString()).to.include("SettlementUnavailable");
    }

    const curveAfterGrad = await (program.account as any).curveAccount.fetch(curvePda);
    const stockProvAfter = await safeGetAccount(provider.connection, stockProviderQuoteAta.address);
    const ammQuoteAfter = await safeGetAccount(provider.connection, ammQuoteAta.address);
    const treasuryAfter = await safeGetAccount(provider.connection, treasuryVaultPda);
    const ammTokenAfter = await safeGetAccount(provider.connection, ammTokenAta.address);
    expect(curveAfterGrad.isGraduated).to.be.false;
    expect(curveAfterGrad.realQuoteReserves.toString()).to.equal(curveAtThreshold.realQuoteReserves.toString());
    expect(stockProvAfter.amount.toString()).to.equal(stockProvBefore.amount.toString());
    expect(ammQuoteAfter.amount.toString()).to.equal(ammQuoteBefore.amount.toString());
    expect(treasuryAfter.amount.toString()).to.equal(treasuryBefore.amount.toString());
    expect(ammTokenAfter.amount.toString()).to.equal(ammTokenBefore.amount.toString());

    const memeMintAtThreshold = await getMint(provider.connection, memeMint);
    expect(curveAfterGrad.totalMemeSupply.toString()).to.equal(TOTAL_MEME_SUPPLY.toString());
    expect(memeMintAtThreshold.supply.toString()).to.equal(TOTAL_MEME_SUPPLY.toString());
    txReceipts["04_graduation"] = {
      action: "GRADUATION_BLOCKED_UNVERIFIED_SETTLEMENT",
      txSignature: graduationAttemptSignature,
      status: "not_graduated",
      graduationThresholdQuote,
      reason: "SettlementUnavailable",
      memeSupplyRaw: memeMintAtThreshold.supply.toString(),
    };
    console.log("✅ Step 4 Verified: Settlement was rejected and all balances remained unchanged.");
  });

  it("Step 5: Rejects redemption while the token has not graduated", async () => {
    aliceEquityAta = await safeGetOrCreateAta(
      provider.connection,
      creator,
      equityMint,
      traderAlice.publicKey
    );

    // The test verifies the redemption gate only; it must not burn or transfer assets.
    const memeToBurn = new BN(1_000_000 * 1_000_000);
    const expectedEquityShares = 150_000;

    let redemptionAttemptSignature: string | null = null;
    try {
      await (program.methods as any)
        .burnAndRedeem({
          memeTokensToBurn: memeToBurn,
          minEquityTokensOut: new BN(expectedEquityShares),
        })
        .accounts({
          redeemer: traderAlice.publicKey,
          memeMint,
          targetEquityMint: equityMint,
          curve: curvePda,
          treasuryVault: treasuryVaultPda,
          redeemerTokenAccount: aliceTokenAta.address,
          redeemerEquityAccount: aliceEquityAta.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          equityTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([traderAlice])
        .rpc();
      expect.fail("Redemption must be unavailable before graduation");
    } catch (err: any) {
      redemptionAttemptSignature =
        typeof err?.signature === "string"
          ? err.signature
          : typeof err?.transactionSignature === "string"
            ? err.transactionSignature
            : null;
      expect(err.toString()).to.include("CurveNotGraduated");
    }

    txReceipts["05_redeem"] = {
      action: "REDEMPTION_BLOCKED_BEFORE_GRADUATION",
      txSignature: redemptionAttemptSignature,
      status: "not_redeemed",
      reason: "CurveNotGraduated",
    };

    const aliceEquityAcc = await safeGetAccount(provider.connection, aliceEquityAta.address);
    expect(aliceEquityAcc.amount).to.equal(0n);

    console.log("✅ Step 5 Verified: Pre-graduation redemption was rejected without a burn or asset transfer.");

    const artifactPath = path.resolve(
      process.cwd(),
      "target/test-artifacts/e2e_verified_transactions.json"
    );
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, JSON.stringify(txReceipts, null, 2));
    console.log("💾 Saved verified transaction receipts to e2e_verified_transactions.json");
  });
});
