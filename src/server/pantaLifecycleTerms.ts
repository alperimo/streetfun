import { getDbcLaunchPda, getCurvePda } from "@/sdk/pda";
import { PROGRAM_ID } from "@/sdk/constants";
import { PublicKey } from "@solana/web3.js";
import type { LifecycleStage } from "@/lib/pantaTypes";

export const LIFECYCLE_SECONDS = 30 * 86400;
/** Immutable, token-specific terms: ticker duplicates cannot collide on Panta. */
export function lifecycleTerms(input: {
  network: "devnet" | "mainnet-beta"; mint: string; symbol: string; targetSymbol: string; targetMint: string;
  stage: LifecycleStage; anchor: number; sourceSignature: string; protocol: "meteora-dbc" | "streetfun-legacy";
}) {
  const deadline = input.anchor + LIFECYCLE_SECONDS;
  const date = new Date(deadline * 1000).toISOString().slice(0, 10);
  const label = `$${input.symbol}`;
  const title = input.stage === "pre-graduation"
    ? `Will ${label} graduate into ${input.targetSymbol} backing by ${date}?`
    : `Will ${label} outperform its ${input.targetSymbol} backing by 20%+ over 30 days?`;
  const registry = (input.protocol === "meteora-dbc" ? getDbcLaunchPda : getCurvePda)(new PublicKey(input.mint), PROGRAM_ID)[0].toBase58();
  const suffix = input.network === "devnet" ? "?cluster=devnet" : "";
  const base = process.env.PANTA_EVIDENCE_ORIGIN || process.env.NEXT_PUBLIC_APP_URL;
  let evidenceUrl: string | undefined;
  if (base) {
    const url = new URL(base);
    if (url.protocol === "https:" && !["localhost", "127.0.0.1", "::1"].includes(url.hostname))
      evidenceUrl = `${url.origin}/api/panta/evidence/${input.mint}?stage=${input.stage}&network=${input.network}`;
  }
  const sources = evidenceUrl ? [evidenceUrl] : [`https://explorer.solana.com/address/${registry}${suffix}`];
  const rule = input.stage === "pre-graduation"
    ? "YES iff confirmed StreetFun collateral settlement sets isGraduated=true before the deadline. Curve completion or Meteora migration alone excluded. NO requires full chain review at deadline. Panta oracle settles."
    : "Use public paired observations: start within 60s of graduation; end deadline to +300s; same sources. YES iff token return minus collateral return >=0.20; else NO. Missing evidence needs oracle review. Devnet prices are test prices.";
  return {
    question: input.stage === "pre-graduation"
      ? `Will ${input.mint} graduate on ${input.network} before ${deadline}?`
      : `Will ${input.mint} outperform its collateral by 20pp on ${input.network} at ${deadline}?`, title, deadline,
    resolution_rule: rule, sources,
    description: input.stage === "pre-graduation"
      ? `System market. Resolves from confirmed StreetFun collateral settlement before ${new Date(deadline * 1000).toISOString()}. Panta verifies the outcome before winnings become claimable.`
      : `System market. Compares token return with its actual collateral price over 30 days from graduation. YES requires at least 20 percentage points of excess return. Published paired observations are reviewed by Panta's oracle.`,
  };
}
