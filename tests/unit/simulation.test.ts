import { expect } from "chai";
import { mockTradeService } from "../../src/services/mock/mockTradeService";
import { mockRedeemService } from "../../src/services/mock/mockRedeemService";
import { mockTokenService } from "../../src/services/mock/mockTokenService";
import { INITIAL_TOKENS } from "../../src/lib/mockData";
import { simulateBuyTokensOut, simulateSellQuoteOut } from "../../src/sdk/math";
import { tokenCreatedAt } from "../../src/lib/marketFormat";

async function rejects(work: Promise<unknown>, message: string) {
  try { await work; expect.fail("Expected rejection"); }
  catch (error) { expect((error as Error).message).to.include(message); }
}

describe("Simulation accounting", () => {
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const savedStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const savedFetch = globalThis.fetch;
  const savedMock = process.env.NEXT_PUBLIC_USE_MOCK_DATA;
  const storage = new Map<string, string>();
  let token: any;
  before(() => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "true";
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value),
    } });
    globalThis.fetch = async () => new Response('{}');
  });
  after(() => {
    if (savedWindow) Object.defineProperty(globalThis, "window", savedWindow); else delete (globalThis as any).window;
    if (savedStorage) Object.defineProperty(globalThis, "localStorage", savedStorage); else delete (globalThis as any).localStorage;
    globalThis.fetch = savedFetch;
    if (savedMock === undefined) delete process.env.NEXT_PUBLIC_USE_MOCK_DATA; else process.env.NEXT_PUBLIC_USE_MOCK_DATA = savedMock;
  });
  beforeEach(() => {
    storage.clear();
    token = structuredClone(INITIAL_TOKENS[0]);
    token.mint = "AccountingFixture";
    token.totalSupply = 1_000_000_000;
    Object.assign(token.bondingCurve, { isGraduated: false, realQuoteReservesUsd: 0, graduationThresholdUsd: 60_000,
      virtualQuoteReserves: "30000000000", virtualTokenReserves: "1073000000000000", realTokenReserves: "800000000000000", dynamicFeeBps: 100 });
    token.treasury.totalEquityLocked = 0;
    token.treasury.totalEquityValueUsd = 0;
    mockTokenService.updateToken(token);
  });
  it("charges fees consistently and preserves the product across a buy and sell", async () => {
    const buy = await mockTradeService.executeTrade({ token, tradeMode: "buy", amount: 100, slippagePct: 1 });
    expect(buy.updatedToken.bondingCurve.realQuoteReservesUsd).to.equal(99);
    const sell = await mockTradeService.executeTrade({ token, tradeMode: "sell", amount: buy.tokensAmount, slippagePct: 1 });
    const curve = sell.updatedToken.bondingCurve;
    expect(sell.quoteAmount).to.be.lessThan(100);
    expect(BigInt(curve.virtualQuoteReserves) * BigInt(curve.virtualTokenReserves) >= 30_000_000_000n * 1_073_000_000_000_000n).to.equal(true);
    expect(curve.realQuoteReservesUsd).to.be.lessThan(0.00001);
    expect(sell.updatedToken.marketCapUsd).to.equal(sell.updatedToken.priceUsd * 1_000_000_000);
  });
  it("preserves a configured zero fee", async () => {
    token.bondingCurve.dynamicFeeBps = 0;
    mockTokenService.updateToken(token);
    const buy = await mockTradeService.executeTrade({ token, tradeMode: "buy", amount: 100, slippagePct: 1 });
    expect(buy.updatedToken.bondingCurve.realQuoteReservesUsd).to.equal(100);
  });
  it("burns supply and keeps sequential redemptions proportional", async () => {
    token.totalSupply = 1000;
    token.bondingCurve.isGraduated = true;
    token.targetEquity.stockPriceUsd = 10;
    token.treasury.totalEquityLocked = 100;
    token.treasury.totalEquityValueUsd = 1000;
    mockTokenService.updateToken(token);
    const first = await mockRedeemService.executeRedeem({ token, memeAmount: 100, actionType: "stock" });
    const second = await mockRedeemService.executeRedeem({ token, memeAmount: 100, actionType: "stock" });
    expect(first.entitledShares).to.equal(10);
    expect(second.entitledShares).to.equal(10);
    expect(second.updatedToken.totalSupply).to.equal(800);
    expect(second.updatedToken.treasury.totalEquityLocked).to.equal(80);
  });
  it("does not manufacture equity for an empty vault or allow burns above supply", async () => {
    await rejects(mockRedeemService.executeRedeem({ token, memeAmount: 1, actionType: "stock" }), "after graduation");
    token.bondingCurve.isGraduated = true;
    mockTokenService.updateToken(token);
    await rejects(mockRedeemService.executeRedeem({ token, memeAmount: 1, actionType: "stock" }), "treasury is empty");
    token.totalSupply = 1; token.treasury.totalEquityLocked = 1;
    mockTokenService.updateToken(token);
    await rejects(mockRedeemService.executeRedeem({ token, memeAmount: 2, actionType: "stock" }), "remaining supply");
  });
  it("executes a launch's initial buy through the same curve calculation", async () => {
    const created = await mockTokenService.launchToken({ name: "Test", symbol: "TEST", description: "", avatarUrl: "", targetEquitySymbol: "$TSPACEX", initialBuyUsdc: 100 });
    const expected = simulateBuyTokensOut(100_000_000n, 30_000_000_000n, 1_073_000_000_000_000n, 800_000_000_000_000n, 20);
    expect(created.bondingCurve.realQuoteReservesUsd).to.equal(99.8);
    expect(created.bondingCurve.realTokenReserves).to.equal((800_000_000_000_000n - expected.tokensOut).toString());
    expect(created.volume24hUsd).to.equal(100);
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
