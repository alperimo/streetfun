# StreetFun Engineering & Design Guidelines

This document defines the architectural principles, color layering mental model, component standards, and development protocols for StreetFun. Keep this guide concise, principled, and actionable.

---

## 1. Single Source of Truth & Zero Hardcoding

1. **Tokens Over Hex Codes**:
   - All theme colors, surfaces, and accents are defined exclusively as CSS variables in `src/app/globals.css` and mapped via `tailwind.config.ts`.
   - **Never hardcode hex values (`#...`) in JSX/TSX components.** Always use semantic Tailwind utility classes (`bg-card`, `bg-card-hover`, `border-border`, `text-foreground`, `text-muted`, `bg-brand-cyan`, etc.).
   - If a color needs to be updated, change it in `globals.css`. Components must adapt automatically without manual edits.

---

## 2. Surface Layering & Depth Architecture

StreetFun uses a 4-tier surface elevation system to create depth without visual noise:

1. **Canvas (`bg-background`)**: The base background layer for the entire application canvas.
2. **Surface (`bg-card`)**: The primary container layer for cards, feed items, panels, and modal boxes.
3. **Elevated / Active Surface (`bg-card-hover`)**: The raised state used for hover interactions, active list item selections, and focused rows.
4. **Recessed Well (`bg-card-subtle`)**: An inset, sunken surface used strictly for embedded input fields or formula code blocks.

> **The "Black Hole" Rule**:
> `card-subtle` is intentionally darker than both `card` and `background`. Therefore, **NEVER** use `bg-card-subtle` as an active/selected state or badge background. Doing so produces a jarring pitch-black void. Active states and selections must always use `bg-card-hover` with a subtle active border or a delicate accent tint.

---

## 3. Visual Hierarchy & Action States

1. **Primary CTAs (Launch Token, Connect Wallet)**:
   - Both `Launch Token` and `Connect Wallet` share the matching primary brand accent fill with high-contrast dark text and a subtle hover brightness lift.
2. **Secondary Controls (Navigation Controls, Social Links)**:
   - Subdued, neutral translucent slate styling retaining polish without competing with primary actions for visual weight.
3. **Active Pills & Segmented Selectors**:
   - Inactive: Crisp low-contrast border, transparent background, calm muted slate text.
   - Active: Delicate accent tint background (e.g. `10%` opacity) paired with a soft accent border and highlighted text. Never use heavy, saturated blocks that overpower the feed.
4. **Bonding Progress Bars**:
   - Smooth horizontal gradient fill across the active progress width, embedded in a recessed track.

---

## 4. Semantic Domain Separation (Launchpad vs. Treasury)

Maintain a strict visual distinction between speculative momentum and institutional backing:

- **Launchpad & Bonding Curve**: Uses the primary brand accent (Cyan) for discovery, progression bars, and trading momentum.
- **Treasury, NAV Floor & Equity Redemption**: Exclusively uses the Gold/Amber palette (`border-amber-500/30 bg-amber-500/10 text-amber-300`).
- **Rule**: Never override equity backing markers (NAV Floor, collateral reserves, redeem module) with the launchpad accent. The gold tone is reserved to communicate collateral security and vault solvency.

---

## 5. Component Standards & Alignment

1. **Uniform Header Sizing**:
   - All interactive elements in the header (Search input, Social icon buttons, Launch Token CTA, Connect Wallet CTA) must share the exact same height (`h-11` / 44px) and border radius (`rounded-xl`).
2. **Zero SSR Layout Shifts**:
   - Client-only dynamic imports (such as wallet buttons) must declare a fallback `loading` skeleton matching the exact height (`h-11`), width, padding, and icon placeholders to prevent millisecond jumps during hydration.
3. **Badges & Status Tags**:
   - Badges (`Graduated`, `Pre-IPO`, `xStocks`) adhere to a restrained terminal aesthetic with thin slate borders and muted text. Avoid glowing shadows or harsh consumer neon fills.
4. **Modals & Overlays**:
   - Backdrops must remain soft and translucent (`bg-black/30 backdrop-blur-[1px]`), keeping the underlying dashboard context visible. Never use pitch-black overlays.
   - Modals must support keyboard navigation (`↑`/`↓`, `Enter`, `Escape`) and dismiss on backdrop click.

---

## 6. Copy, Data & Financial Formatting

1. **No Dev Jargon**: Never expose internal protocol jargon (e.g. DBC formulas, DLMM tick spacing, PDA addresses) in user-facing views. Use institutional financial terms (*"Treasury & Security Details"*, *"Vault NAV Floor"*, *"Collateral Stock"*).
2. **Financial Notation**: Format numbers cleanly using standard abbreviations (e.g. `$1.41M` instead of `$1410K`).
3. **Numeric Inputs**: HTML5 default number spin arrows are suppressed globally across all inputs.

---

## 7. Quality Assurance & Git Protocol

1. **Build First**: Run `npm run build` to ensure type safety and zero compile warnings before committing.
2. **Visual Verification**: Always capture and inspect screenshots of the affected screens.
3. **Strict Approval Rule**:
   > **NEVER execute `git push` without presenting the visual screenshot to the user and receiving explicit approval.**
