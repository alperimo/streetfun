import { TokenMetadata } from "@/lib/types";
import { getTokenService } from "@/services";

/** One server-side source of truth for SSR and the market API.
 * The API must use the same mock/live selector as the browser provider;
 * otherwise demo mode still attempts to contact a local validator.
 */
export async function getLiveTokens(): Promise<TokenMetadata[]> {
  return getTokenService().getTokens();
}
