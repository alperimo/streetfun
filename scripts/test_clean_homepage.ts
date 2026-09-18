import puppeteer from "puppeteer-core";
import * as path from "path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS_DIR = "/Users/alperenf/.gemini/antigravity/brain/eee7d099-16e6-4871-acc0-9f8aff898880";

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 950 },
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const page = await browser.newPage();
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, "homepage_cleaned_feed.png") });
  console.log("Captured homepage_cleaned_feed.png");
  await browser.close();
}

main().catch(console.error);
