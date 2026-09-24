import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, unpackMint } from "@solana/spl-token";
import type { TesseraPreIpoAsset } from "@/sdk/constants";

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
      proofOfReserve: "", meteoraPoolAddress: "", logoUrl: "/generated/streetfun-logo.png",
      isPreIpo: true, priceSource: "tessera-mark", fetchedAt: now, network: "mainnet-beta",
    };
  });
}

let cached: { assets: TesseraAsset[]; expires: number } | undefined;
let pending: Promise<TesseraAsset[]> | undefined;
export async function getTesseraCatalog(): Promise<TesseraAsset[]> {
  if (cached && cached.expires > Date.now()) return cached.assets;
  if (pending) return pending;
  pending = (async () => {
    const response = await fetch("https://rest-api.tessera.pe/v1/public/token-details", {
      cache: "no-store", signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error("Tessera asset catalog is unavailable.");
    const assets = parseTesseraCatalog(await response.json());
    cached = { assets, expires: Date.now() + 30_000 };
    return assets;
  })().finally(() => { pending = undefined; });
  return pending;
}

export async function getTesseraAvailability(connection: Connection, assets: TesseraAsset[]) {
  const [genesis, infos] = await Promise.all([
    connection.getGenesisHash(),
    connection.getMultipleAccountsInfo(assets.map(a => new PublicKey(a.mintAddress)), "confirmed"),
  ]);
  return assets.map((asset, index) => {
    const info = infos[index];
    const officialNetwork = genesis === "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
    const validOwner = info && (info.owner.equals(TOKEN_PROGRAM_ID) || info.owner.equals(TOKEN_2022_PROGRAM_ID));
    const mint = validOwner ? unpackMint(new PublicKey(asset.mintAddress), info, info.owner) : null;
    const exists = !!mint?.isInitialized;
    return {
      ...asset, existsOnConfiguredNetwork: exists,
      tokenProgram: info?.owner.toBase58() || null, decimals: mint?.decimals ?? null,
      launchEnabled: false,
      unavailableReason: !officialNetwork || !exists
        ? "Tessera has no verified asset deployment on the configured network."
        : "Tessera Token-2022 support and atomic graduation settlement are not yet available.",
    };
  });
}
