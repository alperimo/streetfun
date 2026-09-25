import { expect } from "chai";
import { MigrationFeeOption, MigrationOption, TokenDecimal, TokenType } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { PROGRAM_ID, USDC_MINT } from "../../src/sdk/constants";
import { getGlobalConfigPda } from "../../src/sdk/pda";
import { assertStreetFunDbcConfig, buildStreetFunDbcConfig, DBC_TOTAL_SUPPLY } from "../../src/server/meteoraDbc";

describe("StreetFun Meteora DBC configuration", () => {
  const config = buildStreetFunDbcConfig(60);
  const [globalConfig] = getGlobalConfigPda(PROGRAM_ID);
  const state = {
    quoteMint: USDC_MINT,
    feeClaimer: globalConfig,
    leftoverReceiver: globalConfig,
    migrationOption: config.migrationOption,
    migrationFeeOption: config.migrationFeeOption,
    migrationFeePercentage: config.migrationFee.feePercentage,
    creatorMigrationFeePercentage: config.migrationFee.creatorFeePercentage,
    tokenDecimal: config.tokenDecimal,
    tokenType: config.tokenType,
    fixedTokenSupplyFlag: 1,
    preMigrationTokenSupply: config.tokenSupply.preMigrationTokenSupply,
    postMigrationTokenSupply: config.tokenSupply.postMigrationTokenSupply,
    partnerPermanentLockedLiquidityPercentage: config.partnerPermanentLockedLiquidityPercentage,
    partnerLiquidityPercentage: config.partnerLiquidityPercentage,
    creatorPermanentLockedLiquidityPercentage: config.creatorPermanentLockedLiquidityPercentage,
    creatorLiquidityPercentage: config.creatorLiquidityPercentage,
  };
  const expectRejectedWith = async (promise: Promise<unknown>, message: string) => {
    let failure: unknown;
    try { await promise; } catch (error) { failure = error; }
    expect(failure).to.be.instanceOf(Error);
    expect((failure as Error).message).to.include(message);
  };

  it("uses USDC, a 50% partner migration allocation, fixed one-billion supply and DAMM v2", async () => {
    expect(config.migrationOption).to.equal(MigrationOption.MET_DAMM_V2);
    expect(config.migrationFeeOption).to.equal(MigrationFeeOption.Customizable);
    expect(config.migrationFee.feePercentage).to.equal(50);
    expect(config.migrationFee.creatorFeePercentage).to.equal(0);
    expect(config.tokenType).to.equal(TokenType.SPLToken);
    expect(config.tokenDecimal).to.equal(TokenDecimal.SIX);
    expect(BigInt(config.tokenSupply.preMigrationTokenSupply.toString())).to.equal(DBC_TOTAL_SUPPLY);
    expect(BigInt(config.tokenSupply.postMigrationTokenSupply.toString())).to.equal(DBC_TOTAL_SUPPLY);
    expect(BigInt(config.migrationQuoteThreshold.toString())).to.equal(60_000_000n);
    expect(config.partnerPermanentLockedLiquidityPercentage).to.equal(100);
    await assertStreetFunDbcConfig({ state: { getPoolConfig: async () => state } } as any, PROGRAM_ID);
  });

  it("rejects incompatible migration and quote configurations", async () => {
    await expectRejectedWith(
      assertStreetFunDbcConfig({ state: { getPoolConfig: async () => ({ ...state, migrationOption: 0 }) } } as any, PROGRAM_ID),
      "does not match StreetFun's settlement and supply invariants",
    );
    await expectRejectedWith(
      assertStreetFunDbcConfig({ state: { getPoolConfig: async () => ({ ...state, quoteMint: globalConfig }) } } as any, PROGRAM_ID),
      "does not match StreetFun's settlement and supply invariants",
    );
  });

  it("rejects a zero or invalid graduation threshold", () => {
    expect(() => buildStreetFunDbcConfig(0)).to.throw("positive USDC amount");
    expect(() => buildStreetFunDbcConfig(Number.NaN)).to.throw("positive USDC amount");
  });
});
