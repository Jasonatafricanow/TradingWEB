# GlobalTrade Hub — Design System

## Brand Register

**Product**: Cross-border trading platform for consulting services and virtual goods.
**Audience**: International traders, business professionals, procurement managers.
**Register type**: Brand register (public-facing pages = design IS the product) + Product register (admin dashboard = design SERVES the product).

### Brand Identity
- **Trust first**: financial transactions, international commerce — credibility is non-negotiable.
- **Global**: multi-language (zh/en/es/ja), multi-currency, cross-border.
- **Professional but approachable**: not corporate-stiff, not playful-startup.

### Design Read
*"Reading this as: B2B cross-border commerce platform for international traders and consultants, with a trust-first professional language leaning toward Tailwind + shadcn/ui + Geist + restrained motion."*

### Design Dials
- **DESIGN_VARIANCE**: 5 — clean, centered, trustworthy; not experimental.
- **MOTION_INTENSITY**: 4 — subtle hover states + purposeful reveals; nothing cinematic.
- **VISUAL_DENSITY**: 4 — spacious for marketing pages; denser for admin dashboards.

---

## Color System (OKLCH-first)

### Strategy: *Committed* (one saturated brand color carries 30-60% of surfaces)

### Palette

| Role | Token | OKLCH | Usage |
|---|---|---|---|
| **Brand** | `--color-brand` | `oklch(55% 0.22 255)` | CTAs, active states, key accent |
| **Brand hover** | `--color-brand-hover` | `oklch(50% 0.20 255)` | Button/CTA hover |
| **Brand subtle** | `--color-brand-subtle` | `oklch(95% 0.02 255)` | Tinted backgrounds |
| **Surface** | `--color-surface` | `oklch(100% 0 0)` | Page background |
| **Surface raised** | `--color-surface-raised` | `oklch(98% 0.002 255)` | Cards, elevated panels |
| **Surface muted** | `--color-surface-muted` | `oklch(96% 0.003 255)` | Secondary backgrounds |
| **Ink** | `--color-ink` | `oklch(18% 0.01 260)` | Primary text |
| **Ink muted** | `--color-ink-muted` | `oklch(45% 0.02 260)` | Secondary text |
| **Border** | `--color-border` | `oklch(88% 0.01 260)` | Hairline borders |
| **Error** | `--color-error` | `oklch(50% 0.19 25)` | Destructive actions |
| **Success** | `--color-success` | `oklch(55% 0.17 160)` | Confirmation states |

### Dark mode (prefers-color-scheme: dark)
- Surface → `oklch(14% 0.01 260)`
- Surface raised → `oklch(18% 0.01 260)`
- Ink → `oklch(92% 0.002 260)`
- Ink muted → `oklch(70% 0.01 260)`
- Border → `oklch(25% 0.01 260)`

### Anti-Patterns Enforced
- ❌ No `brand-gradient` that mixes blue+indigo+purple
- ❌ No gray text on colored backgrounds
- ❌ No pure black (`#000`) or pure white (`#fff`)
- ❌ No AI purple/blue glow defaults
- ❌ No warm-cream body background (#f5f1ea family)

---

## Typography System

### Font Stack (2 families + mono)

| Role | Font | Weight | Usage |
|---|---|---|---|
| **Display** | Geist (via `next/font`) | 600-700 | Hero h1, section callouts |
| **Body** | Hanken Grotesk (via `next/font`) | 400-600 | All body text, nav, labels |
| **Mono** | JetBrains Mono (via `next/font`) | 400 | Code, order numbers, data |

### Scale (1.25 ratio minimum between steps)

| Step | Size | Line-height | Usage |
|---|---|---|---|
| Display (hero) | `clamp(2.5rem, 5vw, 4.5rem)` | 1.05 | Hero h1 only |
| h2 | `clamp(1.75rem, 3vw, 2.5rem)` | 1.15 | Section headings |
| h3 | `clamp(1.25rem, 2vw, 1.5rem)` | 1.25 | Card titles |
| Body lg | `1.125rem` | 1.6 | Featured body |
| Body | `1rem` | 1.6 | Default prose |
| Body sm | `0.875rem` | 1.5 | Captions, meta |
| Label | `0.75rem` | 1.3 | Badges, eyebrow (sparingly) |

### Anti-Patterns Enforced
- ❌ Inter as default (the single most-common AI typography tell)
- ❌ Serif display fonts unless explicitly brand-justified
- ❌ No all-caps body copy
- ❌ No em-dashes anywhere
- ❌ Hero heading max ≤ 6rem, tracking ≥ -0.04em
- ❌ Body line-length capped at 65-75ch
- ✅ `text-wrap: balance` on h1-h3
- ✅ One eyebrow per page maximum (not one per section)

---

## Spacing & Layout

- Container: `max-w-7xl mx-auto` (1280px)
- Page gutters: `px-4 sm:px-6 lg:px-8`
- Section vertical rhythm: `py-16 md:py-24`
- Grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` (never `flex` + calc math)
- Viewport stability: `min-h-[100dvh]` (never `h-screen`)

### Anti-Patterns Enforced
- ❌ Cards are the lazy answer — use only when truly the best affordance
- ❌ Nested cards are always wrong
- ❌ Identical card grids (icon + heading + text, repeated)
- ❌ Side-stripe borders (`border-l` > 1px as accent)
- ❌ Flexbox percentage math; use CSS Grid
- ❌ Zebra-striping or `border-t` + `border-b` on every row

---

## Motion

- **Library**: `motion` (from `motion/react` — the library formerly known as Framer Motion)
- **Easing**: `cubic-bezier(0.2, 0.8, 0.2, 1)` (ease-out expo)
- **Duration**: 180-300ms for micro; 400-700ms for reveals
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` → crossfade or instant
- **No**: bounce/elastic easing, `animate-bounce`, infinite-loop marquees

---

## Icons

- **Library**: `@phosphor-icons/react` (primary)
- **Stroke width**: 1.5 (standardized globally)
- **One family per project** — no mixing with other icon libraries
- **No**: hand-rolled SVG paths, Material Symbols CDN

---

## Component Decisions

| Surface | Approach |
|---|---|
| Buttons | shadcn/ui Button with brand variant |
| Cards | shadcn/ui Card with consistent rounding (rounded-xl, max 16px) |
| Nav | Shared Navbar (existing, already good shell) |
| Admin | shadcn/ui Sidebar (existing, minor fixes only) |
| Forms | shadcn/ui Form + Input (existing) |
| Tables | Tailwind table (not TanStack unless > 100 rows) |
| Charts | Recharts (existing) |

---

## Anti-Pattern Bans & Design Rules

### Absolute (never ship)
1. No em-dashes anywhere
2. No side-stripe borders as accent
3. No gradient text (`background-clip: text`)
4. No glassmorphism as default
5. No hero-metric template (big number + small label + stats)
6. No identical card grids (icon + heading + text × N)
7. No eyebrow on every section (max 1 per page)
8. No numbered section markers (01 / 02 / 03)
9. No bounce/elastic easing
10. No gray text on colored backgrounds
11. No pure black or pure white
12. No nested cards
13. No rounded-lg/3xl > 16px on cards
14. No `h-screen` — use `min-h-[100dvh]`
15. No hand-rolled SVG icons
16. No photo-credit captions as decoration
17. No version labels in hero
18. No scroll cues (`Scroll ↓`)
19. No decorative dots
20. No floating top-right sub-text in section headings

### Contextual (avoid unless justified)
- Inter as default font
- Purple/blue gradients
- Lucide icons (replace with Phosphor)
- rounded-3xl cards
- `group-hover:scale-105` on images
