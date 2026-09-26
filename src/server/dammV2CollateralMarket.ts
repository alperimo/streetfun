import {
  CpAmm,
  getCurrentPoint,
  getPriceFromSqrtPrice,
  SwapMode,
} from "@meteora-ag/cp-amm-sdk";
import {
  getMint,
  getTransferHook,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  unpackMint,
} from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import type { AccountInfo } from "@solana/web3.js";
import BN from "bn.js";
import { USDC_MINT } from "@/sdk/constants";
import { assertStreetFunDbcConfig, getDbcClient, getDbcConfigAddress } from "./meteoraDbc";

const partnerQuoteBudgetCache = new Map<string, { expiresAt: number; pending: Promise<bigint> }>();
const marketCache = new Map<string, { expiresAt: number; result: DammV2CollateralMarket }>();
const pendingMarkets = new Map<string, Promise<DammV2CollateralMarket>>();
const usdcMintCache = new Map<string, Promise<Awaited<ReturnType<typeof getMint>>>>();
const epochCache = new Map<string, { expiresAt: number; pending: Promise<number> }>();
const MAX_CONCURRENT_MARKET_DISCOVERIES = 2;
let activeMarketDiscoveries = 0;
const marketDiscoveryWaiters: Array<() => void> = [];

export interface DammV2CollateralMarket {
  available: boolean;
  poolAddress?: string;
  /** Spot price in configured USDC per collateral token. */
  priceUsd?: number;
  quotedOutputRaw?: string;
}

export function getUsdcPerCollateralFromSqrtPrice(
  tokenBPerTokenA: number,
  usdcIsTokenA: boolean,
): number | undefined {
  if (!Number.isFinite(tokenBPerTokenA) || tokenBPerTokenA <= 0) return undefined;
  const price = usdcIsTokenA ? 1 / tokenBPerTokenA : tokenBPerTokenA;
  return Number.isFinite(price) && price > 0 ? price : undefined;
}

async function withMarketDiscoverySlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeMarketDiscoveries >= MAX_CONCURRENT_MARKET_DISCOVERIES) {
    await new Promise<void>(resolve => marketDiscoveryWaiters.push(resolve));
  }
  activeMarketDiscoveries++;
  try {
    return await task();
  } finally {
    activeMarketDiscoveries--;
    marketDiscoveryWaiters.shift()?.();
  }
}

async function getCachedUsdcMint(connection: Connection) {
  const key = connection.rpcEndpoint;
  const cached = usdcMintCache.get(key);
  if (cached) return cached;
  const pending = getMint(connection, USDC_MINT, "confirmed", TOKEN_PROGRAM_ID);
  usdcMintCache.set(key, pending);
  try {
    return await pending;
  } catch (error) {
    usdcMintCache.delete(key);
    throw error;
  }
}

async function getCachedEpoch(connection: Connection): Promise<number> {
  const key = connection.rpcEndpoint;
  const cached = epochCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.pending;
  const pending = connection.getEpochInfo("confirmed").then(info => info.epoch);
  epochCache.set(key, { expiresAt: Date.now() + 30_000, pending });
  try {
    return await pending;
  } catch (error) {
    epochCache.delete(key);
    throw error;
  }
}

async function getPartnerQuoteBudget(connection: Connection): Promise<bigint> {
  const key = connection.rpcEndpoint;
  const cached = partnerQuoteBudgetCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.pending;

  const pending = (async () => {
    const client = getDbcClient(connection);
    const config = await assertStreetFunDbcConfig(client, getDbcConfigAddress());
    const budget = BigInt(config.migrationQuoteThreshold.toString()) / 2n;
    if (budget <= 0n) throw new Error("The DBC partner settlement quote is empty.");
    return budget;
  })();
  partnerQuoteBudgetCache.set(key, { expiresAt: Date.now() + 10_000, pending });
  try {
    return await pending;
  } catch (error) {
    partnerQuoteBudgetCache.delete(key);
    throw error;
  }
}

async function discoverMarket(
  connection: Connection,
  collateralMint: PublicKey,
  collateralMintInfo: AccountInfo<Buffer>,
  quoteBudgetRaw: bigint,
): Promise<DammV2CollateralMarket> {
  const collateralTokenProgram = collateralMintInfo.owner;
  if (!collateralTokenProgram.equals(TOKEN_PROGRAM_ID) && !collateralTokenProgram.equals(TOKEN_2022_PROGRAM_ID)) {
    return { available: false };
  }
  const collateralMintState = unpackMint(collateralMint, collateralMintInfo, collateralTokenProgram);
  // DAMM v2 settlement cannot safely execute arbitrary transfer-hook logic.
  if (collateralTokenProgram.equals(TOKEN_2022_PROGRAM_ID) && getTransferHook(collateralMintState)) {
    return { available: false };
  }

  const amm = new CpAmm(connection);
  const [poolsA, poolsB] = await Promise.all([
    amm.fetchPoolStatesByTokenAMint(collateralMint),
    amm.fetchPoolStatesByTokenBMint(collateralMint),
  ]);
  const candidates = [...new Map([...poolsA, ...poolsB]
    .filter(({ account }) => (
      (account.tokenAMint.equals(USDC_MINT) && account.tokenBMint.equals(collateralMint)) ||
      (account.tokenBMint.equals(USDC_MINT) && account.tokenAMint.equals(collateralMint))
  ))
    .map(pool => [pool.publicKey.toBase58(), pool])).values()];
  if (!candidates.length) return { available: false };

  const [usdcMint, currentEpoch] = await Promise.all([
    getCachedUsdcMint(connection),
    collateralTokenProgram.equals(TOKEN_2022_PROGRAM_ID) ? getCachedEpoch(connection) : Promise.resolve(undefined),
  ]);
  const outputTokenInfo = collateralTokenProgram.equals(TOKEN_2022_PROGRAM_ID)
    ? { mint: collateralMintState, currentEpoch: currentEpoch! }
    : undefined;

  const marketQuotes = await Promise.all(candidates.map(async (market) => {
    try {
      const usdcIsA = market.account.tokenAMint.equals(USDC_MINT);
      const currentPoint = await getCurrentPoint(connection, market.account.activationType as any);
      const quote = amm.getQuote2({
        inputTokenMint: USDC_MINT,
        slippage: 100,
        currentPoint,
        poolState: market.account,
        tokenADecimal: usdcIsA ? usdcMint.decimals : collateralMintState.decimals,
        tokenBDecimal: usdcIsA ? collateralMintState.decimals : usdcMint.decimals,
        outputTokenInfo,
        hasReferral: false,
        swapMode: SwapMode.ExactIn,
        amountIn: new BN(quoteBudgetRaw.toString()),
      });
      if (quote.outputAmount.isZero()) return null;

      const tokenBPerTokenA = Number(getPriceFromSqrtPrice(
        market.account.sqrtPrice,
        usdcIsA ? usdcMint.decimals : collateralMintState.decimals,
        usdcIsA ? collateralMintState.decimals : usdcMint.decimals,
      ).toString());
      const priceUsd = getUsdcPerCollateralFromSqrtPrice(tokenBPerTokenA, usdcIsA);
      if (!priceUsd) return null;
      return { market, quote, priceUsd };
    } catch {
      return null;
    }
  }));

  const best = marketQuotes.reduce<typeof marketQuotes[number] | null>((current, candidate) =>
    candidate && (!current || candidate.quote.outputAmount.gt(current.quote.outputAmount)) ? candidate : current,
  null);
  if (!best) return { available: false };
  return {
    available: true,
    poolAddress: best.market.publicKey.toBase58(),
    priceUsd: best.priceUsd,
    quotedOutputRaw: best.quote.outputAmount.toString(),
  };
}

export async function getDammV2CollateralMarket(
  connection: Connection,
  collateralMint: PublicKey,
  collateralMintInfo: AccountInfo<Buffer>,
): Promise<DammV2CollateralMarket> {
  let quoteBudgetRaw: bigint;
  try {
    quoteBudgetRaw = await getPartnerQuoteBudget(connection);
  } catch {
    return { available: false };
  }

  const key = `${connection.rpcEndpoint}:${collateralMint.toBase58()}:${quoteBudgetRaw}`;
  const cached = marketCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  const pending = pendingMarkets.get(key);
  if (pending) return pending;

  const request = withMarketDiscoverySlot(() =>
    discoverMarket(connection, collateralMint, collateralMintInfo, quoteBudgetRaw),
  )
    .catch((): DammV2CollateralMarket => ({ available: false }))
    .then(result => {
      marketCache.set(key, { expiresAt: Date.now() + (result.available ? 15_000 : 4_000), result });
      return result;
    })
    .finally(() => pendingMarkets.delete(key));
  pendingMarkets.set(key, request);
  return request;
}
