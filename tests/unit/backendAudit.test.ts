import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import bs58 from "bs58";
import idl from "../../src/idl/streetfun.json";
import { PROGRAM_ID } from "../../src/sdk/constants";
import { decodeStreetfunInstructions } from "../../src/server/indexTransaction";
import { canLaunchTesseraAsset, parseTesseraCatalog } from "../../src/server/tessera";
import { getServerRpcUrl } from "../../src/server/rpc";
import { alphaClaimMessage, validAlphaClaim } from "../../src/lib/alphaClaim";
import { POST as trade } from "../../src/app/api/trade/route";
import { POST as graduate } from "../../src/app/api/graduate/route";
import { POST as redeem } from "../../src/app/api/redeem/route";

describe("Backend audit regressions", () => {
  it("rejects public server-wallet spending and incomplete graduation", async () => {
    expect((await trade()).status).to.equal(410); expect((await redeem()).status).to.equal(410); expect((await graduate()).status).to.equal(503);
  });
  it("requires real Tessera mint and finite price data", () => {
    expect(() => parseTesseraCatalog([{ symbol: "OpenAI", name: "OpenAI", mint: "placeholder", markPrice: 185 }])).to.throw();
    expect(() => parseTesseraCatalog([{ symbol: "OpenAI", name: "OpenAI", mint: Keypair.generate().publicKey.toBase58(), markPrice: NaN }])).to.throw();
  });
  it("allows only explicitly mapped Devnet test collateral to launch", () => {
    expect(canLaunchTesseraAsset(true, true, true)).to.equal(true);
    expect(canLaunchTesseraAsset(false, true, false)).to.equal(false);
    expect(canLaunchTesseraAsset(true, true, false)).to.equal(false);
    expect(canLaunchTesseraAsset(true, false, true)).to.equal(false);
  });
  it("uses Helius on the configured cluster without a public API key", () => {
    const keys = ["SOLANA_RPC_URL", "NEXT_PUBLIC_SOLANA_RPC", "HELIUS_API_KEY", "NEXT_PUBLIC_SOLANA_NETWORK"];
    const previous = keys.map(k => process.env[k]);
    try { delete process.env.SOLANA_RPC_URL; delete process.env.NEXT_PUBLIC_SOLANA_RPC; process.env.HELIUS_API_KEY = "test"; process.env.NEXT_PUBLIC_SOLANA_NETWORK = "mainnet-beta";
      expect(getServerRpcUrl()).to.equal("https://mainnet.helius-rpc.com/?api-key=test");
    } finally { keys.forEach((key, i) => previous[i] === undefined ? delete process.env[key] : process.env[key] = previous[i]); }
  });
  it("binds alpha claims to purpose, wallet, handle and freshness", () => {
    const time = new Date().toISOString(), nonce = "1234567890123456";
    const message = alphaClaimMessage("wallet", "alice", nonce, time);
    expect(validAlphaClaim(message, "wallet", "alice")).to.equal(true);
    expect(validAlphaClaim(message, "wallet", "bob")).to.equal(false);
    expect(validAlphaClaim(message, "wallet", "alice", Date.now() + 360_000)).to.equal(false);
    expect(validAlphaClaim("arbitrary wallet signature", "wallet", "alice")).to.equal(false);
  });
  it("decodes launch instruction accounts independently of fee-payer ordering", () => {
    const coder = new Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, { connection: {} } as any).coder;
    const accounts = Array.from({ length: 13 }, () => Keypair.generate().publicKey);
    const instruction = { programId: PROGRAM_ID, accounts, data: bs58.encode(coder.instruction.encode("launchStonk", { params: { name: "Actual Name", symbol: "ACT", uri: "", meteoraDbcPool: null } })) };
    const tx: any = { meta: { err: null, logMessages: [`Program ${PROGRAM_ID} invoke [1]`, "Program log: Instruction: LaunchStonk", `Program ${PROGRAM_ID} success`] }, transaction: { message: { accountKeys: [{ pubkey: PublicKey.default }], instructions: [instruction] } } };
    const [decoded] = decodeStreetfunInstructions(tx);
    expect(decoded.instruction.accounts[2].equals(accounts[2])).to.equal(true); expect(decoded.data.params.name).to.equal("Actual Name");
    tx.meta.err = { InstructionError: [0, "failure"] }; expect(() => decodeStreetfunInstructions(tx)).to.throw("did not succeed");
  });
  it("cannot create a launch from another program's spoofed log text", () => {
    const other = Keypair.generate().publicKey;
    const tx: any = { meta: { err: null, logMessages: [`Program ${other} invoke [1]`, "Program log: Instruction: LaunchStonk", `Program ${other} success`] }, transaction: { message: { instructions: [{ programId: other }] } } };
    expect(() => decodeStreetfunInstructions(tx)).to.throw("No StreetFun instruction");
  });
});
