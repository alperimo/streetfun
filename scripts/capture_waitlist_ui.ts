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
    // 1. Visit homepage with onboarded set so how-it-works doesn't auto-popup
    console.log("Navigating to http://localhost:3000/ ...");
    await page.goto("http://localhost:3000/", { waitUntil: "load", timeout: 20000 });
    await page.evaluate(() => {
      localStorage.setItem("streetfun:onboarded", "true");
    });
    // reload to apply localStorage
    await page.goto("http://localhost:3000/", { waitUntil: "load", timeout: 20000 });
    console.log("Waiting for .site-header selector...");
    await page.waitForSelector(".site-header", { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "homepage_waitlist_header.png") });
    console.log("Captured homepage_waitlist_header.png");

    // 2. Open Waitlist modal by clicking the header "Mainnet Waitlist" button
    console.log("Clicking 'Mainnet Waitlist' button in header...");
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const waitlistBtn = buttons.find((b) => b.textContent && b.textContent.includes("Waitlist"));
      if (waitlistBtn) waitlistBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "waitlist_modal_unconnected.png") });
    console.log("Captured waitlist_modal_unconnected.png");

    // 3. Test claimed Alpha Pass state in modal & header
    console.log("Navigating to claimed pass state (?waitlist=true&demo_pass=true)...");
    await page.goto("http://localhost:3000/?waitlist=true&demo_pass=true", { waitUntil: "load", timeout: 20000 });
    await page.waitForSelector(".site-header", { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "waitlist_modal_claimed.png") });
    console.log("Captured waitlist_modal_claimed.png");

    // 4. Close modal and capture header with Pass #0042
    console.log("Dismissing modal to capture header with Pass #0042...");
    await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "homepage_with_claimed_pass_header.png") });
    console.log("Captured homepage_with_claimed_pass_header.png");

  } catch (err) {
    console.error("Error during capture:", err);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
