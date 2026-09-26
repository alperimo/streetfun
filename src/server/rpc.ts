import { Connection, clusterApiUrl } from "@solana/web3.js";

export const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

export function assertDevnetNetwork(network: string, genesisHash: string): void {
  if (network !== "devnet" || genesisHash !== DEVNET_GENESIS_HASH) {
    throw new Error("This operation is Devnet-only; the configured network and RPC must both resolve to Devnet.");
  }
}

export function getServerRpcUrl(): string {
  if (process.env.SOLANA_RPC_URL) return process.env.SOLANA_RPC_URL;
  if (process.env.NEXT_PUBLIC_SOLANA_RPC) return process.env.NEXT_PUBLIC_SOLANA_RPC;
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
  if (network === "localnet") return "http://127.0.0.1:8899";
  if (network !== "devnet" && network !== "mainnet-beta") throw new Error("Unsupported Solana network.");
  if (process.env.HELIUS_API_KEY) {
    return `https://${network === "devnet" ? "devnet" : "mainnet"}.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
  }
  return clusterApiUrl(network);
}

let connection: Connection | undefined;
export function getServerConnection(): Connection {
  return connection ??= new Connection(getServerRpcUrl(), {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
    fetch: async (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }),
  });
}

export async function assertConfiguredCluster(rpc: Connection): Promise<string> {
  const genesis = await rpc.getGenesisHash();
  const expected: Record<string, string> = {
    devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
    "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  };
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
  if (expected[network] && genesis !== expected[network]) throw new Error("RPC cluster does not match the configured network.");
  return genesis;
}

export async function assertDevnetCluster(rpc: Connection): Promise<string> {
  const genesisHash = await rpc.getGenesisHash();
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
  assertDevnetNetwork(network, genesisHash);
  return genesisHash;
}
