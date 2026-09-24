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
  page.on("requestfailed", (req) => console.log(`[Request Failed]: ${req.url()} - ${req.failure()?.errorText}`));

  try {
    console.log("Navigating to http://localhost:3000/ ...");
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle2", timeout: 25000 });
    console.log("Waiting 3s for client hydration...");
    await new Promise((r) => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "prestocks_homepage_verified.png") });
    console.log("Captured prestocks_homepage_verified.png");

    console.log("Opening Launch Token modal (?launch=true)...");
    await page.goto("http://localhost:3000/?launch=true", { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise((r) => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "prestocks_launch_modal_verified.png") });
    console.log("Captured prestocks_launch_modal_verified.png");
  } catch (err) {
    console.error("Error during capture:", err);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
