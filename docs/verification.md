# Verification and release requirements

Run `npm test` for offline regression tests covering trade authentication, retry handling, accounting, token discovery, formatting, and persistence. Run `npm run build` for the production compilation and application type checks. `npm run lint` currently performs TypeScript checks, not ESLint checks.

Run `npm run test:contract` with Rust installed for native program unit tests. These do not execute Solana transactions. The numbered integration tests require a fresh local validator, a deployed StreetFun program, funded test accounts, and the configured test mints; run them with `npm run test:integration` after that setup. They share a generated protocol administrator through `tests/helpers.ts`.

For an isolated mock browser session alongside another development server, use:

```sh
NEXT_DIST_DIR=.next-verification NEXT_PUBLIC_USE_MOCK_DATA=true NEXT_PUBLIC_SOLANA_NETWORK=localnet NEXT_PUBLIC_SUPABASE_URL='' npm run dev -- --port 3100
```

Verify a simulated buy updates the receipt and history, narrow-screen layouts remain usable, wallet dialogs support keyboard navigation, and a saved pending order prevents another submission. Mock history is in memory and can reset when the development server recompiles.

## Deployment dependencies

Apply `supabase/migrations/202609190001_chart_buckets.sql` through the normal database migration process. It fixes multi-hour/day candle boundaries, excludes redemptions from candles, and preserves six decimal places in quote amounts.

The graduation instruction now requires the configured protocol administrator and a nonzero equity amount. This is a trusted operator settlement: destination accounts and the exchange price are still operator-selected. It does not verify an external swap or create an AMM pool. Permissionless graduation must remain disabled until those operations are verified on chain. Updating the source does not upgrade an already deployed program; rebuild, run validator integration tests, and deploy through the normal program upgrade process.

Live trading of graduated tokens and live equity redemption remain unavailable until verified execution routes are configured. Browser simulations and native unit tests do not validate those integrations.
