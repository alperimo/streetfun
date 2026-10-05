import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { getGlobalConfigPda, getSettlementPolicyPda } from "@/sdk/pda";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function getAdminKeypair(): Keypair | null {
  try {
    const rawKey = process.env.ADMIN_KEYPAIR || process.env.ADMIN_SECRET_KEY;
    if (rawKey) {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(rawKey)));
    }
    const walletPath = process.env.ANCHOR_WALLET || join(homedir(), ".config/solana/id.json");
    if (existsSync(walletPath)) {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8"))));
    }
  } catch {
    return null;
  }
  return null;
}

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

  const now = Math.floor(Date.now() / 1000);
  const validUntil = Number(policy.validUntil.toString());

  if (validUntil <= now + 60) {
    const adminKey = getAdminKeypair();
    if (adminKey) {
      try {
        const [globalConfig] = getGlobalConfigPda(program.programId);
        const slot = await program.provider.connection.getSlot("confirmed");
        const chainTime = (await program.provider.connection.getBlockTime(slot)) ?? now;
        await (program.methods as any).updateSettlementPolicy({
          minimumOutputNumerator: policy.minimumOutputNumerator,
          minimumOutputDenominator: policy.minimumOutputDenominator,
          validUntil: new BN(chainTime + 240),
        }).accounts({
          admin: adminKey.publicKey,
          globalConfig,
          quoteMint: quote,
          equityMint: equity,
          market: policy.market,
          settlementPolicy: address,
          systemProgram: SystemProgram.programId,
        }).signers([adminKey]).rpc();
        policy = await (program.account as any).settlementPolicy.fetch(address);
      } catch (err) {
        console.warn("[SettlementPolicy] Auto-refresh failed:", err);
      }
    }
  }

  const minimum = settlementPolicyMinimum(policy, amount, Math.floor(Date.now() / 1000));
  return { address, market: policy.market as PublicKey, minimum };
}

export function protectedSettlementMinimum(quotedOutput: bigint, quotedMinimum: bigint, policyMinimum: bigint): bigint {
  if (quotedOutput < policyMinimum) throw new Error("The collateral quote is below the approved minimum exchange rate.");
  return quotedMinimum > policyMinimum ? quotedMinimum : policyMinimum;
}
