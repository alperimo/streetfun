import { expect } from "chai";
import { simulateBuyTokensOut, simulateSellQuoteOut } from "../../src/sdk/math";
import { tokenCreatedAt } from "../../src/lib/marketFormat";
import { getTradeService, getTokenService, getRedeemService } from "../../src/services";

 describe("Live services", () => {
  it("ignores the removed simulation flag and exposes only chain services", () => {
    const saved = process.env.NEXT_PUBLIC_USE_MOCK_DATA;
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "true";
    try {
      expect(getTokenService().constructor.name).to.equal("SolanaTokenService");
      expect(getTradeService().constructor.name).to.equal("SolanaTradeService");
      expect(getRedeemService().constructor.name).to.equal("SolanaRedeemService");
    } finally { if (saved === undefined) delete process.env.NEXT_PUBLIC_USE_MOCK_DATA; else process.env.NEXT_PUBLIC_USE_MOCK_DATA = saved; }
  });
});

describe("Curve math and market ordering", () => {
  it("rejects zero reserves, excessive fees, reserve overflow and dust sells", () => {
    expect(() => simulateBuyTokensOut(1n, 0n, 100n, 100n, 0)).to.throw();
    expect(() => simulateBuyTokensOut(100n, 100n, 100n, 100n, 1001)).to.throw();
    expect(() => simulateBuyTokensOut((1n << 64n) - 1n, 1n, 100n, 100n, 0)).to.throw("overflow");
    expect(() => simulateSellQuoteOut(1n, 1n, 100n, 1n, 0)).to.throw("too small");
  });
  it("orders indexed dates and legacy demo ages chronologically", () => {
    const now = Date.parse("2026-09-19T12:00:00Z");
    const dates = ["3 hours ago", "10 mins ago", "2026-09-19T11:55:00Z", "Slot 100", "Just now"];
    expect(dates.sort((a, b) => tokenCreatedAt(b, now) - tokenCreatedAt(a, now))).to.deep.equal([
      "Just now", "2026-09-19T11:55:00Z", "10 mins ago", "3 hours ago", "Slot 100",
    ]);
  });
});
