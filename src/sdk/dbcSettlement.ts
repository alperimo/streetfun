import { DBC_SETTLEMENT_FALLBACK_DELAY_SECONDS } from "./constants";

/** Return the Unix time when a non-creator may settle, or undefined before DBC records completion. */
export function getDbcSettlementFallbackAt(finishCurveTimestamp: unknown): number | undefined {
  const finishAt = Number(finishCurveTimestamp);
  if (!Number.isSafeInteger(finishAt) || finishAt <= 0) return undefined;
  const fallbackAt = finishAt + DBC_SETTLEMENT_FALLBACK_DELAY_SECONDS;
  return Number.isSafeInteger(fallbackAt) ? fallbackAt : undefined;
}

export function isDbcSettlementFallbackOpen(
  fallbackAt: number | undefined,
  now = Math.floor(Date.now() / 1000),
): boolean {
  return fallbackAt !== undefined && Number.isSafeInteger(fallbackAt) && now >= fallbackAt;
}
