# Panta failure isolation — 8 October 2026

## Confirmed StreetFun defect, corrected

The server RPC guard, Panta browser wallet guard and two mainnet asset filters used a truncated mainnet genesis hash. Solana's official mainnet RPC returns `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`, so the old comparison rejected a legitimate mainnet connection. All these guards now use `src/lib/solanaClusters.ts`. A regression test accepts the actual mainnet hash and rejects the truncated value and cross-cluster connections. Devnet identity remains unchanged. This defect did not cause the observed Devnet API quote failures.

## Confirmed API failure boundary

`npm run diagnose:panta -- --live-control` was run at 11:53 UTC. Its secret-free results are in `../panta-api-diagnostics.json`. The script uses the published API/playground schema, fresh UUID questions, a publicly reachable sample image and the authorized test wallet. It cannot sign, broadcast or register transactions. Live-host calls are unsigned controls only.

| Check | Staging API | Live API |
| --- | --- | --- |
| Same account, authenticated | HTTP 200 | HTTP 200 |
| Market-creation permission | true | true |
| Invalid payload control | HTTP 400 with required-field errors | Not needed |
| Valid standard quote | HTTP 400 `DUPLICATE_MARKET` | HTTP 200 |
| Valid breaking quote | HTTP 400 `DUPLICATE_MARKET` | HTTP 200 |
| Unsigned build | No quote to build | HTTP 200 for both |

Both live-built transactions include mainnet USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`; their blockhashes were checked immediately and were valid on mainnet and invalid on Devnet. Neither was signed or broadcast.

The current program `6gM5afTQBq5VZCfgpGqcsqzfWd5maLSCKWtGjbEobZMp` has a 356-byte, configured USDC account on mainnet. At the same address on Devnet its configuration is 324 bytes and the USDC mint is unset. The legacy Devnet program has a configured test mint, but earlier staging buy quotes could not find its markets. Choosing it locally has not been shown to repair the API.

These checks rule out missing API authentication/creation permission and a general incompatibility with the documented request schema. They isolate the current Devnet failure to Panta's staging creation path and the current program's incomplete Devnet configuration. Funding cannot repair a quote that fails before an unsigned transaction is returned.

## Remaining uncertainty and concrete provider check

The extended field experiments in `api-isolation.json` also recorded intermittent generic `unexpected create quote/build failure — check server logs` responses on the live host. Interleaved identical controls failed too, so the failed variations do not establish that StreetFun's question, source URL or catalog text is invalid. The public response does not identify the backend exception; no database/RPC root cause has been asserted without logs.

Panta needs to correlate the recorded timestamps and UUID questions with the server exception, then verify staging's RPC genesis, program address, USDC configuration and create-session database constraints. The acceptance check is a unique standard and breaking question returning a quote and a build whose blockhash is valid on Devnet and whose mint/program match the supported Devnet configuration. If the supported program differs, StreetFun's reviewed program configuration must be aligned with it. No new StreetFun Anchor program is required.

References: [official create flow](https://github.com/Kaito-HQ/panta-api-playground/blob/main/src/components/CreateMarketFlow.tsx), [quote schema](https://github.com/Kaito-HQ/panta-api-pub/blob/main/api-reference/markets/quote.mdx), [Solana cluster identity method](https://solana.com/docs/rpc/http/getgenesishash).
