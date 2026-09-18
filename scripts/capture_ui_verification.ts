import puppeteer from "puppeteer-core";
import * as path from "path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS_DIR = "/Users/alperenf/.gemini/antigravity/brain/eee7d099-16e6-4871-acc0-9f8aff898880";

async function main() {
  console.log("Launching headless Chrome via puppeteer-core...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 1000 },
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const page = await browser.newPage();

  page.on("console", (msg) => {
    console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
  });

  page.on("pageerror", (err) => {
    console.error(`[Browser PageError]:`, err);
  });

  try {
    // 1. Home page
    console.log("Navigating to home page...");
    await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 25000 });
    await new Promise((r) => setTimeout(r, 2000));
    
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "live_tokens_homepage.png") });
    console.log("Captured live_tokens_homepage.png");

    // 2. Treasury page
    console.log("Navigating to treasury page...");
    await page.goto("http://localhost:3000/treasury", {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "live_treasury_page.png") });
    console.log("Captured live_treasury_page.png");

    // 3. BIG DASSAK Token detail page
    console.log("Navigating to BIG DASSAK page...");
    await page.goto("http://localhost:3000/token/SaSbgssBAK6unw3idBiMZVjDtafdRBsm4ZBexRDgipB", {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "live_dassak_token_page.png") });
    console.log("Captured live_dassak_token_page.png");
  } catch (err) {
    console.error("Error during visual capture:", err);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "live_tokens_homepage_err.png") });
  } finally {
    await browser.close();
  }
}

main();
