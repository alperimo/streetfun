import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, unpackAccount, unpackMint } from "@solana/spl-token";
import { compilePantaTransaction, validatePantaInstructions } from "@/lib/pantaTransaction";
import { getServerConnection, assertConfiguredCluster } from "./rpc";
import { address, object, text, unavailable, usdcUnits, MarketBinding, PantaError } from "./pantaValidation";
import { issuePantaSession } from "./pantaSession";

export async function buildCheckedTransaction(raw: Record<string, unknown>, binding: MarketBinding, session: Record<string, unknown>, action: "buy" | "claim") {
  const wallet = address(session.wallet);
  const instructions = validatePantaInstructions(raw.instructions, { wallet, ...binding, kind: action });
  const connection = getServerConnection(); await assertConfiguredCluster(connection);
  const mint = new PublicKey(binding.usdcMint), owner = new PublicKey(wallet);
  const mintAccount = await connection.getAccountInfo(mint, "confirmed");
  if (!mintAccount || !mintAccount.owner.equals(TOKEN_PROGRAM_ID) || unpackMint(mint, mintAccount).decimals !== 6) throw unavailable();
  const ata = getAssociatedTokenAddressSync(mint, owner);
  const before = await connection.getAccountInfo(ata, "confirmed");
  const beforeAmount = before ? unpackAccount(ata, before).amount : 0n;
  if (before && !unpackAccount(ata, before).owner.equals(owner)) throw unavailable();
  if (action === "buy" && beforeAmount < usdcUnits(session.amountUsdc)) throw new PantaError("INSUFFICIENT_BALANCE", 409, "Insufficient USDC balance.");
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = compilePantaTransaction(instructions, wallet, blockhash);
  if (tx.serialize().length > 1232) throw unavailable();
  const simulation = await connection.simulateTransaction(tx, { sigVerify: false, commitment: "confirmed", accounts: { encoding: "base64", addresses: [ata.toBase58(), wallet] } });
  if (simulation.value.err) throw unavailable();
  const simulated = simulation.value.accounts?.[0];
  const simulatedWallet = simulation.value.accounts?.[1];
  if (!simulated || !simulatedWallet || simulated.owner !== TOKEN_PROGRAM_ID.toBase58()) throw unavailable();
  const after = unpackAccount(ata, { ...simulated, owner: new PublicKey(simulated.owner), data: Buffer.from(simulated.data[0], "base64") });
  if (!after.owner.equals(owner) || !after.mint.equals(mint)) throw unavailable();
  const spend = beforeAmount - after.amount;
  if ((action === "buy" && (spend <= 0n || spend > usdcUnits(session.amountUsdc))) || (action === "claim" && spend >= 0n)) throw unavailable();
  const walletLamports = await connection.getBalance(owner, "confirmed");
  if (walletLamports - simulatedWallet.lamports > 10_000_000) throw unavailable(); // rent + fees capped at 0.01 SOL
  const expires = Math.min(Date.now() + 60_000, action === "buy" ? Number(session.expires) : Date.now() + 60_000);
  if (expires <= Date.now()) throw unavailable();
  const transaction = Buffer.from(tx.serialize()).toString("base64");
  const orderToken = issuePantaSession({ kind: "order", action, ...binding, wallet, side: session.side, amountUsdc: session.amountUsdc,
    quoteId: session.quoteId, orderId: raw.orderId, shares: action === "buy" ? raw.expectedShares : raw.winningShares,
    lastValidBlockHeight, messageHash: createHash("sha256").update(tx.message.serialize()).digest("hex"), expires: Date.now() + 86400_000 });
  return { instructions, transaction, recentBlockhash: blockhash, lastValidBlockHeight, expiresAt: new Date(expires).toISOString(), orderToken,
    programId: binding.programId, usdcMint: binding.usdcMint, wallet, marketId: binding.marketId };
}
