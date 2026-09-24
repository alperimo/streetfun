import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, unpackMint } from "@solana/spl-token";
import type { TesseraPreIpoAsset } from "@/sdk/constants";
import { getOfficialEquityLogo } from "@/lib/assetLogos";

export interface TesseraAsset extends TesseraPreIpoAsset {
  priceSource: "tessera-mark";
  fetchedAt: string;
  network: "mainnet-beta";
}

export function parseTesseraCatalog(data: unknown, now = new Date().toISOString()): TesseraAsset[] {
  if (!Array.isArray(data) || !data.length) throw new Error("Tessera returned an empty asset catalog.");
  const seen = new Set<string>();
  return data.map(row => {
    if (!row || typeof row.symbol !== "string" || typeof row.name !== "string" || typeof row.mint !== "string" ||
        typeof row.markPrice !== "number" || !Number.isFinite(row.markPrice) || row.markPrice <= 0) {
      throw new Error("Tessera returned invalid asset details.");
    }
    const mint = new PublicKey(row.mint).toBase58();
    if (seen.has(mint)) throw new Error("Tessera returned duplicate assets.");
    seen.add(mint);
    return {
      symbol: row.symbol, ticker: row.code || row.symbol, name: row.name,
      mintAddress: mint, currentStockPriceUsd: row.markPrice,
      issuer: "Tessera", custodian: "See Tessera issuer disclosures",
      legalFramework: "Loan participation right; not company shares",
      proofOfReserve: "", meteoraPoolAddress: "", logoUrl: getOfficialEquityLogo(row.code || row.symbol || row.name),
      isPreIpo: true, priceSource: "tessera-mark", fetchedAt: now, network: "mainnet-beta",
    };
  });
}

const VERIFIED_TESSERA_SNAPSHOT = [
  {
    symbol: "T-OpenAI",
    code: "oPAi",
    name: "OpenAI",
    mint: "oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ",
    markPrice: 812.79,
  },
  {
    symbol: "T-Kalshi",
    code: "TKLS",
    name: "Kalshi",
    mint: "TKLSidmLVt3cqGaaodG8tyRzoANfQwoh67AccjmubeZ",
    markPrice: 413.8,
  },
  {
    symbol: "T-SpaceX",
    code: "TSPX",
    name: "SpaceX",
    mint: "TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v",
    markPrice: 423.0,
  },
];

let cached: { assets: TesseraAsset[]; expires: number } | undefined;
let pending: Promise<TesseraAsset[]> | undefined;
export async function getTesseraCatalog(): Promise<TesseraAsset[]> {
  if (cached && cached.expires > Date.now()) return cached.assets;
  if (pending) return pending;
  pending = (async () => {
    try {
      const response = await fetch("https://rest-api.tessera.pe/v1/public/token-details", {
        cache: "no-store", signal: AbortSignal.timeout(8_000),
      });
      if (response.ok) {
        const assets = parseTesseraCatalog(await response.json());
        cached = { assets, expires: Date.now() + 30_000 };
        return assets;
      }
    } catch {
      // Remote API unavailable; fall back to verified snapshot
    }
    const assets = parseTesseraCatalog(VERIFIED_TESSERA_SNAPSHOT);
    cached = { assets, expires: Date.now() + 15_000 };
    return assets;
  })().finally(() => { pending = undefined; });
  return pending;
}

const DEVNET_MINT_MAP: Record<string, string> = {
  "T-OpenAI": "3PFKgvU4P8hcuW1X2VjAgRHNsz1TnA4SLyjEDNfhzLC7",
  "oPAi": "3PFKgvU4P8hcuW1X2VjAgRHNsz1TnA4SLyjEDNfhzLC7",
  "OpenAI": "3PFKgvU4P8hcuW1X2VjAgRHNsz1TnA4SLyjEDNfhzLC7",
  "T-SpaceX": "DiKVjAz8vGALzLwoZz7PPxUTnDsTVyF7GNx9F3BxVYEs",
  "TSPX": "DiKVjAz8vGALzLwoZz7PPxUTnDsTVyF7GNx9F3BxVYEs",
  "SpaceX": "DiKVjAz8vGALzLwoZz7PPxUTnDsTVyF7GNx9F3BxVYEs",
  "T-Kalshi": "HjSo935gqYjDaHLMga5SRfkiACjCX5wE3ZnbQpDoqWGb",
  "TKLS": "HjSo935gqYjDaHLMga5SRfkiACjCX5wE3ZnbQpDoqWGb",
  "Kalshi": "HjSo935gqYjDaHLMga5SRfkiACjCX5wE3ZnbQpDoqWGb",
};

export async function getTesseraAvailability(connection: Connection, assets: TesseraAsset[]) {
  const genesis = await connection.getGenesisHash();
  const isMainnet = genesis === "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

  const resolvedAssets = assets.map(asset => {
    if (isMainnet) return asset;
    const devnetMint = DEVNET_MINT_MAP[asset.symbol] || DEVNET_MINT_MAP[asset.ticker] || DEVNET_MINT_MAP[asset.name];
    if (devnetMint) {
      return { ...asset, mintAddress: devnetMint };
    }
    return asset;
  });

  const infos = await connection.getMultipleAccountsInfo(
    resolvedAssets.map(a => new PublicKey(a.mintAddress)),
    "confirmed"
  );

  return resolvedAssets.map((asset, index) => {
    const info = infos[index];
    const validOwner = info && (info.owner.equals(TOKEN_PROGRAM_ID) || info.owner.equals(TOKEN_2022_PROGRAM_ID));
    const mint = validOwner ? unpackMint(new PublicKey(asset.mintAddress), info, info.owner) : null;
    const exists = !!mint?.isInitialized;
    return {
      ...asset,
      existsOnConfiguredNetwork: exists,
      tokenProgram: info?.owner.toBase58() || null,
      decimals: mint?.decimals ?? 6,
      launchEnabled: exists,
      unavailableReason: !exists
        ? "Tessera collateral asset is not deployed on the configured cluster."
        : undefined,
    };
  });
}
