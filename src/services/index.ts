import { ITokenService, ITradeService, IRedeemService, IChartService } from "./types";
import { mockTokenService } from "./mock/mockTokenService";
import { mockTradeService } from "./mock/mockTradeService";
import { mockRedeemService } from "./mock/mockRedeemService";
import { mockChartService } from "./mock/mockChartService";
import { solanaTokenService } from "./solana/solanaTokenService";
import { solanaTradeService } from "./solana/solanaTradeService";
import { solanaRedeemService } from "./solana/solanaRedeemService";

export * from "./types";

/**
 * Returns whether the application is running in Simulation / Mock Mode.
 * Controlled via NEXT_PUBLIC_USE_MOCK_DATA in .env.local / .env.
 * Defaults to true for zero-friction local demos, offline testing, and presentations.
 */
export function isMockMode(): boolean {
  if (typeof process !== "undefined" && process.env) {
    if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === "false") {
      return false;
    }
  }
  return true;
}

export function getTokenService(): ITokenService {
  return isMockMode() ? mockTokenService : solanaTokenService;
}

export function getTradeService(): ITradeService {
  return isMockMode() ? mockTradeService : solanaTradeService;
}

export function getRedeemService(): IRedeemService {
  return isMockMode() ? mockRedeemService : solanaRedeemService;
}

import { realtimeChartService } from "./chartService";

export function getChartService(): IChartService {
  return isMockMode() ? mockChartService : realtimeChartService;
}
