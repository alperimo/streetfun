import { TokenMetadata } from "@/lib/types";
import { solanaTokenService } from "@/server/tokenData";

export async function getLiveTokens(): Promise<TokenMetadata[]> {
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true" && process.env.NODE_ENV !== "production") {
    const { mockTokenService } = await import("../mock/mockTokenService");
    return mockTokenService.getTokens();
  }
  return solanaTokenService.getTokens();
}
