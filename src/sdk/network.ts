import { clusterApiUrl } from "@solana/web3.js";

export function getBrowserRpcUrl(): string {
  if (process.env.NEXT_PUBLIC_SOLANA_RPC) return process.env.NEXT_PUBLIC_SOLANA_RPC;
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
  if (network === "localnet") return "http://127.0.0.1:8899";
  if (network !== "devnet" && network !== "mainnet-beta") throw new Error("Unsupported Solana network.");
  return clusterApiUrl(network);
}
