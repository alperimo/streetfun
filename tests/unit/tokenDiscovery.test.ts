import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import { AccountLayout, MintLayout, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { SolanaTokenService } from "../../src/server/tokenData";
import { PROGRAM_ID, USDC_MINT } from "../../src/sdk/constants";
import * as tessera from "../../src/server/tessera";
import { TradeStoreService } from "../../src/services/indexer/tradeStore";

describe("Live token discovery", () => {
  const catalog = tessera.getTesseraCatalog, getStore = TradeStoreService.getInstance;
  before(() => {
    (tessera as any).getTesseraCatalog = async () => [];
    (TradeStoreService as any).getInstance = () => ({ getMarketStats: async () => ({}) });
  });
  after(() => { (tessera as any).getTesseraCatalog = catalog; TradeStoreService.getInstance = getStore; });
  const fixture = () => {
    const curves = [0, 1].map(() => ({ publicKey: Keypair.generate().publicKey, account: {
      memeMint: Keypair.generate().publicKey, targetEquityMint: Keypair.generate().publicKey,
      creator: Keypair.generate().publicKey, meteoraDammV2Pool: PublicKey.default,
      virtualQuoteReserves: 30_000_000_000n, virtualTokenReserves: 1_000_000_000_000_000n,
      realQuoteReserves: 0n, realTokenReserves: 800_000_000_000_000n,
      totalMemeSupply: 1_000_000_000_000_000n, totalEquityLocked: 0n, isGraduated: false,
    } }));
    const mintData = Buffer.alloc(MintLayout.span);
    MintLayout.encode({ mintAuthorityOption: 0, mintAuthority: PublicKey.default, supply: 500_000_000_000_000n, decimals: 6, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default }, mintData);
    const quoteInfo = (index: number) => {
      const data = Buffer.alloc(AccountLayout.span);
      AccountLayout.encode({ mint: index === 0 ? USDC_MINT : Keypair.generate().publicKey,
        owner: curves[index].publicKey, amount: 0n, delegateOption: 0, delegate: PublicKey.default,
        state: 1, isNativeOption: 0, isNative: 0n, delegatedAmount: 0n, closeAuthorityOption: 0, closeAuthority: PublicKey.default }, data);
      return { owner: TOKEN_PROGRAM_ID, data };
    };
    let scans = 0, batches = 0;
    const service = new SolanaTokenService({
      getGenesisHash: async () => "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
      getMultipleAccountsInfoAndContext: async () => {
        batches++;
        return { context: { slot: 123 }, value: curves.flatMap((c, i) => [
          { owner: PROGRAM_ID, data: Buffer.from([i]) }, { owner: TOKEN_PROGRAM_ID, data: mintData }, quoteInfo(i), null, null,
        ]) };
      },
    } as any) as any;
    service.getProgram = () => ({ account: {
      curveAccount: { all: async () => { scans++; return curves; } },
      globalConfig: { fetch: async () => ({ graduationThreshold: 60_000_000_000n, protocolFeeBps: 100 }) },
    }, coder: { accounts: { decode: (_name, data) => curves[data[0]].account } } });
    service.getIndexedMetadata = async () => new Map();
    return { service, curves, counts: () => ({ scans, batches }) };
  };
  it("isolates unsupported quote assets and derives market cap from actual mint supply", async () => {
    const { service, curves, counts } = fixture();
    const tokens = await service.getTokens();
    expect(tokens.map(t => t.mint)).to.deep.equal([curves[0].account.memeMint.toBase58()]);
    expect(tokens[0].totalSupply).to.equal(500_000_000); expect(tokens[0].marketCapUsd).to.equal(15_000);
    expect(tokens[0].treasury.proofOfReserveVerified).to.equal(false); expect(counts().batches).to.equal(1);
  });
  it("coalesces simultaneous reads and invalidates cached snapshots after events", async () => {
    const { service, counts } = fixture(); await Promise.all([service.getTokens(), service.getTokens()]);
    expect(counts().scans).to.equal(1); service.invalidate(); await service.getTokens(); expect(counts().scans).to.equal(2);
  });
  it("never uses the frozen curve price after graduation", async () => {
    const { service, curves } = fixture(); curves[0].account.isGraduated = true; (curves[0].account as any).graduatedAt = 1n;
    const [token] = await service.getTokens(); expect(token.priceUsd).to.equal(0); expect(token.bondingCurve.progressPct).to.equal(100);
  });
  it("never promotes database-only rows to live chain markets", async () => {
    const { service } = fixture(); service.getProgram = () => ({ account: { curveAccount: { all: async () => [] } } });
    service.getIndexedMetadata = async () => { throw new Error("must not read fabricated rows"); };
    expect(await service.getTokens()).to.deep.equal([]);
  });
});
