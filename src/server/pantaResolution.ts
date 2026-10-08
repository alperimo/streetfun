import type { LifecycleRow, PriceEvidence } from "./pantaLifecycleStore";

// Compare decimal observations exactly: floating subtraction turns 120/100 - 1
// into 0.19999999999999996 and incorrectly rejects the inclusive 20pp boundary.
export function meetsExcessReturnThreshold(tokenStart: number, tokenEnd: number, targetStart: number, targetEnd: number) {
  const values = [tokenStart, tokenEnd, targetStart, targetEnd];
  if (!values.every(value => Number.isFinite(value) && value > 0)) return false;
  const decimals = values.map(value => {
    const [mantissa, exponent = "0"] = value.toString().split("e");
    const [whole, fraction = ""] = mantissa.split(".");
    return { digits: BigInt(whole + fraction), scale: fraction.length - Number(exponent) };
  });
  const scale = Math.max(...decimals.map(value => value.scale));
  const [t0, t1, c0, c1] = decimals.map(value => value.digits * 10n ** BigInt(scale - value.scale));
  return 5n * (t1 * c0 - c1 * t0) >= t0 * c0;
}

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
  if (now < row.deadline) return { status: "pending", outcome: null, reason: "The performance window is open." };
  if (!validPriceEvidence(row.baseline, row, row.anchor_time, row.anchor_time + 60) ||
      !validPriceEvidence(row.final_snapshot, row, row.deadline, row.deadline + 300) ||
      row.baseline.targetSource !== row.final_snapshot.targetSource || row.baseline.tokenPool !== row.final_snapshot.tokenPool ||
      row.baseline.testCollateral !== row.final_snapshot.testCollateral)
    return { status: now >= row.deadline + 300 ? "oracle_review_required" : "pending", outcome: null, reason: "Awaiting valid paired price observations." };
  const tokenReturn = row.final_snapshot.tokenPriceUsd / row.baseline.tokenPriceUsd - 1;
  const targetReturn = row.final_snapshot.targetPriceUsd / row.baseline.targetPriceUsd - 1;
  const excessReturn = tokenReturn - targetReturn;
  if (!Number.isFinite(excessReturn)) return { status: "oracle_review_required", outcome: null, reason: "Invalid price observations." };
  return { status: "available", outcome: meetsExcessReturnThreshold(row.baseline.tokenPriceUsd, row.final_snapshot.tokenPriceUsd,
    row.baseline.targetPriceUsd, row.final_snapshot.targetPriceUsd) ? "yes" : "no", tokenReturn, targetReturn, excessReturn,
    thresholdPercentagePoints: 20, reason: "Paired token and actual collateral price observations." };
}
