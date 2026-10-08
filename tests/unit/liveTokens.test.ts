import { expect } from "chai";
import { solanaTokenService } from "../../src/server/tokenData";
import { getLiveTokens } from "../../src/services/tokens/liveTokens";

describe("Server token source selection", () => {
  const previous = process.env.NEXT_PUBLIC_USE_MOCK_DATA;

  afterEach(() => {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_USE_MOCK_DATA;
    else process.env.NEXT_PUBLIC_USE_MOCK_DATA = previous;
  });

  it("keeps the real server source even when the removed mock flag is enabled", async () => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "true";
    const original = solanaTokenService.getTokens;
    const fixture = [{ dataSource: "onchain", mint: "verified-test-source" }];
    solanaTokenService.getTokens = async () => fixture as any;
    try { expect(await getLiveTokens()).to.equal(fixture); }
    finally { solanaTokenService.getTokens = original; }
  });
});
