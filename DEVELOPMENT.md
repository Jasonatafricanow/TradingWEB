# TradingWEB — Development and Architecture Record

This document records the project's architecture direction and important corrections.
Current source, tests, migrations and CI are stronger authority than historical sprint
descriptions.

## 1. Shared business authority

TradingWEB serves several interfaces—storefront, admin, POS and migration—but they converge
on one business/data authority. Client-specific UI state must not become an alternate
source of truth for orders, inventory, staff identity or imported records.

The codebase separates presentation/API routes from service and persistence concerns under
`src/app/`, `src/services/` and `src/db/`.

## 2. Retry and transaction semantics

POS and migration clients can retry. Repeated delivery of an intent must not imply repeated
business effects.

For POS order creation, `client_ref` participates in the idempotency boundary together
with server-side persistence/validation. Do not infer a Redis dependency from older design
notes; the current repository manifest does not declare Redis as a runtime dependency.

Payment completion is more than a status flag. Audit work moved order finalization,
inventory allocation, coupon consumption and timeline writes into a transaction-oriented
finalizer so a local payment success cannot leave partially applied business state.

## 3. Identity and authentication corrections

The public initial release was followed by targeted audit fixes.

Staff identity:
- bind staff authorization to the active authenticated user ID;
- remove implicit staff binding by email;
- keep active-session checks on protected profile/admin paths.

Authentication/reset:
- rate-limit login;
- avoid account enumeration;
- bind reset tokens to credential version;
- make reset links single-use;
- deliver resets through the configured provider path;
- validate JWT secret at runtime so tooling/build imports do not require a production secret.

These corrections are intentionally visible in Git history rather than rewritten into a
fictional clean initial implementation.

## 4. Migration ownership

ShopifyDataBridge is a sender/adapter. TradingWEB owns target-side import validation,
reference resolution, idempotency, sessions/reconciliation and database writes.

This keeps migration authorization and target schema authority on the system that owns the
business data.

## 5. Verification

The current CI uses disposable MySQL and runs the repository's executable quality gates:

```bash
pnpm test
pnpm ts-check
pnpm lint:build
pnpm i18n:check
pnpm exec drizzle-kit migrate
pnpm exec tsx scripts/schema-integrity-check.ts
pnpm exec tsx scripts/pos-integration-test.ts
```

`pnpm test:e2e` remains available for browser-level coverage; consult the workflow and
test configuration for what is executed automatically on each commit.

## 6. Evidence boundary

The repository demonstrates business-system implementation and correctness work. It should
not be read as proof of production-scale traffic, complete payment-provider certification,
or physical-store hardware validation.
