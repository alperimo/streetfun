import { TokenMetadata } from "@/lib/types";
import { IChartService, OHLCVBar, TimeframeOption } from "./types";

export class RealtimeChartService implements IChartService {
  async getOHLCV(
    token: TokenMetadata,
    timeframe: TimeframeOption
  ): Promise<OHLCVBar[]> {
    try {
      const res = await fetch(
        `/api/charts/${token.mint}?timeframe=${timeframe}&price=${token.priceUsd}`
      );
      if (!res.ok) throw new Error("Failed to fetch chart bars");
      const data = await res.json();
      return Array.isArray(data.bars) ? data.bars : [];
    } catch (e) {
      console.warn("[ChartService] Verified OHLCV is unavailable:", e);
      throw e;
    }
  }
}

export const realtimeChartService = new RealtimeChartService();
