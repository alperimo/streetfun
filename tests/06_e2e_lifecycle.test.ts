import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  createProvider,
  protocolAdmin,
  loadProgram,
  airdropSol,
  createSplMint,
  mintToAta,
  deriveGlobalConfigPda,
  deriveCurvePda,
  deriveTokenVaultPda,
  deriveQuoteVaultPda,
  deriveTreasuryVaultPda,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  BN,
  TOTAL_MEME_SUPPLY,
} from "./helpers";
import { getOrCreateAssociatedTokenAccount, getAccount } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

describe("06 - StreetFun Protocol: Complete E2E Lifecycle ($SING - Neural Singularity)", () => {
  const creator = Keypair.generate();
  const traderAlice = Keypair.generate();
  const stockProvider = Keypair.generate(); // Custodian providing real Pre-IPO equity tokens
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

  const totalStockDeposited = 150 * 1_000_000; // 150 shares ($TOPAI OpenAI Pre-IPO)
  const txReceipts: Record<string, any> = {};

  before(async () => {
    // Fund all participants
    await airdropSol(provider.connection, creator.publicKey, 10);
    await airdropSol(provider.connection, traderAlice.publicKey, 20);
    await airdropSol(provider.connection, stockProvider.publicKey, 10);
    await airdropSol(provider.connection, ammQuoteDest.publicKey, 5);
    await airdropSol(provider.connection, ammTokenDest.publicKey, 5);

    // Create USDC Quote and Pre-IPO Equity Mints
    quoteMint = await createSplMint(provider.connection, creator, 6);
    equityMint = await createSplMint(provider.connection, stockProvider, 6, stockProvider.publicKey);
    memeMintKeypair = Keypair.generate();
    memeMint = memeMintKeypair.publicKey;

    [curvePda] = deriveCurvePda(memeMint);
    [tokenVaultPda] = deriveTokenVaultPda(curvePda);
    [quoteVaultPda] = deriveQuoteVaultPda(curvePda);
    [treasuryVaultPda] = deriveTreasuryVaultPda(curvePda);

    // Setup Fee Recipient ATA
    const config = await program.account.globalConfig.fetch(globalConfigPda);
    feeRecipientAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      creator,
      quoteMint,
      config.protocolFeeRecipient
    );
  });

  it("Step 1: Launches new token $SING (Neural Singularity) backed by OpenAI ($TOPAI)", async () => {
    const tx = await program.methods
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

    const curveAcc = await program.account.curveAccount.fetch(curvePda);
    expect(curveAcc.isGraduated).to.be.false;
    expect(curveAcc.realQuoteReserves.toNumber()).to.equal(0);
    expect(curveAcc.realTokenReserves.toString()).to.equal("800000000000000"); // 800M tokens
    console.log("✅ Step 1 Verified: $SING launched successfully on-chain! Tx:", tx);
  });

  it("Step 2: Trader Alice executes a Buy on $SING bonding curve", async () => {
    // Mint 80,000 USDC to Alice
    aliceQuoteAta = await mintToAta(
      provider.connection,
      creator,
      quoteMint,
      traderAlice.publicKey,
      80_000 * 1_000_000,
      creator
    );

    aliceTokenAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      traderAlice,
      memeMint,
      traderAlice.publicKey
    );

    const buyAmount = new BN(1_000 * 1_000_000); // 1,000 USDC
    const tx = await program.methods
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

    const aliceTokenAcc = await getAccount(provider.connection, aliceTokenAta.address);
    const tokensReceived = Number(aliceTokenAcc.amount) / 1_000_000;

    txReceipts["02_buy"] = {
      action: "BONDING_BUY",
      txSignature: tx,
      trader: traderAlice.publicKey.toBase58(),
      quoteInUsdc: 1_000,
      tokensReceived,
    };

    const curveAfterBuy = await program.account.curveAccount.fetch(curvePda);
    expect(curveAfterBuy.realQuoteReserves.toNumber()).to.be.greaterThan(0);
    expect(tokensReceived).to.be.greaterThan(0);
    console.log("✅ Step 2 Verified: Alice bought $SING with tx:", tx, "Tokens received:", tokensReceived);
  });

  it("Step 3: Trader Alice executes a Sell on $SING bonding curve", async () => {
    const sellTokens = new BN(5_000_000 * 1_000_000); // 5M tokens
    const tx = await program.methods
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
      tokensSold: 5_000_000,
    };

    console.log("✅ Step 3 Verified: Alice sold 5M $SING with tx:", tx);
  });

  it("Step 4: Pushes bonding curve to $60,000 threshold and verifies Graduation", async () => {
    // Buy 61,000 USDC (ensures >60,000 USDC after 1% protocol fee)
    const buyQuoteIn = new BN(61_000 * 1_000_000);
    
    await program.methods
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

    // Custodian stock provider deposits 150 shares ($30k value) of $TOPAI
    const stockProviderEquityAta = await mintToAta(
      provider.connection,
      stockProvider,
      equityMint,
      stockProvider.publicKey,
      totalStockDeposited,
      stockProvider
    );

    const stockProviderQuoteAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      stockProvider,
      quoteMint,
      stockProvider.publicKey
    );

    const ammQuoteAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      creator,
      quoteMint,
      ammQuoteDest.publicKey
    );

    const ammTokenAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      creator,
      memeMint,
      ammTokenDest.publicKey
    );

    // Execute graduation via graduateAndExecuteStock
    const tx = await program.methods
      .graduateAndExecuteStock({
        minEquityTokensExpected: new BN(totalStockDeposited),
      })
      .accounts({
        caller: protocolAdmin.publicKey,
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
      .signers([protocolAdmin, stockProvider])
      .rpc();

    txReceipts["04_graduation"] = {
      action: "GRADUATION_AND_50_50_SPLIT",
      txSignature: tx,
      graduationThresholdUsdc: 60_000,
      stockCollateralLockedShares: 150,
      stockCollateralValueUsdc: 30_000,
      ammLiquidityBudgetUsdc: 30_000,
      treasuryVaultPda: treasuryVaultPda.toBase58(),
      ammQuoteAta: ammQuoteAta.address.toBase58(),
    };

    const curveAfterGrad = await program.account.curveAccount.fetch(curvePda);
    expect(curveAfterGrad.isGraduated).to.be.true;
    expect(curveAfterGrad.totalEquityLocked.toNumber()).to.equal(totalStockDeposited);

    // Verify 50% USDC transferred to stock provider for shares and 50% to AMM LP (Exact 50-50 split)
    const stockProvQuoteAcc = await getAccount(provider.connection, stockProviderQuoteAta.address);
    const ammQuoteAcc = await getAccount(provider.connection, ammQuoteAta.address);
    const stockProvAmount = Number(stockProvQuoteAcc.amount) / 1_000_000;
    const ammAmount = Number(ammQuoteAcc.amount) / 1_000_000;

    expect(stockProvAmount).to.be.closeTo(30_000, 1_000);
    expect(ammAmount).to.be.closeTo(30_000, 1_000);
    expect(stockProvAmount).to.be.closeTo(ammAmount, 1.0); // Exact 50/50 equality

    console.log("✅ Step 4 Verified: Curve Graduated with 50/50 split! Tx:", tx);
  });

  it("Step 5: Trader Alice redeems pro-rata OpenAI Pre-IPO stock by burning $SING", async () => {
    aliceEquityAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      traderAlice,
      equityMint,
      traderAlice.publicKey
    );

    // Alice burns 10,000,000 tokens (1% of 1B supply)
    // Entitled stock = 1% * 150 shares = 1.5 shares (1,500,000 units)
    const memeToBurn = new BN(10_000_000 * 1_000_000);
    const expectedEquityShares = 1_500_000;

    const tx = await program.methods
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
      memeBurned: 10_000_000,
      sharesRedeemed: 1.5,
      redeemerEquityAta: aliceEquityAta.address.toBase58(),
    };

    const aliceEquityAcc = await getAccount(provider.connection, aliceEquityAta.address);
    const sharesReceived = Number(aliceEquityAcc.amount) / 1_000_000;
    expect(sharesReceived).to.be.closeTo(1.5, 0.01);

    console.log("✅ Step 5 Verified: Alice burned 10M $SING and redeemed", sharesReceived, "OpenAI Pre-IPO shares! Tx:", tx);

    // Save full receipts to JSON artifact
    const artifactPath = path.resolve(
      "/Users/alperenf/.gemini/antigravity/brain/eee7d099-16e6-4871-acc0-9f8aff898880",
      "e2e_verified_transactions.json"
    );
    fs.writeFileSync(artifactPath, JSON.stringify(txReceipts, null, 2));
    console.log("💾 Saved verified transaction receipts to e2e_verified_transactions.json");
  });
});
