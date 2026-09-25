import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getEpochFee, getAccount, getMint, getAssociatedTokenAddress, createAssociatedTokenAccountIdempotentInstruction, getTransferFeeConfig } from "@solana/spl-token";
import { IRedeemService, RedeemParams, RedeemResult, WalletIdentity } from "../types";
import { PROGRAM_ID } from "@/sdk/constants";
import { getBrowserRpcUrl } from "@/sdk/network";
import { getCurvePda, getTreasuryVaultPda } from "@/sdk/pda";
import { toTokenUnits } from "@/sdk/amounts";
import { netAfterTransferFee } from "@/sdk/transferFee";
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
    const equityMintInfo = await connection.getAccountInfo(curve.targetEquityMint, "confirmed");
    const equityTokenProgram = equityMintInfo?.owner;
    if (!equityTokenProgram || (!equityTokenProgram.equals(TOKEN_PROGRAM_ID) && !equityTokenProgram.equals(TOKEN_2022_PROGRAM_ID))) {
      throw new Error("The collateral mint has an unsupported token program.");
    }
    if (equityTokenProgram.equals(TOKEN_2022_PROGRAM_ID) && process.env.NEXT_PUBLIC_TOKEN_2022_COLLATERAL_DEPLOYED !== "true") {
      throw new Error("Token-2022 redemption requires the audited program upgrade on this network. No tokens were burned.");
    }
    const [equityMint, vault] = await Promise.all([
      getMint(connection, curve.targetEquityMint, "confirmed", equityTokenProgram),
      getAccount(connection, treasuryVault, "confirmed", equityTokenProgram),
    ]);
    const supply = BigInt(curve.totalMemeSupply.toString());
    const collateral = BigInt(curve.totalEquityLocked.toString());
    if (amount > supply || supply === 0n) throw new Error("Burn amount exceeds outstanding supply.");
    const expectedGross = amount * collateral / supply;
    const transferFeeConfig = getTransferFeeConfig(equityMint);
    const epoch = await connection.getEpochInfo("confirmed");
    const activeTransferFee = transferFeeConfig
      ? getEpochFee(transferFeeConfig, BigInt(epoch.epoch))
      : null;
    const expectedNet = activeTransferFee
      ? netAfterTransferFee(expectedGross, activeTransferFee.transferFeeBasisPoints, activeTransferFee.maximumFee)
      : expectedGross;
    if (expectedGross === 0n || expectedNet === 0n || expectedGross > vault.amount) throw new Error("Insufficient redeemable collateral.");
    const userToken = await getAssociatedTokenAddress(memeMint, wallet.publicKey);
    const userEquity = await getAssociatedTokenAddress(curve.targetEquityMint, wallet.publicKey, false, equityTokenProgram);
    const tx = new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, userEquity, wallet.publicKey, curve.targetEquityMint, equityTokenProgram));
    tx.add(await (program.methods as any).burnAndRedeem({ memeTokensToBurn: new BN(amount.toString()), minEquityTokensOut: new BN(expectedNet.toString()) }).accounts({
      redeemer: wallet.publicKey, memeMint, targetEquityMint: curve.targetEquityMint, curve: curvePda,
      treasuryVault, redeemerTokenAccount: userToken, redeemerEquityAccount: userEquity,
      tokenProgram: TOKEN_PROGRAM_ID, equityTokenProgram,
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
