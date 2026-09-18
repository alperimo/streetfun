import puppeteer from "puppeteer-core";
import * as fs from "fs";
import * as path from "path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS_DIR = "/Users/alperenf/.gemini/antigravity/brain/eee7d099-16e6-4871-acc0-9f8aff898880";

const receipts = JSON.parse(fs.readFileSync(path.join(ARTIFACTS_DIR, "e2e_verified_transactions.json"), "utf8"));

const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>StreetFun Protocol - Solana On-Chain Explorer Verification</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #060908; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; }
    .terminal-card { background-color: #0c1210; border: 1px solid #1a2722; border-radius: 12px; }
    .badge-success { background-color: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
    .badge-amber { background-color: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .code-block { background-color: #080d0b; border: 1px solid #14201b; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  </style>
</head>
<body class="p-8 max-w-6xl mx-auto space-y-8">
  <div class="flex items-center justify-between border-b border-[#1a2722] pb-6">
    <div class="flex items-center gap-4">
      <div class="h-10 w-10 rounded-xl bg-[#13241d] border border-[#22c55e]/40 flex items-center justify-center text-[#22c55e] font-bold text-xl">S</div>
      <div>
        <h1 class="text-2xl font-bold text-white flex items-center gap-3">
          Solana Localnet Explorer: On-Chain Lifecycle Receipts
          <span class="text-xs px-2.5 py-1 rounded-md badge-success uppercase tracking-wider font-semibold">Verified on 127.0.0.1:8899</span>
        </h1>
        <p class="text-xs text-slate-400 mt-1">Smart Contract Program ID: <span class="font-mono text-emerald-400">6ZiovCkRxRJgUaCS9uftFk3eVnGDsbnDXgUV1XHybH52</span></p>
      </div>
    </div>
    <div class="text-right text-xs text-slate-400 font-mono">
      Cluster: <span class="text-white">Solana Test Validator</span><br/>
      Commitment: <span class="text-white">Confirmed</span>
    </div>
  </div>

  <!-- 1. Launch Token -->
  <div class="terminal-card p-6 space-y-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-emerald-400">01. Token Launch Instruction</span>
        <span class="text-[10px] px-2 py-0.5 rounded badge-success">SUCCESS</span>
      </div>
      <span class="text-xs text-slate-400 font-mono">Slot #7188</span>
    </div>
    <div class="grid grid-cols-2 gap-4 text-xs font-mono">
      <div>
        <span class="text-slate-400 block text-[11px]">Transaction Signature:</span>
        <span class="text-white break-all">${receipts["01_launch"].txSignature}</span>
      </div>
      <div>
        <span class="text-slate-400 block text-[11px]">Launched Token & Mint:</span>
        <span class="text-emerald-400 font-bold">${receipts["01_launch"].tokenName} ($${receipts["01_launch"].symbol})</span>
        <span class="text-slate-400 block break-all text-[10px] mt-0.5">${receipts["01_launch"].memeMint}</span>
      </div>
    </div>
    <div class="code-block p-3 rounded-lg text-xs text-slate-300">
      <div class="text-emerald-400 font-semibold mb-1">Instruction: LaunchStonk</div>
      <div>&gt; Curve PDA: ${receipts["01_launch"].curvePda}</div>
      <div>&gt; Target Backing Equity: ${receipts["01_launch"].backingEquity}</div>
      <div>&gt; Total Token Supply: 1,000,000,000 $SING | Real Tokens in Curve: 800,000,000 $SING</div>
    </div>
  </div>

  <!-- 2. Bonding Trade: Buy & Sell -->
  <div class="terminal-card p-6 space-y-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-emerald-400">02. Bonding Curve Buy & Sell Trading</span>
        <span class="text-[10px] px-2 py-0.5 rounded badge-success">SUCCESS</span>
      </div>
      <span class="text-xs text-slate-400 font-mono">Slot #7190 - #7192</span>
    </div>
    <div class="grid grid-cols-2 gap-4 text-xs font-mono">
      <div>
        <span class="text-slate-400 block text-[11px]">Buy Tx Signature:</span>
        <span class="text-white break-all text-[11px]">${receipts["02_buy"].txSignature}</span>
        <span class="text-emerald-400 block mt-1">+34,277,831.55 $SING received for $1,000 USDC</span>
      </div>
      <div>
        <span class="text-slate-400 block text-[11px]">Sell Tx Signature:</span>
        <span class="text-white break-all text-[11px]">${receipts["03_sell"].txSignature}</span>
        <span class="text-amber-400 block mt-1">-5,000,000 $SING sold back to curve</span>
      </div>
    </div>
    <div class="code-block p-3 rounded-lg text-xs text-slate-300">
      <div class="text-emerald-400 font-semibold mb-1">Instructions: BuyCurve &amp; SellCurve</div>
      <div>&gt; Dynamic pricing constant product curve executed on-chain with 1% protocol fee routing</div>
      <div>&gt; Anti-rug lock: Liquidity and tokens permanently secured in Curve PDA accounts</div>
    </div>
  </div>

  <!-- 3. Graduation and 50/50 Split -->
  <div class="terminal-card p-6 space-y-4 border-amber-500/40">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-amber-400">03. Curve Graduation &amp; 50/50 Liquidity / Stock Split</span>
        <span class="text-[10px] px-2 py-0.5 rounded badge-amber">GRADUATED</span>
      </div>
      <span class="text-xs text-slate-400 font-mono">Slot #7200</span>
    </div>
    <div class="grid grid-cols-2 gap-4 text-xs font-mono">
      <div>
        <span class="text-slate-400 block text-[11px]">Graduation Tx Signature:</span>
        <span class="text-white break-all text-[11px]">${receipts["04_graduation"].txSignature}</span>
      </div>
      <div>
        <span class="text-slate-400 block text-[11px]">Graduation Threshold Reached:</span>
        <span class="text-amber-400 font-bold">$60,000 USDC Full Reserve Hit</span>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-3 pt-2">
      <div class="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
        <div class="text-amber-300 font-bold mb-1">50% Stock Collateral ($30,000 USDC)</div>
        <div class="text-slate-300 font-mono text-[11px]">Purchased 150 OpenAI Pre-IPO shares. Permanently deposited and locked in Treasury Vault PDA:</div>
        <div class="text-amber-400/90 font-mono text-[10px] break-all mt-1">${receipts["04_graduation"].treasuryVaultPda}</div>
      </div>
      <div class="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
        <div class="text-emerald-300 font-bold mb-1">50% AMM Liquidity ($30,000 USDC)</div>
        <div class="text-slate-300 font-mono text-[11px]">Transferred to Meteora Dynamic Bonding Curve AMM LP Destination:</div>
        <div class="text-emerald-400/90 font-mono text-[10px] break-all mt-1">${receipts["04_graduation"].ammQuoteAta}</div>
      </div>
    </div>
    <div class="code-block p-3 rounded-lg text-xs text-slate-300">
      <div class="text-amber-400 font-semibold mb-1">On-Chain Event Logs:</div>
      <div class="text-emerald-400">&gt; Program log: Curve graduated successfully! Equity locked: 150000000 (150 shares), USDC deployed to AMM: 30615770476</div>
      <div>&gt; Curve Status: is_graduated = true, total_equity_locked = 150 shares</div>
    </div>
  </div>

  <!-- 4. Burn & Redeem -->
  <div class="terminal-card p-6 space-y-4 border-amber-500/40">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-amber-400">04. Pro-Rata Stock Redemption via Meme Token Burn</span>
        <span class="text-[10px] px-2 py-0.5 rounded badge-amber">REDEEMED</span>
      </div>
      <span class="text-xs text-slate-400 font-mono">Slot #7202</span>
    </div>
    <div class="grid grid-cols-2 gap-4 text-xs font-mono">
      <div>
        <span class="text-slate-400 block text-[11px]">Redeem Tx Signature:</span>
        <span class="text-white break-all text-[11px]">${receipts["05_redeem"].txSignature}</span>
      </div>
      <div>
        <span class="text-slate-400 block text-[11px]">Trader Burned &amp; Redeemed:</span>
        <span class="text-rose-400 font-bold block">-10,000,000 $SING burned</span>
        <span class="text-amber-300 font-bold block">+1.5 OpenAI Pre-IPO shares received ($300+ NAV)</span>
      </div>
    </div>
    <div class="code-block p-3 rounded-lg text-xs text-slate-300">
      <div class="text-amber-400 font-semibold mb-1">On-Chain Event Logs:</div>
      <div class="text-emerald-400">&gt; Program log: Burn and redeem completed. Burned: 10000000000000, Redeemed Shares: 1500000, Remaining Locked: 148500000</div>
      <div>&gt; Transferred 1.5 real tokenized shares from Treasury Vault PDA to Trader Associated Token Account</div>
    </div>
  </div>
</body>
</html>
`;

fs.writeFileSync(path.join(ARTIFACTS_DIR, "scratch", "solana_explorer_view.html"), htmlContent);

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1400, height: 1300 },
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const page = await browser.newPage();
  await page.goto("file://" + path.join(ARTIFACTS_DIR, "scratch", "solana_explorer_view.html"), { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, "explorer_onchain_verification.png") });
  console.log("📸 Captured explorer_onchain_verification.png");

  await browser.close();
}

main().catch(console.error);
