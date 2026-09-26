import { Connection } from "@solana/web3.js";
import { getPreStocksAvailability, getPreStocksCatalog } from "./prestocks";
import { getTesseraAvailability, getTesseraCatalog } from "./tessera";
import { assertConfiguredCluster, DEVNET_GENESIS_HASH } from "./rpc";

export type AssetProviderFilter = "all" | "prestocks" | "tessera";

const MAINNET_GENESIS_HASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

/** Resolve provider data and chain availability without crossing cluster identities. */
export async function getNetworkAssetCatalog(
  connection: Connection,
  provider: AssetProviderFilter = "all",
  knownGenesisHash?: string,
): Promise<any[]> {
  const genesisHash = knownGenesisHash || await assertConfiguredCluster(connection);

  if (genesisHash === DEVNET_GENESIS_HASH) {
    if (provider === "prestocks") return [];
    // Devnet uses the locally created on-chain test fixtures with live Tessera mark prices.
    const tesseraLive = await getTesseraCatalog().catch(() => []);
    return getTesseraAvailability(connection, tesseraLive, genesisHash);
  }
  if (genesisHash !== MAINNET_GENESIS_HASH) return [];

  if (provider === "prestocks") {
    return getPreStocksAvailability(connection, await getPreStocksCatalog(), genesisHash);
  }
  if (provider === "tessera") {
    return getTesseraAvailability(connection, await getTesseraCatalog(), genesisHash);
  }

  const [preStocksRaw, tesseraRaw] = await Promise.all([
    getPreStocksCatalog().catch(() => []),
    getTesseraCatalog().catch(() => []),
  ]);
  const [preStocks, tessera] = await Promise.all([
    getPreStocksAvailability(connection, preStocksRaw, genesisHash).catch(() => []),
    getTesseraAvailability(connection, tesseraRaw, genesisHash).catch(() => []),
  ]);
  return [...preStocks, ...tessera];
}
