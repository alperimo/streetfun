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
    await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 25000 });
    await new Promise((r) => setTimeout(r, 2500));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "home_market_page.png") });
    console.log("Captured home_market_page.png");

    // 2. Alpha Landing Page (/alpha) with Ambient Video
    console.log("Navigating to Alpha Landing page (http://localhost:3000/alpha)...");
    await page.goto("http://localhost:3000/alpha", { waitUntil: "domcontentloaded", timeout: 25000 });
    await new Promise((r) => setTimeout(r, 2500));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "alpha_landing_page.png") });
    console.log("Captured alpha_landing_page.png");

    // 3. Claimed Alpha Pass State (/alpha?demo_pass=true)
    console.log("Navigating to Claimed / Connected State (http://localhost:3000/alpha?demo_pass=true)...");
    await page.goto("http://localhost:3000/alpha?demo_pass=true", { waitUntil: "domcontentloaded", timeout: 25000 });
    await new Promise((r) => setTimeout(r, 2500));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "alpha_claimed_pass.png") });
    console.log("Captured alpha_claimed_pass.png");

    // 4. Wallet Modal Opened State (/alpha)
    console.log("Opening Wallet Modal on /alpha...");
    await page.goto("http://localhost:3000/alpha", { waitUntil: "domcontentloaded", timeout: 25000 });
    await new Promise((r) => setTimeout(r, 1500));
    // Click "Connect Wallet for Alpha Access" button
    const buttons = await page.$$("button");
    for (const b of buttons) {
      const text = await page.evaluate((el) => el.textContent, b);
      if (text && text.includes("Connect Wallet for Alpha Access")) {
        await b.click();
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
    
    // Evaluate and inject mockup wallets to visually verify the user's scenario
    await page.evaluate(() => {
      const list = document.querySelector(".wallet-adapter-modal-list");
      if (list) {
        list.innerHTML = `
          <li>
            <button class="wallet-adapter-button" tabindex="0" type="button">
              <i class="wallet-adapter-button-start-icon"><img src="https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/phantom/src/icon.png" alt="Phantom icon"></i>
              Phantom
              <span>Detected</span>
            </button>
          </li>
          <li>
            <button class="wallet-adapter-button" tabindex="0" type="button">
              <i class="wallet-adapter-button-start-icon"><img src="https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/solflare/src/icon.png" alt="Solflare icon"></i>
              Solflare
              <span>Detected</span>
            </button>
          </li>
          <li>
            <button class="wallet-adapter-button" tabindex="0" type="button">
              <i class="wallet-adapter-button-start-icon"><img src="https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/torus/src/icon.png" alt="Torus icon"></i>
              Torus
            </button>
          </li>
        `;
        const existingMore = document.querySelector(".wallet-adapter-modal-list-more");
        if (!existingMore) {
          const moreBtn = document.createElement("button");
          moreBtn.className = "wallet-adapter-modal-list-more";
          moreBtn.innerHTML = `More options <svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 8.5L2 4.5h8z" fill="currentColor"/></svg>`;
          list.parentNode?.appendChild(moreBtn);
        }
      }
    });

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "wallet_connect_modal.png") });
    console.log("Captured wallet_connect_modal.png");

    // 5. Mobile Landing Page Viewport (iPhone 14 / 390x844)
    console.log("Capturing Mobile Landing page (390x844)...");
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto("http://localhost:3000/alpha", { waitUntil: "domcontentloaded", timeout: 25000 });
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "alpha_mobile_landing.png") });
    console.log("Captured alpha_mobile_landing.png");

  } catch (err) {
    console.error("Error during Alpha verification capture:", err);
  } finally {
    await browser.close();
  }
}

main();
