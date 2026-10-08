# Panta integration

StreetFun displays only real, reviewed Panta markets associated with a live StreetFun token and its current lifecycle stage. The server derives graduation from StreetFun's confirmed on-chain token snapshot. It never derives a question, deadline, odds, volume or resolution feed from browser query parameters. Panta's published title, description, dates, phase and share prices are shown as returned; an absent value remains absent. A configured binding does not create a market or automate its resolution.

## Activation

1. Revoke the API credential exposed in commit `664a515` using your Panta account. Issue a replacement and set `PANTA_API_KEY` in the server environment. The exposed credential is rejected by its SHA-256 fingerprint, including when set in the environment. Removing it from current source does not revoke it or erase Git history. Never place credentials in `NEXT_PUBLIC_*`.
2. Generate `PANTA_SESSION_SECRET` with `openssl rand -hex 32`. Keep it in server secrets. Rotating it invalidates quote/order recovery tokens; allow outstanding orders to be confirmed before routine rotation.
3. Apply `supabase/panta_security.sql` in the Supabase SQL editor. Its service-role-only function provides a shared, atomic budget of 60 StreetFun Panta requests per minute across all server instances. Errors, missing configuration or denied budgets stop requests. Cloudflare/Vercel protection should additionally limit ingress; the shared budget bounds upstream use even with rotating IPs/wallets. The migration does not create user-supplied prediction records.
4. Obtain actual markets from Panta's create → build → wallet sign → register flow, or review existing markets. Record their exact published title and verify the intended resolution criteria. Pin the independently verified Panta USDC program address, USDC mint and Solana network. A `pk_test_` key does **not** establish that the market is on Devnet; the public API accepts both prefixes.
5. Set `PANTA_MARKET_BINDINGS_JSON` to a JSON array. Do not fill it with placeholder/default addresses. Each entry has this shape (replace every example value):

```json
[
  {
    "network": "devnet",
    "mint": "<StreetFun token mint>",
    "stage": "pre-graduation",
    "marketId": "<registered Panta market address>",
    "programId": "<verified Panta USDC program address>",
    "usdcMint": "<verified Panta USDC mint on this network>",
    "expectedTitle": "<exact published market question>"
  }
]
```

The network must match `NEXT_PUBLIC_SOLANA_NETWORK` and the actual RPC genesis hash. The Panta market account must be owned by the pinned program. Each token/stage and each market can appear once per network. `[]` is the safe default: the module shows unavailable and cannot build a payment. Primary purchases are supported; secondary markets link to Panta without inventing a swap path. After StreetFun graduation, a separate reviewed post-graduation market binding is required. Resolution is performed by Panta under the actual market's published criteria, not by StreetFun's UI labels.

## Purchase and claim safety

- The browser sends `{mint,wallet,side,amountUsdc}` for a live quote. Amounts are decimal strings with at most six fractional digits, parsed as integer micro-USDC; the current order cap is 1,000 USDC.
- Quotes are short-lived and bound with an HMAC to wallet, amount, side, token, stage, market and the deployment configuration. Build accepts only this signed quote token, never client totals or a synthetic quote id. Slippage is fixed to 100 basis points (1%).
- Panta's documented primary build returns an instruction list, not a serialized transaction. Both server and browser permit exactly one `primary_order_usdc` (or `claim_win_usdc`) instruction for the pinned program and market. They reject standalone token transfers, approvals, other signers and unexpected programs. Only constrained compute-budget, USDC associated-account creation and attribution-memo instructions are permitted.
- The server verifies the six-decimal SPL USDC mint and simulates the transaction. It rejects a failed simulation, mismatched account ownership, spending beyond the quote, a USDC debit on a claim, and rent/fees exceeding 0.01 SOL. The ceilings are conservative and may reject otherwise valid builds; investigate a rejection before changing them.
- The wallet signs the compiled transaction using the configured connection. Message changes and expired orders are rejected. The transaction signature and recovery token are saved before broadcasting, protecting against an ambiguous RPC response. The UI blocks a second order while confirmation is unresolved and allows an explicit status retry.
- Confirm accepts only `{signature,orderToken}`. The confirmed transaction must succeed and match the exact built message, payer and sole signer. Panta then independently validates the wallet, market, instruction kind and quote via its idempotent submit/report endpoints. `submitted`, `pending`, upstream errors or failed DB calls never become a success message. An expired transaction is released only after history lookup finds no signature and its validity height has passed.
- Positions include both reviewed lifecycle markets, so graduation does not hide claims from the earlier market. Claim requests may select only a reviewed market associated with the same token. Positions and claim builds are real Panta responses. Claims are built only for resolved markets and eligibility is revalidated by Panta. No client-provided shares or amounts are inserted into a prediction database. A successful confirmation message does not claim an estimated share count was actually received.

All outbound Panta requests use the fixed official HTTPS host, refuse redirects, have a ten-second timeout and a 256 KB JSON response limit. Request bodies are limited to 8 KB with an allowlist of fields; errors returned to browsers omit provider internals, credentials and RPC URLs. The proxy does not implement arbitrary upstream paths or authentication/account-management routes.

## Verification and limits

`tests/unit/pantaSecurity.test.ts` covers malformed amounts, mapping/market mismatches, session tampering/expiry, unexpected transaction instructions, provider failures, forged confirmations and pending/failed/successful attribution. Test fixtures stub external services and do not spend funds. Build and UI screenshots are separate checks. A live end-to-end test requires a rotated credential, the SQL migration, real market bindings, a funded test wallet and a compatible Panta deployment. No live purchase or claim should be declared verified until those checks run.

Instruction validation relies on the reviewed Panta program and its documented Anchor instruction names. A future incompatible deployment must fail closed until its layout and accounts are reviewed. Simulation is an additional check, not a substitute for the program's on-chain protections or an audit of Panta itself.

Official sources: [Panta flow](https://docs.panta.market/guides/how-it-works), [authentication](https://docs.panta.market/guides/authentication), [primary build](https://docs.panta.market/api-reference/orders/build), [trade verification](https://docs.panta.market/api-reference/trades/report), [playground](https://github.com/Kaito-HQ/panta-api-playground).
