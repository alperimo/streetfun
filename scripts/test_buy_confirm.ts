import { Connection, Keypair, PublicKey } from "@solana/web3.js";
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
  getTestQuoteMint,
  safeGetOrCreateAta,
  safeGetAccount,
  TOKEN_PROGRAM_ID,
  BN,
} from "../tests/helpers";

async function main() {
  const memeMint = new PublicKey("D4bvmnRPfmpv9ut3oJ4xMq6yBabv9TrgKLs1faSeMj1v");
  console.log("Executing live Devnet buy on $CLAUDE:", memeMint.toBase58());

  const provider = createProvider(protocolAdmin);
  const program = loadProgram(provider);
  const [globalConfigPda] = deriveGlobalConfigPda();
  const [curvePda] = deriveCurvePda(memeMint);
  const [tokenVaultPda] = deriveTokenVaultPda(curvePda);
  const [quoteVaultPda] = deriveQuoteVaultPda(curvePda);
  const quoteMint = await getTestQuoteMint(provider.connection, protocolAdmin);

  const traderBob = Keypair.generate();
  await airdropSol(provider.connection, traderBob.publicKey, 0.1);

  const config = await (program.account as any).globalConfig.fetch(globalConfigPda);
  const feeRecipientAta = await safeGetOrCreateAta(
    provider.connection,
    protocolAdmin,
    quoteMint,
    config.protocolFeeRecipient
  );

  const bobQuoteAta = await mintToAta(
    provider.connection,
    protocolAdmin,
    quoteMint,
    traderBob.publicKey,
    15 * 1_000_000,
    protocolAdmin
  );

  const bobTokenAta = await safeGetOrCreateAta(
    provider.connection,
    traderBob,
    memeMint,
    traderBob.publicKey
  );

  const buyTx = await (program.methods as any)
    .buyCurve({
      quoteAmountIn: new BN(12 * 1_000_000), // 12 USDC
      minTokensOut: new BN(1),
    })
    .accounts({
      buyer: traderBob.publicKey,
      globalConfig: globalConfigPda,
      memeMint: memeMint,
      curve: curvePda,
      tokenVault: tokenVaultPda,
      quoteVault: quoteVaultPda,
      buyerQuoteAccount: bobQuoteAta.address,
      buyerTokenAccount: bobTokenAta.address,
      protocolFeeAccount: feeRecipientAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([traderBob])
    .rpc();

  console.log(`✅ Buy tx confirmed on Solana Devnet: ${buyTx}`);

  // Now call /api/trades/confirm
  console.log("Confirming trade through API /api/trades/confirm...");
  const confirmRes = await fetch("http://localhost:3000/api/trades/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      signature: buyTx,
      mint: memeMint.toBase58(),
    }),
  });

  const confirmData = await confirmRes.json();
  console.log("Confirm API result:", confirmData);
}

main().catch(console.error);
