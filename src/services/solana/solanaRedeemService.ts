import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAccount, getMint, getAssociatedTokenAddress, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { IRedeemService, RedeemParams, RedeemResult, WalletIdentity } from "../types";
import { PROGRAM_ID } from "@/sdk/constants";
import { getBrowserRpcUrl } from "@/sdk/network";
import { getCurvePda, getTreasuryVaultPda } from "@/sdk/pda";
import { toTokenUnits } from "@/sdk/amounts";
import { confirmSubmittedTransaction, pendingTradeKey, savePendingTrade, SubmittedTransactionError } from "./transactionConfirmation";
import { solanaTokenService } from "./solanaTokenService";
import idl from "@/idl/streetfun.json";

export class SolanaRedeemService implements IRedeemService {
  async executeRedeem(params: RedeemParams, wallet?: WalletIdentity): Promise<RedeemResult> {
    if (!wallet || wallet instanceof PublicKey || typeof wallet.sendTransaction !== "function") throw new Error("Connect a wallet that can sign transactions.");
    if (params.actionType !== "stock") throw new Error("An atomic collateral-to-USDC swap is unavailable. No tokens were burned.");
    const amount = toTokenUnits(params.memeAmount);
    const connection = new Connection(getBrowserRpcUrl(), "confirmed");
    const provider = new AnchorProvider(connection, { publicKey: wallet.publicKey } as any, { commitment: "confirmed" });
    const program = new Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, provider);
    const memeMint = new PublicKey(params.token.mint);
    const [curvePda] = getCurvePda(memeMint, PROGRAM_ID);
    const [treasuryVault] = getTreasuryVaultPda(curvePda, PROGRAM_ID);
    const curve = await (program.account as any).curveAccount.fetch(curvePda);
    if (!curve.isGraduated) throw new Error("This token has not graduated.");
    // The current deployed program accepts legacy SPL collateral only.
    // getMint fails closed for Token-2022 rather than submitting an invalid burn.
    const [equityMint, vault] = await Promise.all([
      getMint(connection, curve.targetEquityMint), getAccount(connection, treasuryVault),
    ]);
    const supply = BigInt(curve.totalMemeSupply.toString());
    const collateral = BigInt(curve.totalEquityLocked.toString());
    if (amount > supply || supply === 0n) throw new Error("Burn amount exceeds outstanding supply.");
    const expected = amount * collateral / supply;
    if (expected === 0n || expected > vault.amount) throw new Error("Insufficient redeemable collateral.");
    const userToken = await getAssociatedTokenAddress(memeMint, wallet.publicKey);
    const userEquity = await getAssociatedTokenAddress(curve.targetEquityMint, wallet.publicKey);
    const tx = new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, userEquity, wallet.publicKey, curve.targetEquityMint));
    tx.add(await (program.methods as any).burnAndRedeem({ memeTokensToBurn: new BN(amount.toString()), minEquityTokensOut: new BN(expected.toString()) }).accounts({
      redeemer: wallet.publicKey, memeMint, targetEquityMint: curve.targetEquityMint, curve: curvePda,
      treasuryVault, redeemerTokenAccount: userToken, redeemerEquityAccount: userEquity, tokenProgram: TOKEN_PROGRAM_ID,
    }).instruction());
    const blockhash = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash.blockhash; tx.feePayer = wallet.publicKey;
    const signature = await wallet.sendTransaction(tx, connection, { skipPreflight: false, preflightCommitment: "confirmed" });
    const key = pendingTradeKey(wallet.publicKey.toBase58(), params.token.mint);
    savePendingTrade(key, signature);
    try { await confirmSubmittedTransaction(connection, signature, blockhash); savePendingTrade(key, null); }
    catch (error) { if (!(error instanceof SubmittedTransactionError)) savePendingTrade(key, null); throw error; }
    let entitledShares = 0;
    try {
      const response = await fetch("/api/redemptions/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signature, mint: params.token.mint }) });
      if (response.ok) entitledShares = Number((await response.json()).trade?.equity_amount || 0);
    } catch { /* Confirmation succeeded. Never resubmit to repair the index. */ }
    return { success: true, txSignature: signature, entitledShares, usdcValue: 0,
      message: entitledShares > 0 ? `Redeemed ${entitledShares.toLocaleString()} collateral tokens to your wallet.` : `Transaction ${signature} confirmed. Exact receipt is pending verification; do not resubmit.`,
      updatedToken: (await solanaTokenService.getToken(params.token.mint).catch(() => null)) || params.token };
  }
}
export const solanaRedeemService = new SolanaRedeemService();
