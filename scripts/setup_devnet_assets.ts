import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import BN from "bn.js";

const PROGRAM_ID = new PublicKey("6ZiovCkRxRJgUaCS9uftFk3eVnGDsbnDXgUV1XHybH52");
const GLOBAL_CONFIG_SEED = Buffer.from("global-config");

async function main() {
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
  console.log(`[Devnet Setup] Connecting to ${rpcUrl}...`);
  const connection = new Connection(rpcUrl, "confirmed");

  const keypairPath = path.resolve(process.env.HOME || "", ".config/solana/id.json");
  const keypairRaw = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(keypairRaw));
  console.log(`[Devnet Setup] Admin: ${admin.publicKey.toBase58()}`);

  const balance = await connection.getBalance(admin.publicKey);
  console.log(`[Devnet Setup] Balance: ${(balance / 1e9).toFixed(4)} SOL`);

  // Path to cache mints so they stay stable across runs
  const cachePath = path.resolve(process.cwd(), ".devnet-mints.json");
  let mintsCache: Record<string, string> = {};
  if (fs.existsSync(cachePath)) {
    mintsCache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
  }

  // Helper to get or create mint
  async function getOrCreateDevnetMint(name: string, decimals: number = 6): Promise<PublicKey> {
    if (mintsCache[name]) {
      try {
        const pk = new PublicKey(mintsCache[name]);
        const acc = await connection.getAccountInfo(pk);
        if (acc) {
          console.log(`[Devnet Setup] Using existing ${name}: ${pk.toBase58()}`);
          return pk;
        }
      } catch (e) {}
    }

    console.log(`[Devnet Setup] Creating new SPL Mint for ${name}...`);
    const mint = await createMint(
      connection,
      admin,
      admin.publicKey,
      admin.publicKey,
      decimals
    );
    console.log(`[Devnet Setup] Created ${name}: ${mint.toBase58()}`);
    mintsCache[name] = mint.toBase58();
    fs.writeFileSync(cachePath, JSON.stringify(mintsCache, null, 2));

    // Mint initial tokens to admin
    await new Promise((r) => setTimeout(r, 1500));
    let ata;
    for (let i = 0; i < 5; i++) {
      try {
        ata = await getOrCreateAssociatedTokenAccount(
          connection,
          admin,
          mint,
          admin.publicKey,
          false,
          "confirmed"
        );
        break;
      } catch (err) {
        console.log(`[Devnet Setup] Retrying ATA get/create (${i + 1}/5)...`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (!ata) throw new Error(`Could not create ATA for ${name}`);
    const initialAmount = 1_000_000n * 10n ** BigInt(decimals); // 1,000,000 units
    await mintTo(connection, admin, mint, ata.address, admin.publicKey, initialAmount);
    console.log(`[Devnet Setup] Minted 1,000,000 ${name} to admin ATA: ${ata.address.toBase58()}`);

    return mint;
  }

  // 1. Setup USDC
  const usdcMint = await getOrCreateDevnetMint("USDC", 6);

  // 2. Setup Pre-IPO Equities
  const topaiMint = await getOrCreateDevnetMint("TOPAI", 6); // OpenAI
  const tspacexMint = await getOrCreateDevnetMint("TSPACEX", 6); // SpaceX
  const tstripeMint = await getOrCreateDevnetMint("TSTRIPE", 6); // Stripe
  const nvdaMint = await getOrCreateDevnetMint("NVDA", 6); // NVIDIA

  console.log("\n--- Devnet Mints Summary ---");
  console.log(`USDC_MINT:    ${usdcMint.toBase58()}`);
  console.log(`TOPAI_MINT:   ${topaiMint.toBase58()}`);
  console.log(`TSPACEX_MINT: ${tspacexMint.toBase58()}`);
  console.log(`TSTRIPE_MINT: ${tstripeMint.toBase58()}`);
  console.log(`NVDA_MINT:    ${nvdaMint.toBase58()}`);

  // 3. Update Global Config to $60 graduation threshold!
  console.log("\n[Devnet Setup] Updating Global Config graduation threshold to $60 (60,000,000 units)...");
  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const idlPath = path.resolve(process.cwd(), "src/idl/streetfun.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const program = new anchor.Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, provider);

  const [globalConfigPda] = PublicKey.findProgramAddressSync([GLOBAL_CONFIG_SEED], PROGRAM_ID);

  const tx = await (program.methods as any)
    .updateGlobalConfig({
      protocolFeeBps: null,
      graduationFeeBps: null,
      graduationThreshold: new BN(60 * 1_000_000), // $60 USDC for fast live testing/demo!
      initialVirtualQuoteReserves: null,
      initialVirtualTokenReserves: null,
      protocolFeeRecipient: null,
    })
    .accounts({
      admin: admin.publicKey,
      globalConfig: globalConfigPda,
    })
    .signers([admin])
    .rpc();

  console.log(`[Devnet Setup] Global Config updated! Tx: ${tx}`);
  console.log(`[Devnet Setup] Solscan: https://solscan.io/tx/${tx}?cluster=devnet`);

  const updatedConfig = await (program.account as any).globalConfig.fetch(globalConfigPda);
  console.log(`[Devnet Setup] Verified On-Chain Config:`, {
    admin: updatedConfig.admin.toBase58(),
    graduationThreshold: `${(Number(updatedConfig.graduationThreshold.toString()) / 1e6).toFixed(2)} USDC`,
  });
}

main().catch((err) => {
  console.error("[Devnet Setup] Error:", err);
  process.exit(1);
});
