import { TokenMetadata } from "@/lib/types";
import { solanaTokenService } from "@/services/solana/solanaTokenService";

/** One server-side source of truth for SSR and the market API. */
export async function getLiveTokens(): Promise<TokenMetadata[]> {
  return solanaTokenService.getTokens();
}
