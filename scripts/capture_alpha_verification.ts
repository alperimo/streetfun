import puppeteer from "puppeteer-core";
import * as path from "path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS_DIR = "/Users/alperenf/.gemini/antigravity/brain/eee7d099-16e6-4871-acc0-9f8aff898880";

async function main() {
  console.log("Launching headless Chrome for Alpha Pass verification...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 950 },
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const page = await browser.newPage();

  page.on("console", (msg) => console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => console.error(`[Browser Error]:`, err));

  try {
    // 1. Normal Market Page (Default /)
    console.log("Navigating to Default Market page (http://localhost:3000/)...");
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "home_market_page.png") });
    console.log("Captured home_market_page.png");

    // 2. Alpha Landing Page (/alpha)
    console.log("Navigating to Alpha Landing page (http://localhost:3000/alpha)...");
    await page.goto("http://localhost:3000/alpha", { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "alpha_landing_page.png") });
    console.log("Captured alpha_landing_page.png");

    // 3. Open Terms Modal on /alpha
    console.log("Clicking Terms button on /alpha...");
    const termsButtons = await page.$$("footer button");
    for (const btn of termsButtons) {
      const text = await page.evaluate((el) => el.textContent, btn);
      if (text && text.includes("Terms")) {
        await btn.click();
        await new Promise((r) => setTimeout(r, 1000));
        await page.screenshot({ path: path.join(ARTIFACTS_DIR, "alpha_terms_modal.png") });
        console.log("Captured alpha_terms_modal.png");
        await page.keyboard.press("Escape");
        await new Promise((r) => setTimeout(r, 500));
        break;
      }
    }

    // 4. Claimed Alpha Pass State (/alpha?demo_pass=true)
    console.log("Navigating to Claimed Alpha Pass state (http://localhost:3000/alpha?demo_pass=true)...");
    await page.goto("http://localhost:3000/alpha?demo_pass=true", { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "alpha_claimed_pass.png") });
    console.log("Captured alpha_claimed_pass.png");

  } catch (err) {
    console.error("Error during Alpha verification capture:", err);
  } finally {
    await browser.close();
  }
}

main();
