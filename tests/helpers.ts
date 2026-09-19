import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
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
  Account as SplTokenAccount,
} from "@solana/spl-token";
import BN from "bn.js";
import * as fs from "fs";
import * as path from "path";

export { BN, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, SystemProgram, SYSVAR_RENT_PUBKEY, LAMPORTS_PER_SOL };

export const protocolAdmin = Keypair.generate();

export const LOCALNET_RPC = "http://127.0.0.1:8899";
export const PROGRAM_ID = new PublicKey("6ZiovCkRxRJgUaCS9uftFk3eVnGDsbnDXgUV1XHybH52");

export const GLOBAL_CONFIG_SEED = Buffer.from("global-config");
export const CURVE_SEED = Buffer.from("curve");
export const TOKEN_VAULT_SEED = Buffer.from("token-vault");
export const QUOTE_VAULT_SEED = Buffer.from("quote-vault");
export const TREASURY_VAULT_SEED = Buffer.from("treasury-vault");

export const PROTOCOL_FEE_BPS = 100; // 1%
export const GRADUATION_FEE_BPS = 150; // 1.5%
export const GRADUATION_THRESHOLD = new BN(60_000 * 1_000_000); // 60,000 USDC (6 decimals)
export const INITIAL_VIRTUAL_QUOTE = new BN(30_000 * 1_000_000); // 30,000 USDC
export const INITIAL_VIRTUAL_TOKENS = new BN("1073000000000000"); // 1.073B tokens
export const TOTAL_MEME_SUPPLY = new BN("1000000000000000"); // 1 Billion (6 decimals)

export function loadProgram(provider: anchor.AnchorProvider): any {
  const idlPath = path.resolve(process.cwd(), "target/idl/streetfun.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  return new anchor.Program(idl, provider) as any;
}

export function createProvider(walletKeypair?: Keypair): anchor.AnchorProvider {
  const connection = new Connection(LOCALNET_RPC, "confirmed");
  const wallet = walletKeypair
    ? new anchor.Wallet(walletKeypair)
    : anchor.Wallet.local();
  return new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
}

export async function airdropSol(
  connection: Connection,
  recipient: PublicKey,
  solAmount = 10
): Promise<string> {
  const sig = await connection.requestAirdrop(
    recipient,
    solAmount * LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

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

export async function mintToAta(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
  amount: number | bigint,
  authority?: Keypair
): Promise<SplTokenAccount> {
  const ata = await getOrCreateAssociatedTokenAccount(
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

export function deriveGlobalConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([GLOBAL_CONFIG_SEED], PROGRAM_ID);
}

export function deriveCurvePda(memeMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CURVE_SEED, memeMint.toBuffer()],
    PROGRAM_ID
  );
}

export function deriveTokenVaultPda(curvePda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TOKEN_VAULT_SEED, curvePda.toBuffer()],
    PROGRAM_ID
  );
}

export function deriveQuoteVaultPda(curvePda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [QUOTE_VAULT_SEED, curvePda.toBuffer()],
    PROGRAM_ID
  );
}

export function deriveTreasuryVaultPda(curvePda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TREASURY_VAULT_SEED, curvePda.toBuffer()],
    PROGRAM_ID
  );
}
