import puppeteer from "puppeteer-core";
import { Connection } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

type Receipt = { action?: string; txSignature?: string | null };

function explorerQuery(network: string, rpcUrl: string): string {
  return network === "localnet"
    ? `cluster=custom&customUrl=${encodeURIComponent(rpcUrl)}`
    : `cluster=${encodeURIComponent(network)}`;
}

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const receiptsPath = path.resolve(
    process.env.E2E_RECEIPTS_PATH ||
      path.join(projectRoot, "target/test-artifacts/e2e_verified_transactions.json")
  );
  const outputDir = path.resolve(
    process.env.E2E_EXPLORER_OUTPUT_DIR ||
      path.join(projectRoot, "target/test-artifacts/explorer")
  );
  const network = process.env.SOLANA_NETWORK || "localnet";
  const defaults: Record<string, string> = {
    localnet: "http://127.0.0.1:8899",
    devnet: "https://api.devnet.solana.com",
    "mainnet-beta": "https://api.mainnet-beta.solana.com",
  };
  const rpcUrl = process.env.SOLANA_RPC_URL || defaults[network];
  if (!rpcUrl) throw new Error(`Unsupported SOLANA_NETWORK: ${network}`);

  const chromePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!fs.existsSync(chromePath)) {
    throw new Error(`Chrome was not found at ${chromePath}; set CHROME_PATH to the installed browser executable.`);
  }

  const receipts = JSON.parse(fs.readFileSync(receiptsPath, "utf8")) as Record<string, Receipt>;
  const transactions = Object.entries(receipts).filter(
    ([, receipt]) => typeof receipt.txSignature === "string" && receipt.txSignature.length > 0
  );
  if (transactions.length === 0) {
    throw new Error(`No transaction signatures were recorded in ${receiptsPath}; blocked steps will not be presented as transactions.`);
  }

  const connection = new Connection(rpcUrl, "confirmed");
  const query = explorerQuery(network, rpcUrl);
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    defaultViewport: { width: 1440, height: 1200 },
    args: ["--no-sandbox", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage();
    fs.mkdirSync(outputDir, { recursive: true });
    for (const [key, receipt] of transactions) {
      const signature = receipt.txSignature!;
      const transaction = await connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (!transaction) {
        throw new Error(`RPC did not return confirmed transaction ${signature} from ${network}`);
      }

      const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
      const status = transaction.meta?.err == null ? "success" : "failed";
      const url = `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?${query}`;
      console.log(`Capturing receipt ${key} (${status}, slot ${transaction.slot}): ${url}`);
      await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
      await page.screenshot({
        path: path.join(outputDir, `${safeKey}_${status}.png`),
        fullPage: false,
      });
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
