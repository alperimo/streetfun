import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import bs58 from "bs58";
import idl from "../../src/idl/streetfun.json";
import { PROGRAM_ID } from "../../src/sdk/constants";
import { decodeStreetfunInstructions, getDbcLaunchRegistryAddress } from "../../src/server/indexTransaction";
import { canLaunchTesseraAsset, parseTesseraCatalog, resolveTesseraAssetsForNetwork } from "../../src/server/tessera";
import { getAssetMarkPrice } from "../../src/server/assetValuation";
import { getUsdcPerCollateralFromSqrtPrice } from "../../src/server/dammV2CollateralMarket";
import { parsePreStocksCatalog, resolvePreStocksAssetsForNetwork } from "../../src/server/prestocks";
import { assertDevnetNetwork, getServerRpcUrl } from "../../src/server/rpc";
import { alphaClaimMessage, validAlphaClaim } from "../../src/lib/alphaClaim";
import { POST as trade } from "../../src/app/api/trade/route";
import { POST as graduate } from "../../src/app/api/graduate/route";
import { POST as redeem } from "../../src/app/api/redeem/route";
import { netAfterTransferFee } from "../../src/sdk/transferFee";

describe("Backend audit regressions", () => {
  it("keeps trading and redemption off public server signers and validates graduation plans", async () => {
    const invalidGraduation = await graduate(new Request("http://localhost/api/graduate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }));
    expect((await trade()).status).to.equal(410);
    expect((await redeem()).status).to.equal(410);
    expect(invalidGraduation.status).to.equal(400);
  });
  it("requires real Tessera mint and finite price data", () => {
    expect(() => parseTesseraCatalog([{ symbol: "OpenAI", name: "OpenAI", mint: "placeholder", markPrice: 185 }])).to.throw();
    expect(() => parseTesseraCatalog([{ symbol: "OpenAI", name: "OpenAI", mint: Keypair.generate().publicKey.toBase58(), markPrice: NaN }])).to.throw();
  });
  it("never invents a collateral mark when live price data is missing or invalid", () => {
    expect(getAssetMarkPrice({ currentStockPriceUsd: 0 })).to.equal(0);
    expect(getAssetMarkPrice({ currentStockPriceUsd: Number.NaN })).to.equal(0);
    expect(getAssetMarkPrice({ currentStockPriceUsd: 812.79 })).to.equal(812.79);
  });
  it("normalizes DAMM v2 spot prices to USDC per collateral token", () => {
    expect(getUsdcPerCollateralFromSqrtPrice(2, true)).to.equal(0.5);
    expect(getUsdcPerCollateralFromSqrtPrice(2, false)).to.equal(2);
    expect(getUsdcPerCollateralFromSqrtPrice(0, true)).to.equal(undefined);
    expect(getUsdcPerCollateralFromSqrtPrice(Number.POSITIVE_INFINITY, true)).to.equal(undefined);
  });
  it("prices a Token-2022 redemption by spendable receipt after the current transfer fee", () => {
    expect(netAfterTransferFee(50_000n, 20, 1_000n)).to.equal(49_900n);
    expect(netAfterTransferFee(1n, 1, 1_000n)).to.equal(0n);
    expect(netAfterTransferFee(5_000_000n, 20, 1_000n)).to.equal(4_999_000n);
    expect(netAfterTransferFee(50_000n, 0, 0n)).to.equal(50_000n);
  });
  it("allows real Tessera mints on mainnet and only mapped test collateral on Devnet", () => {
    expect(canLaunchTesseraAsset(true, true, true)).to.equal(false);
    expect(canLaunchTesseraAsset(true, true, true, true)).to.equal(true);
    expect(canLaunchTesseraAsset(false, true, false, true)).to.equal(true);
    expect(canLaunchTesseraAsset(false, true, undefined, true)).to.equal(true);
    expect(canLaunchTesseraAsset(false, true, false, false)).to.equal(false);
    expect(canLaunchTesseraAsset(false, true, true)).to.equal(false);
    expect(canLaunchTesseraAsset(true, true, false)).to.equal(false);
    expect(canLaunchTesseraAsset(true, false, true)).to.equal(false);
  });
  it("never leaks Tessera mainnet mints into the Devnet test catalog", () => {
    const mainnetAssets = parseTesseraCatalog([{
      symbol: "OpenAI", name: "OpenAI", mint: Keypair.generate().publicKey.toBase58(), markPrice: 185,
    }]);
    const devnetAssets = resolveTesseraAssetsForNetwork(true, mainnetAssets);
    expect(devnetAssets).to.have.length(3);
    expect(devnetAssets.every(asset => asset.testCollateral && asset.currentStockPriceUsd === 0)).to.equal(true);
    expect(devnetAssets.map(asset => asset.mintAddress)).not.to.include(mainnetAssets[0].mintAddress);
    expect(resolveTesseraAssetsForNetwork(false, mainnetAssets)).to.equal(mainnetAssets);
  });
  it("never aliases Devnet test mints to PreStocks provider assets", () => {
    const catalog = parsePreStocksCatalog([{
      symbol: "OPENAI", name: "OpenAI", contract_address: Keypair.generate().publicKey.toBase58(),
      markPrice: 100, tokenPrice: 100, markValuation: 0, impliedValuation: 0, supply: 0,
    }]);
    expect(resolvePreStocksAssetsForNetwork(false, catalog)).to.deep.equal([]);
    expect(resolvePreStocksAssetsForNetwork(true, catalog)).to.equal(catalog);
  });
  it("rejects Devnet-only transaction tooling on any other configured cluster", () => {
    const devnetHash = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
    expect(() => assertDevnetNetwork("devnet", devnetHash)).not.to.throw();
    expect(() => assertDevnetNetwork("mainnet-beta", devnetHash)).to.throw("Devnet-only");
    expect(() => assertDevnetNetwork("devnet", "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")).to.throw("Devnet-only");
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
    const instruction = { programId: PROGRAM_ID, accounts, data: bs58.encode(coder.instruction.encode("launchStonk", { params: { name: "Actual Name", symbol: "ACT", uri: "", meteoraDammV2Pool: null } })) };
    const tx: any = { meta: { err: null, logMessages: [`Program ${PROGRAM_ID} invoke [1]`, "Program log: Instruction: LaunchStonk", `Program ${PROGRAM_ID} success`] }, transaction: { message: { accountKeys: [{ pubkey: PublicKey.default }], instructions: [instruction] } } };
    const [decoded] = decodeStreetfunInstructions(tx);
    expect(decoded.instruction.accounts[2].equals(accounts[2])).to.equal(true); expect(decoded.data.params.name).to.equal("Actual Name");
    tx.meta.err = { InstructionError: [0, "failure"] }; expect(() => decodeStreetfunInstructions(tx)).to.throw("did not succeed");
  });
  it("resolves and decodes the DBC launch registry using the normalized IDL names", async () => {
    const instructionDefinition = (idl as any).instructions.find((entry: any) => entry.name === "register_dbc_launch");
    const accounts = instructionDefinition.accounts.map(() => Keypair.generate().publicKey);
    const registryIndex = instructionDefinition.accounts.findIndex((account: any) => account.name === "dbc_launch");
    expect(registryIndex).to.equal(9);
    expect(getDbcLaunchRegistryAddress({ accounts })?.equals(accounts[registryIndex])).to.equal(true);
    const program = new Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, { connection: {} } as any);
    const data = await program.coder.accounts.encode("dbcLaunchAccount", {
      creator: accounts[0], memeMint: accounts[2], targetEquityMint: accounts[3], quoteMint: accounts[4],
      dbcConfig: accounts[5], dbcPool: accounts[6], meteoraDammV2Pool: PublicKey.default,
      initialMemeSupply: new BN(0), settlementQuoteAmount: new BN(0), totalEquityLocked: new BN(0),
      graduatedAt: new BN(0), isGraduated: false, bump: 0,
    });
    expect(program.coder.accounts.decode("dbcLaunchAccount", data).memeMint.equals(accounts[2])).to.equal(true);
    expect(() => program.coder.accounts.decode("DbcLaunchAccount", data)).to.throw("Account not found");
  });
  it("cannot create a launch from another program's spoofed log text", () => {
    const other = Keypair.generate().publicKey;
    const tx: any = { meta: { err: null, logMessages: [`Program ${other} invoke [1]`, "Program log: Instruction: LaunchStonk", `Program ${other} success`] }, transaction: { message: { instructions: [{ programId: other }] } } };
    expect(() => decodeStreetfunInstructions(tx)).to.throw("No StreetFun instruction");
  });
});
