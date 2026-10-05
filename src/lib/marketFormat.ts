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

const SUBSCRIPT_DIGITS = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];

export function formatTokenPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value < 0.0001) {
    const exp = value.toExponential();
    const [mantissa, exponent] = exp.split("e");
    const expNum = parseInt(exponent, 10);
    if (expNum <= -4) {
      const zeroCount = Math.abs(expNum) - 1;
      const digits = mantissa.replace(".", "").padEnd(4, "0").slice(0, 4);
      const sub = zeroCount
        .toString()
        .split("")
        .map((d) => SUBSCRIPT_DIGITS[parseInt(d, 10)] ?? d)
        .join("");
      return `$0.0${sub}${digits}`;
    }
  }
  if (value < 0.01) {
    return `$${value.toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    })}`;
  }
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`;
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
