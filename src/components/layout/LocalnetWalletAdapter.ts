import {
  BaseWalletAdapter,
  WalletConnectionError,
  WalletName,
  WalletNotConnectedError,
  WalletReadyState,
  WalletSendTransactionError,
  SendTransactionOptions,
} from "@solana/wallet-adapter-base";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

const STORAGE_KEY = "streetfun-localnet-wallet";

/** A disposable browser signer for the local validator only. Never use its key on a public network. */
export class LocalnetWalletAdapter extends BaseWalletAdapter<"Localnet Dev Wallet"> {
  name = "Localnet Dev Wallet" as WalletName<"Localnet Dev Wallet">;
  url = "";
  icon = "";
  readyState = WalletReadyState.Loadable;
  supportedTransactionVersions = new Set(["legacy", 0] as const);
  private keypair: Keypair | null = null;
  private isConnecting = false;

  get publicKey(): PublicKey | null {
    return this.keypair?.publicKey ?? null;
  }

  get connecting(): boolean {
    return this.isConnecting;
  }

  async connect(): Promise<void> {
    if (this.connected || this.isConnecting) return;
    this.isConnecting = true;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      const keypair = saved
        ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(saved)))
        : Keypair.generate();
      if (!saved) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(keypair.secretKey)));

      const response = await fetch("/api/localnet/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: keypair.publicKey.toBase58() }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Could not fund the local testing wallet.");
      }
      this.keypair = keypair;
      this.emit("connect", keypair.publicKey);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      const friendlyMessage = message.toLowerCase().includes("fetch failed")
        ? "The StreetFun local validator is unavailable. Start it on 127.0.0.1:8899 and try again."
        : message || "Could not connect the local testing wallet.";
      const error = new WalletConnectionError(
        friendlyMessage,
        cause
      );
      this.emit("error", error);
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.keypair) return;
    this.keypair = null;
    this.emit("disconnect");
  }

  async sendTransaction(
    transaction: Transaction | VersionedTransaction,
    connection: Connection,
    options: SendTransactionOptions = {}
  ): Promise<string> {
    if (!this.keypair) throw new WalletNotConnectedError();
    try {
      const rpcHost = new URL(connection.rpcEndpoint).hostname;
      if (rpcHost !== "localhost" && rpcHost !== "127.0.0.1") {
        throw new Error("The local testing wallet can only sign for a local validator.");
      }
      if (transaction instanceof VersionedTransaction) {
        transaction.sign([...(options.signers ?? []), this.keypair]);
      } else {
        const prepared = await this.prepareTransaction(transaction, connection, options);
        prepared.partialSign(...(options.signers ?? []), this.keypair);
      }
      return await connection.sendRawTransaction(transaction.serialize(), options);
    } catch (cause) {
      const error = new WalletSendTransactionError(
        cause instanceof Error ? cause.message : "Local transaction failed.",
        cause
      );
      this.emit("error", error);
      throw error;
    }
  }
}
