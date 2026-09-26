import { PROGRAM_ID } from "@/sdk/constants";
import type { TokenLaunchParams } from "../types";

export interface PendingLaunch {
  version: 1;
  wallet: string;
  mint: string;
  signature: string;
  genesisHash: string;
  blockhash: string;
  lastValidBlockHeight: number;
  params: TokenLaunchParams;
}

export const LAUNCH_PENDING_EVENT = "streetfun:launch-pending";
export function pendingLaunchKey(wallet: string): string {
  return `streetfun:launch:${process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet"}:${PROGRAM_ID}:${wallet}`;
}

export function loadPendingLaunch(wallet: string): PendingLaunch | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(pendingLaunchKey(wallet));
  if (!raw) return null;
  const value = JSON.parse(raw) as PendingLaunch;
  if (value.version !== 1 || value.wallet !== wallet || !value.signature || !value.mint || !value.genesisHash || !value.blockhash || !Number.isSafeInteger(value.lastValidBlockHeight) || !value.params) {
    throw new Error("Saved launch details are unreadable. Verify your wallet history before starting another launch.");
  }
  return value;
}

export function savePendingLaunch(wallet: string, value: PendingLaunch | null): void {
  // Persistence is required BEFORE broadcasting. If storage is blocked, stop.
  if (value) localStorage.setItem(pendingLaunchKey(wallet), JSON.stringify(value));
  else localStorage.removeItem(pendingLaunchKey(wallet));
  window.dispatchEvent(new Event(LAUNCH_PENDING_EVENT));
}

const active = new Set<string>();
export async function withLaunchLock<T>(wallet: string, action: () => Promise<T>): Promise<T> {
  const key = pendingLaunchKey(wallet);
  const run = async () => {
    if (active.has(key)) throw new Error("A launch is already in progress for this wallet.");
    active.add(key);
    try { return await action(); } finally { active.delete(key); }
  };
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(key, { ifAvailable: true }, lock => {
      if (!lock) throw new Error("A launch is already in progress in another tab.");
      return run();
    });
  }
  throw new Error("This browser cannot safely coordinate launches across tabs. Use an up-to-date browser over HTTPS or localhost.");
}
