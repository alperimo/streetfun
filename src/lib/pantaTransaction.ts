import { Buffer } from "buffer";
import { PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import type { PantaInstruction } from "./pantaTypes";

// Anchor discriminators for the two documented USDC instructions. No transfer/approve fallback.
const discriminators = { buy: "2e89447431590df7", claim: "2ba06a33a74c141f" };
export interface PantaTransactionIntent { wallet: string; marketId: string; programId: string; usdcMint: string; kind: "buy" | "claim"; }
export function validatePantaInstructions(value: unknown, intent: PantaTransactionIntent): PantaInstruction[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) throw new Error("Invalid Panta instructions.");
  let trades = 0; let computeLimit = 0; let computePrice = 0; let memos = 0; let atas = 0;
  const result = value.map(raw => {
    if (!raw || typeof raw !== "object" || typeof raw.programId !== "string" ||
        typeof raw.data !== "string" || raw.data.length > 1400 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw.data) ||
        !Array.isArray(raw.accounts) || raw.accounts.length > 40) throw new Error("Invalid Panta instruction.");
    const programId = new PublicKey(raw.programId).toBase58();
    const accounts = raw.accounts.map((a: unknown) => {
      if (!a || typeof a !== "object") throw new Error("Invalid Panta account.");
      const account = a as Record<string, unknown>;
      if (typeof account.pubkey !== "string" || typeof account.isSigner !== "boolean" || typeof account.isWritable !== "boolean") throw new Error("Invalid Panta account.");
      const pubkey = new PublicKey(account.pubkey).toBase58();
      if (account.isSigner && pubkey !== intent.wallet) throw new Error("Unexpected transaction signer.");
      return { pubkey, isSigner: account.isSigner, isWritable: account.isWritable };
    });
    const data = Buffer.from(raw.data, "base64");
    if (programId === intent.programId) {
      trades++;
      if (data.subarray(0, 8).toString("hex") !== discriminators[intent.kind] ||
          !accounts.some((a: PantaInstruction["accounts"][number]) => a.pubkey === intent.marketId && (intent.kind === "claim" || a.isWritable)) ||
          !accounts.some((a: PantaInstruction["accounts"][number]) => a.pubkey === intent.wallet && a.isSigner) ||
          !accounts.some((a: PantaInstruction["accounts"][number]) => a.pubkey === intent.usdcMint)) throw new Error("Panta order does not match the requested market.");
      const pda = (seed: string, ...keys: PublicKey[]) => PublicKey.findProgramAddressSync([Buffer.from(seed), ...keys.map(k => k.toBuffer())], new PublicKey(intent.programId))[0].toBase58();
      const wallet = new PublicKey(intent.wallet), market = new PublicKey(intent.marketId);
      const userAta = getAssociatedTokenAddressSync(new PublicKey(intent.usdcMint), wallet).toBase58();
      if (accounts.length !== 12 || accounts[0].pubkey !== intent.wallet || !accounts[0].isSigner || !accounts[0].isWritable ||
          accounts[intent.kind === "buy" ? 1 : 2].pubkey !== intent.marketId ||
          accounts[intent.kind === "buy" ? 2 : 1].pubkey !== pda("market_config") ||
          accounts[5].pubkey !== pda("position", market, wallet) || accounts[7].pubkey !== userAta ||
          accounts[intent.kind === "buy" ? 6 : 8].pubkey !== intent.usdcMint ||
          accounts[9].pubkey !== TOKEN_PROGRAM_ID.toBase58() || accounts[10].pubkey !== ASSOCIATED_TOKEN_PROGRAM_ID.toBase58() ||
          accounts[11].pubkey !== "11111111111111111111111111111111") throw new Error("Unexpected Panta account layout.");
      if (intent.kind === "buy" && (data.length !== 17 || ![0, 1].includes(data[8]) || data.readBigUInt64LE(9) === 0n)) throw new Error("Invalid Panta purchase data.");
      if (intent.kind === "claim" && (data.length !== 40 || !data.subarray(8).equals(wallet.toBuffer()) || accounts[6].pubkey !== pda("win_claim", market, wallet))) throw new Error("Claim does not belong to this wallet.");
    } else if (programId === ComputeBudgetProgram.programId.toBase58()) {
      if (accounts.length) throw new Error("Invalid compute budget accounts.");
      if (data[0] === 2 && data.length === 5 && ++computeLimit === 1 && data.readUInt32LE(1) <= 400_000) {
        // Fixed ceiling on compute units.
      } else if (data[0] === 3 && data.length === 9 && ++computePrice === 1 && data.readBigUInt64LE(1) <= 100_000n) {
        // At most 40,000 lamports of priority fees at the CU ceiling.
      } else throw new Error("Unexpected compute fee.");
    } else if (programId === "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr") {
      if (++memos > 1 || data.length > 400 || accounts.some((a: PantaInstruction["accounts"][number]) => a.isWritable)) throw new Error("Invalid attribution memo.");
    } else if (programId === ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()) {
      const ata = getAssociatedTokenAddressSync(new PublicKey(intent.usdcMint), new PublicKey(intent.wallet)).toBase58();
      if (++atas > 1 || ![6, 7].includes(accounts.length) || (data.length && !(data.length === 1 && data[0] === 1)) ||
          accounts[0].pubkey !== intent.wallet || !accounts[0].isSigner || accounts[1].pubkey !== ata ||
          accounts[2].pubkey !== intent.wallet || accounts[3].pubkey !== intent.usdcMint ||
          accounts[4].pubkey !== "11111111111111111111111111111111" || accounts[5].pubkey !== TOKEN_PROGRAM_ID.toBase58() ||
          (accounts.length === 7 && accounts[6].pubkey !== "SysvarRent111111111111111111111111111111111"))
        throw new Error("Unexpected token account creation.");
    } else throw new Error("Unexpected transaction program.");
    return { programId, data: raw.data, accounts };
  });
  if (trades !== 1) throw new Error("A single Panta order is required.");
  return result;
}
export function compilePantaTransaction(instructions: PantaInstruction[], wallet: string, blockhash: string): VersionedTransaction {
  return new VersionedTransaction(new TransactionMessage({
    payerKey: new PublicKey(wallet), recentBlockhash: blockhash,
    instructions: instructions.map(ix => new TransactionInstruction({ programId: new PublicKey(ix.programId), data: Buffer.from(ix.data, "base64"),
      keys: ix.accounts.map(a => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })) })),
  }).compileToV0Message());
}
