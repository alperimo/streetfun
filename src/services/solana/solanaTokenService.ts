import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { TokenMetadata } from "@/lib/types";
import { ITokenService, TokenLaunchParams, WalletIdentity } from "../types";
import { PROGRAM_ID, USDC_MINT } from "@/sdk/constants";
import { getBrowserRpcUrl } from "@/sdk/network";
import { getCurvePda, getGlobalConfigPda, getQuoteVaultPda, getTokenVaultPda, getTreasuryVaultPda } from "@/sdk/pda";
import { Connection } from "@solana/web3.js";
import { confirmSubmittedTransaction, SubmittedTransactionError } from "./transactionConfirmation";
import idl from "@/idl/streetfun.json";

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
    if (!Number.isFinite(initialBuyUsdc) || initialBuyUsdc < 0) {
      throw new Error("Enter a valid initial buy amount.");
    }
    if (initialBuyUsdc > 0) {
      throw new Error("Initial buy is not available during launch. Buy after the token is confirmed.");
    }
    if (!params.name.trim() || params.name.length > 64 || !params.symbol.trim() || params.symbol.length > 16) {
      throw new Error("Enter a token name and symbol within the on-chain limits.");
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
      throw new Error("Token-2022 collateral requires a deployed protocol upgrade. No transaction was submitted.");
    }

    const connection = new Connection(getBrowserRpcUrl(), "confirmed");
    const readonlyWallet: any = {
      publicKey: wallet.publicKey,
      signTransaction: async () => { throw new Error("Wallet signing is required."); },
      signAllTransactions: async () => { throw new Error("Wallet signing is required."); },
    };
    const provider = new anchor.AnchorProvider(connection, readonlyWallet, { commitment: "confirmed" });
    const program = new anchor.Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, provider);
    const memeMint = Keypair.generate();
    const [globalConfig] = getGlobalConfigPda(PROGRAM_ID);
    const [curve] = getCurvePda(memeMint.publicKey, PROGRAM_ID);
    const [tokenVault] = getTokenVaultPda(curve, PROGRAM_ID);
    const [quoteVault] = getQuoteVaultPda(curve, PROGRAM_ID);
    const [treasuryVault] = getTreasuryVaultPda(curve, PROGRAM_ID);
    const targetEquityMint = new PublicKey(asset.mintAddress);
    const equityTokenProgram = new PublicKey(asset.tokenProgram);
    const instruction = await (program.methods as any).launchStonk({
      name: params.name.trim(),
      symbol: params.symbol.trim().toUpperCase(),
      uri: params.avatarUrl || "",
      meteoraDbcPool: null,
    }).accounts({
      creator: wallet.publicKey, globalConfig, memeMint: memeMint.publicKey,
      targetEquityMint, curve, tokenVault, quoteMint: USDC_MINT,
      quoteVault, treasuryVault, tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
      equityTokenProgram,
    }).instruction();
    const blockhash = await connection.getLatestBlockhash("confirmed");
    const transaction = new Transaction().add(instruction);
    transaction.recentBlockhash = blockhash.blockhash;
    transaction.feePayer = wallet.publicKey;
    transaction.partialSign(memeMint);
    const signature = await wallet.sendTransaction(transaction, connection, {
      skipPreflight: false, preflightCommitment: "confirmed", signers: [memeMint],
    });
    await confirmSubmittedTransaction(connection, signature, blockhash);
    const response = await fetch("/api/launch/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signature, mint: memeMint.publicKey.toBase58() }),
    }).catch(() => null);
    if (!response?.ok) {
      throw new SubmittedTransactionError(signature);
    }
    const token = (await response.json()).token as TokenMetadata;
    if (!token || token.mint !== memeMint.publicKey.toBase58()) throw new SubmittedTransactionError(signature);
    return token;
  }
}
export const solanaTokenService = new SolanaTokenService();
