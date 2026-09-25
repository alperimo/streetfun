import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import {
  createProvider,
  loadProgram,
  airdropSol,
  createSplMint,
  deriveGlobalConfigPda,
  deriveCurvePda,
  deriveTokenVaultPda,
  deriveQuoteVaultPda,
  deriveTreasuryVaultPda,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TOTAL_MEME_SUPPLY,
} from "./helpers";

describe("02 - StreetFun Protocol: Launch Stonk", () => {
  const creator = Keypair.generate();
  const provider = createProvider(creator);
  const program = loadProgram(provider);

  const [globalConfigPda] = deriveGlobalConfigPda();

  let quoteMint: any;
  let equityMint: any;
  let memeMintKeypair: Keypair;

  before(async () => {
    await airdropSol(provider.connection, creator.publicKey, 10);

    quoteMint = await createSplMint(provider.connection, creator, 6);
    equityMint = await createSplMint(provider.connection, creator, 6);
    memeMintKeypair = Keypair.generate();
  });

  it("Launches a new Stonk tied to SpaceX ($SPCX)", async () => {
    const memeMint = memeMintKeypair.publicKey;
    const [curvePda, curveBump] = deriveCurvePda(memeMint);
    const [tokenVaultPda, tokenVaultBump] = deriveTokenVaultPda(curvePda);
    const [quoteVaultPda, quoteVaultBump] = deriveQuoteVaultPda(curvePda);
    const [treasuryVaultPda, treasuryVaultBump] = deriveTreasuryVaultPda(curvePda);

    const tx = await program.methods
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

    expect(tx).to.be.a("string");

    const curveAccount = await program.account.curveAccount.fetch(curvePda);
    expect(curveAccount.creator.toBase58()).to.equal(creator.publicKey.toBase58());
    expect(curveAccount.memeMint.toBase58()).to.equal(memeMint.toBase58());
    expect(curveAccount.targetEquityMint.toBase58()).to.equal(equityMint.toBase58());
    expect(curveAccount.isGraduated).to.be.false;
    expect(curveAccount.totalMemeSupply.toString()).to.equal(TOTAL_MEME_SUPPLY.toString());
    expect(curveAccount.realTokenReserves.toString()).to.equal("800000000000000"); // 800M
    expect(curveAccount.realQuoteReserves.toNumber()).to.equal(0);
    expect(curveAccount.curveBump).to.equal(curveBump);
    expect(curveAccount.tokenVaultBump).to.equal(tokenVaultBump);
    expect(curveAccount.quoteVaultBump).to.equal(quoteVaultBump);
    expect(curveAccount.treasuryVaultBump).to.equal(treasuryVaultBump);

    // Verify token vault holds 1,000,000,000 meme tokens
    const tokenVaultBalance = await provider.connection.getTokenAccountBalance(tokenVaultPda);
    expect(tokenVaultBalance.value.amount).to.equal(TOTAL_MEME_SUPPLY.toString());

    // Verify quote vault has 0 balance
    const quoteVaultBalance = await provider.connection.getTokenAccountBalance(quoteVaultPda);
    expect(quoteVaultBalance.value.amount).to.equal("0");
  });

  it("Fails when trying to launch duplicate curve for the same meme mint", async () => {
    const memeMint = memeMintKeypair.publicKey;
    const [curvePda] = deriveCurvePda(memeMint);
    const [tokenVaultPda] = deriveTokenVaultPda(curvePda);
    const [quoteVaultPda] = deriveQuoteVaultPda(curvePda);
    const [treasuryVaultPda] = deriveTreasuryVaultPda(curvePda);

    try {
      await program.methods
        .launchStonk({
          name: "Mars Colonization Token 2",
          symbol: "MARS2",
          uri: "https://streetfun.xyz/metadata/mars2.json",
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
      expect.fail("Should have failed duplicate launch");
    } catch (err: any) {
      expect(err.toString()).to.include("already in use");
    }
  });
});
