const { expect } = require("chai");
const {
  calculateBondingProgress,
  formatBondingProgress,
  formatTokenPrice,
  formatUsd,
} = require("../src/lib/marketFormat");

describe("Live market formatting", () => {
  it("keeps small reserves visible rather than rounding them to zero thousands", () => {
    expect(formatUsd(7)).to.equal("$7.00");
    expect(formatUsd(6.93)).to.equal("$6.93");
    expect(formatUsd(0.001)).to.equal("$0.001");
  });

  it("shows small nonzero bonding progress", () => {
    expect(formatBondingProgress(calculateBondingProgress(7, 60_000))).to.equal("0.012%");
    expect(formatBondingProgress(0)).to.equal("0%");
    expect(formatBondingProgress(0.0001)).to.equal("<0.001%");
  });

  it("does not turn an unavailable spot price into a dollar value", () => {
    expect(formatTokenPrice(0)).to.equal("—");
    expect(formatTokenPrice(0.00002802)).to.equal("$0.00002802");
  });
});
