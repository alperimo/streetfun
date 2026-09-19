import { expect } from "chai";
import { NextRequest } from "next/server";
import * as confirmed from "../../src/services/indexer/confirmedTrade";
import { TradeStoreService } from "../../src/services/indexer/tradeStore";
import { POST } from "../../src/app/api/webhooks/helius/route";

describe("Webhook delivery guarantees", () => {
  const read = confirmed.readConfirmedCurveTrade;
  const getStore = TradeStoreService.getInstance;
  const secret = process.env.HELIUS_WEBHOOK_SECRET;
  const warn = console.warn;
  let failStorage = false;
  let writes = 0;
  beforeEach(() => {
    process.env.HELIUS_WEBHOOK_SECRET = "test-secret";
    failStorage = false; writes = 0;
    console.warn = () => {};
    (confirmed as any).readConfirmedCurveTrade = async (_connection, signature) => {
      if (signature === "invalid") throw new confirmed.InvalidCurveTradeError("Not a trade");
      if (signature === "pending") throw new confirmed.PendingCurveTradeError("RPC not ready");
      return { tx_signature: signature, slot: 100 };
    };
    (TradeStoreService as any).getInstance = () => ({ recordTrade: async () => {
      if (failStorage) throw new Error("Database unavailable");
      writes++;
    } });
  });
  afterEach(() => {
    (confirmed as any).readConfirmedCurveTrade = read;
    TradeStoreService.getInstance = getStore;
    console.warn = warn;
    if (secret === undefined) delete process.env.HELIUS_WEBHOOK_SECRET; else process.env.HELIUS_WEBHOOK_SECRET = secret;
  });
  const request = (payload: unknown, auth = "Bearer test-secret") => new NextRequest("http://localhost/api/webhooks/helius", {
    method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  it("rejects unauthorized delivery without reading or writing trades", async () => {
    expect((await POST(request([{ signature: "valid" }], "bad"))).status).to.equal(401);
    expect(writes).to.equal(0);
  });
  it("acknowledges permanent rejections but preserves valid batch members", async () => {
    const response = await POST(request([{ signature: "invalid" }, { signature: "valid" }]));
    expect(response.status).to.equal(200);
    expect(await response.json()).to.include({ processedCount: 1, skippedCount: 1, retryCount: 0 });
  });
  it("requests redelivery when RPC confirmation is not available yet", async () => {
    const response = await POST(request([{ signature: "valid" }, { signature: "pending" }]));
    expect(response.status).to.equal(503);
    expect(await response.json()).to.include({ processedCount: 1, retryCount: 1 });
  });
  it("requests redelivery when a verified trade could not be persisted", async () => {
    failStorage = true;
    const response = await POST(request([{ signature: "valid" }]));
    expect(response.status).to.equal(503);
    expect(await response.json()).to.include({ processedCount: 0, skippedCount: 0, retryCount: 1 });
  });
});
