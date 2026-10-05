const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const screenshotPath = '/Users/alperenf/.gemini/antigravity/brain/eee7d099-16e6-4871-acc0-9f8aff898880/mars_settlement_browser_test.png';
  
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true
  });
  
  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 }
  });
  const page = await context.newPage();

  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push({ type: msg.type(), text });
    console.log(`[Browser Console ${msg.type()}] ${text}`);
  });
  page.on('pageerror', err => {
    logs.push({ type: 'pageerror', text: err.message });
    console.log(`[Page Error] ${err.message}`);
  });
  page.on('requestfailed', req => {
    console.log(`[Network Failed] ${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });
  page.on('response', res => {
    if (res.url().includes('/api/')) {
      console.log(`[API Response] ${res.status()} ${res.url()}`);
    }
  });

  // Inject Creator Wallet so the "Complete settlement" button renders and can be tested
  await page.addInitScript(() => {
    localStorage.setItem('walletName', '"Mock Creator Wallet"');
    
    const pubkeyBase58 = 'EqWkK5fX2wbF2RsFoHky9DyjVNq7j5R5n8rbZU58TppV';
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    function decodeBase58(string) {
      const bytes = [0];
      for (let i = 0; i < string.length; i++) {
        const c = string[i];
        const value = ALPHABET.indexOf(c);
        if (value === -1) throw new Error('Illegal char');
        for (let j = 0; j < bytes.length; j++) bytes[j] *= 58;
        bytes[0] += value;
        let carry = 0;
        for (let j = 0; j < bytes.length; ++j) {
          bytes[j] += carry;
          carry = bytes[j] >> 8;
          bytes[j] &= 0xff;
        }
        while (carry > 0) {
          bytes.push(carry & 0xff);
          carry >>= 8;
        }
      }
      for (let i = 0; i < string.length && string[i] === '1'; i++) bytes.push(0);
      return new Uint8Array(bytes.reverse());
    }
    const pubkeyBytes = decodeBase58(pubkeyBase58);

    const account = {
      address: pubkeyBase58,
      publicKey: pubkeyBytes,
      chains: ['solana:devnet', 'solana:mainnet', 'solana:testnet', 'solana:localnet'],
      features: ['standard:signAndSendTransaction', 'standard:signTransaction']
    };

    const mockWallet = {
      version: '1.0.0',
      name: 'Mock Creator Wallet',
      icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="cyan"/></svg>',
      chains: ['solana:devnet', 'solana:mainnet', 'solana:testnet', 'solana:localnet'],
      features: {
        'standard:connect': {
          version: '1.0.0',
          connect: async () => {
            console.log('[Wallet Adapter] standard:connect called');
            mockWallet.accounts = [account];
            return { accounts: [account] };
          }
        },
        'standard:events': {
          version: '1.0.0',
          on: (event, listener) => () => {}
        },
        'solana:signAndSendTransaction': {
          version: '1.0.0',
          supportedTransactionVersions: ['legacy', 0],
          signAndSendTransaction: async (inputs) => {
            console.log('[Wallet Adapter] solana:signAndSendTransaction triggered with', inputs.length, 'transaction(s)');
            // When user is testing browser flow, a real wallet would either show approval or sign
            // Let's log that wallet approval popup was opened / requested
            return [{ signature: new Uint8Array(64) }];
          }
        },
        'solana:signTransaction': {
          version: '1.0.0',
          supportedTransactionVersions: ['legacy', 0],
          signTransaction: async (inputs) => {
            console.log('[Wallet Adapter] solana:signTransaction triggered');
            return inputs;
          }
        }
      },
      accounts: [account]
    };

    try {
      window.addEventListener('wallet-standard:app-ready', ({ detail: api }) => {
        api.register(mockWallet);
      });
      window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', {
        detail: (callback) => callback(mockWallet)
      }));
    } catch (e) {
      console.error('Wallet standard registration error:', e);
    }
  });

  console.log('Step 1: Navigating to http://localhost:3000/token/4ERTGWxfyj6kCJiJwkev2kKg7aBiy428np3qT2Ri25Aw');
  await page.goto('http://localhost:3000/token/4ERTGWxfyj6kCJiJwkev2kKg7aBiy428np3qT2Ri25Aw');

  console.log('Step 2: Waiting 3 seconds for the page to load...');
  await new Promise(r => setTimeout(r, 3000));

  console.log('Step 3: Checking console and DOM. Locating "Complete settlement" button...');
  const snapshotBefore = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Complete settlement'));
    const tradeTerminal = document.querySelector('.trade-terminal');
    return {
      buttonFound: Boolean(btn),
      buttonText: btn ? btn.innerText.trim() : null,
      buttonDisabled: btn ? btn.disabled : null,
      terminalText: tradeTerminal ? tradeTerminal.innerText : null
    };
  });
  console.log('DOM Snapshot Before Click:', JSON.stringify(snapshotBefore, null, 2));

  if (!snapshotBefore.buttonFound) {
    console.error('ERROR: "Complete settlement" button was not found in the DOM!');
  } else {
    console.log('Step 4: Clicking "Complete settlement" button...');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Complete settlement'));
      if (btn) btn.click();
    });
  }

  console.log('Step 5: Waiting 3 seconds after click...');
  await new Promise(r => setTimeout(r, 3000));

  console.log(`Step 6: Taking screenshot and saving to ${screenshotPath}...`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log('Screenshot saved successfully.');

  console.log('Step 7: Checking for error banners, alerts, or UI state change...');
  const uiStateAfter = await page.evaluate(() => {
    const alerts = Array.from(document.querySelectorAll('[role="alert"]')).map(a => a.innerText.trim());
    const statuses = Array.from(document.querySelectorAll('[role="status"]')).map(s => s.innerText.trim());
    const terminal = document.querySelector('.trade-terminal')?.innerText;
    const settleBtn = Array.from(document.querySelectorAll('button')).find(b => 
      b.innerText.includes('settle') || b.innerText.includes('Settle') || b.innerText.includes('graduation')
    );
    return {
      alerts,
      statuses,
      settleButtonState: settleBtn ? { text: settleBtn.innerText.trim(), disabled: settleBtn.disabled } : null,
      terminalExcerpt: terminal?.slice(0, 500)
    };
  });
  console.log('UI State After Click:', JSON.stringify(uiStateAfter, null, 2));

  await browser.close();
})();
