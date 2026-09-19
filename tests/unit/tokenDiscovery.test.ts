import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import { AccountLayout, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { SolanaTokenService } from "../../src/services/solana/solanaTokenService";
import { PROGRAM_ID, USDC_MINT } from "../../src/sdk/constants";
import { getQuoteVaultPda } from "../../src/sdk/pda";

describe("Live token discovery", () => {
  it("keeps supported markets available when another curve uses an unsupported quote mint", async () => {
    const service = new SolanaTokenService() as any;
    const curves = [0, 1].map(() => ({
      publicKey: Keypair.generate().publicKey,
      account: {
        memeMint: Keypair.generate().publicKey, targetEquityMint: Keypair.generate().publicKey,
        creator: Keypair.generate().publicKey, meteoraDbcPool: PublicKey.default,
        virtualQuoteReserves: 30_000_000_000n, virtualTokenReserves: 1_000_000_000_000_000n,
        realQuoteReserves: 0n, realTokenReserves: 800_000_000_000_000n,
        totalMemeSupply: 1_000_000_000_000_000n, totalEquityLocked: 0n, isGraduated: false,
      },
    }));
    const supportedVault = getQuoteVaultPda(curves[0].publicKey, PROGRAM_ID)[0];
    service.getProgram = () => ({ account: {
      curveAccount: { all: async () => curves },
      globalConfig: { fetch: async () => ({ graduationThreshold: 60_000_000_000n, protocolFeeBps: 100 }) },
    } });
    service.getIndexedMetadata = async () => new Map();
    service.getIndexedStats = async () => ({});
    service.connection = {
      getSlot: async () => 123,
      getAccountInfo: async (address: PublicKey) => {
        const data = Buffer.alloc(AccountLayout.span);
        AccountLayout.encode({
          mint: address.equals(supportedVault) ? USDC_MINT : Keypair.generate().publicKey,
          owner: curves[0].publicKey, amount: 0n, delegateOption: 0, delegate: PublicKey.default,
          state: 1, isNativeOption: 0, isNative: 0n, delegatedAmount: 0n,
          closeAuthorityOption: 0, closeAuthority: PublicKey.default,
        }, data);
        return { owner: TOKEN_PROGRAM_ID, data };
      },
    };
    const tokens = await service.getTokens();
    expect(tokens.map((token: any) => token.mint)).to.deep.equal([curves[0].account.memeMint.toBase58()]);
    expect(tokens[0].bondingCurve.quoteMint).to.equal(USDC_MINT.toBase58());
  });
});
