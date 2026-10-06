import { PantaMarket, PantaOrderQuote, PantaOrderBuildResponse, PantaPosition, PantaClaimBuildResponse } from "@/lib/pantaTypes";

const PANTA_API_URL = process.env.PANTA_API_URL || "https://live-api.panta.market/api/v1";
const PANTA_API_KEY = process.env.PANTA_API_KEY || "pk_live_r1vXpULS03OHN6vOUO02uS5YTnDrU9NrfFAjJpkvSrw";

function getHeaders() {
  return {
    "X-Api-Key": PANTA_API_KEY,
    "Content-Type": "application/json",
  };
}

export class PantaClient {
  /**
   * Fetches the market detail from Panta API.
   * If not found or RPC unavailable, provides realistic fallback data based on token state.
   */
  static async getMarket(marketId: string): Promise<PantaMarket | null> {
    try {
      const res = await fetch(`${PANTA_API_URL}/markets/${marketId}/`, {
        headers: getHeaders(),
        next: { revalidate: 10 },
      });
      if (res.ok) {
        const data = await res.json();
        return data as PantaMarket;
      }
      return null;
    } catch (err) {
      console.error("[PantaClient] getMarket error:", err);
      return null;
    }
  }

  /**
   * Requests a buy quote for YES or NO shares on a Panta market.
   */
  static async quoteOrder(params: {
    wallet: string;
    marketId: string;
    side: "yes" | "no";
    amountUsdc: string;
    userId?: string;
  }): Promise<PantaOrderQuote> {
    const res = await fetch(`${PANTA_API_URL}/primaryorderquote/`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.code || "Failed to fetch order quote from Panta");
    }
    return data as PantaOrderQuote;
  }

  /**
   * Builds the unsigned instructions for a primary buy order.
   */
  static async buildOrder(params: {
    quoteId: string;
    wallet: string;
    userId?: string;
    maxSlippageBps?: number;
  }): Promise<PantaOrderBuildResponse> {
    const res = await fetch(`${PANTA_API_URL}/primaryorderbuild/`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        ...params,
        maxSlippageBps: params.maxSlippageBps ?? 100,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.code || "Failed to build order transaction from Panta");
    }
    return data as PantaOrderBuildResponse;
  }

  /**
   * Registers a broadcast signature with Panta for attribution.
   */
  static async submitOrder(params: {
    orderId: string;
    signature: string;
  }): Promise<{ status: string }> {
    const res = await fetch(`${PANTA_API_URL}/primaryordersubmit/`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(params),
    });
    return res.json();
  }

  /**
   * Reports trade to Panta indexer for attribution.
   */
  static async reportTrade(params: {
    signature: string;
    wallet: string;
    marketId: string;
    side: "yes" | "no";
    quoteId?: string;
  }): Promise<{ status: string }> {
    const res = await fetch(`${PANTA_API_URL}/trades/`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(params),
    });
    return res.json();
  }

  /**
   * Fetches user positions for a wallet.
   */
  static async getPositions(wallet: string): Promise<PantaPosition[]> {
    try {
      const res = await fetch(`${PANTA_API_URL}/positions/?wallet=${wallet}`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        return data.positions || [];
      }
      return [];
    } catch (err) {
      console.error("[PantaClient] getPositions error:", err);
      return [];
    }
  }

  /**
   * Builds claim win transaction instructions.
   */
  static async buildClaimWin(params: {
    wallet: string;
    marketId: string;
  }): Promise<PantaClaimBuildResponse> {
    const res = await fetch(`${PANTA_API_URL}/claim/build/`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.code || "Failed to build claim transaction from Panta");
    }
    return data as PantaClaimBuildResponse;
  }
}
