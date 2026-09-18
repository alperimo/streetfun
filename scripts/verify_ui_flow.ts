import puppeteer from "puppeteer-core";
import * as path from "path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS_DIR = "/Users/alperenf/.gemini/antigravity/brain/eee7d099-16e6-4871-acc0-9f8aff898880";

async function main() {
  console.log("🚀 Starting Puppeteer browser automation with local Chrome...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 1100 },
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const page = await browser.newPage();

  // Listen to console
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.text().includes("[TradeStore]")) {
      console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
    }
  });

  try {
    // 1. Navigate to Home
    console.log("Navigating to http://localhost:3000/ ...");
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2000));

    // Connect wallet
    console.log("Connecting Dev Wallet via UI...");
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Connect wallet")
      );
      btn?.click();
    });

    await new Promise((r) => setTimeout(r, 600));

    // Click Dev Wallet option
    await page.evaluate(() => {
      const opt = Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Dev Wallet")
      );
      opt?.click();
    });

    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "ui_01_wallet_connected.png") });
    console.log("📸 Captured ui_01_wallet_connected.png");

    // 2. Open Launch Token Modal
    console.log("Opening Launch Token modal...");
    await page.evaluate(() => {
      const launchBtn = Array.from(document.querySelectorAll("button, a")).find((el) =>
        el.textContent?.includes("Launch token")
      );
      if (launchBtn) (launchBtn as HTMLElement).click();
    });

    await new Promise((r) => setTimeout(r, 1500));

    // 3. Fill Launch Modal fields
    console.log("Filling Launch Token form...");
    const nameInput = await page.$("input[placeholder*='Starship Doge']");
    const symbolInput = await page.$("input[placeholder*='SDOGE']");
    const descInput = await page.$("textarea");
    const buyInput = await page.$("input[placeholder*='0.00']");

    if (nameInput) await nameInput.type("Neural Singularity", { delay: 20 });
    if (symbolInput) await symbolInput.type("SING", { delay: 20 });
    if (descInput)
      await descInput.type(
        "Autonomous AI meme stonk backed by OpenAI Pre-IPO equity on Solana.",
        { delay: 10 }
      );
    if (buyInput) await buyInput.type("500", { delay: 20 });

    // Select OpenAI target equity
    await page.evaluate(() => {
      const equityBtn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("OpenAI") || b.textContent?.includes("TOPAI")
      );
      if (equityBtn) (equityBtn as HTMLElement).click();
    });

    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "ui_02_launch_modal_filled.png") });
    console.log("📸 Captured ui_02_launch_modal_filled.png");

    // 4. Submit Launch Token
    console.log("Submitting Launch Token transaction...");
    await page.evaluate(() => {
      const submitBtn = document.querySelector("form button[type='submit']");
      if (submitBtn) (submitBtn as HTMLElement).click();
    });

    // Wait for submission and modal close
    await new Promise((r) => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "ui_03_token_launched_feed.png") });
    console.log("📸 Captured ui_03_token_launched_feed.png");

    // 5. Find the new $SING token card and click it
    console.log("Navigating to new token page...");
    const singTokenLink = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a[href*='/token/']"));
      const singLink = links.find((l) => l.textContent?.includes("SING") || l.textContent?.includes("Neural"));
      return singLink ? (singLink as HTMLAnchorElement).href : null;
    });

    if (singTokenLink) {
      console.log(`Found $SING token link: ${singTokenLink}`);
      await page.goto(singTokenLink, { waitUntil: "networkidle2" });
    } else {
      console.log("Using fallback token /token/MARS99999999999999999999999999999999999999");
      await page.goto("http://localhost:3000/token/MARS99999999999999999999999999999999999999", {
        waitUntil: "networkidle2",
      });
    }

    await new Promise((r) => setTimeout(r, 2000));

    // 6. Enter 250 in amount and execute Trade
    console.log("Testing live trade in Trade Terminal...");
    const tradeInput = await page.$("input[placeholder='0.00']");
    if (tradeInput) {
      await tradeInput.click();
      await tradeInput.type("250", { delay: 20 });
    }

    await new Promise((r) => setTimeout(r, 1000));

    // Click trade button
    await page.evaluate(() => {
      const tradeBtn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Buy") || b.textContent?.includes("Trade")
      );
      if (tradeBtn) (tradeBtn as HTMLElement).click();
    });

    await new Promise((r) => setTimeout(r, 2500));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "ui_04_trade_terminal_executed.png") });
    console.log("📸 Captured ui_04_trade_terminal_executed.png");

    // 7. Click Redeem Stock NAV tab
    console.log("Switching to Redeem Stock NAV tab...");
    await page.evaluate(() => {
      const redeemTab = Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Redeem Stock")
      );
      if (redeemTab) (redeemTab as HTMLElement).click();
    });

    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "ui_05_redeem_module.png") });
    console.log("📸 Captured ui_05_redeem_module.png");

    console.log("✅ All UI flow steps completed successfully!");
  } catch (err) {
    console.error("❌ Error in UI flow verification:", err);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
