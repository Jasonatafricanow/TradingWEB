# TradingWEB

TradingWEB is a full-stack commerce and operations system built around one shared business
authority for storefront, administration, POS integration and data migration.

For portfolio review, the important part is not the number of screens. It is the set of
state and transaction boundaries that several clients must share consistently.

## System boundary

```text
storefront / admin / POS / migration
              |
              v
        TradingWEB APIs
              |
              v
orders / inventory / payments / staff identity / import sessions
              |
              v
             MySQL
```

The repository contains product/catalog, customer/order, admin, payment, POS and Shopify
import-receiver surfaces. Some pages can run with mock/demo data, but target business
authority lives on the server/database side.

## Correctness-sensitive paths

### Staff identity and authorization

A security audit found that staff authorization could be derived too loosely from account
identity. The repair changed staff binding to require the active authenticated user ID and
removed implicit staff binding by email.

Regression coverage now includes active-session and staff-identity boundaries.

### Payment finalization

Payment completion touches several pieces of business state at once. The current
implementation moves payment finalization, inventory allocation, coupon consumption and
order timeline writes into one transaction-oriented path rather than applying paid side
effects after commit.

The P0 repair history is visible in
`fix: close staff identity and payment finalization P0s (#3)`.

### Authentication follow-up

Later audit work also added or tightened:

- login rate limiting;
- account-enumeration-resistant authentication/reset responses;
- credential-version binding for reset tokens;
- single-use password reset behavior;
- provider-backed reset delivery;
- runtime rather than import-time JWT-secret validation.

These changes are visible in the subsequent auth/CI commits.

### POS and migration contracts

POS clients use explicit transaction identifiers such as `client_ref` so retries can be
handled as repeated intent rather than duplicate business effects.

ShopifyDataBridge does not write TradingWEB tables directly. It submits a TradingWEB import
contract, and TradingWEB owns target validation, reference resolution, idempotency and the
database transaction.

## Verification

The main quality workflow runs on pushes and pull requests with a disposable MySQL 8.4
service. It currently executes:

```text
pnpm test
pnpm ts-check
pnpm lint:build
pnpm i18n:check
drizzle migrations against disposable MySQL
schema-integrity check
POS integration check
```

Local setup:

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Useful verification commands:

```bash
pnpm test
pnpm ts-check
pnpm lint:build
pnpm i18n:check
pnpm test:e2e
```

## Main repository areas

```text
src/app/           storefront, admin and API routes
src/services/      business/domain services
src/db/            schema and persistence
src/lib/           validation/security/shared utilities
drizzle/           migrations
e2e/               browser-level tests
scripts/           integrity, migration and integration checks
docs/              domain/integration records
```

Related repositories:

- [TradingWEB-POS](https://github.com/Jasonatafricanow/TradingWEB-POS)
- [ShopifyDataBridge](https://github.com/Jasonatafricanow/ShopifyDataBridge)

## Scope / evidence boundary

The repository is an engineering project, not evidence of production operation at global
or enterprise scale.

The public source demonstrates implemented commerce workflows, database migrations,
transaction/auth corrections, CI-backed checks and integration contracts. It does **not**
by itself establish:

- production traffic scale or high-availability operation;
- real-world performance under "massive" datasets;
- production reliability of every configured Stripe/PayPal path;
- every POS hardware path on physical devices;
- that all demo/mock paths are equivalent to live business integrations.

## Stack

Next.js 16 · React 19 · TypeScript · Drizzle ORM · MySQL · Vitest · Playwright

See [ARCHITECTURE.md](ARCHITECTURE.md), [DEVELOPMENT.md](DEVELOPMENT.md) and
[DEPLOYMENT.md](DEPLOYMENT.md) for deeper implementation context.

MIT — see [LICENSE](LICENSE).
