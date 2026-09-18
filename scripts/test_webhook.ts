import * as fs from "fs";
import * as path from "path";

const KNOWN_TOKENS = [
  { symbol: "MARS", mint: "MARS99999999999999999999999999999999999999", name: "Mars Autonomous Colony" },
  { symbol: "NVDU", mint: "NVDU99999999999999999999999999999999999999", name: "Nvidia Degen Unit" },
  { symbol: "DIVI", mint: "DIVI99999999999999999999999999999999999999", name: "Dividend Yield Stonk" },
  { symbol: "FLASH", mint: "FLASH9999999999999999999999999999999999999", name: "Flash Capital" },
  { symbol: "CYBER", mint: "CYBER9999999999999999999999999999999999999", name: "Cyberpunk Ventures" },
  { symbol: "ORBIT", mint: "ORBIT9999999999999999999999999999999999999", name: "Orbital Space Corp" },
  { symbol: "PIXEL", mint: "PIXEL9999999999999999999999999999999999999", name: "Pixel GPU Compute" },
  { symbol: "NEURAL", mint: "NEURAL999999999999999999999999999999999999", name: "Neural Robotics" },
  { symbol: "STARLINK", mint: "STARLINK9999999999999999999999999999999999", name: "Starlink Global Mesh" },
];

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

function getRandomTrader(): string {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let result = "";
  for (let i = 0; i < 44; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

interface WebhookSimParams {
  mint: string;
  symbol: string;
  tradeType: "BUY" | "SELL" | "REDEEM";
  usdAmount: number;
}

async function sendWebhookForToken(params: WebhookSimParams, secret: string) {
  const { mint, symbol, tradeType, usdAmount } = params;
  const endpoint = "http://localhost:3000/api/webhooks/helius";
  const testSignature = `sim_${tradeType.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const trader = getRandomTrader();

  // Calculate approximate token amount based on realistic price
  const estimatedPrice = 0.033;
  const tokensNum = Math.max(10, Math.floor(usdAmount / estimatedPrice));
  const tokensLamports = tokensNum * 1_000_000;
  const quoteLamports = Math.floor(usdAmount * 1_000_000);

  let logAction = `Bought ${tokensLamports} tokens for ${quoteLamports} lamports quote`;
  if (tradeType === "SELL") {
    logAction = `Sold ${tokensLamports} tokens for ${quoteLamports} lamports quote`;
  } else if (tradeType === "REDEEM") {
    logAction = `Redeemed ${tokensLamports} tokens for ${quoteLamports} lamports equity`;
  }

  const payload = [
    {
      signature: testSignature,
      type: "SWAP",
      source: "STREETFUN_BONDING_CURVE",
      fee: 5000,
      feePayer: trader,
      slot: 128450 + Math.floor(Math.random() * 1000),
      timestamp: Math.floor(Date.now() / 1000),
      meta: {
        logMessages: [
          "Program 6ZiovCkRxRJgUaCS9uftFk3eVnGDsbnDXgUV1XHybH52 invoke [1]",
          `Program log: Instruction: ${tradeType === "BUY" ? "Buy" : tradeType === "SELL" ? "Sell" : "BurnAndRedeem"}`,
          `Program log: ${logAction}`,
          "Program 6ZiovCkRxRJgUaCS9uftFk3eVnGDsbnDXgUV1XHybH52 success",
        ],
      },
      instructions: [
        {
          programId: "6ZiovCkRxRJgUaCS9uftFk3eVnGDsbnDXgUV1XHybH52",
          accounts: [
            trader,
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            mint,
          ],
          data: "mockInstructionData",
        },
      ],
    },
  ];

  console.log(`📡 [Webhook] -> ${tradeType.padEnd(6)} | $${usdAmount.toFixed(2).padStart(8)} | $${symbol.padEnd(8)} (${mint.slice(0, 8)}...)`);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: secret,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`❌ HTTP ${res.status}: ${err}`);
      return false;
    }

    const data = await res.json();
    return data.success;
  } catch (err: any) {
    console.error(`❌ Network error reaching localhost:3000: ${err.message}`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const secret = getWebhookSecret();

  const isAll = args.includes("--all");
  const isLoop = args.includes("--loop") || args.includes("--watch");
  
  // Extract custom trade type
  let customType: "BUY" | "SELL" | "REDEEM" | null = null;
  const typeIdx = args.indexOf("--type");
  if (typeIdx !== -1 && args[typeIdx + 1]) {
    const t = args[typeIdx + 1].toUpperCase();
    if (t === "BUY" || t === "SELL" || t === "REDEEM") {
      customType = t;
    }
  }

  // Extract custom amount
  let customAmount: number | null = null;
  const amountIdx = args.indexOf("--amount");
  if (amountIdx !== -1 && args[amountIdx + 1]) {
    const a = parseFloat(args[amountIdx + 1]);
    if (!isNaN(a) && a > 0) {
      customAmount = a;
    }
  }

  // Extract target token (non-flag argument)
  const nonFlagArg = args.find((a) => !a.startsWith("--"));

  console.log("================================================================");
  console.log("⚡ StreetFun Helius Webhook Local Simulator");
  console.log("   Simulating real-time Solana protocol events into Supabase & UI");
  console.log("================================================================");

  if (isAll) {
    console.log(`Simulating trade activity for ALL ${KNOWN_TOKENS.length} tokens...\n`);
    for (const t of KNOWN_TOKENS) {
      const type = customType || (Math.random() > 0.3 ? "BUY" : "SELL");
      const amount = customAmount || Math.round((Math.random() * 1000 + 50) * 100) / 100;
      await sendWebhookForToken({ mint: t.mint, symbol: t.symbol, tradeType: type, usdAmount: amount }, secret);
    }
    console.log("\n✅ All tokens updated successfully in Supabase!");
    return;
  }

  if (isLoop) {
    console.log("🔄 Running in continuous simulation loop (Ctrl+C to stop)...");
    console.log("   Broadcasting new Helius webhook events every 3 seconds.\n");
    const runStep = async () => {
      const t = KNOWN_TOKENS[Math.floor(Math.random() * KNOWN_TOKENS.length)];
      const type = customType || (Math.random() > 0.3 ? "BUY" : "SELL");
      const amount = customAmount || Math.round((Math.random() * 500 + 20) * 100) / 100;
      await sendWebhookForToken({ mint: t.mint, symbol: t.symbol, tradeType: type, usdAmount: amount }, secret);
    };
    await runStep();
    setInterval(runStep, 3000);
    return;
  }

  // Single token simulation
  let targetToken = KNOWN_TOKENS[0]; // default MARS if not specified
  if (nonFlagArg) {
    const matched = KNOWN_TOKENS.find(
      (k) =>
        k.symbol.toLowerCase() === nonFlagArg.toLowerCase() ||
        k.mint.toLowerCase() === nonFlagArg.toLowerCase()
    );
    if (matched) {
      targetToken = matched;
    } else {
      // It's a custom mint address
      targetToken = {
        symbol: nonFlagArg.slice(0, 5).toUpperCase(),
        mint: nonFlagArg,
        name: `Token ${nonFlagArg.slice(0, 6)}`,
      };
    }
  }

  const tradeType = customType || "BUY";
  const amount = customAmount || 250;

  console.log(`Target Token: $${targetToken.symbol} (${targetToken.mint})`);
  console.log(`Action:       ${tradeType}`);
  console.log(`Amount:       $${amount.toFixed(2)} USDC\n`);

  const ok = await sendWebhookForToken(
    { mint: targetToken.mint, symbol: targetToken.symbol, tradeType, usdAmount: amount },
    secret
  );

  if (ok) {
    console.log(`\n🎉 Successfully sent and processed Helius event for $${targetToken.symbol}!`);
    console.log(`👉 Open: http://localhost:3000/token/${targetToken.mint}`);
  }
}

main();
