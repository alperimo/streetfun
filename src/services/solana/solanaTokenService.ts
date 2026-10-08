import bs58 from "bs58";
import { normalizeLaunchMetadata, launchMetadataDigest } from "@/lib/launchMetadata";
import { loadPendingLaunch, savePendingLaunch, withLaunchLock, PendingLaunch } from "./pendingLaunch";
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
    if (!wallet || wallet instanceof PublicKey) throw new Error("Connect a wallet to launch.");
    return withLaunchLock(wallet.publicKey.toBase58(), async () => {
      if (loadPendingLaunch(wallet.publicKey.toBase58())) throw new Error("A launch is pending. Check its status before creating another token.");
      return this.submitLaunch(params, wallet);
    });
  }

  private async submitLaunch(params: TokenLaunchParams, wallet?: WalletIdentity): Promise<TokenMetadata> {
    if (!wallet || wallet instanceof PublicKey || typeof wallet.signTransaction !== "function") {
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

    const metadata = normalizeLaunchMetadata(params);
    const connection = new Connection(getBrowserRpcUrl(), "confirmed");
    const genesisHash = await connection.getGenesisHash();
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
        avatarUrl: metadata.avatarUrl,
        description: metadata.description,
      }),
    });
    const payload = await prepared.json().catch(() => null);
    if (!prepared.ok || !payload?.transaction) throw new Error(payload?.error || "A live Meteora DBC launch could not be prepared.");

    const transaction = Transaction.from(Buffer.from(payload.transaction, "base64"));
    const blockhash = { blockhash: transaction.recentBlockhash!, lastValidBlockHeight: payload.lastValidBlockHeight };
    if (!transaction.feePayer?.equals(wallet.publicKey) || !transaction.signatures.some(signature => signature.publicKey.equals(memeMint.publicKey))) {
      throw new Error("The prepared launch does not match the connected wallet and token mint.");
    }
    const uri = new URL(payload.metadataUri);
    if (uri.searchParams.get("v") !== await launchMetadataDigest(metadata)) throw new Error("The prepared launch does not commit to your image and description.");
    const expectedMessage = transaction.serializeMessage();
    transaction.partialSign(memeMint);
    const signed = await wallet.signTransaction!(transaction);
    if (!signed.serializeMessage().equals(expectedMessage) || !signed.verifySignatures() || !signed.signature) {
      throw new Error("The wallet returned a modified or incomplete launch transaction.");
    }
    const signature = bs58.encode(signed.signature);

    const pending: PendingLaunch = {
      version: 1, wallet: wallet.publicKey.toBase58(), mint: memeMint.publicKey.toBase58(),
      signature, genesisHash, ...blockhash,
      params: { ...params, name, symbol, ...metadata, targetEquitySymbol: asset.symbol },
    };
    savePendingLaunch(pending.wallet, pending);
    try {
      const sent = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 2 });
      if (sent !== signature) throw new Error("Unexpected launch signature.");
      await confirmSubmittedTransaction(connection, signature, blockhash);
    } catch {
      // Even a send error can mean the RPC accepted the transaction. Recovery
      // checks this saved signature instead of submitting a different mint.
      throw new SubmittedTransactionError(signature);
    }
    return this.confirmLaunch(pending);
  }

  private async confirmLaunch(pending: PendingLaunch): Promise<TokenMetadata> {
    const response = await fetch("/api/launch/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...pending.params, signature: pending.signature, mint: pending.mint }),
    }).catch(() => null);
    if (!response?.ok) throw new SubmittedTransactionError(pending.signature);
    const payload = await response.json().catch(() => null);
    const token = payload?.token as TokenMetadata;
    if (!token || token.mint !== pending.mint) throw new SubmittedTransactionError(pending.signature);
    savePendingLaunch(pending.wallet, null);
    return token;
  }

  async resumeLaunch(wallet?: WalletIdentity): Promise<TokenMetadata | null> {
    if (!wallet || wallet instanceof PublicKey) throw new Error("Connect the wallet used for this launch.");
    return withLaunchLock(wallet.publicKey.toBase58(), async () => {
      const pending = loadPendingLaunch(wallet.publicKey.toBase58());
      if (!pending) return null;
      const connection = new Connection(getBrowserRpcUrl(), "confirmed");
      if (await connection.getGenesisHash() !== pending.genesisHash) throw new Error("Reconnect to the original launch network to check this transaction.");
      const statuses = await connection.getSignatureStatuses([pending.signature], { searchTransactionHistory: true });
      const status = statuses.value[0];
      if (status?.err && status.confirmationStatus === "finalized") {
        savePendingLaunch(pending.wallet, null);
        throw new Error("The launch failed on Solana. You can start a new launch.");
      }
      if (status && !status.err && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) return this.confirmLaunch(pending);
      // A finalized height beyond expiry plus an absent mint proves this launch
      // cannot later succeed. Read status again AFTER observing finality.
      if (await connection.getBlockHeight("finalized") > pending.lastValidBlockHeight) {
        const finalStatuses = await connection.getSignatureStatuses([pending.signature], { searchTransactionHistory: true });
        const final = finalStatuses.value[0];
        if (final && !final.err && (final.confirmationStatus === "confirmed" || final.confirmationStatus === "finalized")) return this.confirmLaunch(pending);
        if (!final && !await connection.getAccountInfo(new PublicKey(pending.mint), "finalized")) {
          savePendingLaunch(pending.wallet, null);
          throw new Error("The launch expired without creating a token. You can start a new launch.");
        }
      }
      throw new SubmittedTransactionError(pending.signature);
    });
  }
}

export const solanaTokenService = new SolanaTokenService();
