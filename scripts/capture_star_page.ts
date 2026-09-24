import puppeteer from "puppeteer-core";
import * as path from "path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS_DIR = "/Users/alperenf/.gemini/antigravity/brain/eee7d099-16e6-4871-acc0-9f8aff898880";

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 1000 },
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const page = await browser.newPage();
  try {
    // Visit STAR token page
    console.log("Navigating to STAR token page...");
    await page.goto("http://localhost:3000/token/Fe25SJ385FLSKmmgFHnrvGqotmN3UPSmSh7Gx5YZfkfN", {
      waitUntil: "networkidle0",
      timeout: 25000,
    });
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "prestocks_star_token_page.png") });
    console.log("Captured prestocks_star_token_page.png");
  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
