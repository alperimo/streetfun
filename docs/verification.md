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

Rebuild and upgrade the StreetFun program before deploying these settlement clients. Updating the source or IDL alone does not change an already deployed program. Existing global, curve and DBC registry account layouts remain unchanged; the new `SettlementPolicy` account is separate. Both graduation instructions now require that account, so the client and program upgrade must be coordinated.

For each quote/collateral pair, the configured protocol administrator must approve a DAMM v2 market and publish a minimum **net** exchange rate before settlement. Use an independently reviewed collateral price and account for swap and Token-2022 transfer fees; do not derive the safety floor solely from the pool being traded. A compromised or careless administrator can still approve an unsafe rate. There is no automatic rate publisher in this repository.

With `ANCHOR_PROVIDER_URL`, `ANCHOR_WALLET`, the configured network and quote mint set for the intended deployment:

```sh
npm run publish:settlement-policy -- <collateral-mint> <approved-DAMM-pool> <maximum-USDC-per-net-collateral-token>
```

This signs an administrator transaction and publishes a four-minute policy (the contract caps validity at five minutes). Refresh it before expiry if a settlement has not completed. The script checks network identity, wallet authority, and mint precision; the contract additionally verifies pool ownership and the asset pair. Every executor, including the creator, must use this market and meet the rate floor. Missing or expired policies stop settlement without releasing reserves.

The local validator lifecycle test exercises actual DAMM v2 swap and pool-creation CPIs, rejects unauthorized policy updates and dust minimums, and verifies that one-atom donations and an external token burn cannot block legacy graduation. Native tests cover substituted markets, expiry and DBC caller timing. These checks do not replace a complete DBC migration test on the target deployment, issuer-specific Token-2022 testing, or a production security review.

Launch recovery stores the signed transaction identifier and public launch details in browser storage before broadcasting. Keep that record until Solana confirms success, failure or expiry; clearing browser storage loses automatic recovery. The confirmation endpoint verifies the metadata digest committed in the signed DBC URI. Older launches without a digest can be reindexed but cannot change unsigned image or description fields through confirmation.

Treasury holdings come from verified live vault balances. On a refresh failure, the interface labels the retained snapshot with its last verification time. Indexed redemption history remains separate from current holdings.
