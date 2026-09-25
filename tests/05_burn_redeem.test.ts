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

describe("05 - StreetFun Protocol: Redemption Safety Before Graduation", () => {
  const creator = Keypair.generate();
  const traderBob = Keypair.generate();

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

  before(async () => {
    await airdropSol(provider.connection, creator.publicKey, 10);
    await airdropSol(provider.connection, traderBob.publicKey, 10);

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

    const config = await program.account.globalConfig.fetch(globalConfigPda);
    const feeRecipientAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      creator,
      quoteMint,
      config.protocolFeeRecipient
    );

    // Bob gets test quote units and buys to the graduation threshold.
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

    const curveAtThreshold = await program.account.curveAccount.fetch(curvePda);
    expect(curveAtThreshold.isGraduated).to.be.false;

    // Prepare Bob's equity ATA
    const equityAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      traderBob,
      equityMint,
      traderBob.publicKey
    );
    bobEquityAta = equityAta.address;
  });

  it("Rejects redemption before graduation without burning tokens or transferring collateral", async () => {
    const memeToBurn = new BN(10_000_000 * 1_000_000);
    const expectedEquityShares = 1_500_000; // 1.5 shares

    const bobMemeBalanceBefore = await provider.connection.getTokenAccountBalance(bobTokenAta);
    const treasuryBalanceBefore = await provider.connection.getTokenAccountBalance(treasuryVaultPda);

    try {
      await program.methods
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
          equityTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([traderBob])
        .rpc();
      expect.fail("Redemption must be unavailable before graduation");
    } catch (err: any) {
      expect(err.toString()).to.include("CurveNotGraduated");
    }

    const bobMemeBalanceAfter = await provider.connection.getTokenAccountBalance(bobTokenAta);
    const treasuryBalanceAfter = await provider.connection.getTokenAccountBalance(treasuryVaultPda);
    const bobEquityBalance = await provider.connection.getTokenAccountBalance(bobEquityAta);
    expect(bobMemeBalanceAfter.value.amount).to.equal(bobMemeBalanceBefore.value.amount);
    expect(treasuryBalanceAfter.value.amount).to.equal(treasuryBalanceBefore.value.amount);
    expect(bobEquityBalance.value.amount).to.equal("0");
  });

  it("Keeps the graduation gate ahead of redemption slippage checks", async () => {
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
          equityTokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([traderBob])
        .rpc();
      expect.fail("Redemption must be unavailable before graduation");
    } catch (err: any) {
      expect(err.toString()).to.include("CurveNotGraduated");
    }
  });
});
