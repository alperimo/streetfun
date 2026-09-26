import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, unpackMint } from "@solana/spl-token";
import type { TesseraPreIpoAsset } from "@/sdk/constants";
import { getOfficialEquityLogo } from "@/lib/assetLogos";
import { getDammV2CollateralMarket } from "./dammV2CollateralMarket";

export interface PreStocksAsset extends TesseraPreIpoAsset {
  priceSource: "prestocks-api";
  fetchedAt: string;
  network: string;
  provider: "prestocks";
  markValuation?: number;
  impliedValuation?: number;
  tokenPrice?: number;
  externalUrl?: string;
  supply?: number;
}

export interface RawPreStocksApiItem {
  name: string;
  symbol: string;
  description: string;
  image: string;
  external_url: string;
  contract_address: string;
  markPrice: number;
  markValuation: number;
  tokenPrice: number;
  impliedValuation: number;
  supply: number;
}

export function parsePreStocksCatalog(
  data: unknown,
  now = new Date().toISOString()
): PreStocksAsset[] {
  if (!Array.isArray(data) || !data.length) {
    throw new Error("PreStocks returned an empty asset catalog.");
  }
  return data.map((row: any) => {
    if (
      !row ||
      typeof row.symbol !== "string" ||
      typeof row.name !== "string" ||
      typeof row.contract_address !== "string" ||
      typeof row.markPrice !== "number" ||
      !Number.isFinite(row.markPrice) ||
      row.markPrice <= 0
    ) {
      throw new Error("PreStocks returned invalid asset details.");
    }
    const mint = new PublicKey(row.contract_address).toBase58();
    return {
      symbol: row.symbol.toUpperCase(),
      ticker: row.symbol.toUpperCase(),
      name: row.name,
      mintAddress: mint,
      currentStockPriceUsd: row.markPrice,
      tokenPrice: row.tokenPrice || row.markPrice,
      markValuation: row.markValuation,
      impliedValuation: row.impliedValuation,
      supply: row.supply,
      externalUrl: row.external_url,
      issuer: "PreStocks",
      custodian: "See PreStocks disclosures",
      legalFramework: "Economic exposure token; see provider disclosures",
      proofOfReserve: "",
      meteoraPoolAddress: "",
      logoUrl: getOfficialEquityLogo(row.symbol) || row.image || "/logos/openai.png",
      isPreIpo: true,
      priceSource: "prestocks-api",
      provider: "prestocks",
      fetchedAt: now,
      network: "mainnet-beta",
    };
  });
}

let cachedPreStocks: { assets: PreStocksAsset[]; expires: number } | undefined;
let pendingPreStocks: Promise<PreStocksAsset[]> | undefined;

export async function getPreStocksCatalog(): Promise<PreStocksAsset[]> {
  if (cachedPreStocks && cachedPreStocks.expires > Date.now()) {
    return cachedPreStocks.assets;
  }
  if (pendingPreStocks) return pendingPreStocks;

  pendingPreStocks = (async () => {
    const response = await fetch("https://prestocks.com/api/prestocks", {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`PreStocks asset API returned ${response.status}.`);
    const assets = parsePreStocksCatalog(await response.json());
    cachedPreStocks = { assets, expires: Date.now() + 30_000 };
    return assets;
  })().finally(() => {
    pendingPreStocks = undefined;
  });

  return pendingPreStocks;
}

const MAINNET_GENESIS_HASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

export function resolvePreStocksAssetsForNetwork(
  isMainnet: boolean,
  assets: PreStocksAsset[],
): PreStocksAsset[] {
  // PreStocks catalog contracts are mainnet contracts. StreetFun's Devnet
  // Tessera-style fixtures must never be presented as PreStocks assets.
  return isMainnet ? assets : [];
}

export async function getPreStocksAvailability(
  connection: Connection,
  assets: PreStocksAsset[],
  knownGenesisHash?: string,
) {
  const genesis = knownGenesisHash || await connection.getGenesisHash();
  const resolvedAssets = resolvePreStocksAssetsForNetwork(genesis === MAINNET_GENESIS_HASH, assets);
  if (!resolvedAssets.length) return [];

  const infos = await connection.getMultipleAccountsInfo(
    resolvedAssets.map((a) => new PublicKey(a.mintAddress)),
    "confirmed"
  );
  const markets = await Promise.all(resolvedAssets.map(async (asset, index) => {
    const info = infos[index];
    const validOwner = info && (info.owner.equals(TOKEN_PROGRAM_ID) || info.owner.equals(TOKEN_2022_PROGRAM_ID));
    if (!validOwner) return { available: false };
    return getDammV2CollateralMarket(connection, new PublicKey(asset.mintAddress), info);
  }));

  return resolvedAssets.map((asset, index) => {
    const info = infos[index];
    const validOwner =
      info &&
      (info.owner.equals(TOKEN_PROGRAM_ID) ||
        info.owner.equals(TOKEN_2022_PROGRAM_ID));
    const mint = validOwner
      ? unpackMint(new PublicKey(asset.mintAddress), info, info.owner)
      : null;
    const exists = !!mint?.isInitialized;
    const market = markets[index];
    const settlementMarketAvailable = Boolean(market.available);
    return {
      ...asset,
      existsOnConfiguredNetwork: exists,
      tokenProgram: info?.owner.toBase58() || null,
      decimals: mint?.decimals ?? 6,
      settlementMarketAddress: market.poolAddress,
      settlementMarketAvailable,
      launchEnabled: exists && settlementMarketAvailable,
      unavailableReason: !exists
        ? "PreStocks collateral asset is not deployed on the configured cluster."
        : !settlementMarketAvailable
          ? "No DAMM v2 / USDC pool can quote the configured settlement allocation for this asset."
        : undefined,
    };
  });
}
