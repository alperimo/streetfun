import { Connection, PublicKey } from "@solana/web3.js";
import { CpAmm } from "@meteora-ag/cp-amm-sdk";
import { USDC_MINT } from "@/sdk/constants";
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

export function canLaunchTesseraAsset(isDevnet: boolean, existsOnCluster: boolean, testCollateral?: boolean, hasSettlementMarket = false): boolean {
  if (!existsOnCluster) return false;
  // Devnet only offers explicitly mapped test collateral. Mainnet launches must
  // use Tessera's actual on-chain T-Token mint, never a test mint.
  return isDevnet ? testCollateral === true && hasSettlementMarket : testCollateral !== true;
}

const devnetSettlementMarkets = new Map<string, { available: boolean; expiresAt: number }>();

async function hasDammV2UsdcMarket(connection: Connection, equityMint: PublicKey): Promise<boolean> {
  const cachedMarket = devnetSettlementMarkets.get(equityMint.toBase58());
  if (cachedMarket && cachedMarket.expiresAt > Date.now()) return cachedMarket.available;
  try {
    const client = new CpAmm(connection);
    const [poolsWithEquityA, poolsWithEquityB] = await Promise.all([
      client.fetchPoolStatesByTokenAMint(equityMint),
      client.fetchPoolStatesByTokenBMint(equityMint),
    ]);
    const available = [...poolsWithEquityA, ...poolsWithEquityB].some(({ account }) =>
      (account.tokenAMint.equals(USDC_MINT) && account.tokenBMint.equals(equityMint)) ||
      (account.tokenBMint.equals(USDC_MINT) && account.tokenAMint.equals(equityMint)),
    );
    devnetSettlementMarkets.set(equityMint.toBase58(), { available, expiresAt: Date.now() + 15_000 });
    return available;
  } catch {
    devnetSettlementMarkets.set(equityMint.toBase58(), { available: false, expiresAt: Date.now() + 5_000 });
    return false;
  }
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

export function resolveTesseraAssetsForNetwork(isDevnet: boolean, mainnetAssets: TesseraAsset[]): TesseraAsset[] {
  return isDevnet ? devnetTestCatalog() : mainnetAssets;
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
  // Devnet always uses the explicit local test-mint mapping. The live Tessera
  // catalog contains mainnet mints and must never leak them into Devnet flows.
  const resolvedAssets = resolveTesseraAssetsForNetwork(isDevnet, assets);
  const devnetMarkets = new Map<string, boolean>();
  if (isDevnet) {
    const supported = resolvedAssets.filter(asset => asset.testCollateral);
    const results = await Promise.all(supported.map(async asset => [
      asset.mintAddress,
      await hasDammV2UsdcMarket(connection, new PublicKey(asset.mintAddress)),
    ] as const));
    for (const [mint, available] of results) devnetMarkets.set(mint, available);
  }
  const infos = await connection.getMultipleAccountsInfo(
    resolvedAssets.map(a => new PublicKey(a.mintAddress)),
    "confirmed"
  );

  return resolvedAssets.map((asset, index) => {
    const info = infos[index];
    const validOwner = info && (info.owner.equals(TOKEN_PROGRAM_ID) || info.owner.equals(TOKEN_2022_PROGRAM_ID));
    const mint = validOwner ? unpackMint(new PublicKey(asset.mintAddress), info, info.owner) : null;
    const exists = !!mint?.isInitialized;
    const settlementMarketAvailable = !isDevnet || Boolean(devnetMarkets.get(asset.mintAddress));
    const launchEnabled = canLaunchTesseraAsset(isDevnet, exists, asset.testCollateral, settlementMarketAvailable);
    return {
      ...asset,
      existsOnConfiguredNetwork: exists,
      tokenProgram: info?.owner.toBase58() || null,
      decimals: mint?.decimals ?? 6,
      settlementMarketAvailable,
      launchEnabled,
      unavailableReason: !exists
        ? "No provider or mapped test mint exists on the configured Solana cluster."
        : launchEnabled
          ? undefined
          : isDevnet
            ? asset.testCollateral
              ? "No live Meteora market exists for this Devnet test mint and configured quote asset."
              : "This Tessera asset has no explicitly mapped Devnet test mint."
            : "A Devnet test collateral mint cannot be used on mainnet.",
    };
  });
}
