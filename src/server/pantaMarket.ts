import { PublicKey } from "@solana/web3.js";
import type { LifecycleMarketInfo, LifecycleStage } from "@/lib/pantaTypes";
import { solanaTokenService } from "./tokenData";
import { getServerConnection, assertConfiguredCluster } from "./rpc";
import { pantaLimit } from "./pantaHttp";
import { pantaRequest } from "./pantaService";
import { address, MarketBinding, parseMarket, PantaError, unavailable } from "./pantaValidation";
import { lifecycleBinding, lifecycleRows, rowBinding } from "./pantaLifecycleStore";

export async function reviewedBindingsForToken(mint: string) {
  address(mint);
  await pantaLimit();
  const token = await solanaTokenService.getToken(mint);
  if (!token) throw new PantaError("TOKEN_NOT_FOUND", 404, "Token not found.");
  const reviewed = (await lifecycleRows(mint)).filter(row => row.status === "registered").map(rowBinding);
  return { reviewed, token };
}
export async function bindingForToken(mint: string): Promise<MarketBinding> {
  const { token } = await reviewedBindingsForToken(mint);
  return lifecycleBinding(mint, token.bondingCurve.isGraduated ? "post-graduation" : "pre-graduation");
}
export async function bindingFromSession(session: Record<string, unknown>): Promise<MarketBinding> {
  const binding = await lifecycleBinding(address(session.mint), session.stage as LifecycleStage);
  if (session.network !== binding.network || session.marketId !== binding.marketId || session.programId !== binding.programId || session.usdcMint !== binding.usdcMint) throw unavailable();
  return binding;
}
export async function checkedMarket(binding: MarketBinding): Promise<LifecycleMarketInfo> {
  const connection = getServerConnection();
  await assertConfiguredCluster(connection);
  const marketAccount = await connection.getAccountInfo(new PublicKey(binding.marketId), "confirmed");
  if (!marketAccount || !marketAccount.owner.equals(new PublicKey(binding.programId))) throw unavailable();
  const market = parseMarket(await pantaRequest(`/markets/${binding.marketId}/`), binding.marketId);
  if (market.title !== binding.expectedTitle) throw unavailable();
  return { ...market, mint: binding.mint, stage: binding.stage, programId: binding.programId, usdcMint: binding.usdcMint,
    marketUrl: `https://panta.market/market/${binding.marketId}`,
    tradingEnabled: !market.resolved && market.phase === "primary" && market.status === "open" &&
      market.startTime !== null && market.startTime * 1000 <= Date.now() && market.endTime !== null && market.endTime * 1000 > Date.now(),
  };
}
export async function requirePrimaryMarket(binding: MarketBinding) {
  const market = await checkedMarket(binding);
  if (!market.tradingEnabled) throw new PantaError("MARKET_CLOSED", 409, "This market is not accepting primary purchases.");
  return market;
}
