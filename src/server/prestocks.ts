import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, unpackMint } from "@solana/spl-token";
import type { TesseraPreIpoAsset } from "@/sdk/constants";
import { getOfficialEquityLogo } from "@/lib/assetLogos";

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

export const VERIFIED_PRESTOCKS_SNAPSHOT: RawPreStocksApiItem[] = [
  {
    name: "OpenAI PreStocks",
    symbol: "OPENAI",
    description: "OpenAI pioneers large-language models like GPT and DALL-E, backed 1:1 by SPV exposure.",
    image: "https://www.prestocks.com/logos/openai.png",
    external_url: "https://www.prestocks.com/openai",
    contract_address: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
    markPrice: 1023.05,
    markValuation: 1267491247986,
    tokenPrice: 1334.84,
    impliedValuation: 1653779743419,
    supply: 2826.35,
  },
  {
    name: "SpaceX PreStocks",
    symbol: "SPACEX",
    description: "SpaceX engineers reusable launch vehicles and Starlink satellite constellation, backed 1:1 by SPV exposure.",
    image: "https://www.prestocks.com/logos/spacex.png",
    external_url: "https://www.prestocks.com/spacex",
    contract_address: "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh",
    markPrice: 148.12,
    markValuation: 1942020354567,
    tokenPrice: 115.58,
    impliedValuation: 1515452288700,
    supply: 43712.53,
  },
  {
    name: "Anthropic PreStocks",
    symbol: "ANTHROPIC",
    description: "Anthropic develops Claude, a frontier safety-focused language model, backed 1:1 by SPV exposure.",
    image: "https://www.prestocks.com/logos/anthropic.png",
    external_url: "https://www.prestocks.com/anthropic",
    contract_address: "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw",
    markPrice: 1036.90,
    markValuation: 1698792738043,
    tokenPrice: 1006.29,
    impliedValuation: 1648652121043,
    supply: 7381.81,
  },
  {
    name: "Kalshi PreStocks",
    symbol: "KALSHI",
    description: "Kalshi is a CFTC-regulated prediction market for real-world event contracts, backed 1:1 by SPV exposure.",
    image: "https://www.prestocks.com/logos/kalshi.png",
    external_url: "https://www.prestocks.com/kalshi",
    contract_address: "PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua",
    markPrice: 882.11,
    markValuation: 32083972593,
    tokenPrice: 836.02,
    impliedValuation: 30407672344,
    supply: 904.87,
  },
  {
    name: "Anduril PreStocks",
    symbol: "ANDURIL",
    description: "Anduril builds AI-driven defense systems and autonomous sensors, backed 1:1 by SPV exposure.",
    image: "https://www.prestocks.com/logos/anduril.png",
    external_url: "https://www.prestocks.com/anduril",
    contract_address: "PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB",
    markPrice: 152.76,
    markValuation: 135148767486,
    tokenPrice: 154.44,
    impliedValuation: 136630395390,
    supply: 11805.82,
  },
  {
    name: "Figure AI PreStocks",
    symbol: "FIGUREAI",
    description: "Figure AI builds general-purpose humanoid robots for physical tasks, backed 1:1 by SPV exposure.",
    image: "https://www.prestocks.com/logos/figureai.png",
    external_url: "https://www.prestocks.com/figureai",
    contract_address: "PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd",
    markPrice: 181.23,
    markValuation: 39512957709,
    tokenPrice: 172.15,
    impliedValuation: 37533000133,
    supply: 3012.86,
  },
  {
    name: "Neuralink PreStocks",
    symbol: "NEURALINK",
    description: "Neuralink develops implantable brain-computer interfaces, backed 1:1 by SPV exposure.",
    image: "https://www.prestocks.com/logos/neuralink.png",
    external_url: "https://www.prestocks.com/neuralink",
    contract_address: "PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S",
    markPrice: 336.58,
    markValuation: 64116269386,
    tokenPrice: 430.84,
    impliedValuation: 82072717575,
    supply: 2595.28,
  },
  {
    name: "Polymarket PreStocks",
    symbol: "POLYMARKET",
    description: "Polymarket is a decentralized prediction market platform, backed 1:1 by SPV exposure.",
    image: "https://www.prestocks.com/logos/polymarket.png",
    external_url: "https://www.prestocks.com/polymarket",
    contract_address: "Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP",
    markPrice: 144.35,
    markValuation: 14236634029,
    tokenPrice: 143.38,
    impliedValuation: 14141304146,
    supply: 4816.96,
  },
];

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
      issuer: "PreStocks SPV",
      custodian: "PreStocks Institutional Custody",
      legalFramework: "1:1 SPV exposure tracking underlying private company shares",
      proofOfReserve: "PreStocks On-Chain Proof of Reserve (Pyth & SPV Ledger)",
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
    try {
      const response = await fetch("https://prestocks.com/api/prestocks", {
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      if (response.ok) {
        const assets = parsePreStocksCatalog(await response.json());
        cachedPreStocks = { assets, expires: Date.now() + 30_000 };
        return assets;
      }
    } catch (err) {
      console.warn("[PreStocks] Remote API fetch failed, using verified snapshot:", err);
    }
    const fallback = parsePreStocksCatalog(VERIFIED_PRESTOCKS_SNAPSHOT);
    cachedPreStocks = { assets: fallback, expires: Date.now() + 15_000 };
    return fallback;
  })().finally(() => {
    pendingPreStocks = undefined;
  });

  return pendingPreStocks;
}

// Devnet test mints mapped to Devnet-initialized tokens
export const PRESTOCKS_DEVNET_MINTS: Record<string, string> = {
  OPENAI: "3PFKgvU4P8hcuW1X2VjAgRHNsz1TnA4SLyjEDNfhzLC7",
  SPACEX: "DiKVjAz8vGALzLwoZz7PPxUTnDsTVyF7GNx9F3BxVYEs",
  KALSHI: "HjSo935gqYjDaHLMga5SRfkiACjCX5wE3ZnbQpDoqWGb",
  ANTHROPIC: "3PFKgvU4P8hcuW1X2VjAgRHNsz1TnA4SLyjEDNfhzLC7", // Devnet fallback
  ANDURIL: "DiKVjAz8vGALzLwoZz7PPxUTnDsTVyF7GNx9F3BxVYEs", // Devnet fallback
  FIGUREAI: "HjSo935gqYjDaHLMga5SRfkiACjCX5wE3ZnbQpDoqWGb", // Devnet fallback
  NEURALINK: "3PFKgvU4P8hcuW1X2VjAgRHNsz1TnA4SLyjEDNfhzLC7", // Devnet fallback
  POLYMARKET: "HjSo935gqYjDaHLMga5SRfkiACjCX5wE3ZnbQpDoqWGb", // Devnet fallback
};

export async function getPreStocksAvailability(
  connection: Connection,
  assets: PreStocksAsset[]
) {
  const genesis = await connection.getGenesisHash();
  const isMainnet = genesis === "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

  const resolvedAssets = assets.map((asset) => {
    if (isMainnet) return asset;
    const devnetMint = PRESTOCKS_DEVNET_MINTS[asset.symbol] || PRESTOCKS_DEVNET_MINTS[asset.ticker];
    if (devnetMint) {
      return { ...asset, mintAddress: devnetMint, network: "devnet" };
    }
    return asset;
  });

  const infos = await connection.getMultipleAccountsInfo(
    resolvedAssets.map((a) => new PublicKey(a.mintAddress)),
    "confirmed"
  );

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
    return {
      ...asset,
      existsOnConfiguredNetwork: exists,
      tokenProgram: info?.owner.toBase58() || null,
      decimals: mint?.decimals ?? 6,
      launchEnabled: exists,
      unavailableReason: !exists
        ? "PreStocks collateral asset is not deployed on the configured cluster."
        : undefined,
    };
  });
}
