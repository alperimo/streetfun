import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { expect } from "chai";

describe("streetfun protocol", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Streetfun as Program<any>;

  const admin = Keypair.generate();
  const protocolFeeRecipient = Keypair.generate();
  const creator = Keypair.generate();
  const traderAlice = Keypair.generate();
  const traderBob = Keypair.generate();
  const stockProvider = Keypair.generate(); // Simulates Jupiter / equity custodian on devnet
  const ammQuoteDest = Keypair.generate();
  const ammTokenDest = Keypair.generate();

  let quoteMint: PublicKey; // USDC mock mint (6 decimals)
  let equityMint: PublicKey; // $SPCX mock equity mint (6 decimals)
  let memeMintKeypair: Keypair; // $MARS meme token mint keypair

  let globalConfigPda: PublicKey;
  let globalConfigBump: number;

  let curvePda: PublicKey;
  let curveBump: number;

  let tokenVaultPda: PublicKey;
  let quoteVaultPda: PublicKey;
  let treasuryVaultPda: PublicKey;

  const PROTOCOL_FEE_BPS = 100; // 1%
  const GRADUATION_FEE_BPS = 150; // 1.5%
  const GRADUATION_THRESHOLD = new anchor.BN(60_000 * 1_000_000); // 60,000 USDC
  const INITIAL_VIRTUAL_QUOTE = new anchor.BN(30_000 * 1_000_000); // 30,000 USDC
  const INITIAL_VIRTUAL_TOKENS = new anchor.BN("1073000000000000"); // 1.073B tokens

  before(async () => {
    // Fund test wallets
    const airdropAccounts = [
      admin,
      creator,
      traderAlice,
      traderBob,
      stockProvider,
      ammQuoteDest,
      ammTokenDest,
    ];

    for (const acc of airdropAccounts) {
      const sig = await provider.connection.requestAirdrop(
        acc.publicKey,
        10 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }

    // Create quote mint (USDC mock, 6 decimals)
    quoteMint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      6
    );

    // Create equity mint ($SPCX mock, 6 decimals)
    equityMint = await createMint(
      provider.connection,
      admin,
      stockProvider.publicKey,
      null,
      6
    );

    // Derive Global Config PDA
    [globalConfigPda, globalConfigBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("global-config")],
      program.programId
    );
  });

  it("Initializes Global Config", async () => {
    const feeRecipientAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      admin,
      quoteMint,
      protocolFeeRecipient.publicKey
    );

    await program.methods
      .initializeGlobalConfig({
        protocolFeeBps: PROTOCOL_FEE_BPS,
        graduationFeeBps: GRADUATION_FEE_BPS,
        graduationThreshold: GRADUATION_THRESHOLD,
        initialVirtualQuoteReserves: INITIAL_VIRTUAL_QUOTE,
        initialVirtualTokenReserves: INITIAL_VIRTUAL_TOKENS,
      })
      .accounts({
        admin: admin.publicKey,
        protocolFeeRecipient: protocolFeeRecipient.publicKey,
        globalConfig: globalConfigPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const configAccount = await program.account.globalConfig.fetch(
      globalConfigPda
    );
    expect(configAccount.admin.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(configAccount.protocolFeeBps).to.equal(PROTOCOL_FEE_BPS);
    expect(configAccount.graduationThreshold.toString()).to.equal(
      GRADUATION_THRESHOLD.toString()
    );
  });

  it("Launches a new Stonk tied to SpaceX ($SPCX)", async () => {
    memeMintKeypair = Keypair.generate();

    [curvePda, curveBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("curve"), memeMintKeypair.publicKey.toBuffer()],
      program.programId
    );

    [tokenVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("token-vault"), curvePda.toBuffer()],
      program.programId
    );

    [quoteVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("quote-vault"), curvePda.toBuffer()],
      program.programId
    );

    [treasuryVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury-vault"), curvePda.toBuffer()],
      program.programId
    );

    await program.methods
      .launchStonk({
        name: "Mars Colonization Token",
        symbol: "MARS",
        uri: "https://streetfun.xyz/metadata/mars.json",
      })
      .accounts({
        creator: creator.publicKey,
        globalConfig: globalConfigPda,
        memeMint: memeMintKeypair.publicKey,
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

    const curveAccount = await program.account.curveAccount.fetch(curvePda);
    expect(curveAccount.creator.toBase58()).to.equal(
      creator.publicKey.toBase58()
    );
    expect(curveAccount.targetEquityMint.toBase58()).to.equal(
      equityMint.toBase58()
    );
    expect(curveAccount.isGraduated).to.be.false;
    expect(curveAccount.totalMemeSupply.toString()).to.equal(
      "1000000000000000"
    );
  });

  it("Traders buy meme tokens on bonding curve with price discovery", async () => {
    // Mint 10,000 USDC to Alice
    const aliceQuoteAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      traderAlice,
      quoteMint,
      traderAlice.publicKey
    );
    await mintTo(
      provider.connection,
      admin,
      quoteMint,
      aliceQuoteAta.address,
      admin,
      10_000 * 1_000_000
    );

    const aliceMemeAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      traderAlice,
      memeMintKeypair.publicKey,
      traderAlice.publicKey
    );

    const feeRecipientAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      admin,
      quoteMint,
      protocolFeeRecipient.publicKey
    );

    const buyAmountUSDC = new anchor.BN(1_000 * 1_000_000); // 1,000 USDC
    const minTokensOut = new anchor.BN(1);

    await program.methods
      .buyCurve({
        quoteAmountIn: buyAmountUSDC,
        minTokensOut: minTokensOut,
      })
      .accounts({
        buyer: traderAlice.publicKey,
        globalConfig: globalConfigPda,
        memeMint: memeMintKeypair.publicKey,
        curve: curvePda,
        tokenVault: tokenVaultPda,
        quoteVault: quoteVaultPda,
        buyerQuoteAccount: aliceQuoteAta.address,
        buyerTokenAccount: aliceMemeAta.address,
        protocolFeeAccount: feeRecipientAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([traderAlice])
      .rpc();

    const curveAccount = await program.account.curveAccount.fetch(curvePda);
    expect(curveAccount.realQuoteReserves.toNumber()).to.be.greaterThan(0);

    const aliceTokenAccount =
      await provider.connection.getTokenAccountBalance(aliceMemeAta.address);
    expect(Number(aliceTokenAccount.value.amount)).to.be.greaterThan(0);
  });

  it("Trader sells meme tokens back to curve", async () => {
    const aliceQuoteAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      traderAlice,
      quoteMint,
      traderAlice.publicKey
    );
    const aliceMemeAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      traderAlice,
      memeMintKeypair.publicKey,
      traderAlice.publicKey
    );
    const feeRecipientAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      admin,
      quoteMint,
      protocolFeeRecipient.publicKey
    );

    const sellAmount = new anchor.BN(5_000_000 * 1_000_000); // 5M meme tokens
    const minQuoteOut = new anchor.BN(1);

    await program.methods
      .sellCurve({
        tokensAmountIn: sellAmount,
        minQuoteOut: minQuoteOut,
      })
      .accounts({
        seller: traderAlice.publicKey,
        globalConfig: globalConfigPda,
        memeMint: memeMintKeypair.publicKey,
        curve: curvePda,
        tokenVault: tokenVaultPda,
        quoteVault: quoteVaultPda,
        sellerTokenAccount: aliceMemeAta.address,
        sellerQuoteAccount: aliceQuoteAta.address,
        protocolFeeAccount: feeRecipientAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([traderAlice])
      .rpc();

    const curveAccount = await program.account.curveAccount.fetch(curvePda);
    expect(curveAccount.isGraduated).to.be.false;
  });

  it("Curve hits graduation threshold and executes stock purchase into Treasury PDA", async () => {
    // Bob buys enough to hit graduation threshold (60,000 USDC)
    const bobQuoteAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      traderBob,
      quoteMint,
      traderBob.publicKey
    );
    await mintTo(
      provider.connection,
      admin,
      quoteMint,
      bobQuoteAta.address,
      admin,
      65_000 * 1_000_000
    );

    const bobMemeAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      traderBob,
      memeMintKeypair.publicKey,
      traderBob.publicKey
    );
    const feeRecipientAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      admin,
      quoteMint,
      protocolFeeRecipient.publicKey
    );

    await program.methods
      .buyCurve({
        quoteAmountIn: new anchor.BN(61_000 * 1_000_000),
        minTokensOut: new anchor.BN(1),
      })
      .accounts({
        buyer: traderBob.publicKey,
        globalConfig: globalConfigPda,
        memeMint: memeMintKeypair.publicKey,
        curve: curvePda,
        tokenVault: tokenVaultPda,
        quoteVault: quoteVaultPda,
        buyerQuoteAccount: bobQuoteAta.address,
        buyerTokenAccount: bobMemeAta.address,
        protocolFeeAccount: feeRecipientAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([traderBob])
      .rpc();

    // Prepare graduation accounts:
    // 1. Stock provider has real tokenized equity shares ($SPCX)
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

    const stockSharesToDeposit = 150 * 1_000_000; // 150 shares of $SPCX (6 decimals)
    await mintTo(
      provider.connection,
      stockProvider,
      equityMint,
      stockProviderEquityAta.address,
      stockProvider,
      stockSharesToDeposit
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

    // Call graduate_and_execute_stock
    await program.methods
      .graduateAndExecuteStock({
        minEquityTokensExpected: new anchor.BN(stockSharesToDeposit),
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

    const curveAccount = await program.account.curveAccount.fetch(curvePda);
    expect(curveAccount.isGraduated).to.be.true;
    expect(curveAccount.totalEquityLocked.toNumber()).to.equal(
      stockSharesToDeposit
    );

    // Verify Treasury Vault holds the real equity tokens
    const treasuryBalance = await provider.connection.getTokenAccountBalance(
      treasuryVaultPda
    );
    expect(Number(treasuryBalance.value.amount)).to.equal(stockSharesToDeposit);
  });

  it("Executes Burn & Redeem for pro-rata real tokenized stock", async () => {
    const bobMemeAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      traderBob,
      memeMintKeypair.publicKey,
      traderBob.publicKey
    );

    const bobEquityAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      traderBob,
      equityMint,
      traderBob.publicKey
    );

    const bobMemeBalanceBefore =
      await provider.connection.getTokenAccountBalance(bobMemeAta.address);
    const memeAmountToBurn = new anchor.BN("10000000000000"); // 10 Million meme tokens

    await program.methods
      .burnAndRedeem({
        memeTokensToBurn: memeAmountToBurn,
        minEquityTokensOut: new anchor.BN(1),
      })
      .accounts({
        redeemer: traderBob.publicKey,
        memeMint: memeMintKeypair.publicKey,
        targetEquityMint: equityMint,
        curve: curvePda,
        treasuryVault: treasuryVaultPda,
        redeemerTokenAccount: bobMemeAta.address,
        redeemerEquityAccount: bobEquityAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([traderBob])
      .rpc();

    // Verify Bob received real $SPCX shares directly in wallet
    const bobEquityBalance = await provider.connection.getTokenAccountBalance(
      bobEquityAta.address
    );
    expect(Number(bobEquityBalance.value.amount)).to.be.greaterThan(0);

    const curveAccount = await program.account.curveAccount.fetch(curvePda);
    expect(curveAccount.totalEquityLocked.toNumber()).to.be.lessThan(
      150 * 1_000_000
    );
  });
});
