import { expect } from "chai";
import { CpAmm, CollectFeeMode } from "@meteora-ag/cp-amm-sdk";
import { Connection } from "@solana/web3.js";
import BN from "bn.js";
import { prepareExactDammV2GraduationPool } from "../../src/server/dammV2Graduation";

describe("DAMM v2 graduation liquidity", () => {
  it("uses BothToken and consumes the exact quote and meme allocations", () => {
    const client = new CpAmm(new Connection("http://127.0.0.1:8899"));
    const originalPrepare = client.preparePoolCreationParams.bind(client);
    let feeMode: CollectFeeMode | undefined;
    client.preparePoolCreationParams = (params) => {
      feeMode = params.collectFeeMode;
      return originalPrepare(params);
    };

    const quoteAmount = new BN("30000000");
    const memeAmount = new BN("600000000000000");
    const prepared = prepareExactDammV2GraduationPool(client, quoteAmount, memeAmount);

    expect(feeMode).to.equal(CollectFeeMode.BothToken);
    expect(prepared).not.to.equal(null);
    expect(prepared?.liquidityDelta.gt(new BN(0))).to.equal(true);
  });
});
