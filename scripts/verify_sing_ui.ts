import puppeteer from "puppeteer-core";
import * as path from "path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS_DIR = "/Users/alperenf/.gemini/antigravity/brain/eee7d099-16e6-4871-acc0-9f8aff898880";

async function main() {
  console.log("🚀 Starting UI verification on http://localhost:3000/ ...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 1000 },
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const page = await browser.newPage();

  try {
    // 1. Navigate to Home
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));

    // Connect wallet
    console.log("Connecting Dev Wallet...");
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Connect wallet")
      );
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    await page.evaluate(() => {
      const opt = Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Dev Wallet")
      );
      opt?.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // 2. Open Launch Modal
    console.log("Opening Launch Token modal...");
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button, a")).find((el) =>
        el.textContent?.includes("Launch token")
      );
      if (btn) (btn as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    // Fill form with Neural Singularity
    console.log("Filling form for Neural Singularity ($SING)...");
    const nameInput = await page.$("input[placeholder*='Starship Doge']");
    const symbolInput = await page.$("input[placeholder*='STAR']");
    const descInput = await page.$("textarea");
    const buyInput = await page.$("input[placeholder*='0.00']");

    if (nameInput) await nameInput.type("Neural Singularity", { delay: 15 });
    if (symbolInput) await symbolInput.type("SING", { delay: 15 });
    if (descInput)
      await descInput.type(
        "Autonomous AI culture currency backed by OpenAI Pre-IPO equity on Solana.",
        { delay: 10 }
      );
    if (buyInput) await buyInput.type("500", { delay: 15 });

    // Select OpenAI asset inside modal
    await page.evaluate(() => {
      const modal = document.querySelector("form");
      if (modal) {
        const btn = Array.from(modal.querySelectorAll("button")).find((b) =>
          b.textContent?.includes("OpenAI") || b.textContent?.includes("TOPAI")
        );
        if (btn) (btn as HTMLElement).click();
      }
    });
    await new Promise((r) => setTimeout(r, 800));

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "ui_sing_01_launch_form.png") });
    console.log("📸 Captured ui_sing_01_launch_form.png");

    // Submit form
    console.log("Submitting Launch Token...");
    await page.evaluate(() => {
      const btn = document.querySelector("form button[type='submit']");
      if (btn) (btn as HTMLElement).click();
    });

    // Modal automatically redirects to /token/<mint>
    console.log("Waiting for redirection to new token page...");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "ui_sing_02_trade_terminal.png") });
    console.log("📸 Captured ui_sing_02_trade_terminal.png");

    // Execute Buy on $SING
    console.log("Executing $250 USDC buy on $SING in Trade Terminal...");
    const tradeInput = await page.$("input[placeholder='0.00']");
    if (tradeInput) {
      await tradeInput.click();
      await tradeInput.type("250", { delay: 15 });
    }
    await new Promise((r) => setTimeout(r, 600));

    await page.evaluate(() => {
      const buyBtn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Buy") || b.textContent?.includes("Trade")
      );
      if (buyBtn) (buyBtn as HTMLElement).click();
    });

    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "ui_sing_03_trade_executed.png") });
    console.log("📸 Captured ui_sing_03_trade_executed.png");

    // Open Redeem Tab
    console.log("Opening Redeem Stock NAV tab for $SING...");
    await page.evaluate(() => {
      const tab = Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Redeem Stock")
      );
      if (tab) (tab as HTMLElement).click();
    });

    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "ui_sing_04_redeem_tab.png") });
    console.log("📸 Captured ui_sing_04_redeem_tab.png");

    // Navigate back to Markets home feed to show $SING on feed
    console.log("Navigating back to Markets home feed...");
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "ui_sing_05_feed_with_sing.png") });
    console.log("📸 Captured ui_sing_05_feed_with_sing.png");

    console.log("✅ All SING UI steps completed and screenshots captured successfully!");
  } catch (err) {
    console.error("❌ Error during UI verification:", err);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
