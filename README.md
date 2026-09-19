# Streetfun (StonkCurves)

Streetfun is a decentralized launchpad and bonding curve engine on Solana where every memecoin is backed by a verified tokenized equity asset (such as SpaceX `$SPCX`, Nvidia `$NVDA`, Grindr `$GRND`, or SanDisk `$SNDK`).

Upon reaching graduation, 50% of the accumulated USDC purchases the underlying tokenized equity and locks it permanently into an immutable Anchor PDA Treasury, establishing an unbreakable dual redemption floor. Holders can burn their meme tokens at any time post-graduation to redeem their pro-rata share of real tokenized equities or swap them back to USDC in a single click.

---

## 1. Core Architecture & Differentiators

Unlike traditional pump engines or paired-token platforms, Streetfun implements four distinct architectural features:

1. **Collateralized Equity Backing ("Backed By")**:
   Each token card and terminal indicates the underlying stock collateral with a verified vault badge, referencing the canonical Sunrise SPL mint custodied under New York UCC Article 8 by Backpack Securities.

2. **Graduation Progress Gauge**:
   A deterministic progress indicator measuring current quote reserves against the graduation threshold (default: 60,000 USDC) alongside projected equity share purchases.

3. **Burn & Redeem Module**:
   A dedicated post-graduation module allowing holders to burn meme tokens for their pro-rata share of real tokenized stock held in the PDA vault, with two execution modes:
   - **Direct Stock Withdrawal**: Transfers the canonical equity SPL tokens directly to the user's wallet.
   - **1-Click Cash Settlement**: Automatically routes equity liquidation back to USDC.

4. **Streamlined Navigation**:
   - **Explore**: Live bonding curves, filters by backed equity, and market metrics.
   - **Treasury / Proof of Assets**: Real-time on-chain vault metrics, TVL, and equity distribution ledger.
   - **Launch a Stonk**: 5-second token creation wizard with verified equity selection.

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

$$\text{Shares} = \frac{M}{\text{Total Meme Supply}} \times \text{Total Equity Locked}$$

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
│   ├── 04_graduation.test.ts       # 60k threshold trigger & 50/50 fund split tests
│   └── 05_burn_redeem.test.ts      # Pro-rata stock redemption & burn tests
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
| `graduate_and_execute_stock` | Caller, Curve PDA, Treasury Vault, Equity Source, AMM Dest | Allocates 50% USDC to stock purchase; allocates 50% to AMM |
| `burn_and_redeem` | Redeemer, Meme Mint, Treasury Vault, Equity Mint | Burns meme tokens; transfers pro-rata stock shares |

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

## 6. Production Deployment (Vercel & Cloudflare)

StreetFun is architected to run on **Vercel** (Next.js 15 App Router & Server Actions) fronted by **Cloudflare** (DNS, DDoS Mitigation, Edge CDN & SSL).

### Production Architecture

```
[Users / Wallets]
       │
       ▼ (DNS / DDoS / CDN)
[Cloudflare Edge] (Full Strict SSL / Proxied CNAME)
       │
       ▼
[Vercel Serverless] (Next.js 15 Production Instance)
       ├── Root (/) ──► Alpha Early Access Landing Page (Active)
       ├── /api/alpha/* ──► Cüzdan Doğrulama & Pass Kayıt
       └── /treasury, /token/* ──► Middleware Protected (Redirect to /)
```

### How to Deploy

#### Method 1: Continuous Deployment via Git Push (Recommended)
Every push to the `main` branch automatically triggers an optimized production build on Vercel:

```bash
git add .
git commit -m "feat: your feature or fix"
git push origin main
```
*Vercel detects the push, executes `npm run build`, and updates the production domains (`https://streetfun.xyz`) within 45-60 seconds.*

#### Method 2: Direct CLI Deployment via Vercel CLI
You can deploy directly from your local terminal without committing to GitHub:

```bash
# 1. Deploy directly to Production (Live):
npx vercel --prod

# 2. Deploy a Preview / Test Build (generates a temporary private test URL):
npx vercel
```

### Alpha-Only Mode vs Full Platform Launch

- **Current State (Alpha-Only)**:
  In production, only the Alpha Early Access page (`/`) and verification APIs (`/api/alpha/*`) are exposed. Any direct URL visits to `/treasury` or `/token/[mint]` are automatically intercepted and redirected to `/` by Next.js `middleware.ts`.
- **Local Development**:
  On `http://localhost:3000/`, the full trading terminal (`MarketsPage`), Treasury, and token detail pages remain 100% accessible.
- **Launching Full Platform in Production**:
  When ready for Devnet/Mainnet trading, add `NEXT_PUBLIC_FULL_APP=true` to your Vercel Project Environment Variables (Settings ➔ Environment Variables) or set the flag in code.

---

## 7. License
MIT License.
