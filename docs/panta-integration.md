# Panta integration

StreetFun derives two canonical system markets from successful, confirmed StreetFun transactions. A verified token launch enqueues a 30-day graduation market. Confirmed collateral settlement enqueues a separate 30-day performance market and attaches its signature to the earlier market. Meteora curve completion or migration alone does not constitute StreetFun graduation. Duplicate deliveries retain the original terms; out-of-order launch deliveries recover already indexed graduation evidence.

The token page reads the current stage from Solana. Prices, phases and catalog metadata come from the registered Panta market. Pending creation shows the question and actual availability without fabricated odds, volume or deposit controls. Browser parameters cannot create markets, set graduation state or substitute market addresses. Manual `PANTA_MARKET_BINDINGS_JSON` configuration has been removed.

## Server setup

1. Set `PANTA_API_KEY` to a replacement credential. The previously committed credential is rejected by fingerprint. Its revocation was rechecked on 2026-10-08: the live API returns HTTP 401. Never put keys in `NEXT_PUBLIC_*`.
2. Generate separate `PANTA_SESSION_SECRET` and `CRON_SECRET` values with `openssl rand -hex 32`. Keep both in server secrets.
3. Apply `supabase/migrations/202610080001_panta_lifecycle.sql` and `202610080002_panta_issuer_budget.sql`. The existing StreetFun `tokens` schema must be present first. These migrations include the shared rate limit, durable create outbox, leases and daily issuer budget. Do not re-run applied non-idempotent migrations. The diagnostics command below verifies tables, functions and anonymous access denial without executing migrations again.
4. Configure exactly one of `PANTA_SYSTEM_KEYPAIR_PATH` or `PANTA_SYSTEM_KEYPAIR_JSON` for a dedicated system issuer. Do not reuse a user wallet or the StreetFun administrator key. Fund it with SOL and the **USDC mint read from Panta's on-chain config on the same cluster**. The configured creation payment is validated against the program, capped at 20 USDC per market and bounded by `PANTA_DAILY_CREATION_BUDGET_USDC` (default 100).
5. Set `PANTA_MARKET_IMAGE_URL` to a stable public HTTPS catalog image and `PANTA_EVIDENCE_ORIGIN` to the public HTTPS deployment serving `/api/panta/evidence/[mint]`. Post-graduation creation checks that this public feed actually serves its persisted baseline before obtaining a quote. A localhost URL cannot provide public oracle evidence.
6. Leave `PANTA_API_URL` unset for automatic selection: Devnet uses `https://staging-api.panta.market/api/v1`; mainnet uses `https://live-api.panta.market/api/v1`. Explicit URLs must exactly match the configured cluster's official host. A `pk_test_` prefix does not mean the API builds Devnet transactions.
7. Run `npm run worker:panta` as a supervised process. It polls every 20 seconds; verified indexing also triggers a background attempt. Serverless deployments can use an external scheduler calling `GET /api/panta/worker` with `Authorization: Bearer <CRON_SECRET>` at least once per minute. No hosted schedule is installed by this repository. Ensure the hosting plan supports the needed cadence. Maintain supervision through the market deadlines.

The worker captures graduation baselines independently of market-creation retry timing, and final observations during their deadline window. It creates one market per run, skips leased jobs, and retries transient failures with backoff. Expired unsigned quotes are replaced. Signed transactions are stored before broadcast and recovered by their exact signature; historical absence after finalized expiry is required before rebuilding. Expired lifecycle windows, failed create transactions and missed baselines become blocked jobs. A delayed pre-graduation market is not opened after confirmed graduation. Do not clear a signed create to force a second payment.

## Outcomes and provider requirements

Pre-graduation YES evidence requires a confirmed StreetFun collateral settlement before the immutable deadline. NO cannot be inferred from a missing indexed row: Panta must verify complete chain coverage. Performance evidence uses paired token and actual collateral prices: a baseline within 60 seconds of graduation and a final observation from the deadline through +300 seconds. The source, pool, collateral mint and test-asset status must match. YES means token return minus collateral return is at least **20 percentage points**, compared with exact decimal arithmetic. This is different from a 20% relative ratio. Missing or inconsistent observations require oracle review.

The evidence endpoint publishes verifiable signatures, slots, source labels, paired observations and the computed evidence. It does **not** resolve Panta's market. Panta's USDC interface authorizes oracle result submission and settlement to its relayer/admin. The public API documents creation, orders, positions and claims; it does not expose a partner resolution endpoint. Immediate YES settlement on StreetFun graduation therefore requires Panta's authorized resolution integration and confirmation that early settlement is supported. UI labels cannot supply this permission.

On 2026-10-08, Devnet readiness checks found:

- Program `6gM5afTQBq5VZCfgpGqcsqzfWd5maLSCKWtGjbEobZMp` is executable.
- Config `8mJjfx7SuWwS4yfVZXtqC2cvzxr3TQHsCgKyjpuDWKAP` has 324 bytes, while the reviewed USDC interface needs the extended fee configuration. Its USDC mint field is `11111111111111111111111111111111` (unset).
- Staging account and catalog reads return HTTP 200, and the account permits creation. Create quote probes return HTTP 400 `DUPLICATE_MARKET`, including a unique unsigned diagnostic question.
- A second executable Devnet program, `4CQ4LWv7194V3Qe3iEYZq33cFPQbmKU3e1xVQkpTegLU`, has a 356-byte configuration and test USDC mint `8Qm44MpHDMs3mdiqryHxhgqLBVrecWmTdVKwqUoxywEY`. Panta's published frontend lists it as a legacy USDC program. Six of the first 50 staging catalog markets exist on Devnet, all owned by this legacy program; staging buy quotes for two of those markets return HTTP 404 `MARKET_NOT_FOUND`. The first catalog market has no Devnet account and its buy quote returns HTTP 400 `MARKET_NOT_IN_PRIMARY`. See `artifacts/panta-completion-2026-10-08/staging-trade-probe.json`. This does not establish a working alternative API deployment.
- The canonical tables and all three database functions exist. Anonymous lifecycle-table reads are denied. The new `PANTEST` launch produced its canonical pre-graduation row automatically, with `PANTA_CONFIGURATION_INCOMPLETE` and no create payment.

Panta must initialize/upgrade that Devnet USDC deployment, fix staging creation and provide the authorized resolution flow. Switching to the live/mainnet API is not a Devnet workaround. No Panta purchase, claim or on-chain market creation has been declared verified.

## Purchase and claim safety

Amounts are decimal strings parsed into integer micro-USDC, capped at 1,000 USDC per order. Quotes and built orders carry signed HMAC sessions bound to wallet, token, stage, market, side, amount and deployment configuration. Slippage is fixed at 1%. Instruction validation rejects direct transfers, approvals, unexpected programs and additional signers. The server validates the USDC mint and simulates the exact transaction with spending and SOL-fee ceilings before returning it for signing.

The browser checks network genesis, instruction intent, unchanged signed messages and expiry. It saves signature and recovery data before broadcasting and blocks another order until confirmation is resolved. The confirmation endpoint requires successful on-chain execution matching the built message, followed by Panta's independently verified attribution. Pending responses and provider errors never become success messages. Both lifecycle markets remain available for eligible claims after graduation; no client-provided prediction amounts are inserted into the database.

Requests use fixed official hosts, refuse redirects and have a ten-second timeout and bounded JSON responses. Browser errors omit credentials, RPC URLs and upstream internals. Database budgets and issuer reservations are service-role only.

## Verification

The failure-isolation report is `artifacts/panta-completion-2026-10-08/isolation.md`. Valid standard and breaking requests using the same account succeed on the live API but fail on staging. Immediate blockhash checks establish that the live-built controls are mainnet transactions, so using that host cannot repair Devnet. StreetFun's previously truncated mainnet genesis hash has been corrected in the shared browser/server cluster identities; this separate defect did not cause the Devnet quote rejection. Some extended live probes also return opaque server exceptions, so failed payload variations alone do not prove a field is unsupported.

Run `npm run diagnose:panta` for unsigned staging quote/build diagnostics. Add `-- --live-control` to compare with the live host and read mainnet cluster/configuration data. No transaction is signed, broadcast or registered. The script writes `artifacts/panta-api-diagnostics.json`; API keys and account personal details are excluded. Quotes reserve short-lived provider sessions. Inspect this report before selecting a program or changing network configuration.

```bash
npm run test:unit
npm run build
node scripts/verify_panta_environment.cjs
npm run worker:panta -- --once
```

The environment diagnostics are Devnet-only and write a secret-free report under `artifacts/panta-completion-2026-10-08/`. Unit tests exercise adversarial transactions, quote expiry, evidence windows, threshold boundaries, outages and delayed webhooks; they are distinct from live receipts.

For the explicitly authorized local test wallet, configure `DEVNET_TEST_WALLET_KEYPAIR_PATH` and its matching `DEVNET_TEST_WALLET_ADDRESS`. The verification script checks the Devnet genesis and intended creator, persists signatures before broadcast and records receipts. It refuses to silently launch another token when a saved test mint exists.

```bash
npm run verify:panta-devnet -- launch
npm run verify:panta-devnet -- buy 5
# Fund the curve to its actual on-chain threshold before graduation.
npm run verify:panta-devnet -- graduate
npm run verify:panta-devnet -- inspect
```

`PANTEST` mint: `DTyL8pSGmLBRMyHP3DEsqzPByZ4CadEKkCvKaZ2x3bzc`. Creator: `1YqxrFExzvJ6r1HqeaoRyZ8i4iUaZX5q8eZ3pFqaBmR`. Launch signature and slot are in the artifact report. This wallet currently lacks the configured test USDC (`DuQ1T5B6tmf5ZfSNpPomVcDntLEzR1mkoB81yHP5rGHG`). Funding and an administrator-refreshed OpenAI settlement policy are required to complete the actual buy/graduation case. Post-graduation 30-day outcomes cannot be represented as live results before their deadline.

Official references: [creation flow](https://docs.panta.market/api-reference/markets/overview), [quote](https://docs.panta.market/api-reference/markets/quote), [authentication](https://docs.panta.market/guides/authentication), [primary build](https://docs.panta.market/api-reference/orders/build), [trade verification](https://docs.panta.market/api-reference/trades/report), [official playground](https://github.com/Kaito-HQ/panta-api-playground).
