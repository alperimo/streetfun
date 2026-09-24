import { PublicKey } from "@solana/web3.js";
import { TokenMetadata } from "@/lib/types";
import { ITokenService, TokenLaunchParams } from "../types";

/** Browser facade: market data and database access stay on the server. */
export class SolanaTokenService implements ITokenService {
  async getTokens(): Promise<TokenMetadata[]> {
    const response = await fetch("/api/tokens", { cache: "no-store" });
    if (!response.ok) throw new Error("Live market data is unavailable.");
    const payload = await response.json();
    if (!Array.isArray(payload.tokens)) throw new Error("Invalid live market response.");
    return payload.tokens;
  }
  async getToken(mint: string): Promise<TokenMetadata | null> {
    return (await this.getTokens()).find(token => token.mint === mint) || null;
  }
  async launchToken(params: TokenLaunchParams, walletPublicKey?: PublicKey | null): Promise<TokenMetadata> {
    const response = await fetch("/api/launch", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, creatorPublicKey: walletPublicKey?.toBase58() }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Token launch unavailable.");
    return payload.token;
  }
}
export const solanaTokenService = new SolanaTokenService();
