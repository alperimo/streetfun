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
  const minimumBalance = 0.1 * LAMPORTS_PER_SOL;
  if (currentBalance >= minimumBalance) {
    return "already_funded";
  }

  if (isDevnet) {
    const targetBalance = Math.min(solAmount, 0.2) * LAMPORTS_PER_SOL;
    let signature: string;
    try {
      signature = await connection.requestAirdrop(
        recipient,
        Math.max(1, targetBalance - currentBalance)
      );
      await connection.confirmTransaction(signature, "confirmed");
    } catch (airdropError) {
      const adminBalance = await connection.getBalance(protocolAdmin.publicKey);
      const needed = Math.max(1, targetBalance - currentBalance);
      if (
        !recipient.equals(protocolAdmin.publicKey) &&
        adminBalance >= needed + 5_000
      ) {
        const tx = new anchor.web3.Transaction().add(
          SystemProgram.transfer({
            fromPubkey: protocolAdmin.publicKey,
            toPubkey: recipient,
            lamports: needed,
          })
        );
        signature = await anchor.web3.sendAndConfirmTransaction(connection, tx, [
          protocolAdmin,
        ]);
      } else {
        const detail = airdropError instanceof Error ? airdropError.message : String(airdropError);
        throw new Error(
          `Devnet test preflight could not fund ${recipient.toBase58()} to ${targetBalance / LAMPORTS_PER_SOL} SOL (current ${(currentBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL). Fund this test wallet with https://faucet.solana.com or use a funded test wallet. RPC result: ${detail}`
        );
      }
    }

    const fundedBalance = await connection.getBalance(recipient, "confirmed");
    if (fundedBalance < minimumBalance) {
      throw new Error(
        `Devnet test preflight funding was not confirmed for ${recipient.toBase58()} (balance ${(fundedBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL; need at least ${minimumBalance / LAMPORTS_PER_SOL} SOL).`
      );
    }
    return signature;
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
  // Test-only mint: Devnet's configured quote mint is controlled by the
  // deployment admin, not by arbitrary test payers. Never mint against it.
  return await createSplMint(connection, payer, 6);
}

export async function getTestEquityMint(
  connection: Connection,
  payer: Keypair
): Promise<PublicKey> {
  // Test-only equity mint. The Tessera/issuer asset mint has a separate issuer
  // authority and must be exercised by a dedicated integration test.
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
