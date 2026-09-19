import { expect } from "chai";
import { getLiveTokens } from "../../src/services/tokens/liveTokens";

describe("Server token source selection", () => {
  const previous = process.env.NEXT_PUBLIC_USE_MOCK_DATA;

  afterEach(() => {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_USE_MOCK_DATA;
    else process.env.NEXT_PUBLIC_USE_MOCK_DATA = previous;
  });

  it("does not contact the local RPC when mock mode is enabled", async () => {
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "true";
    const tokens = await getLiveTokens();
    expect(tokens.length).to.be.greaterThan(0);
    expect(tokens.every((token) => token.dataSource === "mock")).to.equal(true);
  });
});
