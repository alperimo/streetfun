import { getPreStocksAvailability } from "../src/server/prestocks";
import { TESSERA_DEVNET_TEST_MINTS, getTesseraAvailability } from "../src/server/tessera";
import { assertDevnetCluster, getServerConnection } from "../src/server/rpc";

async function main() {
  const connection = getServerConnection();
  await assertDevnetCluster(connection);

  // This is deliberately read-only. The fixture mints and DAMM v2 pools are
  // created by the separately authorized Devnet setup; verification submits no txs.
  const [testAssets, preStocksAssets] = await Promise.all([
    getTesseraAvailability(connection, []),
    getPreStocksAvailability(connection, []),
  ]);

  if (preStocksAssets.length) {
    throw new Error("PreStocks mainnet assets must not be aliased into the Devnet test catalog.");
  }
  const expectedSymbols = Object.keys(TESSERA_DEVNET_TEST_MINTS);
  const verified = testAssets.filter(asset => asset.existsOnConfiguredNetwork && asset.settlementMarketAvailable && asset.launchEnabled);
  console.log("Devnet test collateral and settlement markets (read-only verification)");
  for (const asset of testAssets) {
    console.log(JSON.stringify({
      symbol: asset.symbol,
      mint: asset.mintAddress,
      decimals: asset.decimals,
      testCollateral: asset.testCollateral,
      pool: asset.settlementMarketAddress || null,
      spotUsdcPerToken: asset.currentStockPriceUsd,
      launchEnabled: asset.launchEnabled,
      unavailableReason: asset.unavailableReason || null,
    }));
  }
  console.log("PreStocks assets available on Devnet: 0 (provider assets remain on their own network)");

  if (testAssets.length !== expectedSymbols.length || verified.length !== expectedSymbols.length) {
    throw new Error(`Expected ${expectedSymbols.length} deployed test mints with usable DAMM v2/USDC settlement quotes; found ${verified.length}.`);
  }
}

main().catch(error => {
  console.error("Devnet market verification failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
