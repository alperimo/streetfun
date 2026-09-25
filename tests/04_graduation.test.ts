import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
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
} from "./helpers";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { burn } from "@solana/spl-token";

describe("04 - StreetFun Protocol: Graduation Settlement Safety (test mints)", () => {
  const creator = Keypair.generate();
  const traderBob = Keypair.generate();
  const stockProvider = Keypair.generate(); // Simulates custodian / broker / Jupiter CPI
  const ammQuoteDest = Keypair.generate();
  const ammTokenDest = Keypair.generate();

  const provider = createProvider(creator);
  const program = loadProgram(provider);

  const [globalConfigPda] = deriveGlobalConfigPda();

  let quoteMint: any;
  let equityMint: any;
  let memeMintKeypair: Keypair;
  let curvePda: any;
  let tokenVaultPda: any;
  let quoteVaultPda: any;
  let treasuryVaultPda: any;
  let protocolFeeAccount: any;
  let bobQuoteAta: any;
  let bobTokenAta: any;

  const stockSharesToDeposit = 150 * 1_000_000; // 150 test-equity units

  before(async () => {
    await airdropSol(provider.connection, creator.publicKey, 10);
    await airdropSol(provider.connection, traderBob.publicKey, 10);
    await airdropSol(provider.connection, stockProvider.publicKey, 10);
    await airdropSol(provider.connection, ammQuoteDest.publicKey, 5);
    await airdropSol(provider.connection, ammTokenDest.publicKey, 5);

    quoteMint = await createSplMint(provider.connection, creator, 6);
    equityMint = await createSplMint(provider.connection, stockProvider, 6);
    memeMintKeypair = Keypair.generate();

    const memeMint = memeMintKeypair.publicKey;
    [curvePda] = deriveCurvePda(memeMint);
    [tokenVaultPda] = deriveTokenVaultPda(curvePda);
    [quoteVaultPda] = deriveQuoteVaultPda(curvePda);
    [treasuryVaultPda] = deriveTreasuryVaultPda(curvePda);

    // Launch curve
    await program.methods
      .launchStonk({
        name: "Mars Colonization Token",
        symbol: "MARS",
        uri: "https://streetfun.xyz/metadata/mars.json",
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

    // Protocol fee account
    const config = await program.account.globalConfig.fetch(globalConfigPda);
    const feeRecipientAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      creator,
      quoteMint,
      config.protocolFeeRecipient
    );
    protocolFeeAccount = feeRecipientAta.address;

    // Bob gets 70,000 units of a test-only quote mint to cross the test threshold.
    bobQuoteAta = await mintToAta(
      provider.connection,
      creator,
      quoteMint,
      traderBob.publicKey,
      70_000 * 1_000_000
    );

    const tokenAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      traderBob,
      memeMint,
      traderBob.publicKey
    );
    bobTokenAta = tokenAta.address;
  });

  it("Graduation fails before the test quote threshold is reached", async () => {
    const stockProviderEquityAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      stockProvider,
      equityMint,
      stockProvider.publicKey
    );

    const equityPurchaseQuoteAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      stockProvider,
      quoteMint,
      stockProvider.publicKey
    );

    const ammQuoteAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      ammQuoteDest,
      quoteMint,
      ammQuoteDest.publicKey
    );

    const ammTokenAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      ammTokenDest,
      memeMintKeypair.publicKey,
      ammTokenDest.publicKey
    );

    try {
      await program.methods
        .graduateAndExecuteStock({
          minEquityTokensExpected: new BN(stockSharesToDeposit),
        })
        .accounts({
          caller: protocolAdmin.publicKey,
          globalConfig: globalConfigPda,
          memeMint: memeMintKeypair.publicKey,
          targetEquityMint: equityMint,
          curve: curvePda,
          tokenVault: tokenVaultPda,
          quoteVault: quoteVaultPda,
          treasuryVault: treasuryVaultPda,
          equityPurchaseAccount: equityPurchaseQuoteAta.address,
          equitySourceAccount: stockProviderEquityAta.address,
          ammQuoteDestination: ammQuoteAta.address,
          ammTokenDestination: ammTokenAta.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          equityTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([protocolAdmin])
        .rpc();
      expect.fail("Should have failed GraduationThresholdNotReached");
    } catch (err: any) {
      expect(err.toString()).to.include("GraduationThresholdNotReached");
    }
  });

  it("Bob buys enough tokens to hit 60,000 USDC graduation threshold", async () => {
    const buyQuoteIn = new BN(61_000 * 1_000_000); // 61,000 USDC
    const minTokensOut = new BN(1);

    await program.methods
      .buyCurve({
        quoteAmountIn: buyQuoteIn,
        minTokensOut: minTokensOut,
      })
      .accounts({
        buyer: traderBob.publicKey,
        globalConfig: globalConfigPda,
        memeMint: memeMintKeypair.publicKey,
        curve: curvePda,
        tokenVault: tokenVaultPda,
        quoteVault: quoteVaultPda,
        buyerQuoteAccount: bobQuoteAta.address,
        buyerTokenAccount: bobTokenAta,
        protocolFeeAccount: protocolFeeAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([traderBob])
      .rpc();

    const curveAccount = await program.account.curveAccount.fetch(curvePda);
    expect(curveAccount.realQuoteReserves.toNumber()).to.be.greaterThanOrEqual(60_000 * 1_000_000);
  });

  it("A non-admin may request graduation, but unverified settlement remains closed", async () => {
    // Stock provider mints 150 units of the test-only equity mint.
    const stockProviderEquityAta = await mintToAta(
      provider.connection,
      stockProvider,
      equityMint,
      stockProvider.publicKey,
      stockSharesToDeposit,
      stockProvider
    );

    const equityPurchaseQuoteAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      stockProvider,
      quoteMint,
      stockProvider.publicKey
    );

    const ammQuoteAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      ammQuoteDest,
      quoteMint,
      ammQuoteDest.publicKey
    );

    const ammTokenAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      ammTokenDest,
      memeMintKeypair.publicKey,
      ammTokenDest.publicKey
    );

    const curveBefore = await program.account.curveAccount.fetch(curvePda);
    const quoteVaultBefore = await provider.connection.getTokenAccountBalance(quoteVaultPda);
    const treasuryBefore = await provider.connection.getTokenAccountBalance(treasuryVaultPda);

    try {
      await program.methods
        .graduateAndExecuteStock({
          minEquityTokensExpected: new BN(stockSharesToDeposit),
        })
        .accounts({
          // This wallet is not the configured admin. Finalization is permissionless.
          caller: traderBob.publicKey,
          globalConfig: globalConfigPda,
          memeMint: memeMintKeypair.publicKey,
          targetEquityMint: equityMint,
          curve: curvePda,
          tokenVault: tokenVaultPda,
          quoteVault: quoteVaultPda,
          treasuryVault: treasuryVaultPda,
          equityPurchaseAccount: equityPurchaseQuoteAta.address,
          equitySourceAccount: stockProviderEquityAta.address,
          ammQuoteDestination: ammQuoteAta.address,
          ammTokenDestination: ammTokenAta.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          equityTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([traderBob])
        .rpc();
      expect.fail("Settlement must remain closed until both external outcomes are verifiable");
    } catch (err: any) {
      expect(err.toString()).to.include("SettlementUnavailable");
    }

    const curveAfter = await program.account.curveAccount.fetch(curvePda);
    const quoteVaultAfter = await provider.connection.getTokenAccountBalance(quoteVaultPda);
    const treasuryAfter = await provider.connection.getTokenAccountBalance(treasuryVaultPda);
    expect(curveAfter.isGraduated).to.be.false;
    expect(curveAfter.realQuoteReserves.toString()).to.equal(curveBefore.realQuoteReserves.toString());
    expect(quoteVaultAfter.value.amount).to.equal(quoteVaultBefore.value.amount);
    expect(treasuryAfter.value.amount).to.equal(treasuryBefore.value.amount);
  });

  it("Rejects a live mint supply mismatch before any settlement", async () => {
    await burn(
      provider.connection,
      traderBob,
      bobTokenAta,
      memeMintKeypair.publicKey,
      traderBob,
      1
    );

    const stockProviderEquityAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      stockProvider,
      equityMint,
      stockProvider.publicKey
    );
    const equityPurchaseQuoteAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      stockProvider,
      quoteMint,
      stockProvider.publicKey
    );
    const ammQuoteAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      ammQuoteDest,
      quoteMint,
      ammQuoteDest.publicKey
    );
    const ammTokenAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      ammTokenDest,
      memeMintKeypair.publicKey,
      ammTokenDest.publicKey
    );

    try {
      await program.methods
        .graduateAndExecuteStock({ minEquityTokensExpected: new BN(stockSharesToDeposit) })
        .accounts({
          caller: traderBob.publicKey,
          globalConfig: globalConfigPda,
          memeMint: memeMintKeypair.publicKey,
          targetEquityMint: equityMint,
          curve: curvePda,
          tokenVault: tokenVaultPda,
          quoteVault: quoteVaultPda,
          treasuryVault: treasuryVaultPda,
          equityPurchaseAccount: equityPurchaseQuoteAta.address,
          equitySourceAccount: stockProviderEquityAta.address,
          ammQuoteDestination: ammQuoteAta.address,
          ammTokenDestination: ammTokenAta.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          equityTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([traderBob])
        .rpc();
      expect.fail("A supply mismatch must reject graduation");
    } catch (err: any) {
      expect(err.toString()).to.include("SupplyInvariantViolation");
    }
  });

  it("Keeps curve buys closed at threshold while settlement is unavailable", async () => {
    try {
      await program.methods
        .buyCurve({
          quoteAmountIn: new BN(100 * 1_000_000),
          minTokensOut: new BN(1),
        })
        .accounts({
          buyer: traderBob.publicKey,
          globalConfig: globalConfigPda,
          memeMint: memeMintKeypair.publicKey,
          curve: curvePda,
          tokenVault: tokenVaultPda,
          quoteVault: quoteVaultPda,
          buyerQuoteAccount: bobQuoteAta.address,
          buyerTokenAccount: bobTokenAta,
          protocolFeeAccount: protocolFeeAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([traderBob])
        .rpc();
      expect.fail("A curve buy cannot proceed beyond the graduation threshold");
    } catch (err: any) {
      expect(err.toString()).to.include("GraduationThresholdReached");
    }
    const curveAccount = await program.account.curveAccount.fetch(curvePda);
    expect(curveAccount.isGraduated).to.be.false;
  });
});
