# TradingWEB

TradingWEB is a Next.js/TypeScript commerce backend and storefront covering products, customers, orders, payments, administration, POS APIs, and Shopify migration.

## Main system

```text
storefront / admin / POS / migration
              |
              v
        Next.js API surface
              |
              v
        domain services
 products / orders / customers
 inventory / payments / auth / audit
              |
              v
       Drizzle ORM + MySQL
```

## Current implementation

The repository includes:

- product and variant management;
- cart / checkout / order flows;
- physical, virtual, and service-style products;
- customer accounts;
- inventory handling;
- Stripe and PayPal integration;
- payment webhook reconciliation;
- administration workflows;
- RBAC and audit logging;
- multilingual UI infrastructure;
- POS-oriented APIs;
- Shopify migration receiver;
- typed Drizzle schema/service layer.

## Payment handling

Browser redirects are not treated as proof of payment.

Provider callbacks/webhooks are processed as asynchronous events and reconciled against order/payment state.

## POS writes

POS-originated order creation uses a stable `client_ref`.

If a mobile client loses the network after submitting an order, it can retry the same logical operation without intentionally creating a second order.

The paired client is [TradingWEB POS](https://github.com/Jasonatafricanow/TradingWEB-POS).

## Migration

Historical Shopify imports use a separate receiver instead of being mixed into ordinary storefront requests.

The source-side parser/validator lives in [ShopifyDataBridge](https://github.com/Jasonatafricanow/ShopifyDataBridge).

## Verification

The repository contains:

- TypeScript checks;
- ESLint;
- Vitest;
- Playwright;
- i18n checks;
- migration reconciliation scripts.

Typical local commands:

```bash
pnpm install
pnpm validate
pnpm test
pnpm test:e2e
```

External payment/deployment integrations still require their own credentials and environment.

## Local development

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

## Stack

Next.js 16 · React 19 · TypeScript · Drizzle ORM · MySQL · Tailwind CSS · Vitest · Playwright

## Project history

This repository was published as a cleaned baseline after earlier local development. See [PROJECT-HISTORY.md](PROJECT-HISTORY.md) for the project sequence and the code areas that reflect it.
