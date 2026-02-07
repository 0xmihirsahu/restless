# Restless — Brand & Logo Design Instructions

## Brand Essence

**Tagline:** Your Escrow, Never Idle
**Core concept:** Capital in perpetual motion. Funds locked in escrow continuously earn yield — they never sit still.
**One-word feeling:** Relentless

---

## Logo Direction: The Orbital Loop

A continuous, asymmetric loop — inspired by a Mobius strip or infinity form, but modern and non-cliche. The loop represents the perpetual cycle of capital: deposited into escrow, flowing through Aave to earn yield, and returning with more than it started.

### Concept

The mark is a single, continuous stroke that forms a loop. It never breaks. One section of the loop is **thicker** (the locked principal — stable, secure), and it tapers into a **thinner, accelerating** section (the yield being generated — dynamic, active). The weight variation within one continuous path communicates both security and motion in a single mark.

Think of it as: a racetrack where the straightaway is bold and the curve accelerates into something lighter and faster.

### What It Is NOT

- Not a coin or token shape
- Not a lock, key, vault, or shield
- Not lightning, spark, thunder, or electricity
- Not a generic infinity symbol (must be asymmetric, not a perfect figure-8)
- Not a circular arrow (recycling symbol)
- Not any recognizable crypto cliche

### Visual References (Mood, Not Copy)

| Reference | What to Take From It |
|-----------|---------------------|
| Uniswap logomark | Confidence, simplicity, works tiny and huge |
| Stripe wordmark | Premium tech feel, not "crypto-bro" |
| Curve Finance logo | Mathematical elegance in a simple form |
| Safe Global mark | Trust and security without a literal shield |
| Superfluid logo | Sense of flow and continuous streaming |
| Linear app icon | Geometric precision, modern software aesthetic |

---

## Construction Rules

### Geometry
- Built from clean bezier curves, no sharp corners
- Single continuous path (one stroke, variable weight)
- Asymmetric — the loop should feel directional, like it has momentum
- The thick-to-thin transition should be smooth, not abrupt
- Must be constructible on a grid (mathematically precise, not hand-drawn)

### Sizing
- Must be legible and recognizable at **16x16px** (favicon)
- Must work as a **32x32px** circular avatar (Discord, Twitter/X, GitHub)
- Must hold up at **512px+** for hero usage
- Test at all three sizes before finalizing

### Orientation
- The loop should suggest forward/upward motion (energy moving right and up)
- Default orientation: the thicker section at bottom-left, thinning as it curves up-right

---

## Color System

### Primary Palette

| Name | Hex | Usage |
|------|-----|-------|
| Indigo | `#4F46E5` | Primary brand color. The main loop stroke. Trust, depth, sophistication. |
| Amber | `#F59E0B` | Accent. Applied to the thin/accelerating section of the loop. Yield, warmth, energy. |
| Navy | `#0F172A` | Dark backgrounds, dark mode base. |
| Off-White | `#F8FAFC` | Light backgrounds, light mode base. |

### Extended Palette

| Name | Hex | Usage |
|------|-----|-------|
| Slate | `#94A3B8` | Secondary text, muted UI elements |
| Emerald | `#10B981` | Success states (deal settled, tx confirmed) |
| Red | `#EF4444` | Error/danger states (timed out, failed) |
| Indigo Light | `#818CF8` | Hover states, secondary accents |
| Amber Light | `#FCD34D` | Highlight, yield ticker glow |

### Color Application on Logo

**On dark background (#0F172A):**
- Main loop: Indigo `#4F46E5`
- Accelerating section: gradient from Indigo to Amber `#F59E0B`
- Or: full loop in Off-White `#F8FAFC` (monochrome variant)

**On light background (#F8FAFC):**
- Main loop: Indigo `#4F46E5`
- Accelerating section: gradient from Indigo to Amber `#F59E0B`
- Or: full loop in Navy `#0F172A` (monochrome variant)

**Single-color usage (monochrome):**
- White on dark, or Navy on light. No gradient. Weight variation alone carries the concept.

---

## Typography

### Display / Headings
**Satoshi** (bold, black weights)
- Geometric sans-serif with personality
- Used for: logo wordmark, page headings, hero text
- Fallback: `General Sans`, `DM Sans`

### Body / UI
**DM Sans** (regular, medium weights)
- Clean, readable, pairs well with Satoshi
- Used for: paragraph text, UI labels, descriptions
- Fallback: `Inter`, system-ui

### Monospace / Data
**JetBrains Mono** (regular)
- Used for: contract addresses, transaction hashes, token amounts, code
- Fallback: `Fira Code`, `SF Mono`

### Type Scale

| Name | Size | Weight | Usage |
|------|------|--------|-------|
| Hero | 48-64px | Satoshi Black | Landing page headline |
| H1 | 36px | Satoshi Bold | Page titles |
| H2 | 24px | Satoshi Bold | Section headers |
| H3 | 20px | Satoshi Medium | Card titles |
| Body | 16px | DM Sans Regular | Paragraph text |
| Small | 14px | DM Sans Regular | Secondary text, labels |
| Caption | 12px | DM Sans Medium | Metadata, timestamps |
| Mono | 14px | JetBrains Mono | Addresses, amounts |

---

## Logo Wordmark

**"restless"** — all lowercase, set in Satoshi Bold.

The double "s" in the middle can optionally use the amber accent color to create a subtle focal point, but this is not required. The wordmark should work in pure indigo or pure navy as well.

Letter spacing: slightly tight (-0.02em). The word should feel compact and confident.

### Lockup Variants

1. **Symbol only** — the orbital loop mark, no text
2. **Symbol + wordmark** — loop mark to the left, "restless" to the right, vertically centered
3. **Wordmark only** — "restless" in Satoshi Bold, no symbol
4. **Stacked** — loop mark above, "restless" below, center-aligned

Minimum clear space around the mark: 1x the height of the loop on all sides.

---

## AI Image Generation Prompts

### For Midjourney / DALL-E / Stable Diffusion

**Primary prompt (abstract mark):**
```
Minimal vector logomark for a fintech protocol called "Restless".
A continuous asymmetric orbital loop — like a Mobius strip but modern
and geometric. One section of the loop is thicker representing stability,
tapering into a thinner accelerating section representing motion and
growth. Single continuous stroke with variable weight. Deep indigo
(#4F46E5) main form with warm amber (#F59E0B) gradient on the thin
accelerating section. Dark navy (#0F172A) background. Clean bezier
curves, no sharp corners. No coin, no shield, no lock, no lightning.
Sophisticated and confident like Stripe or Linear branding. Flat
vector, works at favicon size. White background version also needed.
```

**Monochrome variant prompt:**
```
Minimal vector logomark, single continuous loop with variable stroke
weight — thick on one side tapering to thin on the other. Asymmetric,
suggesting forward momentum. Pure white on dark navy (#0F172A)
background. Geometric construction, smooth bezier curves. No text.
Clean enough for a 16px favicon. Premium fintech aesthetic, not crypto
cliche. Similar confidence to Stripe, Linear, or Vercel logos.
```

**Wordmark prompt:**
```
Typographic logo "restless" in all lowercase, bold geometric
sans-serif font similar to Satoshi or General Sans. Deep indigo
(#4F46E5) text on white background. Tight letter-spacing, compact
and confident. The double "s" in warm amber (#F59E0B) as subtle
accent. Clean, modern, editorial. Would look at home next to
Uniswap, Aave, and Superfluid logos. No icon, text only.
```

---

## Usage Don'ts

- Don't rotate the logo at arbitrary angles
- Don't change the aspect ratio (no stretching/squishing)
- Don't add drop shadows, outlines, or 3D effects
- Don't place on busy/patterned backgrounds without sufficient contrast
- Don't swap the indigo/amber color roles
- Don't use any other colors for the logo mark
- Don't recreate the loop as a perfect symmetrical infinity symbol
