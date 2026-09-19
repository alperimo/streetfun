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
  TOTAL_MEME_SUPPLY,
} from "./helpers";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";

describe("05 - StreetFun Protocol: Burn & Redeem for Pro-Rata Stock", () => {
  const creator = Keypair.generate();
  const traderBob = Keypair.generate();
  const stockProvider = Keypair.generate();
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
  let bobQuoteAta: any;
  let bobTokenAta: any;
  let bobEquityAta: any;

  const totalStockDeposited = 150 * 1_000_000; // 150 shares of $SPCX

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

    const config = await program.account.globalConfig.fetch(globalConfigPda);
    const feeRecipientAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      creator,
      quoteMint,
      config.protocolFeeRecipient
    );

    // Bob gets USDC and buys to graduation
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

    await program.methods
      .buyCurve({
        quoteAmountIn: new BN(61_000 * 1_000_000),
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
        protocolFeeAccount: feeRecipientAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([traderBob])
      .rpc();

    // Setup accounts for graduation
    const stockProviderEquityAta = await mintToAta(
      provider.connection,
      stockProvider,
      equityMint,
      stockProvider.publicKey,
      totalStockDeposited,
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

    // Graduate
    await program.methods
      .graduateAndExecuteStock({
        minEquityTokensExpected: new BN(totalStockDeposited),
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
        equitySourceAuthority: stockProvider.publicKey,
        ammQuoteDestination: ammQuoteAta.address,
        ammTokenDestination: ammTokenAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([protocolAdmin, stockProvider])
      .rpc();

    // Prepare Bob's equity ATA
    const equityAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      traderBob,
      equityMint,
      traderBob.publicKey
    );
    bobEquityAta = equityAta.address;
  });

  it("Trader burns meme tokens to redeem pro-rata real tokenized stock", async () => {
    // Bob burns 10,000,000 meme tokens (1% of 1B supply)
    // Entitled stock = 1% * 150 shares = 1.5 shares (1,500,000 units)
    const memeToBurn = new BN(10_000_000 * 1_000_000);
    const expectedEquityShares = 1_500_000; // 1.5 shares

    const bobMemeBalanceBefore = await provider.connection.getTokenAccountBalance(bobTokenAta);
    const treasuryBalanceBefore = await provider.connection.getTokenAccountBalance(treasuryVaultPda);

    const tx = await program.methods
      .burnAndRedeem({
        memeTokensToBurn: memeToBurn,
        minEquityTokensOut: new BN(expectedEquityShares),
      })
      .accounts({
        redeemer: traderBob.publicKey,
        memeMint: memeMintKeypair.publicKey,
        targetEquityMint: equityMint,
        curve: curvePda,
        treasuryVault: treasuryVaultPda,
        redeemerTokenAccount: bobTokenAta,
        redeemerEquityAccount: bobEquityAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([traderBob])
      .rpc();

    expect(tx).to.be.a("string");

    // 1. Verify Bob's meme token balance decreased by 10M
    const bobMemeBalanceAfter = await provider.connection.getTokenAccountBalance(bobTokenAta);
    const memeBurned = Number(bobMemeBalanceBefore.value.amount) - Number(bobMemeBalanceAfter.value.amount);
    expect(memeBurned).to.equal(10_000_000 * 1_000_000);

    // 2. Verify Bob received exactly 1.5 real $SPCX shares
    const bobEquityBalance = await provider.connection.getTokenAccountBalance(bobEquityAta);
    expect(Number(bobEquityBalance.value.amount)).to.equal(expectedEquityShares);

    // 3. Verify Treasury Vault locked balance decreased by 1.5 shares
    const treasuryBalanceAfter = await provider.connection.getTokenAccountBalance(treasuryVaultPda);
    const sharesWithdrawn = Number(treasuryBalanceBefore.value.amount) - Number(treasuryBalanceAfter.value.amount);
    expect(sharesWithdrawn).to.equal(expectedEquityShares);

    // 4. Verify curve state total_equity_locked updated
    const curveAccount = await program.account.curveAccount.fetch(curvePda);
    expect(curveAccount.totalEquityLocked.toNumber()).to.equal(totalStockDeposited - expectedEquityShares);
  });

  it("Redemption fails when minEquityTokensOut exceeds entitled amount", async () => {
    const memeToBurn = new BN(1_000_000 * 1_000_000); // 1M tokens
    const unrealisticExpectation = new BN(100 * 1_000_000); // 100 shares

    try {
      await program.methods
        .burnAndRedeem({
          memeTokensToBurn: memeToBurn,
          minEquityTokensOut: unrealisticExpectation,
        })
        .accounts({
          redeemer: traderBob.publicKey,
          memeMint: memeMintKeypair.publicKey,
          targetEquityMint: equityMint,
          curve: curvePda,
          treasuryVault: treasuryVaultPda,
          redeemerTokenAccount: bobTokenAta,
          redeemerEquityAccount: bobEquityAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([traderBob])
        .rpc();
      expect.fail("Should have thrown SlippageExceeded");
    } catch (err: any) {
      expect(err.toString()).to.include("SlippageExceeded");
    }
  });
});
