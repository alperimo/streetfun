import { expect } from "chai";
import { Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAccount, getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  CpAmm,
  CP_AMM_PROGRAM_ID,
  deriveCustomizablePoolAddress,
  derivePoolAuthority,
  derivePositionAddress,
  derivePositionNftAccount,
  deriveTokenVaultAddress,
  getCurrentPoint,
  getFeeTimeSchedulerParams,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  SwapMode,
} from "@meteora-ag/cp-amm-sdk";
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
  SALE_SUPPLY,
  TOTAL_MEME_SUPPLY,
} from "./helpers";
import * as fs from "fs";
import * as path from "path";

describe("06 - StreetFun Protocol: Lifecycle Safety (test collateral)", () => {
  // Participants: On devnet, admin acts as creator and stock provider to leverage funded keys
  const creator = isDevnet ? protocolAdmin : Keypair.generate();
  const traderAlice = Keypair.generate();
  const stockProvider = isDevnet ? protocolAdmin : Keypair.generate();

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
  let equityDammV2Pool: PublicKey;
  let marketAmm: CpAmm;
  const marketPositionNft = Keypair.generate();

  const txReceipts: Record<string, any> = {};

  before(async () => {
    // Fund all participants with SOL
    await airdropSol(provider.connection, creator.publicKey, 5);
    await airdropSol(provider.connection, traderAlice.publicKey, 2);
    await airdropSol(provider.connection, stockProvider.publicKey, 2);

    // Dynamic Mints (re-uses existing on devnet, generates fresh on localnet)
    quoteMint = await getTestQuoteMint(provider.connection, creator);
    equityMint = await getTestEquityMint(provider.connection, stockProvider);

    // The source market is a real Meteora DAMM v2 pool seeded with test-only
    // collateral. Devnet Tessera assets are not minted or represented here.
    const marketSeedAmount = new BN(2_000_000_000_000);
    await mintToAta(provider.connection, creator, quoteMint, stockProvider.publicKey, 2_000_000_000_000n, creator);
    await mintToAta(provider.connection, creator, equityMint, stockProvider.publicKey, 2_000_000_000_000n, stockProvider);
    marketAmm = new CpAmm(provider.connection);
    const marketPoolParams = marketAmm.preparePoolCreationParams({
      tokenAAmount: marketSeedAmount,
      tokenBAmount: marketSeedAmount,
      minSqrtPrice: new BN(MIN_SQRT_PRICE.toString()),
      maxSqrtPrice: new BN(MAX_SQRT_PRICE.toString()),
      collectFeeMode: CollectFeeMode.BothToken,
    });
    const market = await marketAmm.createCustomPool({
      payer: stockProvider.publicKey,
      creator: stockProvider.publicKey,
      positionNft: marketPositionNft.publicKey,
      tokenAMint: quoteMint,
      tokenBMint: equityMint,
      tokenAAmount: marketSeedAmount,
      tokenBAmount: marketSeedAmount,
      sqrtMinPrice: new BN(MIN_SQRT_PRICE.toString()),
      sqrtMaxPrice: new BN(MAX_SQRT_PRICE.toString()),
      liquidityDelta: marketPoolParams.liquidityDelta,
      initSqrtPrice: marketPoolParams.initSqrtPrice,
      poolFees: {
        baseFee: getFeeTimeSchedulerParams(25, 25, BaseFeeMode.FeeTimeSchedulerLinear, 0, 0),
        compoundingFeeBps: 0,
        padding: 0,
        dynamicFee: null,
      },
      hasAlphaVault: false,
      collectFeeMode: CollectFeeMode.BothToken,
      activationType: ActivationType.Slot,
      activationPoint: null,
      tokenAProgram: TOKEN_PROGRAM_ID,
      tokenBProgram: TOKEN_PROGRAM_ID,
    });
    market.tx.feePayer = stockProvider.publicKey;
    const marketTx = await sendAndConfirmTransaction(provider.connection, market.tx, [stockProvider, marketPositionNft]);
    equityDammV2Pool = market.pool;
    txReceipts["00_test_equity_market"] = {
      action: "CREATE_TEST_COLLATERAL_DAMM_V2_MARKET",
      txSignature: marketTx,
      pool: equityDammV2Pool.toBase58(),
      quoteMint: quoteMint.toBase58(),
      testEquityMint: equityMint.toBase58(),
    };
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
        meteoraDammV2Pool: null,
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

  it("Step 4: Settles both legs into collateral and a Meteora DAMM v2 pool", async () => {
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

    const sourceMarketBefore = await marketAmm.fetchPoolState(equityDammV2Pool);
    const sourceQuoteBefore = await safeGetAccount(provider.connection, sourceMarketBefore.tokenAVault);
    const sourceEquityBefore = await safeGetAccount(provider.connection, sourceMarketBefore.tokenBVault);
    const curveAtThreshold = await (program.account as any).curveAccount.fetch(curvePda);
    expect(BigInt(curveAtThreshold.realQuoteReserves.toString()) >= thresholdUnits).to.equal(true);
    const treasuryBefore = await safeGetAccount(provider.connection, treasuryVaultPda);
    const quoteForEquity = new BN((BigInt(curveAtThreshold.realQuoteReserves.toString()) / 2n).toString());
    const currentPoint = await getCurrentPoint(provider.connection, sourceMarketBefore.activationType as any);
    const equityQuote = marketAmm.getQuote2({
      inputTokenMint: quoteMint,
      slippage: 100,
      currentPoint,
      poolState: sourceMarketBefore,
      tokenADecimal: 6,
      tokenBDecimal: 6,
      hasReferral: false,
      swapMode: SwapMode.ExactIn,
      amountIn: quoteForEquity,
    });
    expect(equityQuote.minimumAmountOut?.gt(new BN(0))).to.equal(true);

    const quoteForLiquidity = new BN((BigInt(curveAtThreshold.realQuoteReserves.toString()) - BigInt(quoteForEquity.toString())).toString());
    const expectedPoolTokens = new BN((BigInt(curveAtThreshold.realTokenReserves.toString()) + BigInt(TOTAL_MEME_SUPPLY.toString()) - BigInt(SALE_SUPPLY.toString())).toString());
    const positionNftMint = Keypair.generate();
    const destinationPool = deriveCustomizablePoolAddress(quoteMint, memeMint);
    const destinationPosition = derivePositionAddress(positionNftMint.publicKey);
    const destinationPositionNftAccount = derivePositionNftAccount(positionNftMint.publicKey);
    const destinationQuoteVault = deriveTokenVaultAddress(quoteMint, destinationPool);
    const destinationMemeVault = deriveTokenVaultAddress(memeMint, destinationPool);
    const preparedDestinationPool = marketAmm.preparePoolCreationParams({
      tokenAAmount: quoteForLiquidity,
      tokenBAmount: expectedPoolTokens,
      minSqrtPrice: new BN(MIN_SQRT_PRICE.toString()),
      maxSqrtPrice: new BN(MAX_SQRT_PRICE.toString()),
      collectFeeMode: CollectFeeMode.BothToken,
    });
    const callerQuoteAta = await safeGetOrCreateAta(provider.connection, creator, quoteMint, traderAlice.publicKey);
    const callerMemeAta = await safeGetOrCreateAta(provider.connection, creator, memeMint, traderAlice.publicKey);
    const callerQuoteBefore = await safeGetAccount(provider.connection, callerQuoteAta.address);
    const callerMemeBefore = await safeGetAccount(provider.connection, callerMemeAta.address);
    const [globalConfig] = deriveGlobalConfigPda();
    const dammV2EventAuthority = PublicKey.findProgramAddressSync([Buffer.from("__event_authority")], CP_AMM_PROGRAM_ID)[0];
    const graduationSignature = await (program.methods as any)
      .graduateAndExecuteStock({
        minEquityTokensExpected: equityQuote.minimumAmountOut,
        poolLiquidity: preparedDestinationPool.liquidityDelta,
        poolSqrtPrice: preparedDestinationPool.initSqrtPrice,
      })
      .accounts({
        caller: traderAlice.publicKey,
        globalConfig,
        memeMint,
        quoteMint,
        targetEquityMint: equityMint,
        curve: curvePda,
        tokenVault: tokenVaultPda,
        quoteVault: quoteVaultPda,
        treasuryVault: treasuryVaultPda,
        equityDammV2Pool: equityDammV2Pool,
        equityReserveA: sourceMarketBefore.tokenAVault,
        equityReserveB: sourceMarketBefore.tokenBVault,
        equityTokenAMint: sourceMarketBefore.tokenAMint,
        equityTokenBMint: sourceMarketBefore.tokenBMint,
        equityTokenAProgram: TOKEN_PROGRAM_ID,
        equityTokenBProgram: TOKEN_PROGRAM_ID,
        callerQuoteAccount: callerQuoteAta.address,
        callerMemeAccount: callerMemeAta.address,
        dammV2Pool: destinationPool,
        positionNftMint: positionNftMint.publicKey,
        positionNftAccount: destinationPositionNftAccount,
        dammV2Position: destinationPosition,
        dammV2QuoteVault: destinationQuoteVault,
        dammV2MemeVault: destinationMemeVault,
        dammV2PoolAuthority: derivePoolAuthority(),
        dammV2EventAuthority,
        dammV2Program: CP_AMM_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        equityTokenProgram: TOKEN_PROGRAM_ID,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([traderAlice, positionNftMint])
      .rpc();

    const curveAfterGrad = await (program.account as any).curveAccount.fetch(curvePda);
    const treasuryAfter = await safeGetAccount(provider.connection, treasuryVaultPda);
    const memeMintAfterGraduation = await getMint(provider.connection, memeMint);
    const destinationQuoteBalance = await safeGetAccount(provider.connection, destinationQuoteVault);
    const destinationMemeBalance = await safeGetAccount(provider.connection, destinationMemeVault);
    const positionNft = await getAccount(provider.connection, destinationPositionNftAccount, "confirmed", TOKEN_2022_PROGRAM_ID);
    const sourceMarketAfter = await marketAmm.fetchPoolState(equityDammV2Pool);
    const sourceQuoteAfter = await safeGetAccount(provider.connection, sourceMarketAfter.tokenAVault);
    const sourceEquityAfter = await safeGetAccount(provider.connection, sourceMarketAfter.tokenBVault);
    const callerQuoteAfter = await safeGetAccount(provider.connection, callerQuoteAta.address);
    const callerMemeAfter = await safeGetAccount(provider.connection, callerMemeAta.address);
    expect(curveAfterGrad.isGraduated).to.be.true;
    expect(curveAfterGrad.meteoraDammV2Pool.equals(destinationPool)).to.be.true;
    expect(curveAfterGrad.realQuoteReserves.toString()).to.equal("0");
    expect(curveAfterGrad.realTokenReserves.toString()).to.equal("0");
    expect(curveAfterGrad.totalMemeSupply.toString()).to.equal(memeMintAfterGraduation.supply.toString());
    expect(treasuryAfter.amount > 0n).to.equal(true);
    expect(curveAfterGrad.totalEquityLocked.toString()).to.equal(treasuryAfter.amount.toString());
    expect(treasuryAfter.amount > treasuryBefore.amount).to.equal(true);
    expect(destinationQuoteBalance.amount.toString()).to.equal(quoteForLiquidity.toString());
    expect(destinationMemeBalance.amount.toString()).to.equal(expectedPoolTokens.toString());
    expect(callerQuoteAfter.amount.toString()).to.equal(callerQuoteBefore.amount.toString());
    expect(callerMemeAfter.amount.toString()).to.equal(callerMemeBefore.amount.toString());
    expect(positionNft.owner.equals(curvePda)).to.be.true;
    expect(positionNft.amount).to.equal(1n);
    expect(sourceQuoteAfter.amount > sourceQuoteBefore.amount).to.equal(true);
    expect(sourceEquityAfter.amount < sourceEquityBefore.amount).to.equal(true);
    txReceipts["04_graduation"] = {
      action: "ATOMIC_DAMM_V2_GRADUATION_SETTLEMENT",
      txSignature: graduationSignature,
      status: "graduated",
      graduationThresholdQuote,
      sourceMarket: equityDammV2Pool.toBase58(),
      destinationPool: destinationPool.toBase58(),
      quoteToEquityRaw: quoteForEquity.toString(),
      equityReceivedRaw: treasuryAfter.amount.toString(),
      quoteToDestinationPoolRaw: quoteForLiquidity.toString(),
      memeToDestinationPoolRaw: expectedPoolTokens.toString(),
      memeSupplyRaw: memeMintAfterGraduation.supply.toString(),
    };
    console.log("✅ Step 4 Verified: both settlement legs and final DAMM v2 pool are on chain. Graduation tx:", graduationSignature);
  });

  it("Step 5: Redeems collateral pro rata after graduation", async () => {
    aliceEquityAta = await safeGetOrCreateAta(
      provider.connection,
      creator,
      equityMint,
      traderAlice.publicKey
    );

    const memeToBurn = new BN(1_000_000);
    const curveBeforeRedeem = await (program.account as any).curveAccount.fetch(curvePda);
    const mintBeforeRedeem = await getMint(provider.connection, memeMint);
    const entitledEquity = BigInt(memeToBurn.toString()) * BigInt(curveBeforeRedeem.totalEquityLocked.toString()) / BigInt(mintBeforeRedeem.supply.toString());
    const equityBeforeRedeem = await safeGetAccount(provider.connection, aliceEquityAta.address);
    const redemptionSignature = await (program.methods as any)
      .burnAndRedeem({ memeTokensToBurn: memeToBurn, minEquityTokensOut: new BN(entitledEquity.toString()) })
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
    const equityAfterRedeem = await safeGetAccount(provider.connection, aliceEquityAta.address);
    const curveAfterRedeem = await (program.account as any).curveAccount.fetch(curvePda);
    expect(equityAfterRedeem.amount - equityBeforeRedeem.amount).to.equal(entitledEquity);
    expect(curveAfterRedeem.totalEquityLocked.toString()).to.equal((BigInt(curveBeforeRedeem.totalEquityLocked.toString()) - entitledEquity).toString());
    txReceipts["05_redeem"] = {
      action: "PRO_RATA_COLLATERAL_REDEMPTION",
      txSignature: redemptionSignature,
      status: "redeemed",
      memeBurnedRaw: memeToBurn.toString(),
      equityReceivedRaw: entitledEquity.toString(),
    };
    console.log("✅ Step 5 Verified: pro-rata redemption tx:", redemptionSignature);

    const artifactPath = path.resolve(
      process.cwd(),
      "target/test-artifacts/e2e_verified_transactions.json"
    );
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, JSON.stringify(txReceipts, null, 2));
    console.log("💾 Saved verified transaction receipts to e2e_verified_transactions.json");
  });
});
