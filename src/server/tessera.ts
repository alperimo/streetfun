import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, unpackMint } from "@solana/spl-token";
import type { TesseraPreIpoAsset } from "@/sdk/constants";
import { getOfficialEquityLogo } from "@/lib/assetLogos";

export interface TesseraAsset extends TesseraPreIpoAsset {
  priceSource: "tessera-mark" | "devnet-test";
  fetchedAt: string;
  network: "mainnet-beta" | "devnet";
  testCollateral?: boolean;
}

export const TESSERA_DEVNET_TEST_MINTS: Record<string, string> = {
  "T-OpenAI": "3PFKgvU4P8hcuW1X2VjAgRHNsz1TnA4SLyjEDNfhzLC7",
  "T-SpaceX": "DiKVjAz8vGALzLwoZz7PPxUTnDsTVyF7GNx9F3BxVYEs",
  "T-Kalshi": "HjSo935gqYjDaHLMga5SRfkiACjCX5wE3ZnbQpDoqWGb",
};

export function devnetTestCollateralLabel(mint: string): string | undefined {
  const symbol = Object.entries(TESSERA_DEVNET_TEST_MINTS).find(([, address]) => address === mint)?.[0];
  return symbol ? `Devnet test (${symbol})` : undefined;
}

export function canLaunchTesseraAsset(isDevnet: boolean, existsOnCluster: boolean, testCollateral?: boolean): boolean {
  // Production launch settlement does not yet acquire Tessera inventory or initialize Meteora liquidity.
  return isDevnet && existsOnCluster && testCollateral === true;
}

function devnetTestCatalog(): TesseraAsset[] {
  return Object.entries(TESSERA_DEVNET_TEST_MINTS).map(([symbol, mintAddress]) => {
    const name = symbol.slice(2);
    return {
      symbol, ticker: symbol, name, mintAddress,
      currentStockPriceUsd: 0, issuer: "StreetFun Devnet test mint",
      custodian: "No Tessera custody on Devnet",
      legalFramework: "Testing token; no Tessera loan participation right",
      proofOfReserve: "", meteoraPoolAddress: "",
      logoUrl: getOfficialEquityLogo(name), isPreIpo: false,
      priceSource: "devnet-test", fetchedAt: new Date().toISOString(),
      network: "devnet", testCollateral: true,
    };
  });
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

let cached: { assets: TesseraAsset[]; expires: number } | undefined;
let pending: Promise<TesseraAsset[]> | undefined;
export async function getTesseraCatalog(): Promise<TesseraAsset[]> {
  if (cached && cached.expires > Date.now()) return cached.assets;
  if (pending) return pending;
  pending = (async () => {
    const response = await fetch("https://rest-api.tessera.pe/v1/public/token-details", {
      cache: "no-store", signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Tessera asset API returned ${response.status}.`);
    const assets = parseTesseraCatalog(await response.json());
    cached = { assets, expires: Date.now() + 30_000 };
    return assets;
  })().finally(() => { pending = undefined; });
  return pending;
}

export async function getTesseraAvailability(connection: Connection, assets: TesseraAsset[]) {
  const genesis = await connection.getGenesisHash();
  const isDevnet = genesis === "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
  // These are locally controlled Devnet testing mints, not Tessera-issued assets.
  const catalog = isDevnet && assets.length === 0 ? devnetTestCatalog() : assets;
  const resolvedAssets = catalog.map(asset => {
    const testMint = isDevnet ? TESSERA_DEVNET_TEST_MINTS[asset.symbol] : undefined;
    return testMint ? {
      ...asset,
      mintAddress: testMint,
      currentStockPriceUsd: 0,
      issuer: "StreetFun Devnet test mint",
      custodian: "No Tessera custody on Devnet",
      legalFramework: "Testing token; no Tessera loan participation right",
      proofOfReserve: "",
      isPreIpo: false,
      priceSource: "devnet-test" as const,
      network: "devnet" as const,
      testCollateral: true,
    } : asset;
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
      launchEnabled: canLaunchTesseraAsset(isDevnet, exists, asset.testCollateral),
      unavailableReason: !exists
        ? "No provider or mapped test mint exists on the configured Solana cluster."
        : canLaunchTesseraAsset(isDevnet, exists, asset.testCollateral)
          ? undefined
          : "Live Tessera acquisition and verified Meteora settlement are not implemented yet.",
    };
  });
}
