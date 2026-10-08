import { TokenMetadata } from "@/lib/types";
import { solanaTokenService } from "@/server/tokenData";

export async function getLiveTokens(): Promise<TokenMetadata[]> {
  return solanaTokenService.getTokens();
}
