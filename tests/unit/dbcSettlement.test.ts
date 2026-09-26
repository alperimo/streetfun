import { expect } from "chai";
import { DBC_SETTLEMENT_FALLBACK_DELAY_SECONDS } from "../../src/sdk/constants";
import { getDbcSettlementFallbackAt, isDbcSettlementFallbackOpen } from "../../src/sdk/dbcSettlement";

describe("DBC settlement fallback timing", () => {
  it("opens exactly 24 hours after Meteora records curve completion", () => {
    const completedAt = 1_800_000_000;
    const fallbackAt = getDbcSettlementFallbackAt(completedAt.toString());
    expect(fallbackAt).to.equal(completedAt + DBC_SETTLEMENT_FALLBACK_DELAY_SECONDS);
    expect(isDbcSettlementFallbackOpen(fallbackAt, fallbackAt! - 1)).to.equal(false);
    expect(isDbcSettlementFallbackOpen(fallbackAt, fallbackAt!)).to.equal(true);
  });

  it("keeps the fallback closed when Meteora has not recorded completion", () => {
    expect(getDbcSettlementFallbackAt(0)).to.equal(undefined);
    expect(getDbcSettlementFallbackAt("not-a-timestamp")).to.equal(undefined);
    expect(isDbcSettlementFallbackOpen(undefined, Number.MAX_SAFE_INTEGER)).to.equal(false);
  });
});
