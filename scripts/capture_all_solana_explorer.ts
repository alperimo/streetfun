import puppeteer from "puppeteer-core";
import * as fs from "fs";
import * as path from "path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS_DIR = "/Users/alperenf/.gemini/antigravity/brain/eee7d099-16e6-4871-acc0-9f8aff898880";

const receipts = JSON.parse(
  fs.readFileSync(path.join(ARTIFACTS_DIR, "e2e_verified_transactions.json"), "utf8")
);

const txList = [
  { key: "01_launch", name: "explorer_01_launch.png", title: "Launch Token ($SING)" },
  { key: "02_buy", name: "explorer_02_buy.png", title: "Bonding Buy ($1,000 USDC)" },
  { key: "03_sell", name: "explorer_03_sell.png", title: "Bonding Sell (5M $SING)" },
  { key: "04_graduation", name: "explorer_04_graduation.png", title: "Graduation & 50/50 Split ($60K)" },
  { key: "05_redeem", name: "explorer_05_redeem.png", title: "Burn & Redeem (1.5 Shares)" },
];

async function main() {
  console.log("🚀 Launching Chrome to capture all 5 transactions on official Solana Explorer...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 1200 },
    args: [
      "--no-sandbox",
      "--disable-web-security",
      "--allow-running-insecure-content",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });

  const page = await browser.newPage();

  for (const item of txList) {
    const sig = receipts[item.key].txSignature;
    const url = `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899`;
    console.log(`\nNavigating to ${item.title}: ${url}`);

    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
    await new Promise((r) => setTimeout(r, 2500));

    // Dismiss cookie prompt if visible
    await page.evaluate(() => {
      const acceptBtn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("ACCEPT")
      );
      if (acceptBtn) (acceptBtn as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // Scroll slightly to get main details
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, item.name),
      fullPage: false,
    });
    console.log(`📸 Saved ${item.name}`);

    // Click "Programs & Logs" tab to show instruction logs
    await page.evaluate(() => {
      const logsTab = Array.from(document.querySelectorAll("a, button")).find((el) =>
        el.textContent?.trim() === "Programs & Logs"
      );
      if (logsTab) (logsTab as HTMLElement).click();
    });

    await new Promise((r) => setTimeout(r, 1000));

    const logsName = item.name.replace(".png", "_logs.png");
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, logsName),
      fullPage: false,
    });
    console.log(`📸 Saved ${logsName}`);
  }

  await browser.close();
  console.log("✅ All official Solana Explorer screenshots captured!");
}

main().catch(console.error);
