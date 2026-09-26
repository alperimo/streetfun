import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getSettlementPolicyPda } from "@/sdk/pda";

export function settlementPolicyMinimum(policy: any, amount: bigint, now: number): bigint {
  const updatedAt = Number(policy.updatedAt.toString());
  const validUntil = Number(policy.validUntil.toString());
  const numerator = BigInt(policy.minimumOutputNumerator.toString());
  const denominator = BigInt(policy.minimumOutputDenominator.toString());
  if (!Number.isSafeInteger(updatedAt) || !Number.isSafeInteger(validUntil) || updatedAt > now || validUntil <= now || validUntil - updatedAt > 300 || numerator <= 0n || denominator <= 0n || amount <= 0n) {
    throw new Error("The approved collateral rate has expired or is unavailable. Settlement will resume after it is refreshed.");
  }
  return (amount * numerator + denominator - 1n) / denominator;
}

export async function readSettlementPolicy(program: Program<any>, quote: PublicKey, equity: PublicKey, amount: bigint) {
  const [address] = getSettlementPolicyPda(quote, equity, program.programId);
  let policy: any;
  try { policy = await (program.account as any).settlementPolicy.fetch(address); }
  catch { throw new Error("An approved collateral market must be configured before settlement is available."); }
  if (!policy.quoteMint.equals(quote) || !policy.equityMint.equals(equity)) throw new Error("The approved collateral market does not match this asset pair.");
  const minimum = settlementPolicyMinimum(policy, amount, Math.floor(Date.now() / 1000));
  return { address, market: policy.market as PublicKey, minimum };
}

export function protectedSettlementMinimum(quotedOutput: bigint, quotedMinimum: bigint, policyMinimum: bigint): bigint {
  if (quotedOutput < policyMinimum) throw new Error("The collateral quote is below the approved minimum exchange rate.");
  return quotedMinimum > policyMinimum ? quotedMinimum : policyMinimum;
}
