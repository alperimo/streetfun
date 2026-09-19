import type { BlockhashWithExpiryBlockHeight, Connection } from "@solana/web3.js";

export class SubmittedTransactionError extends Error {
  constructor(public readonly signature: string) {
    super(`Transaction ${signature} was submitted, but confirmation is unavailable. Check its status before placing another order.`);
    this.name = "SubmittedTransactionError";
  }
}

export async function confirmSubmittedTransaction(
  connection: Connection,
  signature: string,
  blockhash: BlockhashWithExpiryBlockHeight
): Promise<void> {
  let error;
  try {
    const result = await connection.confirmTransaction({ signature, ...blockhash }, "confirmed");
    error = result.value.err;
  } catch {
    // A timeout or RPC outage is not evidence that the transaction failed.
    const result = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true }).catch(() => null);
    const status = result?.value[0];
    if (status?.err) error = status.err;
    else if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    else throw new SubmittedTransactionError(signature);
  }
  if (error) throw new Error(`Solana rejected the transaction: ${JSON.stringify(error)}`);
}

export function pendingTradeKey(wallet: string | undefined, mint: string): string {
  return `streetfun:pending:${wallet}:${mint}`;
}

export function savePendingTrade(key: string, signature: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (signature) sessionStorage.setItem(key, signature);
    else sessionStorage.removeItem(key);
  } catch { /* In-memory confirmation still protects this open terminal. */ }
}
