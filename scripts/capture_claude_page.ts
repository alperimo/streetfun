import puppeteer from "puppeteer-core";
import * as path from "path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS_DIR = "/Users/alperenf/.gemini/antigravity/brain/eee7d099-16e6-4871-acc0-9f8aff898880";

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 1100 },
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const page = await browser.newPage();
  try {
    console.log("Navigating to CLAUDE token page...");
    await page.goto("http://localhost:3000/token/D4bvmnRPfmpv9ut3oJ4xMq6yBabv9TrgKLs1faSeMj1v", {
      waitUntil: "networkidle2",
      timeout: 25000,
    });
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "claude_token_page_verified.png") });
    console.log("Captured claude_token_page_verified.png");
  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
