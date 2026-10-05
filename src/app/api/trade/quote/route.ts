import * as anchor from "@coral-xyz/anchor";
import {
  DynamicBondingCurveClient,
  SwapMode as DbcSwapMode,
  getCurrentPoint as getDbcCurrentPoint,
  getPriceFromSqrtPrice,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import {
  CpAmm,
  SwapMode as DammSwapMode,
  cpAmmCoder,
  getCurrentPoint as getDammCurrentPoint,
  hasTransferHookExtension,
} from "@meteora-ag/cp-amm-sdk";
import { getMint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { PublicKey, Transaction } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import idl from "@/idl/streetfun.json";
import { METEORA_DAMM_V2_PROGRAM_ID, PROGRAM_ID, USDC_MINT } from "@/sdk/constants";
import { getDbcLaunchPda } from "@/sdk/pda";
import { getDbcClient } from "@/server/meteoraDbc";
import { assertConfiguredCluster, getServerConnection } from "@/server/rpc";

export const dynamic = "force-dynamic";

function parsePublicKey(value: unknown, field: string): PublicKey {
  if (typeof value !== "string") throw new Error(`Missing ${field}.`);
  try { return new PublicKey(value); }
  catch { throw new Error(`Invalid ${field}.`); }
}

function toRawAmount(value: unknown): bigint {
  let text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  text = text.replace(",", ".");
  if (!/^\d+(?:\.\d{1,6})?$/.test(text)) throw new Error("Enter a valid amount with up to six decimal places.");
  const [whole, fraction = ""] = text.split(".");
  const raw = BigInt(whole) * 1_000_000n + BigInt((fraction + "000000").slice(0, 6));
  if (raw <= 0n) throw new Error("Trade amount must be greater than zero.");
  return raw;
}

function asPositiveNumber(raw: BN | bigint | string): number {
  const value = Number(raw.toString());
  if (!Number.isFinite(value) || value <= 0) throw new Error("No executable quote is available for this amount.");
  return value;
}

async function getRegistry(connection: ReturnType<typeof getServerConnection>, mint: PublicKey) {
  const readOnlyWallet: any = {
    publicKey: PublicKey.default,
    signTransaction: async () => { throw new Error("Read-only wallet"); },
    signAllTransactions: async () => { throw new Error("Read-only wallet"); },
  };
  const program = new anchor.Program(
    { ...idl, address: PROGRAM_ID.toBase58() } as any,
    new anchor.AnchorProvider(connection, readOnlyWallet, { commitment: "confirmed" }),
  );
  const [registryAddress] = getDbcLaunchPda(mint, PROGRAM_ID);
  const registry: any = await (program.account as any).dbcLaunchAccount.fetch(registryAddress);
  if (!registry.memeMint.equals(mint)) throw new Error("Token registry does not match the requested mint.");
  return { registryAddress, registry };
}

function responseQuote(inputRaw: BN | bigint, outputRaw: BN | bigint, minimumRaw: BN | bigint, direction: "buy" | "sell", priceImpactPct: number, transaction?: Transaction) {
  const input = BigInt(inputRaw.toString());
  const output = BigInt(outputRaw.toString());
  const minimum = BigInt(minimumRaw.toString());
  const tokenRaw = direction === "buy" ? output : input;
  const quoteRaw = direction === "buy" ? input : output;
  return {
    success: true,
    direction,
    inputAmountRaw: input.toString(),
    outputAmountRaw: output.toString(),
    minimumOutputRaw: minimum.toString(),
    tokensAmount: Number(tokenRaw) / 1e6,
    quoteAmountUsd: Number(quoteRaw) / 1e6,
    effectivePriceUsd: tokenRaw > 0n ? Number(quoteRaw) / Number(tokenRaw) : 0,
    priceImpactPct,
    transaction: transaction?.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const mint = parsePublicKey(body?.mint, "mint");
    const direction = body?.direction;
    if (direction !== "buy" && direction !== "sell") throw new Error("Invalid trade direction.");
    const amount = toRawAmount(body?.amount);
    const slippageBps = Number(body?.slippageBps ?? 100);
    if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 1_000) throw new Error("Slippage must be between 0 and 1000 basis points.");
    const trader = body?.trader ? parsePublicKey(body.trader, "trader") : undefined;
    const connection = getServerConnection();
    await assertConfiguredCluster(connection);
    const { registry, registryAddress } = await getRegistry(connection, mint);
    const amountIn = new BN(amount.toString());
    let lastValidBlockHeight: number | undefined;

    if (registry.isGraduated) {
      const poolAddress: PublicKey = registry.meteoraDammV2Pool;
      const poolInfo = await connection.getAccountInfo(poolAddress, "confirmed");
      if (!poolInfo || !poolInfo.owner.equals(METEORA_DAMM_V2_PROGRAM_ID)) throw new Error("The graduated Meteora pool is not verifiable on this cluster.");
      const poolState: any = cpAmmCoder.accounts.decode("pool", poolInfo.data);
      const pairIsValid =
        (poolState.tokenAMint.equals(USDC_MINT) && poolState.tokenBMint.equals(mint)) ||
        (poolState.tokenBMint.equals(USDC_MINT) && poolState.tokenAMint.equals(mint));
      if (!pairIsValid) throw new Error("The recorded graduated pool does not trade this token against USDC.");
      const [mintAInfo, mintBInfo] = await connection.getMultipleAccountsInfo([poolState.tokenAMint, poolState.tokenBMint], "confirmed");
      if (!mintAInfo || !mintBInfo) throw new Error("A graduated pool mint is missing.");
      const tokenAProgram = mintAInfo.owner;
      const tokenBProgram = mintBInfo.owner;
      if (![TOKEN_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()].includes(tokenAProgram.toBase58()) ||
          ![TOKEN_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()].includes(tokenBProgram.toBase58())) {
        throw new Error("The graduated pool uses an unsupported token program.");
      }
      const tokenA = await getMint(connection, poolState.tokenAMint, "confirmed", tokenAProgram);
      const tokenB = await getMint(connection, poolState.tokenBMint, "confirmed", tokenBProgram);
      const inputTokenMint = direction === "buy" ? USDC_MINT : mint;
      const outputTokenMint = direction === "buy" ? mint : USDC_MINT;
      if ((await hasTransferHookExtension(connection, inputTokenMint)).hasTransferHook ||
          (await hasTransferHookExtension(connection, outputTokenMint)).hasTransferHook) {
        throw new Error("This pool uses a transfer hook that the available DAMM v2 swap route cannot execute.");
      }
      const epoch = await connection.getEpochInfo("confirmed");
      const quote = new CpAmm(connection).getQuote2({
        inputTokenMint,
        slippage: slippageBps,
        currentPoint: await getDammCurrentPoint(connection, poolState.activationType as any),
        poolState,
        tokenADecimal: tokenA.decimals,
        tokenBDecimal: tokenB.decimals,
        inputTokenInfo: tokenAProgram.equals(TOKEN_2022_PROGRAM_ID) ? { mint: tokenA, currentEpoch: epoch.epoch } : undefined,
        outputTokenInfo: tokenBProgram.equals(TOKEN_2022_PROGRAM_ID) ? { mint: tokenB, currentEpoch: epoch.epoch } : undefined,
        hasReferral: false,
        swapMode: DammSwapMode.ExactIn,
        amountIn,
      });
      if (!quote.minimumAmountOut || quote.outputAmount.isZero()) throw new Error("No executable DAMM v2 quote is available for this amount.");
      let transaction: Transaction | undefined;
      if (trader) {
        transaction = await new CpAmm(connection).swap2({
          payer: trader,
          pool: poolAddress,
          poolState,
          inputTokenMint,
          outputTokenMint,
          tokenAMint: poolState.tokenAMint,
          tokenBMint: poolState.tokenBMint,
          tokenAVault: poolState.tokenAVault,
          tokenBVault: poolState.tokenBVault,
          tokenAProgram,
          tokenBProgram,
          referralTokenAccount: null,
          swapMode: DammSwapMode.ExactIn,
          amountIn,
          minimumAmountOut: quote.minimumAmountOut,
        });
      }
      if (transaction) {
        transaction.feePayer = trader!;
        const latest = await connection.getLatestBlockhash("confirmed");
        transaction.recentBlockhash = latest.blockhash;
        lastValidBlockHeight = latest.lastValidBlockHeight;
      }
      return NextResponse.json({ protocol: "meteora-damm-v2", pool: poolAddress.toBase58(), registry: registryAddress.toBase58(), lastValidBlockHeight, ...responseQuote(amountIn, quote.outputAmount, quote.minimumAmountOut, direction, Number(quote.priceImpact.toString()), transaction) }, { headers: { "Cache-Control": "no-store" } });
    }

    const dbcClient = DynamicBondingCurveClient.create(connection, "confirmed");
    const poolAddress: PublicKey = registry.dbcPool;
    const [virtualPool, config] = await Promise.all([
      dbcClient.state.getPool(poolAddress),
      dbcClient.state.getPoolConfig(registry.dbcConfig),
    ]);
    if (!virtualPool || !config || !virtualPool.poolState.baseMint.equals(mint) ||
        !virtualPool.poolState.config.equals(registry.dbcConfig) || !config.quoteMint.equals(registry.quoteMint)) {
      throw new Error("The live DBC pool does not match the StreetFun launch registry.");
    }
    if (virtualPool.poolState.isMigrated) throw new Error("This token has migrated and settlement is still being verified. Trading is paused briefly.");
    if (!registry.quoteMint.equals(USDC_MINT)) throw new Error("This DBC pool does not use the configured USDC mint.");
    const swapBaseForQuote = direction === "sell";
    const currentPoint = await getDbcCurrentPoint(connection, config.activationType as any);

    if (direction === "buy") {
      const migrationThreshold = new BN(config.migrationQuoteThreshold.toString());
      const currentQuoteReserve = new BN(virtualPool.poolState.quoteReserve.toString());
      if (migrationThreshold.gt(currentQuoteReserve)) {
        const remainingToGraduate = migrationThreshold.sub(currentQuoteReserve);
        if (amountIn.gt(remainingToGraduate)) {
          const remainingUsd = remainingToGraduate.toNumber() / 1e6;
          const displayRemaining = remainingUsd < 0.01
            ? remainingUsd.toFixed(6).replace(/0+$/, "")
            : remainingUsd.toFixed(2);
          throw new Error(
            `Amount exceeds remaining curve capacity ($${displayRemaining} USDC left to graduate).`
          );
        }
      }
    }

    const quote = dbcClient.pool.swapQuote2({
      virtualPool,
      config,
      swapBaseForQuote,
      hasReferral: false,
      eligibleForFirstSwapWithMinFee: false,
      currentPoint,
      slippageBps,
      swapMode: DbcSwapMode.ExactIn,
      amountIn,
    });
    if (!quote.minimumAmountOut || quote.outputAmount.isZero()) throw new Error("No executable DBC quote is available for this amount.");
    const spotPrice = Number(getPriceFromSqrtPrice(virtualPool.poolState.sqrtPrice, 6, 6).toString());
    const inputNumber = Number(amount);
    const outputNumber = Number(quote.outputAmount.toString());
    const tokensNumber = direction === "buy" ? outputNumber : inputNumber;
    const quoteNumber = direction === "buy" ? inputNumber : outputNumber;
    const effectivePrice = tokensNumber > 0 ? quoteNumber / tokensNumber : 0;
    const priceImpactPct = spotPrice > 0 ? Math.abs(effectivePrice - spotPrice) / spotPrice * 100 : 0;
    let transaction: Transaction | undefined;
    if (trader) {
      transaction = await dbcClient.pool.swap2({
        owner: trader,
        payer: trader,
        pool: poolAddress,
        swapBaseForQuote,
        referralTokenAccount: null,
        swapMode: DbcSwapMode.ExactIn,
        amountIn,
        minimumAmountOut: quote.minimumAmountOut,
      });
    }
    if (transaction) {
      transaction.feePayer = trader!;
      const latest = await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = latest.blockhash;
      lastValidBlockHeight = latest.lastValidBlockHeight;
    }
    return NextResponse.json({ protocol: "meteora-dbc", pool: poolAddress.toBase58(), registry: registryAddress.toBase58(), lastValidBlockHeight, ...responseQuote(amountIn, quote.outputAmount, quote.minimumAmountOut, direction, priceImpactPct, transaction) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "A live Solana trade quote is unavailable.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Missing ") || message.startsWith("Invalid ") ? 400 : 409, headers: { "Cache-Control": "no-store" } });
  }
}
