# TradingWEB

**A full-stack commerce and operations platform that acts as the central business system for storefront, POS, and migration workflows.**

TradingWEB began as a practical attempt to own the business workflow instead of scattering it across storefront plugins and external tools. The project grew into a central domain/API surface for products, customers, orders, payments, administration, POS operations, and migration.

In the portfolio, it is the clearest example of product engineering before the later AI-runtime work.

## Portfolio role

```text
               TradingWEB
        business + data authority
          /          |          \
         v           v           v
 Storefront     TradingWEB POS   ShopifyDataBridge
 customer UX      store client      migration
```

The important boundary is that the clients can differ while order, inventory, customer, and operational rules remain centralized.

## The problem

A commerce system becomes difficult to reason about when each surface owns part of the business truth:

- storefront logic decides one thing;
- POS logic decides another;
- migration scripts write directly to storage;
- payment callbacks change state outside the order model;
- administrative operations bypass normal validation.

TradingWEB treats these as different interfaces to one business system rather than independent applications with duplicated rules.

## How the design evolved

### 1. From storefront to business system

The initial scope was the web commerce surface. As operational requirements accumulated, the useful center moved from pages to domains: products, variants, inventory, customers, orders, payment state, fulfillment, permissions, and audit.

### 2. POS forced the API boundary to become explicit

A mobile POS cannot safely depend on browser-only state or copy server rules. TradingWEB therefore became the authoritative backend for store-side order creation, inventory updates, staff operations, refunds, and idempotency.

### 3. Migration became a separate ingestion boundary

Historical Shopify data has different failure modes from normal user traffic. Rather than embedding one-off CSV behavior into the storefront, migration was split into [ShopifyDataBridge](https://github.com/Jasonatafricanow/ShopifyDataBridge) with a controlled receiver on the TradingWEB side.

## Key design decisions

### One business authority, several clients

Storefront, admin, POS, and migration use different interfaces but should converge on the same domain rules.

### Idempotency at write boundaries

POS-originated order creation uses `client_ref` so retries after network loss do not silently create duplicate orders.

### Payment events are asynchronous state transitions

Stripe / PayPal callbacks are handled as external events rather than assuming the browser redirect is payment truth.

### Administration is part of the system, not a bypass

RBAC, batch operations, audit logs, and operational views are treated as first-class workflows.

### Migration is validated before admission

Imported historical data enters through a separate validation and mapping path rather than writing arbitrary source fields directly into production tables.

## Architecture

```text
Storefront / Admin / POS / Migration
              |
              v
        Next.js API surface
              |
              v
         Domain services
 products / orders / customers / payments
 inventory / auth / audit / import
              |
              v
       Drizzle ORM + MySQL

External payment providers
        |
        +---- webhook events ----> payment/order transitions
```

## Current implementation

The repository contains:

- storefront and product flows;
- cart / checkout / order center;
- physical, virtual, and service-style product handling;
- Stripe and PayPal integration surfaces;
- customer and administrative workflows;
- RBAC and audit logging;
- multilingual UI infrastructure;
- POS-oriented endpoints;
- Shopify migration receiver;
- typed database schema and service layer.

## Verification

The repository includes TypeScript checks, ESLint, Vitest, Playwright, i18n checks, and migration-reconciliation scripts.

```bash
pnpm install
pnpm validate
pnpm test
pnpm test:e2e
```

Different tests require different local dependencies and service configuration; the repository should not be read as a claim that every external payment or deployment integration is live in every clone.

## Boundaries and non-claims

TradingWEB is a portfolio-scale full-stack system, not a claim of Shopify-scale traffic, global payment certification, or production reliability under arbitrary load.

The strongest evidence in this repository is architectural breadth and domain integration: web, database, payments, admin, POS contracts, migration, and automated validation in one codebase.

## Stack

Next.js 16 · React 19 · TypeScript · Drizzle ORM · MySQL · Tailwind CSS · Vitest · Playwright

## Local development

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

## Repository history

This public repository is a cleaned publication of an earlier project line. The public Git history begins with the publication baseline, so commit dates do not represent the original development sequence.

## Engineering philosophy

The system boundary should follow business authority, not UI boundaries.

A storefront, POS terminal, admin dashboard, and migration tool can all look different while still depending on one explicit model of orders, inventory, customers, and state transitions.
