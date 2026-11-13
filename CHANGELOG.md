# Changelog

## Unreleased — portfolio audit corrections

- Require an explicit, valid `NEXT_PUBLIC_SITE_URL` for non-demo password reset, before any account lookup or email delivery.
- Add regression tests for configuration errors, reset destination, account-enumeration safety and the demo link.
- Split the portfolio introduction into English and Chinese guides.
- Replace encoding-damaged historical prose with the readable summaries below. They summarize the retained log; they do not reconstruct missing original wording or certify old test runs.

## Authentication and payment hardening

The public hardening history includes [staff binding and payment finalization (#3)](https://github.com/Jasonatafricanow/TradingWEB/pull/3): active-user staff binding and transactional payment effects. Subsequent authentication changes added login rate limits, enumeration-resistant reset responses, credential-version binding, single-use reset behavior, provider-backed email delivery and runtime JWT-secret validation. See the repository history for individual changes.

## Historical notes: provenance

The previous log contained mixed GBK/UTF-8 corruption, including unrecoverable characters. Its exact bytes remain available in [the pre-correction version at 2192835](https://github.com/Jasonatafricanow/TradingWEB/blob/2192835/CHANGELOG.md). Dates and old commit identifiers below are retained from that document; some predate the cleaned public history. The earlier log's v0.3.0 attribution was explicitly uncertain and remains so.

## 2026-06-18 — Validation and delivery snapshots

- Add `ValidationError` and map it to HTTP 400.
- Reject invalid variant prices instead of silently substituting 0.00.
- Validate order delivery selection, allowed methods and variant conflicts.
- Include product, variant and delivery identity in cart item keys.
- Add delivery-method snapshots through `drizzle/0007_delivery_method.sql` and align schema/UI fields.

## 2026-06-18 — Payments and OAuth

- Update payment creation, callback and webhook handlers, Stripe/PayPal providers and shared payment validation.
- Add the `formatMoney()` decimal formatter.
- Correct Google Identity Services declarations and authentication context handling.

## 2026-06-17 — Storefront visual update

- Add glass, background-grid and animation styles.
- Rework navbar, footer and home hero while retaining translation, authentication, cart and real product-data paths.
- Add the motion dependency used by the hero.

## 2026-06-15 — Design system and admin layout

- Document design tokens, OKLCH colors, typography, dark mode and motion rules.
- Consolidate admin navigation, breadcrumbs, responsive layout and shared table/form components.
- Move admin pages onto the shared layout and begin icon migration.
- The historical log records type/lint verification; it is not a fresh verification result.

## 2026-06-14 — Navbar overlay hotfix

- Return to Radix's default body portal to resolve navbar dropdown stacking conflicts.
- Keep the portal initializer as a compatibility no-op and raise dropdown stacking order.
- Record accompanying browser-test and PWA-icon work.

## 2026-06-14 — UI and translation pass

- Route home, checkout, admin groups, customer and affiliate text through translation keys.
- Replace placeholder hero imagery with local gradients/icons; load featured products through the API.
- Connect category cards to routes and remove decorative controls without destinations.
- Add public breadcrumbs and shared loading skeletons.
- Consolidate admin order saves, responsive KPI grids and vertical variant-editing cards.
- Improve navbar accessibility labels, footer links and product hover styles.

## 2026-06-14 — API and schema connectivity

- Correct affiliate dashboard and product REST paths; use the shared stored-token helper for admin requests.
- Populate product seller identity from authentication and persist variants on product writes.
- Add customer/affiliate creation, retrieve individual refunds correctly and align order payment-status fields.
- Persist site settings; connect coupon validation, product image upload and OAuth buttons.
- Add affiliate/referral/settings tables through `drizzle/0005_affiliates_settings.sql`.
- Normalize the empty production wallet response and redirect redundant pages.
- Retain the historical audit/backlog references in the pre-correction log.

## 2026-06-09 — Data layer and business modules

- Remove external Supabase authentication/data helpers and unify MySQL access through Drizzle.
- Align early migrations, demo data, order/customer joins and shared configuration modules.
- Record inventory, staff permissions, coupons, refunds, sales reporting, traffic analytics, email, membership, warehouses, customer views, SEO and reviews as historical module work.
- Record abandoned-cart recovery as deferred rather than delivered.
- Extend translation coverage, repair product/cart/order navigation and update authentication checks.

## 2026-05-24 — v0.5.0

Historical references: `8b45e72`, merge of `616a4e9`; follow-up `981afac`.

- Warehouse transfers, product variants, CSV import/export, media library and cost fields.
- Payment-state persistence, order totals, database consistency and environment cleanup.

## 2026-05-21 — v0.4.0

Historical references: `7e573ec`, `dcc15b9`.

- Local JWT authentication, users table and migration.
- Staff, product and category creation; permissions and warehouse replenishment.

## 2026-05-21 — v0.3.2

Historical reference: `6d666a7`. Bug fixes and user-experience polish; the retained log does not identify every fix.

## 2026-05-21 — v0.3.1

Historical reference: `05db3d4`. Permission groups, product fields and service-layer refactoring.

## 2026-05-21 — v0.3.0 (uncertain historical entry)

The old log inferred product-editing and staff-management work around v0.3.1 but reported no corresponding separate commit. That attribution remains unverified.

## Earlier — v0.2.x and initial baseline

Original prose was not recoverable. The old log names `a40ea2d` as an initial project baseline covering translation, affiliates and mock support; no additional history is inferred here.
