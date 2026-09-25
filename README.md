# StreetFun

StreetFun is a Solana token launchpad with an on-chain virtual-reserve bonding curve and third-party collateral tokens. Tessera T-Tokens are loan participation rights; they are not shares or ownership in the referenced company.

Upon reaching graduation, the protocol executes an automated dual-allocation:
1. **Half of quote reserves** buys the selected collateral token through a live Meteora DAMM v2 market and locks the received tokens in the curve's PDA vault.
2. **The other half plus remaining meme supply** seeds a new Meteora DAMM v2 pool for secondary-market liquidity.
3. After graduation, holders can burn meme tokens to redeem their pro-rata portion of the vault-held collateral token, subject to Token-2022 transfer fees and on-chain balances.

---

## 1. Core Architecture & Protocol Features

Unlike traditional bonding curve platforms that operate as extractive zero-sum games, StreetFun transforms speculative momentum into durable institutional collateral:

1. **Collateralized Equity Backing ("Backed By")**:
   Each token is bound to a verified backing asset sourced from institutional on-chain providers:
   - **PreStocks**: 1:1 SPV-backed pre-IPO equities with audited mark pricing.
   - **Tessera**: T-Tokens that represent loan participation rights, not direct equity or company shares.

2. **StreetFun Bonding Curve**:
   Trades execute along a constant-product virtual-reserve curve quoted in USDC. Real-time progress indicators track quote accumulation toward graduation. This is StreetFun's curve; launches do not currently use Meteora DBC.

3. **Automated Meteora Liquidity Migration**:
   On graduation, trading on the curve locks permanently. The contract allocates 50% of accumulated funds to acquire and vault the target equity, while routing the remaining 50% USDC and remaining meme tokens to initialize a Meteora liquidity pool.

4. **On-Chain Burn & Redeem Module**:
   A post-graduation redemption mechanism allowing holders to burn meme tokens for their pro-rata share of collateral tokens held in the PDA vault. This formula does not guarantee a market price or issuer redemption.

5. **Integrated Platform Suites**:
   - **Explore**: Discover live curves, filter by backed equity provider, and track market momentum.
   - **Treasury / Proof of Assets**: Real-time on-chain vault metrics, aggregate TVL, and verifiable redemption records.
   - **Launch Token**: Seamless token creation wizard with verified pre-IPO asset selection and instant liquidity preview.

---

## 2. Mathematical Model

### Constant Product Bonding Curve with Virtual Reserves

The bonding curve utilizes constant-product invariant math with virtual quote and token reserves:

$$(x + v_x) \cdot (y + v_y) = k$$

Where:
- $x$ is real quote reserve (USDC).
- $v_x$ is virtual quote reserve.
- $y$ is real meme token reserve.
- $v_y$ is virtual token reserve.

#### Buy Calculation (USDC -> Meme Tokens)
$$\Delta y = y - \frac{k}{x + \Delta x_{\text{net}}}$$
Where $\Delta x_{\text{net}} = \Delta x - \text{Fee}$.

#### Sell Calculation (Meme Tokens -> USDC)
$$\Delta x_{\text{gross}} = x - \frac{k}{y + \Delta y}$$
Where $\Delta x_{\text{net}} = \Delta x_{\text{gross}} - \text{Fee}$.

### Pro-Rata Equity Redemption Formula

Post-graduation, any holder burning $M$ meme tokens is entitled to:

$$\text{Collateral units} = \frac{M}{\text{Outstanding Meme Supply}} \times \text{Collateral units held in the vault}$$

All mathematical operations use checked 128-bit unsigned integer arithmetic to prevent overflow and round in favor of the vault.

---

## 3. Repository Structure

```
streetfun/
├── Anchor.toml                     # Anchor workspace configuration
├── Cargo.toml                      # Cargo workspace manifest
├── keys/
│   └── streetfun-keypair.json     # Program deploy keypair
├── programs/
│   └── streetfun/
│       ├── Cargo.toml              # Anchor dependencies
│       └── src/
│           ├── lib.rs              # Program entrypoint & event definitions
│           ├── state.rs            # Account structs (GlobalConfig, CurveAccount)
│           ├── errors.rs           # Typed error codes
│           ├── math.rs             # Pure bonding curve & pro-rata math engine
│           └── instructions/
│               ├── initialize.rs   # initialize_global_config
│               ├── launch.rs       # launch_stonk
│               ├── buy.rs          # buy_curve
│               ├── sell.rs         # sell_curve
│               ├── graduate.rs     # graduate_and_execute_stock
│               └── redeem.rs       # burn_and_redeem
├── src/
│   ├── app/                        # Next.js 15 App Router pages & API routes
│   │   ├── page.tsx                # Explore & live curves
│   │   ├── treasury/page.tsx       # Treasury & Proof of Assets (TVL)
│   │   ├── token/[mint]/page.tsx   # Token detail, chart, swap & Burn-Redeem
│   │   └── api/
│   │       ├── webhooks/helius/    # Helius Webhook transaction listener
│   │       ├── trades/record/      # Authenticated trade & token indexing endpoint
│   │       ├── trades/[mint]/      # Live trades query route
│   │       └── charts/[mint]/      # Real-time OHLCV aggregation route
│   ├── components/
│   │   ├── common/                 # Skeletons (TokenCardSkeleton, TokenDetailSkeleton)
│   │   ├── layout/                 # Header, Footer, WalletProvider
│   │   ├── home/                   # HeroBanner, FilterBar
│   │   ├── tokens/                 # TokenCard, TradingViewChart, TradeTerminal, BurnRedeemModule
│   │   └── modals/                 # SearchModal (Cmd+K), LaunchModal
│   ├── sdk/                        # TypeScript SDK (PDAs, Math, Constants)
│   ├── services/                   # Service layer
│   │   ├── indexer/tradeStore.ts   # Supabase trade store & local fallback cache
│   │   ├── solana/                 # On-chain Solana RPC services
│   │   └── mock/                   # In-memory simulation services
│   └── lib/                        # Data models, types & mock state
├── supabase/
│   └── schema.sql                  # PostgreSQL schema, get_ohlcv RPC function & RLS
├── tests/
│   ├── tsconfig.json               # Test compiler configuration
│   ├── helpers.ts                  # Shared PDAs, mints, and provider fixtures
│   ├── 01_initialize.test.ts       # Protocol init & parameter tests
│   ├── 02_launch.test.ts           # Token launch & PDA derivation tests
│   ├── 03_bonding_trade.test.ts    # Buy/sell curve & price discovery tests
│   ├── 05_burn_redeem.test.ts      # Pre-graduation redemption safety tests
│   └── 06_e2e_lifecycle.test.ts    # DAMM v2 settlement and redemption with test collateral
└── scripts/
    ├── init_protocol.ts            # Protocol initialization script
    ├── localnet_demo.ts            # End-to-end localnet live lifecycle runner
    ├── test_webhook.ts             # Dynamic multi-token Helius Webhook simulator
    └── local_helius_indexer.ts     # Localnet Solana log listener daemon
```

---

## 4. Smart Contract Instructions

| Instruction | Accounts Involved | Description |
| :--- | :--- | :--- |
| `initialize_global_config` | Admin, GlobalConfig PDA | Sets protocol fee, graduation threshold, and virtual reserves |
| `launch_stonk` | Creator, Curve PDA, Token Vault, Quote Vault, Treasury Vault | Mints 1B meme supply to vault, sets target equity mint |
| `buy_curve` | Buyer, Curve PDA, Token Vault, Quote Vault, Fee Recipient | Swaps USDC for meme tokens along the bonding curve |
| `sell_curve` | Seller, Curve PDA, Token Vault, Quote Vault, Fee Recipient | Swaps meme tokens back to USDC prior to graduation |
| `graduate_and_execute_stock` | Caller, Curve PDA, Treasury Vault, DAMM v2 markets and pool accounts | Buys collateral with half the quote reserves; seeds the other half plus remaining meme tokens into DAMM v2 |
| `burn_and_redeem` | Redeemer, Meme Mint, Treasury Vault, Collateral Mint | Burns meme tokens and transfers the pro-rata collateral-token amount |

---

## 5. Development & Testing

### Prerequisites
- Node.js v20+ / v24+
- Rust 1.84+ and Cargo
- Agave / Solana CLI 2.3+ (`solana`, `solana-test-validator`)
- Anchor CLI 0.32+

### 1. Start Localnet Validator
```bash
solana-test-validator --reset --quiet
```

### 2. Build & Deploy Smart Contracts
```bash
anchor build
solana program deploy target/deploy/streetfun.so --url http://127.0.0.1:8899
```

### 3. Run Smart Contract Unit Tests
```bash
cargo test --package streetfun --lib math
```

### 4. Run Modular Integration Test Suite (13 Tests)
```bash
# Runs all 5 modular test suites against localnet:
yarn test
# or:
npm run test:integration
```

### 5. Run Live End-to-End Localnet Demo Script
```bash
npx ts-node --transpile-only -P ./tests/tsconfig.json scripts/localnet_demo.ts
```

### 6. Build & Run Next.js Frontend
```bash
# Toggle simulation vs live on-chain in .env.local:
# NEXT_PUBLIC_USE_MOCK_DATA=true  -> Instant interactive simulation demo
# NEXT_PUBLIC_USE_MOCK_DATA=false -> Live on-chain Anchor smart contract calls

# Start development server on localhost:3000
npm run dev

# Production build
npm run build
npm run start
```

With `NEXT_PUBLIC_SOLANA_NETWORK=localnet`, a loopback RPC, and mock data off,
the wallet menu offers **Localnet Dev Wallet**. It creates a disposable browser
signer for this tab and funds it with 2 test SOL and 10,000 test USDC from the
local validator. The configured test USDC mint must be controlled by the local
CLI wallet (`ANCHOR_WALLET` or `~/.config/solana/id.json`). Its key stays in
browser session storage and is never suitable for another network.

### 7. Real-Time Indexing & Helius Webhook Architecture

StreetFun utilizes a high-throughput hybrid architecture combining on-chain Solana state with an off-chain real-time indexing pipeline powered by **Helius Webhooks** and **Supabase (PostgreSQL)**:

1. **Transaction Capture**:
   - **Production (Mainnet / Devnet)**: Helius Webhooks monitor the StreetFun Program ID (`6ZiovCkRxRJgUaCS9uftFk3eVnGDsbnDXgUV1XHybH52`). When a `Buy`, `Sell`, or `BurnAndRedeem` transaction confirms, Helius dispatches an authenticated HTTP POST payload to `/api/webhooks/helius`.
   - **Local Development**: The web application automatically routes trade executions, token launches, and equity redemptions through `/api/trades/record`, ensuring every action updates Supabase with zero configuration.
2. **Parsing & Storage**:
   - The webhook processor parses instruction logs (`"Bought ... tokens for ... quote"`), extracts price and volume, verifies the token entity in `tokens`, and records the swap event into `trades`.
3. **TradingView OHLCV Aggregation**:
   - The PostgreSQL stored procedure `get_ohlcv(p_mint, p_interval_minutes, p_limit)` executes bucketed time-series aggregation directly in the database, feeding lightweight-charts candlesticks and volume histograms at sub-50ms latency.

### 8. Testing & Simulating Helius Webhooks Locally

You can simulate real-time Helius webhook payloads locally without requiring external tunnels:

```bash
# 1. Simulate a trade for a specific token symbol or mint address:
npm run test:webhook NVDU
npm run test:webhook MARS
npm run test:webhook <ANY_MINT_ADDRESS>

# 2. Specify custom trade types and amounts:
npm run test:webhook NVDU -- --type SELL --amount 500
npm run test:webhook MARS -- --type REDEEM --amount 1200

# 3. Simulate activity across all catalog tokens:
npm run test:webhook -- --all

# 4. Continuous live market simulation (ticks every 3 seconds):
npm run test:webhook -- --loop
```

### 9. Localnet Solana Log Listener Daemon

When running a local Solana validator (`solana-test-validator`), start the background indexer daemon to automatically intercept and forward local on-chain contract transactions to your webhook endpoint:

```bash
npm run dev:indexer
```

This service establishes a WebSocket connection to `127.0.0.1:8899`, listens for program logs from `6ZiovCkRxRJgUaCS9uftFk3eVnGDsbnDXgUV1XHybH52`, formats them into the standard Helius webhook schema, and posts them directly to `http://localhost:3000/api/webhooks/helius`.

### 10. Supabase Database Configuration

StreetFun uses modern Supabase Publishable and Secret API keys. Add the following to your `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
HELIUS_WEBHOOK_SECRET=your_secure_webhook_secret
```

Apply the database schema located at `supabase/schema.sql` using the Supabase SQL Editor.

---

## 6. Deployment (Vercel & Cloudflare)

The production web application runs on **Vercel** with **Cloudflare** for DNS, DDoS protection, and SSL.

### Deploy to Production

**Option 1: Git Push (Automatic)**
```bash
git push origin main
```
*Every push to `main` automatically triggers a production deployment.*

**Option 2: Vercel CLI (Manual)**
```bash
npx vercel --prod
```
*To generate a temporary preview/test deployment instead, run `npx vercel`.*

### Environment Flags

- **Alpha Early Access (Default)**: In production, root (`/`) serves the Alpha Early Access page. Routes like `/treasury` and `/token/*` are protected and redirect to `/`.
- **Full Platform Access**: Set `NEXT_PUBLIC_FULL_APP=true` in Vercel Environment Variables to expose all routes.

---

## 7. License
MIT License.
