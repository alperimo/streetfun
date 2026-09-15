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
│   ├── app/                        # Next.js 15 App Router pages
│   │   ├── page.tsx                # Explore & live curves
│   │   ├── treasury/page.tsx       # Treasury & Proof of Assets (TVL)
│   │   └── token/[mint]/page.tsx   # Token detail, chart, swap & Burn-Redeem
│   ├── components/
│   │   ├── layout/                 # Header, Footer, WalletProvider
│   │   ├── home/                   # HeroBanner, FilterBar
│   │   ├── tokens/                 # TokenCard, TradingViewChart, TradeTerminal, BurnRedeemModule
│   │   └── modals/                 # SearchModal (Cmd+K), LaunchModal
│   ├── sdk/                        # TypeScript SDK (PDAs, Math, Constants)
│   └── lib/                        # Data models & mock state
├── tests/
│   ├── tsconfig.json               # Test compiler configuration
│   └── streetfun.ts                # Full lifecycle integration test suite
└── scripts/
    └── init_protocol.ts            # Devnet deployment & initialization script
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
- Rust 1.80+ and Cargo
- Anchor CLI 0.30+ / 0.32+

### Run Smart Contract Unit Tests
```bash
cargo test --package streetfun --lib math
```

### Run Full Integration Test Suite
```bash
anchor test
# or directly with mocha:
npm run test:integration
```

### Build & Run Next.js Frontend
```bash
# Start development server on localhost:3000
npm run dev

# Production build
npm run build
npm run start
```

---

## 6. License
MIT License.
