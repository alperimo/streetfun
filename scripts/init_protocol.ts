import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { getGlobalConfigPda } from "../src/sdk/pda";
import { PROGRAM_ID } from "../src/sdk/constants";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  console.log("Initializing Streetfun protocol on cluster:", provider.connection.rpcEndpoint);

  const [globalConfigPda] = getGlobalConfigPda(PROGRAM_ID);
  console.log("Global Config PDA:", globalConfigPda.toBase58());

  // Protocol parameters: 1% swap fee, 1.5% graduation fee, 60,000 USDC threshold
  const protocolFeeBps = 100;
  const graduationFeeBps = 150;
  const graduationThreshold = new anchor.BN(60_000 * 1_000_000);
  const initialVirtualQuote = new anchor.BN(30_000 * 1_000_000);
  const initialVirtualTokens = new anchor.BN("1073000000000000");

  console.log("Protocol initialized successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
