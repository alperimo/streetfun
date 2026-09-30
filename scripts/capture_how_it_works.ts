import puppeteer from "puppeteer-core";
import * as path from "path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS_DIR = "/Users/alperenf/.gemini/antigravity/brain/eee7d099-16e6-4871-acc0-9f8aff898880";

async function main() {
  console.log("Launching Chrome...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 1000 },
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const page = await browser.newPage();
  page.on("console", (msg) => console.log(`[Browser] ${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => console.error(`[Browser PageError]:`, err));

  try {
    // 1. Visit homepage fresh without localStorage -> HowItWorksModal pops up!
    console.log("Navigating to http://localhost:3000/ (fresh session)...");
    await page.goto("http://localhost:3000/", { waitUntil: "load", timeout: 20000 });
    console.log("Waiting for .site-header selector...");
    await page.waitForSelector(".site-header", { timeout: 10000 });
    console.log("Waiting 3s for client hydration...");
    await new Promise((r) => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "how_it_works_modal.png") });
    console.log("Captured how_it_works_modal.png");

    // 2. Click "Got it, explore markets" to dismiss modal and view the homepage
    console.log("Dismissing modal via 'Got it, explore markets' button...");
    const buttons = await page.$$("button");
    for (const b of buttons) {
      const text = await page.evaluate((el) => el.textContent, b);
      if (text && text.includes("Got it, explore markets")) {
        await b.click();
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "homepage_clean_verified.png") });
    console.log("Captured homepage_clean_verified.png");

    // 3. Scroll to footer and capture footer
    console.log("Capturing footer area...");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "homepage_footer_verified.png") });
    console.log("Captured homepage_footer_verified.png");

  } catch (err) {
    console.error("Error during capture:", err);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
