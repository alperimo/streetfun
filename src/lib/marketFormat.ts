const USD_COMPACT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});

const USD_PRECISE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const USD_TINY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value !== 0 && Math.abs(value) < 0.01) return USD_TINY.format(value);
  return Math.abs(value) < 1_000 ? USD_PRECISE.format(value) : USD_COMPACT.format(value);
}

export function formatTokenPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value < 0.000001) return `$${value.toPrecision(4)}`;
  if (value < 0.01) {
    return `$${value.toLocaleString("en-US", {
      minimumFractionDigits: 6,
      maximumFractionDigits: 10,
      useGrouping: false,
    })}`;
  }
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 6 })}`;
}

export function calculateBondingProgress(reserveUsd: number, thresholdUsd: number): number {
  if (!Number.isFinite(reserveUsd) || !Number.isFinite(thresholdUsd) || thresholdUsd <= 0) return 0;
  return Math.min(100, Math.max(0, (reserveUsd / thresholdUsd) * 100));
}

export function formatBondingProgress(progressPct: number): string {
  if (!Number.isFinite(progressPct) || progressPct <= 0) return "0%";
  if (progressPct < 0.001) return "<0.001%";
  if (progressPct < 0.1) return `${progressPct.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%`;
  if (progressPct < 10) return `${progressPct.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
  return `${progressPct.toFixed(1).replace(/\.0$/, "")}%`;
}

/** Legacy demo ages and indexed ISO dates share one ordering rule. */
export function tokenCreatedAt(value: string, now: number): number {
  if (value === "Just now") return now;
  const relative = value.match(/^(\d+)\s+(min(?:ute)?s?|hours?|days?) ago$/i);
  if (relative) {
    const unit = relative[2].toLowerCase();
    return now - Number(relative[1]) * (unit.startsWith("day") ? 86400000 : unit.startsWith("hour") ? 3600000 : 60000);
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
