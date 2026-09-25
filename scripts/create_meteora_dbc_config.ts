import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import { DynamicBondingCurveClient } from "@meteora-ag/dynamic-bonding-curve-sdk";
import {
  buildStreetFunDbcConfig,
  getDbcMigrationThresholdUsdc,
  assertStreetFunDbcConfig,
} from "../src/server/meteoraDbc";
import { PROGRAM_ID, USDC_MINT } from "../src/sdk/constants";
import { assertConfiguredCluster, getServerConnection } from "../src/server/rpc";

function loadPayer(): Keypair {
  const path = process.env.ANCHOR_WALLET || process.env.SOLANA_KEYPAIR;
  if (!path) throw new Error("Set ANCHOR_WALLET to a funded cluster keypair path.");
  const expandedPath = path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
  const secretKey = JSON.parse(readFileSync(expandedPath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function main() {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
  if (network !== "devnet" && network !== "mainnet-beta") {
    throw new Error("Only Devnet and Mainnet DBC configs are supported.");
  }
  const connection = getServerConnection();
  await assertConfiguredCluster(connection);
  const payer = loadPayer();
  const client = DynamicBondingCurveClient.create(connection, "confirmed");
  const configuredAddress = process.env.NEXT_PUBLIC_METEORA_DBC_CONFIG_ADDRESS;

  if (configuredAddress) {
    const configAddress = new PublicKey(configuredAddress);
    await assertStreetFunDbcConfig(client, configAddress);
    console.log(`Meteora DBC config verified: ${configAddress.toBase58()}`);
    return;
  }

  const [globalConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("global-config")],
    PROGRAM_ID,
  );
  const config = Keypair.generate();
  const curve = buildStreetFunDbcConfig(getDbcMigrationThresholdUsdc());
  const tx = await client.partner.createConfig({
    config: config.publicKey,
    feeClaimer: globalConfig,
    leftoverReceiver: globalConfig,
    payer: payer.publicKey,
    quoteMint: USDC_MINT,
    ...curve,
  });
  const latest = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = latest.blockhash;
  tx.partialSign(payer, config);
  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  const confirmation = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  if (confirmation.value.err) throw new Error(`DBC config creation failed: ${JSON.stringify(confirmation.value.err)}`);
  const verified = await assertStreetFunDbcConfig(client, config.publicKey);
  console.log(`Meteora DBC config created and verified: ${config.publicKey.toBase58()}`);
  console.log(`Migration threshold: ${Number(verified.migrationQuoteThreshold.toString()) / 1e6} USDC`);
  console.log(`Config transaction: ${signature}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "DBC config setup failed.");
  process.exitCode = 1;
});
