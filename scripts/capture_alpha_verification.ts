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
    // 1. Normal Market Page (Default /) with Ambient Video
    console.log("Navigating to Default Market page (http://localhost:3000/)...");
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise((r) => setTimeout(r, 2500));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "home_market_page.png") });
    console.log("Captured home_market_page.png");

    // 2. Alpha Landing Page (/alpha) with Ambient Video
    console.log("Navigating to Alpha Landing page (http://localhost:3000/alpha)...");
    await page.goto("http://localhost:3000/alpha", { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise((r) => setTimeout(r, 2500));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "alpha_landing_page.png") });
    console.log("Captured alpha_landing_page.png");

    // 3. Claimed Alpha Pass State (/alpha?demo_pass=true) - Awakened Bull with Neon Glow & Aura
    console.log("Navigating to Claimed / Connected State (http://localhost:3000/alpha?demo_pass=true)...");
    await page.goto("http://localhost:3000/alpha?demo_pass=true", { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise((r) => setTimeout(r, 2500));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "alpha_claimed_pass.png") });
    console.log("Captured alpha_claimed_pass.png");

  } catch (err) {
    console.error("Error during Alpha verification capture:", err);
  } finally {
    await browser.close();
  }
}

main();
