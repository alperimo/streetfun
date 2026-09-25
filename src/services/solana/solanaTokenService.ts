import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { TokenMetadata } from "@/lib/types";
import { ITokenService, TokenLaunchParams, WalletIdentity } from "../types";
import { PROGRAM_ID } from "@/sdk/constants";
import { getBrowserRpcUrl } from "@/sdk/network";
import { Connection } from "@solana/web3.js";
import { confirmSubmittedTransaction, SubmittedTransactionError } from "./transactionConfirmation";

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

  async launchToken(params: TokenLaunchParams, wallet?: WalletIdentity): Promise<TokenMetadata> {
    if (!wallet || wallet instanceof PublicKey || typeof wallet.sendTransaction !== "function") {
      throw new Error("Connect a wallet that can sign the token launch.");
    }
    const initialBuyUsdc = params.initialBuyUsdc ?? 0;
    if (!Number.isFinite(initialBuyUsdc) || initialBuyUsdc < 0) throw new Error("Enter a valid initial buy amount.");
    if (initialBuyUsdc > 0) throw new Error("Initial buys are not supported by this launch flow. Buy after confirmation.");
    const name = params.name.trim();
    const symbol = params.symbol.trim().toUpperCase();
    if (!name || name.length > 32 || !symbol || symbol.length > 10) {
      throw new Error("Enter a token name (up to 32 characters) and symbol (up to 10 characters).");
    }

    const assetsResponse = await fetch("/api/assets", { cache: "no-store" });
    if (!assetsResponse.ok) throw new Error("Backing asset availability is unavailable.");
    const assets = (await assetsResponse.json()).assets as Array<{
      symbol: string; mintAddress: string; launchEnabled: boolean; tokenProgram: string | null;
    }>;
    const asset = assets.find(item => item.symbol === params.targetEquitySymbol);
    if (!asset?.launchEnabled) throw new Error("This backing asset is unavailable on the configured Solana cluster.");
    if (asset.tokenProgram !== TOKEN_PROGRAM_ID.toBase58() && asset.tokenProgram !== TOKEN_2022_PROGRAM_ID.toBase58()) {
      throw new Error("This collateral mint uses an unsupported token program.");
    }
    if (asset.tokenProgram === TOKEN_2022_PROGRAM_ID.toBase58() && process.env.NEXT_PUBLIC_TOKEN_2022_COLLATERAL_DEPLOYED !== "true") {
      throw new Error("Token-2022 collateral requires the deployed protocol upgrade on this network. No transaction was submitted.");
    }

    const connection = new Connection(getBrowserRpcUrl(), "confirmed");
    const memeMint = Keypair.generate();
    const prepared = await fetch("/api/launch/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        caller: wallet.publicKey.toBase58(),
        mint: memeMint.publicKey.toBase58(),
        name,
        symbol,
        targetEquitySymbol: asset.symbol,
        avatarUrl: params.avatarUrl.trim(),
      }),
    });
    const payload = await prepared.json().catch(() => null);
    if (!prepared.ok || !payload?.transaction) throw new Error(payload?.error || "A live Meteora DBC launch could not be prepared.");

    const transaction = Transaction.from(Buffer.from(payload.transaction, "base64"));
    const blockhash = { blockhash: transaction.recentBlockhash!, lastValidBlockHeight: payload.lastValidBlockHeight };
    if (!transaction.feePayer?.equals(wallet.publicKey) || !transaction.signatures.some(signature => signature.publicKey.equals(memeMint.publicKey))) {
      throw new Error("The prepared launch does not match the connected wallet and token mint.");
    }
    transaction.partialSign(memeMint);
    const signature = await wallet.sendTransaction(transaction, connection, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      signers: [memeMint],
    });
    await confirmSubmittedTransaction(connection, signature, blockhash);

    const response = await fetch("/api/launch/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signature,
        mint: memeMint.publicKey.toBase58(),
        targetEquitySymbol: asset.symbol,
        name,
        symbol,
        avatarUrl: params.avatarUrl.trim(),
      }),
    }).catch(() => null);
    if (!response?.ok) throw new SubmittedTransactionError(signature);
    const token = (await response.json()).token as TokenMetadata;
    if (!token || token.mint !== memeMint.publicKey.toBase58()) throw new SubmittedTransactionError(signature);
    return token;
  }
}

export const solanaTokenService = new SolanaTokenService();
