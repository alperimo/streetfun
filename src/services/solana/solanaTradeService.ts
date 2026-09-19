import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import idl from "@/idl/streetfun.json";
import { ITradeService, TradeParams, TradeResult, WalletIdentity, WalletTransactionSender } from "../types";
import { simulateBuyTokensOut, simulateSellQuoteOut } from "@/sdk/math";
import { PROGRAM_ID, USDC_MINT } from "@/sdk/constants";
import {
  getCurvePda,
  getGlobalConfigPda,
  getQuoteVaultPda,
  getTokenVaultPda,
} from "@/sdk/pda";
import { solanaTokenService } from "./solanaTokenService";

import { confirmSubmittedTransaction, SubmittedTransactionError, pendingTradeKey, savePendingTrade } from "./transactionConfirmation";
import { toTokenUnits, minimumAfterSlippage } from "../../sdk/amounts";

const TOKEN_DECIMALS = 1_000_000;

function isTransactionSender(wallet: WalletIdentity): wallet is WalletTransactionSender {
  return Boolean(
    wallet &&
      !(wallet instanceof PublicKey) &&
      wallet.publicKey &&
      typeof wallet.sendTransaction === "function"
  );
}

export class SolanaTradeService implements ITradeService {
  private connection: Connection;

  constructor() {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  private getProgram(publicKey: PublicKey): anchor.Program<any> {
    const readonlyWallet: any = {
      publicKey,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any) => txs,
    };
    const provider = new anchor.AnchorProvider(this.connection, readonlyWallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    return new anchor.Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, provider);
  }

  async executeTrade(
    params: TradeParams,
    wallet?: WalletIdentity
  ): Promise<TradeResult> {
    if (!isTransactionSender(wallet)) {
      throw new Error("Connect a signing Solana wallet to execute a live trade.");
    }
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw new Error("Enter a valid trade amount.");
    }
    if (params.amount < 0.000001) {
      throw new Error("The minimum on-chain trade amount is 0.000001.");
    }
    if (params.token.bondingCurve.isGraduated) {
      throw new Error(
        "This token is graduated, but a verified Meteora/Jupiter swap route is not configured. No transaction was submitted."
      );
    }

    const amountIn = toTokenUnits(params.amount);
    minimumAfterSlippage(1n, params.slippagePct);
    if (params.tradeMode !== "buy" && params.tradeMode !== "sell") throw new Error("Invalid trade direction.");
    const program = this.getProgram(wallet.publicKey);
    const memeMint = new PublicKey(params.token.mint);
    const [globalConfigPda] = getGlobalConfigPda(PROGRAM_ID);
    const [curvePda] = getCurvePda(memeMint, PROGRAM_ID);
    const [tokenVaultPda] = getTokenVaultPda(curvePda, PROGRAM_ID);
    const [quoteVaultPda] = getQuoteVaultPda(curvePda, PROGRAM_ID);

    const [curveAccount, globalConfig, quoteVaultAccount] = await Promise.all([
      (program.account as any).curveAccount.fetch(curvePda),
      (program.account as any).globalConfig.fetch(globalConfigPda),
      getAccount(this.connection, quoteVaultPda, "confirmed"),
    ]);

    if (curveAccount.isGraduated) {
      throw new Error("The curve graduated before this order was submitted. Refresh and use its AMM route.");
    }

    const quoteMint = quoteVaultAccount.mint;
    if (!quoteMint.equals(USDC_MINT)) throw new Error("This curve does not use the configured USDC mint.");
    const userQuoteAccount = await getAssociatedTokenAddress(quoteMint, wallet.publicKey);
    const userTokenAccount = await getAssociatedTokenAddress(memeMint, wallet.publicKey);
    const protocolFeeAccount = await getAssociatedTokenAddress(
      quoteMint,
      globalConfig.protocolFeeRecipient
    );
    const [userQuoteInfo, userTokenInfo, protocolFeeInfo] = await Promise.all([
      this.connection.getAccountInfo(userQuoteAccount, "confirmed"),
      this.connection.getAccountInfo(userTokenAccount, "confirmed"),
      this.connection.getAccountInfo(protocolFeeAccount, "confirmed"),
    ]);

    if (!protocolFeeInfo) {
      throw new Error("Protocol fee account is missing on the configured Solana network.");
    }

    const transaction = new Transaction();
    if (!userQuoteInfo && params.tradeMode === "sell") {
      transaction.add(
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          userQuoteAccount,
          wallet.publicKey,
          quoteMint
        )
      );
    } else if (!userQuoteInfo) {
      throw new Error("Your wallet has no quote-token account for this curve.");
    }

    if (!userTokenInfo && params.tradeMode === "buy") {
      transaction.add(
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          userTokenAccount,
          wallet.publicKey,
          memeMint
        )
      );
    } else if (!userTokenInfo) {
      throw new Error(`Your wallet has no $${params.token.symbol} token account.`);
    }

    const virtualQuote = BigInt(curveAccount.virtualQuoteReserves.toString());
    const virtualTokens = BigInt(curveAccount.virtualTokenReserves.toString());
    const realQuote = BigInt(curveAccount.realQuoteReserves.toString());
    const realTokens = BigInt(curveAccount.realTokenReserves.toString());
    const feeBps = Number(globalConfig.protocolFeeBps);

    let tokensAmount: number;
    let quoteAmount: number;
    let effectivePrice: number;
    let priceImpactPct: number;

    if (params.tradeMode === "buy") {
      const quoteAmountIn = amountIn;
      const simulation = simulateBuyTokensOut(
        quoteAmountIn,
        virtualQuote,
        virtualTokens,
        realTokens,
        feeBps
      );
      const minTokensOut = minimumAfterSlippage(simulation.tokensOut, params.slippagePct);
      const instruction = await (program.methods as any)
        .buyCurve({
          quoteAmountIn: new anchor.BN(quoteAmountIn.toString()),
          minTokensOut: new anchor.BN(minTokensOut.toString()),
        })
        .accounts({
          buyer: wallet.publicKey,
          globalConfig: globalConfigPda,
          memeMint,
          curve: curvePda,
          tokenVault: tokenVaultPda,
          quoteVault: quoteVaultPda,
          buyerQuoteAccount: userQuoteAccount,
          buyerTokenAccount: userTokenAccount,
          protocolFeeAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();
      transaction.add(instruction);
      tokensAmount = Number(simulation.tokensOut) / TOKEN_DECIMALS;
      quoteAmount = params.amount;
      effectivePrice = simulation.effectivePriceUsd;
      priceImpactPct = simulation.priceImpactPct;
    } else {
      const tokensAmountIn = amountIn;
      const simulation = simulateSellQuoteOut(
        tokensAmountIn,
        virtualQuote,
        virtualTokens,
        realQuote,
        feeBps
      );
      const minQuoteOut = minimumAfterSlippage(simulation.netQuoteOut, params.slippagePct);
      const instruction = await (program.methods as any)
        .sellCurve({
          tokensAmountIn: new anchor.BN(tokensAmountIn.toString()),
          minQuoteOut: new anchor.BN(minQuoteOut.toString()),
        })
        .accounts({
          seller: wallet.publicKey,
          globalConfig: globalConfigPda,
          memeMint,
          curve: curvePda,
          tokenVault: tokenVaultPda,
          quoteVault: quoteVaultPda,
          sellerTokenAccount: userTokenAccount,
          sellerQuoteAccount: userQuoteAccount,
          protocolFeeAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();
      transaction.add(instruction);
      tokensAmount = params.amount;
      quoteAmount = Number(simulation.netQuoteOut) / TOKEN_DECIMALS;
      effectivePrice = simulation.effectivePriceUsd;
      priceImpactPct = simulation.priceImpactPct;
    }

    const blockhash = await this.connection.getLatestBlockhash("confirmed");
    transaction.recentBlockhash = blockhash.blockhash;
    transaction.feePayer = wallet.publicKey;
    const signature = await wallet.sendTransaction(transaction, this.connection, {
      preflightCommitment: "confirmed",
      skipPreflight: false,
    });
    const pendingKey = pendingTradeKey(wallet.publicKey.toBase58(), params.token.mint);
    savePendingTrade(pendingKey, signature);
    try {
      await confirmSubmittedTransaction(this.connection, signature, blockhash);
      savePendingTrade(pendingKey, null);
    } catch (error) {
      if (!(error instanceof SubmittedTransactionError)) savePendingTrade(pendingKey, null);
      throw error;
    }

    let verifiedTrade: { tokens_amount: number; quote_amount_usd: number } | null = null;
    let indexed = false;
    try {
      const response = await fetch("/api/trades/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature, mint: params.token.mint }),
      });
      if (response.ok) {
        const confirmation = await response.json();
        verifiedTrade = confirmation.trade || null;
        indexed = confirmation.indexed === true;
      }
    } catch (indexError) {
      console.warn("Confirmed trade could not be read from the RPC index:", indexError);
    }

    // Never present a simulated quote as the actual execution receipt.
    tokensAmount = verifiedTrade?.tokens_amount || 0;
    quoteAmount = verifiedTrade?.quote_amount_usd || 0;
    effectivePrice = tokensAmount > 0 ? quoteAmount / tokensAmount : 0;

    const updatedToken =
      (await solanaTokenService.getToken(params.token.mint).catch(() => null)) || params.token;
    return {
      success: true,
      txSignature: signature,
      tokensAmount,
      quoteAmount,
      effectivePrice,
      priceImpactPct,
      isGraduated: updatedToken.bondingCurve.isGraduated,
      message: !verifiedTrade
        ? `Transaction ${signature} confirmed on Solana, but exact amounts could not be verified yet. Do not resubmit; check the transaction before retrying.`
        : !indexed
          ? `Transaction ${signature} confirmed; the trade index is temporarily unavailable.`
        : params.tradeMode === "buy"
          ? `Confirmed purchase of ${tokensAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })} $${params.token.symbol}.`
          : `Confirmed sale for ${quoteAmount.toFixed(2)} USDC.`,
      updatedToken,
    };
  }
}

export const solanaTradeService = new SolanaTradeService();
