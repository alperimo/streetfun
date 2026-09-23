import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
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
  getAccount,
  Account as SplTokenAccount,
} from "@solana/spl-token";
import BN from "bn.js";
import * as fs from "fs";
import * as path from "path";
import {
  PROGRAM_ID,
  GLOBAL_CONFIG_SEED,
  CURVE_SEED,
  TOKEN_VAULT_SEED,
  QUOTE_VAULT_SEED,
  TREASURY_VAULT_SEED,
  USDC_MINT,
  VERIFIED_TESSERA_PRE_IPO_ASSETS,
} from "../src/sdk/constants";
import {
  getGlobalConfigPda,
  getCurvePda,
  getTokenVaultPda,
  getQuoteVaultPda,
  getTreasuryVaultPda,
} from "../src/sdk/pda";

export {
  BN,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
  PROGRAM_ID,
  GLOBAL_CONFIG_SEED,
  CURVE_SEED,
  TOKEN_VAULT_SEED,
  QUOTE_VAULT_SEED,
  TREASURY_VAULT_SEED,
};

// Network Detection
export const isDevnet =
  process.env.SOLANA_NETWORK === "devnet" ||
  process.env.NEXT_PUBLIC_SOLANA_NETWORK === "devnet";

export const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC ||
  (isDevnet ? "https://api.devnet.solana.com" : "http://127.0.0.1:8899");

export const LOCALNET_RPC = RPC_URL;

// Admin Keypair Resolution
export function getAdminKeypair(): Keypair {
  const localKeypairPath = path.resolve(
    process.env.HOME || "",
    ".config/solana/id.json"
  );
  if (fs.existsSync(localKeypairPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(localKeypairPath, "utf-8"));
      return Keypair.fromSecretKey(Uint8Array.from(raw));
    } catch {}
  }
  return Keypair.generate();
}

export const protocolAdmin = getAdminKeypair();

// Protocol Default Parameters (Configurable via environment)
export const PROTOCOL_FEE_BPS = 100; // 1%
export const GRADUATION_FEE_BPS = 150; // 1.5%
export const INITIAL_VIRTUAL_QUOTE = new BN(30_000 * 1_000_000); // 30,000 USDC
export const INITIAL_VIRTUAL_TOKENS = new BN("1073000000000000"); // 1.073B tokens
export const TOTAL_MEME_SUPPLY = new BN("1000000000000000"); // 1 Billion tokens

export const GRADUATION_THRESHOLD = new BN(
  (isDevnet ? 60 : 60_000) * 1_000_000
);

// Program Loader
export function loadProgram(provider: anchor.AnchorProvider): any {
  const idlPath = path.resolve(process.cwd(), "src/idl/streetfun.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  return new anchor.Program(
    { ...idl, address: PROGRAM_ID.toBase58() } as any,
    provider
  );
}

// Provider Factory
export function createProvider(walletKeypair?: Keypair): anchor.AnchorProvider {
  const connection = new Connection(RPC_URL, "confirmed");
  const keypair = walletKeypair || protocolAdmin;
  const wallet: any = {
    publicKey: keypair.publicKey,
    payer: keypair,
    signTransaction: async (tx: any) => {
      tx.partialSign(keypair);
      return tx;
    },
    signAllTransactions: async (txs: any[]) => {
      return txs.map((tx) => {
        tx.partialSign(keypair);
        return tx;
      });
    },
  };

  return new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
}

// Network-Agnostic SOL Funding Helper
export async function airdropSol(
  connection: Connection,
  recipient: PublicKey,
  solAmount = 5
): Promise<string> {
  const currentBalance = await connection.getBalance(recipient);
  if (currentBalance >= 0.1 * LAMPORTS_PER_SOL) {
    return "already_funded";
  }

  if (isDevnet) {
    // On Devnet: Transfer from admin if different, or skip if admin
    if (recipient.equals(protocolAdmin.publicKey)) {
      return "devnet_admin_funded";
    }
    const adminBalance = await connection.getBalance(protocolAdmin.publicKey);
    if (adminBalance > 0.5 * LAMPORTS_PER_SOL) {
      const tx = new anchor.web3.Transaction().add(
        SystemProgram.transfer({
          fromPubkey: protocolAdmin.publicKey,
          toPubkey: recipient,
          lamports: Math.min(solAmount, 0.2) * LAMPORTS_PER_SOL,
        })
      );
      return await anchor.web3.sendAndConfirmTransaction(connection, tx, [
        protocolAdmin,
      ]);
    }
    return "devnet_insufficient_faucet";
  }

  // On Localnet: Request standard airdrop
  const sig = await connection.requestAirdrop(
    recipient,
    solAmount * LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

// SPL Mint Helpers
export async function createSplMint(
  connection: Connection,
  payer: Keypair,
  decimals = 6,
  mintAuthority?: PublicKey
): Promise<PublicKey> {
  return await createMint(
    connection,
    payer,
    mintAuthority || payer.publicKey,
    null,
    decimals
  );
}

export async function getTestQuoteMint(
  connection: Connection,
  payer: Keypair
): Promise<PublicKey> {
  if (isDevnet) {
    return USDC_MINT;
  }
  return await createSplMint(connection, payer, 6);
}

export async function getTestEquityMint(
  connection: Connection,
  payer: Keypair,
  symbol = "$TOPAI"
): Promise<PublicKey> {
  if (isDevnet) {
    const asset = VERIFIED_TESSERA_PRE_IPO_ASSETS.find(
      (a) => a.symbol === symbol || a.ticker === symbol
    );
    if (asset) return new PublicKey(asset.mintAddress);
  }
  return await createSplMint(connection, payer, 6, payer.publicKey);
}

export async function safeGetOrCreateAta(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey
): Promise<SplTokenAccount> {
  for (let i = 0; i < 6; i++) {
    try {
      return await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        owner,
        false,
        "confirmed"
      );
    } catch {
      await new Promise((r) => setTimeout(r, 1200 + i * 800));
    }
  }
  return await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    owner,
    false,
    "confirmed"
  );
}

export async function safeGetAccount(
  connection: Connection,
  address: PublicKey
): Promise<SplTokenAccount> {
  for (let i = 0; i < 6; i++) {
    try {
      return await getAccount(connection, address, "confirmed");
    } catch {
      await new Promise((r) => setTimeout(r, 1000 + i * 800));
    }
  }
  return await getAccount(connection, address, "confirmed");
}

export async function mintToAta(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
  amount: number | bigint,
  authority?: Keypair
): Promise<SplTokenAccount> {
  const ata = await safeGetOrCreateAta(
    connection,
    payer,
    mint,
    owner
  );
  await mintTo(
    connection,
    payer,
    mint,
    ata.address,
    authority || payer,
    amount
  );
  return ata;
}

// PDA Derivations (Reuses Single Source of Truth from src/sdk/pda)
export const deriveGlobalConfigPda = () => getGlobalConfigPda(PROGRAM_ID);
export const deriveCurvePda = (memeMint: PublicKey) =>
  getCurvePda(memeMint, PROGRAM_ID);
export const deriveTokenVaultPda = (curvePda: PublicKey) =>
  getTokenVaultPda(curvePda, PROGRAM_ID);
export const deriveQuoteVaultPda = (curvePda: PublicKey) =>
  getQuoteVaultPda(curvePda, PROGRAM_ID);
export const deriveTreasuryVaultPda = (curvePda: PublicKey) =>
  getTreasuryVaultPda(curvePda, PROGRAM_ID);
