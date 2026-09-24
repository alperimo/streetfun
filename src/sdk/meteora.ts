import { Connection, PublicKey } from "@solana/web3.js";
import {
  DynamicBondingCurveClient,
  DYNAMIC_BONDING_CURVE_PROGRAM_ID,
  MigrationOption,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import DLMM from "@meteora-ag/dlmm";
import {
  USDC_MINT,
  EQUITY_SPOT_BUY_RATIO,
  AMM_MIGRATION_RATIO,
} from "./constants";

export interface DbcPoolStatus {
  poolAddress: string;
  quoteMint: string;
  baseMint: string;
  realQuoteReservesUsdc: number;
  graduationThresholdUsdc: number;
  progressPct: number;
  isGraduated: boolean;
  equityPurchaseBudgetUsdc: number;
  ammLiquidityBudgetUsdc: number;
}

/**
 * Creates or retrieves a singleton Meteora Dynamic Bonding Curve Client
 */
export function getMeteoraDbcClient(connection: Connection): DynamicBondingCurveClient {
  return DynamicBondingCurveClient.create(connection);
}

/**
 * Builds the curve configuration parameters for a StreetFun token launch on Meteora DBC.
 * Targets a 60,000 USDC migration threshold to DAMM V2 / DLMM.
 */
export function buildStreetFunDbcCurveConfig(graduationThresholdUsdc: number) {
  return {
    quoteMint: USDC_MINT,
    migrationOption: MigrationOption.MET_DAMM_V2,
    migrationQuoteThreshold: graduationThresholdUsdc,
    targetPreIpoRatio: EQUITY_SPOT_BUY_RATIO,
    targetAmmRatio: AMM_MIGRATION_RATIO,
    programId: DYNAMIC_BONDING_CURVE_PROGRAM_ID,
  };
}

/**
 * Queries the live state of a Meteora DBC pool
 */
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
    equityPurchaseBudgetUsdc: realQuoteReservesUsdc * EQUITY_SPOT_BUY_RATIO,
    ammLiquidityBudgetUsdc: realQuoteReservesUsdc * AMM_MIGRATION_RATIO,
  };
}

/**
 * Loads a graduated Meteora DLMM pool instance for post-graduation liquidity
 */
export async function getMeteoraDlmmPool(
  connection: Connection,
  dlmmPoolAddress: PublicKey
): Promise<DLMM | null> {
  try {
    return await DLMM.create(connection, dlmmPoolAddress);
  } catch (err) {
    console.warn("Could not load DLMM pool instance:", err);
    return null;
  }
}
