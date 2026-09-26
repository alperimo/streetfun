import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { getGlobalConfigPda, getSettlementPolicyPda } from "../src/sdk/pda";
import { PROGRAM_ID, USDC_MINT } from "../src/sdk/constants";
import { assertConfiguredCluster } from "../src/server/rpc";
import { toTokenUnits } from "../src/sdk/amounts";
import idl from "../src/idl/streetfun.json";

async function main() {
  const [equityAddress, marketAddress, maximumUsdcPerCollateral] = process.argv.slice(2);
  if (!equityAddress || !marketAddress || !maximumUsdcPerCollateral) {
    throw new Error("Usage: publish_settlement_policy.ts <collateral mint> <approved DAMM pool> <maximum USDC per net collateral token>. Review the market and price against an independent source before signing.");
  }
  const provider = AnchorProvider.env();
  await assertConfiguredCluster(provider.connection);
  const equityMint = new PublicKey(equityAddress);
  const market = new PublicKey(marketAddress);
  const info = await provider.connection.getAccountInfo(equityMint);
  if (!info) throw new Error("Collateral mint is unavailable.");
  const mint = await getMint(provider.connection, equityMint, "confirmed", info.owner);
  if (mint.decimals > 18) throw new Error("Collateral precision exceeds the supported policy ratio.");
  const quoteAtoms = toTokenUnits(Number(maximumUsdcPerCollateral));
  const numerator = 10n ** BigInt(mint.decimals);
  const program = new Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, provider);
  const [globalConfig] = getGlobalConfigPda();
  const config: any = await (program.account as any).globalConfig.fetch(globalConfig);
  if (!config.admin.equals(provider.wallet.publicKey)) throw new Error("Only the protocol administrator can publish a settlement rate.");
  const slot = await provider.connection.getSlot("confirmed");
  const chainTime = await provider.connection.getBlockTime(slot);
  if (chainTime == null) throw new Error("Current Solana time is unavailable.");
  const signature = await (program.methods as any).updateSettlementPolicy({
    minimumOutputNumerator: new BN(numerator.toString()),
    minimumOutputDenominator: new BN(quoteAtoms.toString()),
    validUntil: new BN(chainTime + 240),
  }).accounts({
    admin: provider.wallet.publicKey, globalConfig, quoteMint: USDC_MINT, equityMint, market,
    settlementPolicy: getSettlementPolicyPda(USDC_MINT, equityMint)[0], systemProgram: SystemProgram.programId,
  }).rpc();
  console.log(`Published approved market and minimum net rate for four minutes. Transaction: ${signature}`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
