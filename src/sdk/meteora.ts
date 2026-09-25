import { Connection, PublicKey } from "@solana/web3.js";
import {
  DynamicBondingCurveClient,
  DYNAMIC_BONDING_CURVE_PROGRAM_ID,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { CpAmm, type PoolState } from "@meteora-ag/cp-amm-sdk";
import { USDC_MINT } from "./constants";

export interface DbcPoolStatus {
  poolAddress: string;
  quoteMint: string;
  baseMint: string;
  realQuoteReservesUsdc: number;
  graduationThresholdUsdc: number;
  progressPct: number;
  isGraduated: boolean;
}

/** Creates a read-only Meteora DBC client for inspecting external DBC pools. */
export function getMeteoraDbcClient(connection: Connection): DynamicBondingCurveClient {
  return DynamicBondingCurveClient.create(connection);
}

/** Queries a real Meteora DBC pool; StreetFun launches currently use the native StreetFun curve. */
export async function fetchDbcPoolStatus(
  connection: Connection,
  poolAddress: PublicKey
): Promise<DbcPoolStatus> {
  const client = getMeteoraDbcClient(connection);
  const pool = await client.state.getPool(poolAddress);
  if (!pool) throw new Error("Meteora pool not found.");
  const config = await client.state.getPoolConfig(pool.poolState.config);
  if (!config || !config.quoteMint.equals(USDC_MINT)) throw new Error("Unsupported Meteora quote asset.");
  const graduationThresholdUsdc = Number(config.migrationQuoteThreshold.toString()) / 1e6;
  const realQuoteReservesUsdc = Number(pool.poolState.quoteReserve.toString()) / 1e6;
  return {
    poolAddress: poolAddress.toBase58(), quoteMint: config.quoteMint.toBase58(), baseMint: pool.poolState.baseMint.toBase58(),
    realQuoteReservesUsdc, graduationThresholdUsdc,
    progressPct: graduationThresholdUsdc > 0 ? Math.min(100, realQuoteReservesUsdc / graduationThresholdUsdc * 100) : 0,
    isGraduated: Boolean(pool.poolState.isMigrated),
  };
}

/**
 * Loads a graduated Meteora DAMM v2 pool for post-graduation liquidity
 */
export async function getMeteoraDammV2Pool(
  connection: Connection,
  dammV2PoolAddress: PublicKey
): Promise<PoolState | null> {
  try {
    return await new CpAmm(connection).fetchPoolState(dammV2PoolAddress);
  } catch (err) {
    console.warn("Could not load DAMM v2 pool state:", err);
    return null;
  }
}
