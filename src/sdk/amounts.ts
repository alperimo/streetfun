/** Convert a UI amount without silently rounding away subunits or unsafe integers. */
export function toTokenUnits(amount: number, decimals = 6): bigint {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a positive, finite amount.");
  const scaled = amount * 10 ** decimals;
  const rounded = Math.round(scaled);
  if (!Number.isSafeInteger(rounded) || rounded <= 0) throw new Error("Amount is outside the supported range.");
  // Permit IEEE-754 multiplication noise, but never silently discard a subunit.
  if (Math.abs(scaled - rounded) > Math.max(1, Math.abs(scaled)) * Number.EPSILON * 2) {
    throw new Error(`Use no more than ${decimals} decimal places.`);
  }
  return BigInt(rounded);
}

export function minimumAfterSlippage(amount: bigint, slippagePct: number): bigint {
  if (!Number.isFinite(slippagePct) || slippagePct < 0 || slippagePct >= 100) {
    throw new Error("Slippage must be at least 0% and less than 100%.");
  }
  const bps = BigInt(Math.floor(slippagePct * 100));
  const minimum = amount * (10_000n - bps) / 10_000n;
  return minimum > 0n ? minimum : 1n;
}
