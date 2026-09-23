import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import BN from "bn.js";

const PROGRAM_ID = new PublicKey("6ZiovCkRxRJgUaCS9uftFk3eVnGDsbnDXgUV1XHybH52");
const GLOBAL_CONFIG_SEED = Buffer.from("global-config");

// Protocol Parameters
const PROTOCOL_FEE_BPS = 100; // 1%
const GRADUATION_FEE_BPS = 150; // 1.5%
const GRADUATION_THRESHOLD = new BN(60_000 * 1_000_000); // 60,000 USDC
const INITIAL_VIRTUAL_QUOTE = new BN(30_000 * 1_000_000); // 30,000 USDC
const INITIAL_VIRTUAL_TOKENS = new BN("1073000000000000"); // 1.073B tokens

async function main() {
  const rpcUrl = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
  console.log(`[Init Devnet] Connecting to ${rpcUrl}...`);
  const connection = new Connection(rpcUrl, "confirmed");

  const keypairPath = path.resolve(process.env.HOME || "", ".config/solana/id.json");
  if (!fs.existsSync(keypairPath)) {
    throw new Error(`Admin keypair not found at ${keypairPath}`);
  }
  const keypairRaw = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(keypairRaw));
  console.log(`[Init Devnet] Admin Pubkey: ${admin.publicKey.toBase58()}`);

  const balance = await connection.getBalance(admin.publicKey);
  console.log(`[Init Devnet] Admin Devnet Balance: ${(balance / 1e9).toFixed(4)} SOL`);

  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });

  const idlPath = path.resolve(process.cwd(), "src/idl/streetfun.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const program = new anchor.Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, provider);

  const [globalConfigPda, bump] = PublicKey.findProgramAddressSync(
    [GLOBAL_CONFIG_SEED],
    PROGRAM_ID
  );
  console.log(`[Init Devnet] Global Config PDA: ${globalConfigPda.toBase58()} (bump: ${bump})`);

  const existingAccount = await connection.getAccountInfo(globalConfigPda);
  if (existingAccount) {
    console.log(`[Init Devnet] Global Config already exists on Devnet!`);
    const data = await (program.account as any).globalConfig.fetch(globalConfigPda);
    console.log(`[Init Devnet] Existing Config:`, {
      admin: data.admin.toBase58(),
      protocolFeeBps: data.protocolFeeBps,
      graduationFeeBps: data.graduationFeeBps,
      graduationThreshold: data.graduationThreshold.toString(),
    });
    return;
  }

  console.log(`[Init Devnet] Initializing Global Config on Devnet...`);
  const tx = await program.methods
    .initializeGlobalConfig({
      protocolFeeBps: PROTOCOL_FEE_BPS,
      graduationFeeBps: GRADUATION_FEE_BPS,
      graduationThreshold: GRADUATION_THRESHOLD,
      initialVirtualQuoteReserves: INITIAL_VIRTUAL_QUOTE,
      initialVirtualTokenReserves: INITIAL_VIRTUAL_TOKENS,
    })
    .accounts({
      admin: admin.publicKey,
      protocolFeeRecipient: admin.publicKey,
      globalConfig: globalConfigPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([admin])
    .rpc();

  console.log(`[Init Devnet] SUCCESS! Tx Signature: ${tx}`);
  console.log(`[Init Devnet] Explorer: https://solscan.io/tx/${tx}?cluster=devnet`);
}

main().catch((err) => {
  console.error("[Init Devnet] Error:", err);
  process.exit(1);
});
