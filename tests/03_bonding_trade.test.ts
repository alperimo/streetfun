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

describe("03 - StreetFun Protocol: Bonding Curve Trading (Buy & Sell)", () => {
  const creator = Keypair.generate();
  const alice = Keypair.generate();
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
  let aliceQuoteAta: any;
  let aliceTokenAta: any;

  before(async () => {
    await airdropSol(provider.connection, creator.publicKey, 10);
    await airdropSol(provider.connection, alice.publicKey, 10);

    quoteMint = await createSplMint(provider.connection, creator, 6);
    equityMint = await createSplMint(provider.connection, creator, 6);
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

    // Fetch protocol fee recipient from config
    const config = await program.account.globalConfig.fetch(globalConfigPda);
    const feeRecipientAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      creator,
      quoteMint,
      config.protocolFeeRecipient
    );
    protocolFeeAccount = feeRecipientAta.address;

    // Fund Alice with 10,000 USDC mock
    aliceQuoteAta = await mintToAta(
      provider.connection,
      creator,
      quoteMint,
      alice.publicKey,
      10_000 * 1_000_000
    );

    const tokenAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      alice,
      memeMint,
      alice.publicKey
    );
    aliceTokenAta = tokenAta.address;
  });

  it("Alice executes buy on bonding curve with price discovery", async () => {
    const buyQuoteIn = new BN(1_000 * 1_000_000); // 1,000 USDC
    const minTokensOut = new BN(1);

    const feeBalanceBefore = await provider.connection.getTokenAccountBalance(protocolFeeAccount);

    const tx = await program.methods
      .buyCurve({
        quoteAmountIn: buyQuoteIn,
        minTokensOut: minTokensOut,
      })
      .accounts({
        buyer: alice.publicKey,
        globalConfig: globalConfigPda,
        memeMint: memeMintKeypair.publicKey,
        curve: curvePda,
        tokenVault: tokenVaultPda,
        quoteVault: quoteVaultPda,
        buyerQuoteAccount: aliceQuoteAta.address,
        buyerTokenAccount: aliceTokenAta,
        protocolFeeAccount: protocolFeeAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([alice])
      .rpc();

    expect(tx).to.be.a("string");

    // Check Alice received meme tokens
    const aliceBalance = await provider.connection.getTokenAccountBalance(aliceTokenAta);
    expect(Number(aliceBalance.value.amount)).to.be.greaterThan(0);

    // Check 1% protocol fee (10 USDC = 10,000,000 units)
    const feeBalanceAfter = await provider.connection.getTokenAccountBalance(protocolFeeAccount);
    const feeCollected = Number(feeBalanceAfter.value.amount) - Number(feeBalanceBefore.value.amount);
    expect(feeCollected).to.equal(10 * 1_000_000);

    // Check curve reserves updated
    const curveAccount = await program.account.curveAccount.fetch(curvePda);
    expect(curveAccount.realQuoteReserves.toNumber()).to.equal(990 * 1_000_000);
  });

  it("Fails buy when slippage protection is breached (minTokensOut too high)", async () => {
    const buyQuoteIn = new BN(100 * 1_000_000); // 100 USDC
    const impossibleMinTokens = new BN("999999999999999"); // Far exceeds available

    try {
      await program.methods
        .buyCurve({
          quoteAmountIn: buyQuoteIn,
          minTokensOut: impossibleMinTokens,
        })
        .accounts({
          buyer: alice.publicKey,
          globalConfig: globalConfigPda,
          memeMint: memeMintKeypair.publicKey,
          curve: curvePda,
          tokenVault: tokenVaultPda,
          quoteVault: quoteVaultPda,
          buyerQuoteAccount: aliceQuoteAta.address,
          buyerTokenAccount: aliceTokenAta,
          protocolFeeAccount: protocolFeeAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([alice])
        .rpc();
      expect.fail("Should have thrown SlippageExceeded");
    } catch (err: any) {
      expect(err.toString()).to.include("SlippageExceeded");
    }
  });

  it("Alice sells portion of meme tokens back to curve", async () => {
    const aliceBalanceBefore = await provider.connection.getTokenAccountBalance(aliceTokenAta);
    const tokensToSell = new BN(5_000_000 * 1_000_000); // 5 Million tokens
    const minQuoteOut = new BN(1);

    const tx = await program.methods
      .sellCurve({
        tokensAmountIn: tokensToSell,
        minQuoteOut: minQuoteOut,
      })
      .accounts({
        seller: alice.publicKey,
        globalConfig: globalConfigPda,
        memeMint: memeMintKeypair.publicKey,
        curve: curvePda,
        tokenVault: tokenVaultPda,
        quoteVault: quoteVaultPda,
        sellerTokenAccount: aliceTokenAta,
        sellerQuoteAccount: aliceQuoteAta.address,
        protocolFeeAccount: protocolFeeAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([alice])
      .rpc();

    expect(tx).to.be.a("string");

    const aliceBalanceAfter = await provider.connection.getTokenAccountBalance(aliceTokenAta);
    expect(Number(aliceBalanceAfter.value.amount)).to.be.lessThan(Number(aliceBalanceBefore.value.amount));

    const curveAccount = await program.account.curveAccount.fetch(curvePda);
    expect(curveAccount.isGraduated).to.be.false;
  });
});
