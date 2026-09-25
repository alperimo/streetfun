import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DammV2BaseFeeMode,
  DammV2DynamicFeeMode,
  DynamicBondingCurveClient,
  MigratedCollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurve,
  deriveDbcPoolAddress,
  deriveDbcTokenVaultAddress,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { getGlobalConfigPda } from "@/sdk/pda";
import {
  METEORA_DAMM_V2_MIGRATION_CONFIG,
  PROGRAM_ID,
  USDC_MINT,
} from "@/sdk/constants";

export const DBC_TOTAL_SUPPLY = 1_000_000_000_000_000n;
export const DBC_MIGRATION_FEE_PERCENT = 50;

export function getDbcClient(connection: Connection) {
  return DynamicBondingCurveClient.create(connection, "confirmed");
}

export function getDbcConfigAddress(): PublicKey {
  const value = process.env.NEXT_PUBLIC_METEORA_DBC_CONFIG_ADDRESS;
  if (!value) throw new Error("Meteora DBC is not configured on this cluster.");
  try {
    return new PublicKey(value);
  } catch {
    throw new Error("The configured Meteora DBC config address is invalid.");
  }
}

export function getDbcMigrationDammConfigAddress(): PublicKey {
  const value = process.env.NEXT_PUBLIC_METEORA_DAMM_V2_MIGRATION_CONFIG;
  if (!value) return METEORA_DAMM_V2_MIGRATION_CONFIG;
  try {
    return new PublicKey(value);
  } catch {
    throw new Error("The configured Meteora DAMM v2 migration config address is invalid.");
  }
}

export function getDbcMigrationThresholdUsdc(): number {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
  const fallback = network === "mainnet-beta" ? 750 : 60;
  const threshold = Number(process.env.METEORA_DBC_MIGRATION_THRESHOLD_USDC ?? fallback);
  if (!Number.isFinite(threshold) || threshold < fallback) {
    throw new Error(`Meteora DBC graduation threshold must be at least ${fallback} USDC on ${network}.`);
  }
  return threshold;
}

/**
 * One shared partner config for a cluster: 1B fixed-supply SPL tokens, 20% of
 * supply migrates into DAMM v2, a 50% quote-side migration fee goes to
 * StreetFun's global PDA, and all DAMM v2 positions are permanently locked.
 */
export function buildStreetFunDbcConfig(migrationQuoteThresholdUsdc: number) {
  if (!Number.isFinite(migrationQuoteThresholdUsdc) || migrationQuoteThresholdUsdc <= 0) {
    throw new Error("DBC migration threshold must be a positive USDC amount.");
  }
  return buildCurve({
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: TokenDecimal.SIX,
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: Number(DBC_TOTAL_SUPPLY) / 1e6,
      leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: {
          startingFeeBps: 1_000,
          endingFeeBps: 100,
          numberOfPeriod: 60,
          totalDuration: 1_800,
        },
      },
      dynamicFeeEnabled: false,
      collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: 0,
      poolCreationFee: 0.001,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.Customizable,
      migrationFee: { feePercentage: DBC_MIGRATION_FEE_PERCENT, creatorFeePercentage: 0 },
      migratedPoolFee: {
        collectFeeMode: MigratedCollectFeeMode.QuoteToken,
        dynamicFee: DammV2DynamicFeeMode.Disabled,
        poolFeeBps: 100,
        baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
      },
    },
    liquidityDistribution: {
      partnerLiquidityPercentage: 0,
      partnerPermanentLockedLiquidityPercentage: 100,
      creatorLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: 0,
    },
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    // The builder accepts a percentage from 0 to 100; 20 leaves 800M tokens
    // for curve trading and sends 200M into the graduated DAMM v2 pool.
    percentageSupplyOnMigration: 20,
    migrationQuoteThreshold: migrationQuoteThresholdUsdc,
  });
}

export async function assertStreetFunDbcConfig(
  client: DynamicBondingCurveClient,
  configAddress: PublicKey,
) {
  const config: any = await client.state.getPoolConfig(configAddress);
  const [globalConfig] = getGlobalConfigPda(PROGRAM_ID);
  const valid = config
    && config.quoteMint.equals(USDC_MINT)
    && config.feeClaimer.equals(globalConfig)
    && config.leftoverReceiver.equals(globalConfig)
    && Number(config.migrationOption) === MigrationOption.MET_DAMM_V2
    && Number(config.migrationFeeOption) === MigrationFeeOption.Customizable
    && Number(config.migrationFeePercentage) === DBC_MIGRATION_FEE_PERCENT
    && Number(config.creatorMigrationFeePercentage) === 0
    && Number(config.tokenDecimal) === TokenDecimal.SIX
    && Number(config.tokenType) === TokenType.SPLToken
    && Number(config.fixedTokenSupplyFlag) === 1
    && BigInt(config.preMigrationTokenSupply.toString()) === DBC_TOTAL_SUPPLY
    && BigInt(config.postMigrationTokenSupply.toString()) === DBC_TOTAL_SUPPLY
    && Number(config.partnerPermanentLockedLiquidityPercentage) === 100
    && Number(config.partnerLiquidityPercentage) === 0
    && Number(config.creatorPermanentLockedLiquidityPercentage) === 0
    && Number(config.creatorLiquidityPercentage) === 0;
  if (!valid) throw new Error("The configured DBC config does not match StreetFun's settlement and supply invariants.");
  return config;
}

export function getDbcPoolAddress(baseMint: PublicKey, config = getDbcConfigAddress()) {
  return deriveDbcPoolAddress(USDC_MINT, baseMint, config);
}

export function getDbcQuoteVaultAddress(pool: PublicKey) {
  return deriveDbcTokenVaultAddress(pool, USDC_MINT);
}

export function getDbcActivationPoint(
  connection: Connection,
  activationType: number,
) {
  if (activationType === ActivationType.Slot) return connection.getSlot("confirmed").then(slot => new BN(slot));
  return Promise.resolve(new BN(Math.floor(Date.now() / 1000)));
}
