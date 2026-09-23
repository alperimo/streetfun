import puppeteer from "puppeteer-core";
import * as path from "path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS_DIR = "/Users/alperenf/.gemini/antigravity/brain/eee7d099-16e6-4871-acc0-9f8aff898880";

async function main() {
  console.log("Launching Chrome for Live Demo verification...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 950 },
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const page = await browser.newPage();
  page.on("console", (msg) => console.log(`[Browser] ${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => console.error(`[Browser Error]:`, err));

  try {
    // 1. Visit Home (Markets Page with Full App enabled)
    console.log("Visiting Home (http://localhost:3000/)...");
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle0", timeout: 20000 });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "demo_markets_feed.png") });
    console.log("Captured demo_markets_feed.png");

    // 2. Open Launch Modal
    console.log("Opening Launch Token modal...");
    // Find button containing "Launch Token"
    const launchBtns = await page.$$("button");
    let clicked = false;
    for (const btn of launchBtns) {
      const text = await page.evaluate((el) => el.textContent, btn);
      if (text && text.includes("Launch Token")) {
        await btn.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      console.log("Opening via ?launch=true query...");
      await page.goto("http://localhost:3000/?launch=true", { waitUntil: "networkidle0" });
    }
    await new Promise((r) => setTimeout(r, 800));

    // Fill in Launch Form: OpenAI
    console.log("Filling in Launch Form for OpenAI ($TOPAI)...");
    await page.evaluate(() => {
      const setReactValue = (el: HTMLInputElement, val: string) => {
        const proto = window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
        if (descriptor && descriptor.set) {
          descriptor.set.call(el, val);
        } else {
          el.value = val;
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };

      const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];
      const nameInput = inputs.find((i) => i.placeholder.includes("Moon Doge") || i.placeholder.includes("Name"));
      if (nameInput) setReactValue(nameInput, "OpenAI Cult");

      const symbolInput = inputs.find((i) => i.placeholder.includes("MDOGE") || i.placeholder.includes("Ticker"));
      if (symbolInput) setReactValue(symbolInput, "OPAI");

      const btns = Array.from(document.querySelectorAll("button"));
      const openaiBtn = btns.find((b) => b.textContent?.includes("OpenAI") || b.textContent?.includes("TOPAI"));
      if (openaiBtn) (openaiBtn as HTMLButtonElement).click();
    });

    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "demo_launch_modal_openai.png") });
    console.log("Captured demo_launch_modal_openai.png");

    // 3. Submit Launch Form
    console.log("Submitting Launch Form...");
    const submitBtn = await page.$('form button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
    }

    // Wait for redirect to /token/<mint>
    console.log("Waiting for navigation to token page...");
    await new Promise((r) => setTimeout(r, 5000));

    let currentUrl = page.url();
    console.log(`Current URL after launch: ${currentUrl}`);

    // Navigate to our live OpenAI token on Devnet (Ax6GBX7HUfXuoKaNzw8xEyrKkaDrMWdxvWzhVVXpAzQY)
    console.log("Navigating to live Devnet OpenAI token page...");
    await page.goto("http://localhost:3000/token/Ax6GBX7HUfXuoKaNzw8xEyrKkaDrMWdxvWzhVVXpAzQY", {
      waitUntil: "networkidle0",
      timeout: 20000,
    });
    await new Promise((r) => setTimeout(r, 2000));

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "demo_openai_token_page.png") });
    console.log("Captured demo_openai_token_page.png");
  } catch (err) {
    console.error("Demo verification error:", err);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
