# Verified progress — 8 October 2026

A fresh `PANTEST` token was created using the authorized local Devnet test wallet. Its creator is `1YqxrFExzvJ6r1HqeaoRyZ8i4iUaZX5q8eZ3pFqaBmR`; its mint is `DTyL8pSGmLBRMyHP3DEsqzPByZ4CadEKkCvKaZ2x3bzc`.

[Confirmed launch transaction](https://solscan.io/tx/5UxQAfVrdWozkn6aSTiXnFvHdh1h2r6DfwBh76M4jfsGR8g51ZbCCwrHYrY6QjH2NC8DB2m67NhanMXkD2X4sLL9?cluster=devnet). The canonical lifecycle row records this signature and slot 508792914. Launch confirmation and current market response are in `transactions.json`.

The launch triggered a real pre-graduation queue entry automatically. The issuer did not send a Panta payment: the provider's Devnet USDC configuration is incomplete. The current UI displays the queued system question and “Awaiting provider setup,” with no fabricated odds or prediction deposit controls. The production build screenshot is `pre-graduation-desktop.jpg`.

Validation: `npm run build` passed with no compile warnings; all 98 unit tests passed. The standalone worker ran successfully against the connected Supabase project. Both migrations' tables and all three RPC functions exist, and anonymous access is denied. The old exposed Panta credential returned 401; the replacement successfully read the staging account and catalog. `environment.json` contains the diagnostics without secrets.

Remaining live-test dependencies:

1. Fund the creator with 100 test USDC of mint `DuQ1T5B6tmf5ZfSNpPomVcDntLEzR1mkoB81yHP5rGHG`. The wallet already has about 8.26 test SOL. The Solana faucet supplies SOL, not this custom mint. Its mint authority and StreetFun protocol administrator are `519jca26LioEQiPhwoHCkC8mNZiCF7cDmtaXdp98iCv2`. Graduation also needs that administrator to refresh the approved OpenAI settlement policy.
2. Panta must finish its Devnet USDC config at `8mJjfx7SuWwS4yfVZXtqC2cvzxr3TQHsCgKyjpuDWKAP`: it has 324 bytes and its USDC mint is unset. The system issuer needs that actual configured USDC and SOL once the deployment is operational.
3. Panta staging creation must work. The canonical new-token create quote returns HTTP 400 `DUPLICATE_MARKET` although its expected event account did not exist on Devnet before the request. See `staging-create.json`. Unique diagnostic questions returned the same error. No transaction was signed for these probes.
4. Configure a stable public market image and deploy the public evidence endpoint. Post-graduation creation checks that it serves the exact stored baseline. A local-only site cannot provide public oracle evidence.
5. Panta must provide an authorized oracle path, including support for immediate pre-graduation YES settlement. The public API does not document a partner resolution endpoint. Post-graduation outcomes depend on the real 30-day observation window; they have not been fabricated as completed test results.

The actual token buy, collateral graduation, second Panta market, prediction buys, resolution and claim are not yet live-verified. Code and recovery tests cover those paths, but do not replace receipts.

Work is checkpointed locally on `panta-completion`, based on `origin/panta`. No push or deployment was performed. Credentials and wallet keypairs are excluded from the checkpoint.

## Additional staging/Devnet test completed at 11:16:49 UTC

The replacement credential still authenticates successfully. An unsigned, UUID-qualified creation question submitted with the authorized creator wallet returns HTTP 400 `DUPLICATE_MARKET`; its expected event account was absent before the request.

The first 50 staging catalog rows include only six accounts present on Devnet. All six belong to program `4CQ4LWv7194V3Qe3iEYZq33cFPQbmKU3e1xVQkpTegLU`, which Panta's published frontend lists as a legacy USDC program. Its configuration at `3a4GuktDEyjqi5X9AQu8WDJcT2mgXD8Dr6v9j2teuWTk` has 356 bytes and six-decimal test USDC mint `8Qm44MpHDMs3mdiqryHxhgqLBVrecWmTdVKwqUoxywEY`. Configured creation payments are 20 USDC for breaking markets and 50 USDC for regular markets.

Staging buy quotes for legacy markets `EWiohz3LKFPmtWKF33K1wDj1xQUUP3Q3xfkj5Tsq9LTd` and `8qCSNAz6nxtWbB4TPuzM6RTq8Bsum1ssPZzgnqpQyF2t` return HTTP 404 `MARKET_NOT_FOUND`. The first listed market, `AESrMoZxcTGQibC1rNEmq3oz9qoDqHhomUe6MQEw1k9F`, has no Devnet account; its quote returns HTTP 400 `MARKET_NOT_IN_PRIMARY`.

`staging-trade-probe.json` records these exact requests and responses. No buy or create build was possible, and no transaction was signed or broadcast. The integration's program configuration was not changed to the legacy address because these API probes did not establish a supported creation/trading path. Panta needs to identify the supported Devnet program, initialize its USDC configuration and make staging creation/trading work against it.
