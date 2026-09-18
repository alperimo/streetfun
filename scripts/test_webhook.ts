import * as fs from "fs";
import * as path from "path";

async function runLocalWebhookSimulation() {
  const endpoint = "http://localhost:3000/api/webhooks/helius";

  // Read actual secret from .env.local if present
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
  secret = secret;

  // Target token mint (default to flagship MARS or accept CLI arg)
  const targetMint = process.argv[2] || "MARS99999999999999999999999999999999999999";
  const testSignature = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const heliusMockPayload = [
    {
      signature: testSignature,
      type: "SWAP",
      source: "STREETFUN_BONDING_CURVE",
      fee: 5000,
      feePayer: "519jca26LioEQiPhwoHCkC8mNZiCF7cDmtaXdp98iCv2",
      slot: 128450,
      timestamp: Math.floor(Date.now() / 1000),
      meta: {
        logMessages: [
          "Program 6ZiovCkRxRJgUaCS9uftFk3eVnGDsbnDXgUV1XHybH52 invoke [1]",
          "Program log: Instruction: Buy",
          "Program log: Bought 45000000000 tokens for 1500000000 lamports quote",
          "Program 6ZiovCkRxRJgUaCS9uftFk3eVnGDsbnDXgUV1XHybH52 success",
        ],
      },
      instructions: [
        {
          programId: "6ZiovCkRxRJgUaCS9uftFk3eVnGDsbnDXgUV1XHybH52",
          accounts: [
            "519jca26LioEQiPhwoHCkC8mNZiCF7cDmtaXdp98iCv2",
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            targetMint,
          ],
          data: "mockData",
        },
      ],
    },
  ];

  console.log("----------------------------------------------------------------");
  console.log("🚀 Sending simulated Helius Webhook payload to localhost:3000...");
  console.log(`🎯 Target Mint: ${targetMint}`);
  console.log(`🔑 Signature:   ${testSignature}`);
  console.log("----------------------------------------------------------------");

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: secret,
      },
      body: JSON.stringify(heliusMockPayload),
    });

    const result = await res.json();
    console.log("✅ Webhook Response Status:", res.status);
    console.log("📦 Response Payload:", result);

    // Verify it exists in /api/trades
    const verifyRes = await fetch(`http://localhost:3000/api/trades/${targetMint}`);
    if (verifyRes.ok) {
      const verifyData = await verifyRes.json();
      console.log(`\n🎉 Verification Passed: Found ${verifyData.trades?.length} trades for this token.`);
      console.log("Top Trade:", verifyData.trades?.[0]);
    }
  } catch (err: any) {
    console.error("❌ Failed to reach localhost:3000. Is your Next.js dev server running?", err.message);
  }
}

runLocalWebhookSimulation();
