import { TokenMetadata } from "@/lib/types";
import { IChartService, OHLCVBar, TimeframeOption } from "./types";
import { mockChartService } from "./mock/mockChartService";
import { isMockMode } from "./index";

export class RealtimeChartService implements IChartService {
  async getOHLCV(
    token: TokenMetadata,
    timeframe: TimeframeOption
  ): Promise<OHLCVBar[]> {
    if (isMockMode()) {
      return mockChartService.getOHLCV(token, timeframe);
    }

    try {
      const res = await fetch(
        `/api/charts/${token.mint}?timeframe=${timeframe}&price=${token.priceUsd}`
      );
      if (!res.ok) throw new Error("Failed to fetch chart bars");
      const data = await res.json();
      if (data.bars && data.bars.length > 0) {
        return data.bars;
      }
    } catch (e) {
      console.warn("[ChartService] Could not fetch real OHLCV, using current price baseline:", e);
    }

    // Default baseline candle at exact current spot price
    const now = Math.floor(Date.now() / 1000);
    return [
      {
        time: now - 900,
        open: token.priceUsd,
        high: token.priceUsd,
        low: token.priceUsd,
        close: token.priceUsd,
        volume: 0,
      },
      {
        time: now,
        open: token.priceUsd,
        high: token.priceUsd,
        low: token.priceUsd,
        close: token.priceUsd,
        volume: 0,
      },
    ];
  }
}

export const realtimeChartService = new RealtimeChartService();
