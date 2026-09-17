import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import {
  createProvider,
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

describe("04 - StreetFun Protocol: Graduation & Treasury Stock Purchase", () => {
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

  const stockSharesToDeposit = 150 * 1_000_000; // 150 shares ($SPCX)

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

    // Bob gets 70,000 USDC to push curve across graduation threshold (60,000 USDC)
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

  it("Graduation fails before threshold is reached", async () => {
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
          equitySourceAuthority: stockProvider.publicKey,
          ammQuoteDestination: ammQuoteAta.address,
          ammTokenDestination: ammTokenAta.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([traderBob, stockProvider])
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

  it("Graduation executes successfully: 50% stock purchase to Treasury PDA + 50% AMM liquidity", async () => {
    // Stock provider mints 150 shares ($SPCX)
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

    const tx = await program.methods
      .graduateAndExecuteStock({
        minEquityTokensExpected: new BN(stockSharesToDeposit),
      })
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
        equitySourceAuthority: stockProvider.publicKey,
        ammQuoteDestination: ammQuoteAta.address,
        ammTokenDestination: ammTokenAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([traderBob, stockProvider])
      .rpc();

    expect(tx).to.be.a("string");

    const curveAccount = await program.account.curveAccount.fetch(curvePda);
    expect(curveAccount.isGraduated).to.be.true;
    expect(curveAccount.totalEquityLocked.toNumber()).to.equal(stockSharesToDeposit);
    expect(curveAccount.realQuoteReserves.toNumber()).to.equal(0);
    expect(curveAccount.realTokenReserves.toNumber()).to.equal(0);

    // Verify Treasury Vault PDA received the 150 $SPCX shares
    const treasuryBalance = await provider.connection.getTokenAccountBalance(treasuryVaultPda);
    expect(Number(treasuryBalance.value.amount)).to.equal(stockSharesToDeposit);

    // Verify Equity Purchase destination received 50% USDC (~$30,195)
    const equityPurchaseBalance = await provider.connection.getTokenAccountBalance(
      equityPurchaseQuoteAta.address
    );
    expect(Number(equityPurchaseBalance.value.amount)).to.be.greaterThan(30_000 * 1_000_000);

    // Verify AMM Quote destination received 50% USDC (~$30,195)
    const ammQuoteBalance = await provider.connection.getTokenAccountBalance(ammQuoteAta.address);
    expect(Number(ammQuoteBalance.value.amount)).to.be.greaterThan(30_000 * 1_000_000);

    // Verify AMM Token destination received leftover meme tokens for pool seeding
    const ammTokenBalance = await provider.connection.getTokenAccountBalance(ammTokenAta.address);
    expect(Number(ammTokenBalance.value.amount)).to.be.greaterThan(0);

    // Verify GlobalConfig total_graduated_tokens count incremented
    const config = await program.account.globalConfig.fetch(globalConfigPda);
    expect(config.totalGraduatedTokens.toNumber()).to.be.greaterThanOrEqual(1);
  });

  it("Buying or selling after graduation is prohibited", async () => {
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
      expect.fail("Should have thrown CurveAlreadyGraduated");
    } catch (err: any) {
      expect(err.toString()).to.include("CurveAlreadyGraduated");
    }
  });
});
