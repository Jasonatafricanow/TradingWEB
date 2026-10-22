# TradingWEB

[English](README.md) | [简体中文](README.zh-CN.md)

A storefront and operations backend that keeps online orders, store sales and Shopify imports on one set of order and inventory rules.

## What to inspect

- Money is calculated in integer minor units; inventory allocation locks affected rows.
- Payment completion, stock deduction, coupon redemption and timeline writes share a transaction.
- POS retries and migration imports enter through server-owned contracts.

See [the implementation guide](docs/IMPLEMENTATION.md), [tests](src) and [change history](CHANGELOG.md). Authentication and payment hardening details are recorded in the change history.

## Run and verify

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm validate
pnpm test
pnpm test:e2e
```

Use the checked-in deployment/configuration instructions for database and payment setup. A local mock/demo run is not a payment integration test. Non-demo password reset requires an explicit `NEXT_PUBLIC_SITE_URL`.

## Evidence and next steps

The repository includes unit tests, admin-list browser tests and database migration checks. A complete checkout-to-payment browser test, a public seeded demo and current product screenshots remain to be delivered. Deployment targets and experimental business modules are documented in the [implementation guide](docs/IMPLEMENTATION.md).

## License

MIT — see [LICENSE](LICENSE).
