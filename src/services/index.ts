import { ITokenService, ITradeService, IRedeemService, IChartService } from "./types";
import { solanaTokenService } from "./solana/solanaTokenService";
import { solanaTradeService } from "./solana/solanaTradeService";
import { solanaRedeemService } from "./solana/solanaRedeemService";

export * from "./types";

export function getTokenService(): ITokenService {
  return solanaTokenService;
}

export function getTradeService(): ITradeService {
  return solanaTradeService;
}

export function getRedeemService(): IRedeemService {
  return solanaRedeemService;
}

import { realtimeChartService } from "./chartService";

export function getChartService(): IChartService {
  return realtimeChartService;
}
