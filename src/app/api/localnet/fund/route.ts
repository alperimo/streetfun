import { NextRequest, NextResponse } from "next/server";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getMint, getOrCreateAssociatedTokenAccount, getAccount, mintTo } from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { USDC_MINT } from "@/sdk/constants";

export const runtime = "nodejs";

function isRpcUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  return `${message} ${cause}`.toLowerCase().includes("fetch failed") ||
    `${message} ${cause}`.toLowerCase().includes("econnrefused");
}

export async function POST(request: NextRequest) {
  const rpc = process.env.SOLANA_RPC;
  const pageHost = request.nextUrl.hostname;
  const rpcHost = rpc ? new URL(rpc).hostname : "";
  const loopback = (host: string) => host === "localhost" || host === "127.0.0.1";
  if (
    process.env.NEXT_PUBLIC_SOLANA_NETWORK !== "localnet" ||
    !loopback(pageHost) ||
    !loopback(rpcHost)
  ) {
    return NextResponse.json({ error: "Local testing wallet is unavailable." }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const { publicKey: address } = await request.json();
    const recipient = new PublicKey(address);
    const walletPath = process.env.ANCHOR_WALLET || join(homedir(), ".config/solana/id.json");
    const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8"))));
    const connection = new Connection(rpc!, "confirmed");
    const mint = await getMint(connection, USDC_MINT);
    if (!mint.mintAuthority?.equals(payer.publicKey)) {
      throw new Error("The local wallet does not control the configured test USDC mint.");
    }

    if ((await connection.getBalance(recipient)) < LAMPORTS_PER_SOL) {
      const signature = await connection.requestAirdrop(recipient, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(signature, "confirmed");
    }
    const account = await getOrCreateAssociatedTokenAccount(connection, payer, USDC_MINT, recipient);
    const balance = (await getAccount(connection, account.address)).amount;
    const targetBalance = 10_000n * 1_000_000n;
    if (balance < targetBalance) {
      await mintTo(connection, payer, USDC_MINT, account.address, payer, targetBalance - balance);
    }
    return NextResponse.json({ publicKey: recipient.toBase58() });
  } catch (error) {
    console.error("[Localnet funding]", error);
    return NextResponse.json(
      {
        error: isRpcUnavailable(error)
          ? "The local Solana validator is unavailable. Start it on 127.0.0.1:8899 and try again."
          : error instanceof Error ? error.message : "Local wallet funding failed.",
        code: isRpcUnavailable(error) ? "RPC_UNAVAILABLE" : "LOCAL_WALLET_FUNDING_FAILED",
      },
      { status: 503 }
    );
  }
}
