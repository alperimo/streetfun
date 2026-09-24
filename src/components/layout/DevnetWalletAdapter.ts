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

const STORAGE_KEY = "streetfun-devnet-wallet";

/** A local development wallet adapter that connects ~/.config/solana/id.json on devnet */
export class DevnetWalletAdapter extends BaseWalletAdapter<"Local Devnet Wallet"> {
  name = "Local Devnet Wallet" as WalletName<"Local Devnet Wallet">;
  url = "https://streetfun.xyz";
  icon = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2306b6d4' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 12V7H5a2 2 0 0 1 0-4h14v4'></path><path d='M3 5v14a2 2 0 0 0 2 2h16v-5'></path><path d='M18 12a2 2 0 0 0 0 4h4v-4Z'></path></svg>";
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
      let keypair: Keypair | null = null;
      const saved = typeof window !== "undefined" ? sessionStorage.getItem(STORAGE_KEY) : null;
      if (saved) {
        try {
          keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(saved)));
        } catch {}
      }

      if (!keypair) {
        const response = await fetch("/api/devnet/wallet");
        if (!response.ok) {
          throw new Error("Could not load the local devnet wallet from ~/.config/solana/id.json");
        }
        const data = await response.json();
        keypair = Keypair.fromSecretKey(Uint8Array.from(data.secretKey));
        if (typeof window !== "undefined") {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(keypair.secretKey)));
        }
      }

      this.keypair = keypair;
      this.emit("connect", keypair.publicKey);
    } catch (cause) {
      const error = new WalletConnectionError(
        cause instanceof Error ? cause.message : "Could not connect local devnet wallet.",
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

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    if (!this.keypair) throw new WalletNotConnectedError();
    if (transaction instanceof VersionedTransaction) {
      transaction.sign([this.keypair]);
    } else {
      transaction.partialSign(this.keypair);
    }
    return transaction;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    return Promise.all(transactions.map((tx) => this.signTransaction(tx)));
  }

  async sendTransaction(
    transaction: Transaction | VersionedTransaction,
    connection: Connection,
    options: SendTransactionOptions = {}
  ): Promise<string> {
    if (!this.keypair) throw new WalletNotConnectedError();
    try {
      if (transaction instanceof VersionedTransaction) {
        transaction.sign([...(options.signers ?? []), this.keypair]);
      } else {
        const prepared = await this.prepareTransaction(transaction, connection, options);
        prepared.partialSign(...(options.signers ?? []), this.keypair);
      }
      return await connection.sendRawTransaction(transaction.serialize(), options);
    } catch (cause) {
      const error = new WalletSendTransactionError(
        cause instanceof Error ? cause.message : "Devnet transaction failed.",
        cause
      );
      this.emit("error", error);
      throw error;
    }
  }
}
