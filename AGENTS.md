# StreetFun Engineering & Design Guidelines

This document serves as the single source of truth for design tokens, component standards, typography, layout rules, and coding conventions across the StreetFun codebase. Every agent and developer must strictly adhere to these principles to maintain consistency and prevent design regression.

---

## 1. Color Palette & Design System Tokens

All colors are configured as CSS variables in `src/app/globals.css` and mapped to Tailwind utilities in `tailwind.config.ts`. **Never hardcode arbitrary hex codes in JSX/TSX components.**

| Token | CSS Variable | Hex Value (Street Dark) | Tailwind Class | Semantic Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Background** | `--background` | `#0c1218` | `bg-background`, `text-background` | App background, page canvas |
| **Foreground** | `--foreground` | `#f1f5f9` | `text-foreground` | Primary text, titles, prominent numbers |
| **Card / Surface** | `--card` | `#131d27` | `bg-card` | Panels, cards, modal dialog containers |
| **Card Hover** | `--card-hover` | `#192734` | `bg-card-hover` | Interactive hover states, active list selections |
| **Card Subtle** | `--card-subtle` | `#090e13` | `bg-card-subtle` | Recessed containers, inset fields |
| **Border** | `--border` | `#1f3042` | `border-border` | Default dividers, card contours, subtle borders |
| **Border Active** | `--border-active` | `#2d455e` | `border-border-active` | Hovered borders, active tabs, focused inputs |
| **Brand Cyan (Primary CTA)** | `--brand-cyan` | `#5eead4` | `bg-brand-cyan`, `text-brand-cyan` | Primary action buttons (Launch, Connect), key accents |
| **Brand Emerald** | `--brand-emerald` | `#10b981` | `text-brand-emerald` | Positive 24h price delta, completed checkmarks |
| **Brand Rose** | `--brand-rose` | `#f43f5e` | `text-brand-rose` | Negative 24h price delta, danger actions |
| **Muted Text** | `--muted` | `#94a3b8` | `text-muted` | Labels, secondary descriptions, metadata |
| **Muted Subtle** | `--muted-foreground` | `#64748b` | `text-muted-foreground` | Timestamps, tertiary notes, placeholders |

> **Avoid the "Black Hole" Bug**: Never use `bg-card-subtle` (`#090e13`) as an active/selected state or badge background on cards/modals. Since `#090e13` is darker than both `--card` (`#131d27`) and `--background` (`#0c1218`), it creates an unsightly pitch-black cutout. For active selections, always use `bg-card-hover` (`#192734`) with a subtle `border-border-active/60`.

---

## 2. Header & Navigation Component Standards

The header sets the standard for terminal-grade alignment and polish:

1. **Uniform Height (`h-11` / 44px)**:
   - Search Bar: `h-11 w-44 rounded-xl border border-border/80 bg-card`
   - Social Icons (Telegram, X): `h-11 w-11 rounded-xl border border-border/80 bg-card`
   - Launch Token CTA: `h-11 px-4 rounded-xl font-bold text-sm bg-brand-cyan text-slate-950`
   - Connect Wallet CTA: `h-11 px-4 rounded-xl font-bold text-sm bg-brand-cyan text-slate-950`
2. **CTA Visual Hierarchy**:
   - Both **Launch Token** and **Connect Wallet** share the matching `bg-brand-cyan` mint cyan color, mirroring the primary action buttons in the hero section.
3. **SSR Hydration Shift Elimination**:
   - Any dynamically imported wallet button or client component MUST declare a `loading` fallback skeleton matching the exact height (`h-11`), width, padding, and inner icon (`<Wallet className="h-4 w-4" />`) to prevent layout jumps during page load.

---

## 3. Badges & Status Tags

StreetFun follows Stonkfun's restrained terminal aesthetic rather than flashy consumer crypto neon.

- **Graduated Badge**:
  ```tsx
  <span className="rounded-md border border-slate-700/60 bg-slate-800/50 px-2 py-0.5 text-[10px] font-medium text-slate-300">
    Graduated
  </span>
  ```
- **Asset Class Badge (`Pre-IPO` / `xStocks`)**:
  ```tsx
  <span className="rounded-md border border-slate-700/50 bg-slate-800/30 px-2 py-0.5 text-[10px] tracking-wide font-mono font-medium text-slate-400">
    {token.targetEquity.isPreIpo ? "Pre-IPO" : "xStocks"}
  </span>
  ```
- **Stock Ticker**:
  Clean bold typography: `<span className="font-bold text-foreground">{symbol}</span>`.

---

## 4. Modals & Dialog Overlays

- **Backdrop Styling**:
  - Always use a soft, translucent overlay: `bg-black/30 backdrop-blur-[1px]` or `bg-black/35`.
  - **Never** use heavy `bg-black/80` or intense blur that completely blocks out the underlying UI.
- **Search Modal Result Rows**:
  - Selected / Focused row: `bg-card-hover border border-border-active/60 rounded-xl`
  - Unselected row: `hover:bg-card-hover/50 border border-transparent rounded-xl`
  - Always support keyboard navigation: `↑` / `↓` for row navigation, `Enter` to select, `Escape` or clicking backdrop to dismiss.

---

## 5. Forms, Number Inputs & Controls

- **Numeric Spinners**:
  HTML5 default stepper arrows are globally suppressed in `globals.css`:
  ```css
  input[type="number"]::-webkit-outer-spin-button,
  input[type="number"]::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  input[type="number"] {
    -moz-appearance: textfield;
    appearance: textfield;
  }
  ```
- **Input Focus State**:
  Terminal focus state: `border border-border bg-card-subtle focus:border-brand-cyan focus:bg-card focus:outline-none`.

---

## 6. Copy, Data Formatting & Jargon Rules

1. **Jargon-Free UI**:
   - Never expose internal protocol jargon (e.g., DBC curves, DLMM tick spacing, bin steps) in user-facing views.
   - Use clean, institutional terminology:
     - *"Treasury & Security Details"* (not *"Protocol details"*)
     - *"Vault NAV Floor"* or *"NAV Floor"*
     - *"Collateral Stock"* / *"Backed with"*
     - *"Bonding Reserves"* / *"Market Cap"*
2. **Financial Number Formatting**:
   - Use standard financial notation: e.g., `$1.41M` instead of `$1410K`.
   - Prices: use clean fixed precision (e.g., `$0.0031`).
   - Percentages: always include sign (`+12.4%`, `-3.2%`).

---

## 7. Quality Assurance & Git Protocol

- **Build Verification**: Run `npm run build` to guarantee type safety and zero compile warnings before submitting changes.
- **Visual Verification First**: Capture and inspect a screenshot of the modified component or screen.
- **Strict User Approval Constraint**:
  > **NEVER execute `git push` without presenting the visual screenshot to the user and receiving their explicit approval ("bi resim ver ben onaylarsam pushla").**
