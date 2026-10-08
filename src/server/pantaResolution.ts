import type { LifecycleRow, PriceEvidence } from "./pantaLifecycleStore";

function validPriceEvidence(value: PriceEvidence | null, row: LifecycleRow, start: number, end: number): value is PriceEvidence {
  if (!value) return false;
  const time = Date.parse(value.observedAt) / 1000;
  return Number.isFinite(time) && time >= start && time <= end && Number.isSafeInteger(value.slot) && value.slot >= row.source_slot &&
    value.targetMint === row.target_mint && !!value.targetSource && !!value.tokenPool &&
    [value.tokenPriceUsd, value.targetPriceUsd].every(p => Number.isFinite(p) && p > 0);
}
/** Deterministic evidence; the authoritative outcome is always Panta's on-chain state. */
export function evidenceOutcome(row: LifecycleRow, now = Math.floor(Date.now() / 1000)) {
  if (row.stage === "pre-graduation") {
    if (row.graduated_signature && row.graduated_slot && row.graduated_time && row.graduated_time >= row.anchor_time && row.graduated_time < row.deadline)
      return { status: "available", outcome: "yes", reason: "Verified StreetFun collateral graduation before the deadline." };
    // Absence in the index cannot prove NO; an oracle must verify full chain coverage.
    return { status: now >= row.deadline ? "oracle_review_required" : "pending", outcome: null,
      reason: now >= row.deadline ? "Panta must verify no qualifying graduation occurred before the deadline." : "Graduation window is open." };
  }
  if (!validPriceEvidence(row.baseline, row, row.anchor_time, row.anchor_time + 60) ||
      !validPriceEvidence(row.final_snapshot, row, row.deadline, row.deadline + 300) ||
      row.baseline.targetSource !== row.final_snapshot.targetSource || row.baseline.tokenPool !== row.final_snapshot.tokenPool ||
      row.baseline.testCollateral !== row.final_snapshot.testCollateral)
    return { status: now >= row.deadline + 300 ? "oracle_review_required" : "pending", outcome: null, reason: "Awaiting valid paired price observations." };
  const tokenReturn = row.final_snapshot.tokenPriceUsd / row.baseline.tokenPriceUsd - 1;
  const targetReturn = row.final_snapshot.targetPriceUsd / row.baseline.targetPriceUsd - 1;
  const excessReturn = tokenReturn - targetReturn;
  if (!Number.isFinite(excessReturn)) return { status: "oracle_review_required", outcome: null, reason: "Invalid price observations." };
  return { status: "available", outcome: excessReturn >= 0.20 ? "yes" : "no", tokenReturn, targetReturn, excessReturn,
    thresholdPercentagePoints: 20, reason: "Paired token and actual collateral price observations." };
}
