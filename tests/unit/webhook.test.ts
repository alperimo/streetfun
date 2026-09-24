import { expect } from "chai";
import { NextRequest } from "next/server";
import * as indexer from "../../src/server/indexTransaction";
import * as rpc from "../../src/server/rpc";
import { InvalidCurveTradeError, PendingCurveTradeError } from "../../src/services/indexer/parseCurveTrade";
import { POST } from "../../src/app/api/webhooks/helius/route";

describe("Webhook delivery guarantees", () => {
  const index = indexer.indexConfirmedTransaction, assertCluster = rpc.assertConfiguredCluster;
  const secret = process.env.HELIUS_WEBHOOK_SECRET, warn = console.warn;
  let failStorage = false, writes = 0;
  beforeEach(() => {
    process.env.HELIUS_WEBHOOK_SECRET = "test-secret";
    failStorage = false; writes = 0; console.warn = () => {};
    (rpc as any).assertConfiguredCluster = async () => "devnet";
    (indexer as any).indexConfirmedTransaction = async (_connection, signature) => {
      if (signature === "invalid") throw new InvalidCurveTradeError("Not a market event");
      if (signature === "pending") throw new PendingCurveTradeError("RPC not ready");
      if (failStorage) throw new Error("Database unavailable");
      writes++; return { indexed: 1, trades: [] };
    };
  });
  afterEach(() => {
    (indexer as any).indexConfirmedTransaction = index; (rpc as any).assertConfiguredCluster = assertCluster;
    console.warn = warn;
    if (secret === undefined) delete process.env.HELIUS_WEBHOOK_SECRET; else process.env.HELIUS_WEBHOOK_SECRET = secret;
  });
  const request = (payload: unknown, auth = "Bearer test-secret") => new NextRequest("http://localhost/api/webhooks/helius", {
    method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  it("rejects unauthorized delivery without indexing", async () => {
    expect((await POST(request([{ signature: "valid" }], "bad"))).status).to.equal(401); expect(writes).to.equal(0);
  });
  it("acknowledges permanent rejections but preserves valid members", async () => {
    const response = await POST(request([{ signature: "invalid" }, { signature: "valid" }]));
    expect(response.status).to.equal(200); expect(await response.json()).to.include({ processedCount: 1, skippedCount: 1, retryCount: 0 });
  });
  it("accepts raw delivery signatures as well as enhanced deliveries", async () => {
    const response = await POST(request([{ transaction: { signatures: ["valid"] } }]));
    expect(response.status).to.equal(200); expect(writes).to.equal(1);
  });
  it("requests redelivery for pending RPC data", async () => {
    const response = await POST(request([{ signature: "valid" }, { signature: "pending" }]));
    expect(response.status).to.equal(503); expect(await response.json()).to.include({ processedCount: 1, retryCount: 1 });
  });
  it("does not acknowledge failed persistence", async () => {
    failStorage = true; expect((await POST(request([{ signature: "valid" }]))).status).to.equal(503);
  });
  it("bounds batches and never follows alpha redirects", async () => {
    expect((await POST(request(Array(101).fill({ signature: "valid" })))).status).to.equal(400);
    const { middleware } = await import("../../src/middleware");
    const previous = process.env.NEXT_PUBLIC_ALPHA_ONLY; process.env.NEXT_PUBLIC_ALPHA_ONLY = "true";
    try { expect(middleware(request([])).headers.get("location")).to.equal(null); }
    finally { if (previous === undefined) delete process.env.NEXT_PUBLIC_ALPHA_ONLY; else process.env.NEXT_PUBLIC_ALPHA_ONLY = previous; }
  });
});
