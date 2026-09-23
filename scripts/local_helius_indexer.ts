import { Connection, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || "6ZiovCkRxRJgUaCS9uftFk3eVnGDsbnDXgUV1XHybH52"
);

function getWebhookSecret(): string {
  let secret = process.env.HELIUS_WEBHOOK_SECRET;
  if (!secret) {
    try {
      const envLocal = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
      const match = envLocal.match(/HELIUS_WEBHOOK_SECRET=(.*)/);
      if (match && match[1]) {
        secret = match[1].trim();
      }
    } catch {}
  }
  return secret || "streetfun_webhook_secret_dev";
}

async function startLocalIndexer() {
  const rpcUrl = process.env.SOLANA_RPC || "http://127.0.0.1:8899";
  const webhookUrl = "http://localhost:3000/api/webhooks/helius";
  const secret = getWebhookSecret();

  console.log("================================================================");
  console.log("⚡ StreetFun Localnet Helius Webhook Daemon");
  console.log(`🔗 Solana RPC:      ${rpcUrl}`);
  console.log(`🎯 Program ID:      ${PROGRAM_ID.toBase58()}`);
  console.log(`📡 Target Webhook:  ${webhookUrl}`);
  console.log("================================================================");

  let connection: Connection;
  try {
    connection = new Connection(rpcUrl, {
      commitment: "confirmed",
      wsEndpoint: rpcUrl.replace("http", "ws"),
    });
    const version = await connection.getVersion();
    console.log(`✅ Connected to local Solana validator (v${version["solana-core"] || "unknown"})`);
  } catch (err: any) {
    console.warn(`⚠️ Could not connect to Solana at ${rpcUrl}: ${err.message}`);
    console.log("👉 Make sure 'solana-test-validator' is running if testing on localnet.");
    return;
  }

  console.log("👂 Listening for StreetFun program logs in real-time...\n");

  connection.onLogs(
    PROGRAM_ID,
    async (logsInfo, context) => {
      const signature = logsInfo.signature;
      const logMessages = logsInfo.logs;

      console.log(`\n🔔 Detected on-chain transaction: ${signature.slice(0, 16)}...`);

      // Determine trade type from logs
      const logText = logMessages.join(" ");
      let tradeType: "BUY" | "SELL" | "REDEEM" = "BUY";
      if (logText.includes("Instruction: Sell") || logText.includes("Sell")) {
        tradeType = "SELL";
      } else if (logText.includes("Instruction: BurnAndRedeem") || logText.includes("Redeem")) {
        tradeType = "REDEEM";
      }

      // Fetch transaction to extract account keys (mint address)
      let mint = "UNKNOWN_MINT";
      let feePayer = "519jca26LioEQiPhwoHCkC8mNZiCF7cDmtaXdp98iCv2";

      try {
        const tx = await connection.getParsedTransaction(signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (tx) {
          feePayer = tx.transaction.message.accountKeys[0]?.pubkey?.toBase58() || feePayer;
          // Look for token mint in account keys
          const accounts = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
          mint = accounts[2] || accounts[1] || mint;
        }
      } catch {}

      const payload = [
        {
          signature,
          type: "SWAP",
          source: "STREETFUN_BONDING_CURVE",
          fee: 5000,
          feePayer,
          slot: context.slot,
          timestamp: Math.floor(Date.now() / 1000),
          meta: {
            logMessages,
          },
          instructions: [
            {
              programId: PROGRAM_ID.toBase58(),
              accounts: [feePayer, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", mint],
              data: "onChainData",
            },
          ],
        },
      ];

      try {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: secret,
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          console.log(`✅ Forwarded to Helius webhook -> Processed ${tradeType} for ${mint.slice(0, 8)}...`);
        } else {
          console.error(`❌ Webhook returned HTTP ${res.status}`);
        }
      } catch (err: any) {
        console.error(`❌ Failed to deliver webhook payload: ${err.message}`);
      }
    },
    "confirmed"
  );
}

startLocalIndexer();
