/** Cluster identities shared by browser and server transaction validation. */
export const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const MAINNET_GENESIS_HASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
export const SOLANA_GENESIS_HASHES: Readonly<Record<string, string>> = {
  devnet: DEVNET_GENESIS_HASH,
  "mainnet-beta": MAINNET_GENESIS_HASH,
};
