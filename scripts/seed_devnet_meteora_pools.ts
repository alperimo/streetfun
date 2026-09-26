import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { CpAmm } from "@meteora-ag/cp-amm-sdk";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { TESSERA_DEVNET_TEST_MINTS } from "../src/server/tessera";
import { USDC_MINT } from "../src/sdk/constants";
import { assertDevnetCluster, getServerConnection } from "../src/server/rpc";

function loadPayer(): Keypair {
  const path = process.env.ANCHOR_WALLET || process.env.SOLANA_KEYPAIR || join(homedir(), ".config/solana/id.json");
  const expandedPath = path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
  const secretKey = JSON.parse(readFileSync(expandedPath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function main() {
  const connection = getServerConnection();
  await assertDevnetCluster(connection);
  const payer = loadPayer();
  const client = new CpAmm(connection);

  const configs = await client.getStaticConfigs();
  if (!configs.length) throw new Error("No Meteora DAMM v2 configs found on Devnet.");
  const config = configs[0];
  console.log(`Using Meteora DAMM v2 config: ${config.publicKey.toBase58()}`);

  for (const [symbol, mintAddress] of Object.entries(TESSERA_DEVNET_TEST_MINTS)) {
    const equityMint = new PublicKey(mintAddress);

    // Check if a pool already exists
    const [poolsA, poolsB] = await Promise.all([
      client.fetchPoolStatesByTokenAMint(equityMint),
      client.fetchPoolStatesByTokenBMint(equityMint),
    ]);
    const existing = [...poolsA, ...poolsB].find(({ account }) =>
      (account.tokenAMint.equals(USDC_MINT) && account.tokenBMint.equals(equityMint)) ||
      (account.tokenBMint.equals(USDC_MINT) && account.tokenAMint.equals(equityMint))
    );

    if (existing) {
      console.log(`Pool already exists for ${symbol}: ${existing.publicKey.toBase58()}`);
      continue;
    }

    console.log(`Creating Meteora DAMM v2 pool for ${symbol} (${mintAddress})...`);

    let token0 = equityMint;
    let token1 = USDC_MINT;
    if (token0.toBuffer().compare(token1.toBuffer()) > 0) {
      token0 = USDC_MINT;
      token1 = equityMint;
    }

    // Seed with 1,000 USDC and 1,000 equity tokens (both 6 decimals)
    const token0Amount = new BN(1_000_000_000);
    const token1Amount = new BN(1_000_000_000);

    const prep = client.preparePoolCreationParams({
      tokenAAmount: token0Amount,
      tokenBAmount: token1Amount,
      minSqrtPrice: config.account.sqrtMinPrice,
      maxSqrtPrice: config.account.sqrtMaxPrice,
      collectFeeMode: config.account.collectFeeMode,
    });

    const positionNft = Keypair.generate();

    const tx: any = await client.createPool({
      payer: payer.publicKey,
      creator: payer.publicKey,
      config: config.publicKey,
      positionNft: positionNft.publicKey,
      tokenAMint: token0,
      tokenBMint: token1,
      tokenAAmount: token0Amount,
      tokenBAmount: token1Amount,
      initSqrtPrice: prep.initSqrtPrice,
      liquidityDelta: prep.liquidityDelta,
      activationPoint: null,
      tokenAProgram: TOKEN_PROGRAM_ID,
      tokenBProgram: TOKEN_PROGRAM_ID,
    });

    const latest = await connection.getLatestBlockhash("confirmed");
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = latest.blockhash;
    tx.partialSign(payer, positionNft);

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    const confirmation = await connection.confirmTransaction(
      { signature, ...latest },
      "confirmed"
    );

    if (confirmation.value.err) {
      throw new Error(`Failed to create pool for ${symbol}: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log(`Successfully created Meteora DAMM v2 pool for ${symbol}!`);
    console.log(`Signature: ${signature}`);
  }
}

main().catch(err => {
  console.error("Pool seeding error:", err);
  process.exitCode = 1;
});
