import { TokenMetadata } from "@/lib/types";
import { IChartService, OHLCVBar, TimeframeOption } from "../types";

export class MockChartService implements IChartService {
  async getOHLCV(
    token: TokenMetadata,
    timeframe: TimeframeOption
  ): Promise<OHLCVBar[]> {
    const bars: OHLCVBar[] = [];
    const now = Math.floor(Date.now() / 1000);

    const stepSeconds =
      timeframe === "1m"
        ? 60
        : timeframe === "5m"
        ? 300
        : timeframe === "15m"
        ? 900
        : timeframe === "1h"
        ? 3600
        : timeframe === "4h"
        ? 14400
        : 86400;

    const count = 50;
    const finalPrice = token.priceUsd;
    // Base progression starting from ~35% of current price to current price
    let currentPrice = finalPrice * 0.38;

    for (let i = count; i >= 0; i--) {
      const time = now - i * stepSeconds;
      const progress = (count - i) / count;

      // Realistic random walk upward curve
      const trendLift = progress * (finalPrice - finalPrice * 0.38);
      const volatility = currentPrice * 0.04;
      const change = (Math.random() - 0.46) * volatility;

      const minFloor = Math.max(0.000001, finalPrice * 0.2);
      const open = i === count ? currentPrice : bars[bars.length - 1].close;
      const close = i === 0 ? finalPrice : Math.max(minFloor, open + change + (trendLift / count));
      const high = Math.max(open, close) + Math.random() * volatility * 0.5;
      const low = Math.max(minFloor, Math.min(open, close) - Math.random() * volatility * 0.5);
      const volume = Math.floor((10_000 + Math.random() * 40_000) * (1 + progress));

      currentPrice = close;

      bars.push({
        time,
        open: parseFloat(open.toFixed(8)),
        high: parseFloat(high.toFixed(8)),
        low: parseFloat(low.toFixed(8)),
        close: parseFloat(close.toFixed(8)),
        volume,
      });
    }

    return bars;
  }
}

export const mockChartService = new MockChartService();
