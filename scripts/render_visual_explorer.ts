import { Connection } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

type Receipt = {
  action?: string;
  txSignature?: string | null;
  status?: string;
  reason?: string;
  [key: string]: unknown;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function selectedNetwork(): { name: string; rpcUrl: string; explorerQuery: string } {
  const name = process.env.SOLANA_NETWORK || "localnet";
  const defaults: Record<string, string> = {
    localnet: "http://127.0.0.1:8899",
    devnet: "https://api.devnet.solana.com",
    "mainnet-beta": "https://api.mainnet-beta.solana.com",
  };
  const rpcUrl = process.env.SOLANA_RPC_URL || defaults[name];
  if (!rpcUrl) throw new Error(`Unsupported SOLANA_NETWORK: ${name}`);

  const explorerQuery =
    name === "localnet"
      ? `cluster=custom&customUrl=${encodeURIComponent(rpcUrl)}`
      : `cluster=${encodeURIComponent(name)}`;
  return { name, rpcUrl, explorerQuery };
}

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const receiptsPath = path.resolve(
    process.env.E2E_RECEIPTS_PATH ||
      path.join(projectRoot, "target/test-artifacts/e2e_verified_transactions.json")
  );
  const outputPath = path.resolve(
    process.env.E2E_PROOF_REPORT_PATH ||
      path.join(projectRoot, "target/test-artifacts/transaction-proof.html")
  );
  const receipts = JSON.parse(fs.readFileSync(receiptsPath, "utf8")) as Record<string, Receipt>;
  const { name, rpcUrl, explorerQuery } = selectedNetwork();
  const connection = new Connection(rpcUrl, "confirmed");
  const rows: string[] = [];

  for (const [key, receipt] of Object.entries(receipts)) {
    const signature = typeof receipt.txSignature === "string" ? receipt.txSignature : "";
    const heading = escapeHtml(key);

    if (!signature) {
      rows.push(`<article><h2>${heading}</h2><p class="blocked">No confirmed transaction signature recorded. The receipt reports: ${escapeHtml(receipt.status || "no status")}. ${escapeHtml(receipt.reason || "")}</p></article>`);
      continue;
    }

    const transaction = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!transaction) {
      throw new Error(`RPC did not return confirmed transaction ${signature} from ${name}`);
    }

    const successful = transaction.meta?.err == null;
    const explorerUrl = `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?${explorerQuery}`;
    const logs = transaction.meta?.logMessages || [];
    const logMarkup = logs.length
      ? `<details><summary>On-chain logs (${logs.length})</summary><pre>${escapeHtml(logs.join("\n"))}</pre></details>`
      : "<p>No transaction logs were returned by the RPC.</p>";
    const errorMarkup = successful
      ? ""
      : `<p class="failed">Execution error: ${escapeHtml(JSON.stringify(transaction.meta?.err))}</p>`;

    rows.push(`<article><h2>${heading}</h2><p class="${successful ? "confirmed" : "failed"}">${successful ? "Confirmed success" : "Confirmed failure"} · slot ${transaction.slot} · fee ${transaction.meta?.fee ?? "unknown"} lamports</p><p>Receipt label (not verified from chain data): ${escapeHtml(receipt.action || key)}</p><p><a href="${explorerUrl}" rel="noreferrer">Open confirmed transaction in Solana Explorer</a></p><code>${escapeHtml(signature)}</code>${errorMarkup}${logMarkup}</article>`);
  }

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>StreetFun transaction evidence</title>
<style>body{font:16px system-ui,sans-serif;max-width:1000px;margin:40px auto;padding:0 20px;background:#101412;color:#e7ece9}article{padding:20px;margin:18px 0;border:1px solid #38443d;border-radius:10px;background:#171d19}h1,h2{margin-top:0}code,pre{overflow-wrap:anywhere;white-space:pre-wrap}a{color:#74d8c3}.confirmed{color:#7de2a1}.failed{color:#ff8d8d}.blocked{color:#f1c878}summary{cursor:pointer}</style></head>
<body><h1>StreetFun transaction evidence</h1><p>RPC: ${escapeHtml(name)} (${escapeHtml(rpcUrl)}). Signatures below were fetched from that RPC at confirmed commitment. Records without a signature are shown as blocked or unsubmitted, not as transactions.</p>${rows.join("\n")}</body></html>`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html);
  console.log(`Wrote transaction evidence report: ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
