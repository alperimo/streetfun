export interface PricedAsset {
  currentStockPriceUsd?: number;
  priceSource?: string;
}

/** Return only a finite positive value supplied by a live provider or market. */
export function getAssetMarkPrice(asset?: PricedAsset | null): number {
  const price = asset?.currentStockPriceUsd;
  return typeof price === "number" && Number.isFinite(price) && price > 0 ? price : 0;
}

export function getAssetValuationSource(asset?: PricedAsset | null): string | undefined {
  if (!asset || getAssetMarkPrice(asset) <= 0) return undefined;
  if (asset.priceSource === "prestocks-api") return "PreStocks live provider mark";
  if (asset.priceSource === "tessera-mark") return "Tessera live provider mark";
  if (asset.priceSource === "devnet-test") return "Tessera live provider mark";
  return "Live collateral market";
}
