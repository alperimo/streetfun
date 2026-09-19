import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import idl from "../../src/idl/streetfun.json";
import { parseCurveTrade } from "../../src/services/indexer/parseCurveTrade";
import { confirmSubmittedTransaction, SubmittedTransactionError } from "../../src/services/solana/transactionConfirmation";
import { minimumAfterSlippage, toTokenUnits } from "../../src/sdk/amounts";
import { isThemeId } from "../../src/config/themes";

const program = Keypair.generate().publicKey;
const quote = Keypair.generate().publicKey;
function fixture() {
  const keys = Array.from({ length: 11 }, () => Keypair.generate().publicKey);
  const data = Buffer.alloc(24);
  Buffer.from(idl.instructions.find(i => i.name === "buy_curve")!.discriminator).copy(data);
  data.writeBigUInt64LE(10_000_000n, 8);
  const log = "Program log: Buy executed. Spent: 10000000, Received: 5000000, New Real Quote: 9900000";
  return { keys, log, tx: {
    slot: 123, blockTime: 1720000000,
    transaction: { message: { accountKeys: keys.map((pubkey, i) => ({ pubkey, signer: i === 0 || i === 10 })),
      instructions: [{ programId: program, accounts: keys.slice(0, 10), data: bs58.encode(data) }] } },
    meta: { err: null, preTokenBalances: [{ accountIndex: 5, mint: quote.toBase58(), uiTokenAmount: { decimals: 6 } }],
      logMessages: [`Program ${program} invoke [1]`, log, `Program ${program} success`] },
  } as any };
}

describe("Authenticated trade indexing", () => {
  it("attributes the trade to the instruction signer, even with a separate fee payer", () => {
    const { tx, keys } = fixture();
    tx.transaction.message.accountKeys = [tx.transaction.message.accountKeys[10], ...tx.transaction.message.accountKeys.slice(0, 10)];
    tx.meta.preTokenBalances[0].accountIndex = 6;
    expect(parseCurveTrade(tx, "sig", program, quote).trader).to.equal(keys[0].toBase58());
  });
  it("rejects matching log text emitted by another program", () => {
    const { tx, log } = fixture();
    tx.meta.logMessages = [`Program ${quote} invoke [1]`, log, `Program ${quote} success`];
    expect(() => parseCurveTrade(tx, "sig", program, quote)).to.throw("authenticated");
  });
  it("ignores spoofed log text from a nested invocation", () => {
    const { tx, log } = fixture();
    tx.meta.logMessages.splice(1, 0, `Program ${quote} invoke [2]`, log, `Program ${quote} success`);
    expect(parseCurveTrade(tx, "sig", program, quote).tokens_amount).to.equal(5);
  });
  it("rejects non-trade instructions, wrong quote assets and mismatched amounts", () => {
    const a = fixture().tx;
    a.transaction.message.instructions[0].data = bs58.encode(Buffer.alloc(24));
    expect(() => parseCurveTrade(a, "sig", program, quote)).to.throw("buy or sell");
    const b = fixture().tx;
    b.meta.preTokenBalances[0].mint = program.toBase58();
    expect(() => parseCurveTrade(b, "sig", program, quote)).to.throw("USDC");
    const c = fixture().tx;
    c.meta.logMessages[1] = c.meta.logMessages[1].replace("10000000", "20000000");
    expect(() => parseCurveTrade(c, "sig", program, quote)).to.throw("signed input");
  });
  it("rejects failed or incomplete transactions", () => {
    const a = fixture().tx; a.meta.err = { InstructionError: [0, "failure"] };
    expect(() => parseCurveTrade(a, "sig", program, quote)).to.throw("succeed");
    const b = fixture().tx; b.meta = null;
    expect(() => parseCurveTrade(b, "sig", program, quote)).to.throw("succeed");
  });
});

describe("Transaction confirmation and input safety", () => {
  const blockhash = { blockhash: "block", lastValidBlockHeight: 100 };
  it("uses the blockhash expiry strategy", async () => {
    let strategy;
    await confirmSubmittedTransaction({ confirmTransaction: async s => { strategy = s; return { value: { err: null } }; } } as any, "sig", blockhash);
    expect(strategy).to.deep.equal({ signature: "sig", ...blockhash });
  });
  it("recovers an already-confirmed transaction after a transport failure", async () => {
    await confirmSubmittedTransaction({ confirmTransaction: async () => { throw new Error("timeout"); },
      getSignatureStatuses: async () => ({ value: [{ err: null, confirmationStatus: "confirmed" }] }) } as any, "sig", blockhash);
  });
  it("preserves the signature for unresolved confirmations", async () => {
    try {
      await confirmSubmittedTransaction({ confirmTransaction: async () => { throw new Error("timeout"); },
        getSignatureStatuses: async () => ({ value: [null] }) } as any, "sig", blockhash);
      expect.fail("Expected pending confirmation");
    } catch (error) {
      expect(error).to.be.instanceOf(SubmittedTransactionError);
      expect((error as SubmittedTransactionError).signature).to.equal("sig");
    }
  });
  it("does not reinterpret an on-chain rejection as pending", async () => {
    try {
      await confirmSubmittedTransaction({ confirmTransaction: async () => ({ value: { err: "rejected" } }) } as any, "sig", blockhash);
      expect.fail("Expected rejection");
    } catch (error) { expect((error as Error).message).to.include("Solana rejected"); }
  });
  it("validates precision, overflow, signs and finite amounts", () => {
    expect(toTokenUnits(0.000001)).to.equal(1n);
    expect(toTokenUnits(1.000001)).to.equal(1000001n);
    for (const value of [0, -1, NaN, Infinity, 1e30, 0.0000001, 1.0000001]) {
      expect(() => toTokenUnits(value)).to.throw();
    }
    for (const value of [-1, NaN, Infinity, 100, 101]) expect(() => minimumAfterSlippage(100n, value)).to.throw();
    expect(minimumAfterSlippage(1n, 1)).to.equal(1n);
  });
  it("does not accept inherited object properties as themes", () => {
    for (const value of ["__proto__", "constructor", "toString"]) expect(isThemeId(value)).to.equal(false);
    expect(isThemeId("dark")).to.equal(true);
  });
});
