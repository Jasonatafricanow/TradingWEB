# Project Lineage and Publication History

TradingWEB's public repository begins with a cleaned **initial release** commit. That commit is a publication baseline, not the start of the actual project work.

This document records the architectural lineage visible in the current system without inventing a backdated Git history.

## What the public commit means

The first public commit packages an already integrated codebase containing:

- storefront and checkout;
- product / variant / inventory domains;
- customers and orders;
- payment integration and webhook handling;
- administration, RBAC, and audit;
- POS-facing APIs;
- migration receiver paths;
- automated unit / integration / browser-level verification.

A single public commit therefore describes how the source was **published**, not how all of those concerns were discovered or implemented.

## Architectural lineage

### 1. Commerce core

The central system owns products, variants, inventory, customers, orders, payments, and administrative operations.

This established the first important boundary:

> Different user interfaces can exist, but business state should converge on one domain model.

Current evidence is visible in the application routes, domain/services layer, Drizzle schema, order/payment paths, and admin surface.

### 2. POS integration made retries and idempotency explicit

A store client introduced a different failure model from the browser:

- connectivity may disappear;
- the same order may be retried;
- local work may exist before the server accepts it.

TradingWEB therefore exposes POS-oriented server contracts and uses stable client references so retries do not become duplicate business effects.

Related project:

- [TradingWEB POS](https://github.com/Jasonatafricanow/TradingWEB-POS)

### 3. Payment callbacks became asynchronous state transitions

Payment completion cannot safely depend only on a browser redirect. Provider callbacks / webhooks are treated as external events that reconcile payment and order state.

This is one of the areas covered by the repository's automated tests.

### 4. Historical migration was separated from ordinary traffic

Shopify exports have different trust, validation, and batch-failure semantics from normal application requests.

Instead of embedding source-specific CSV behavior throughout the main product, migration parsing and validation were separated into a dedicated bridge, while TradingWEB retains the target-side admission surface.

Related project:

- [ShopifyDataBridge](https://github.com/Jasonatafricanow/ShopifyDataBridge)

### 5. Verification became part of the public baseline

The published source includes TypeScript checking, linting, Vitest, Playwright, i18n validation, and migration reconciliation tooling.

The intent is not to claim arbitrary production scale. It is to make the repository's domain and failure contracts inspectable.

## Why the Git history is intentionally small

The repository does not rewrite history to manufacture a long public activity graph.

That means an external reviewer should distinguish:

```text
public publication history
        !=
original local development history
```

The trade-off is that GitHub's timeline does not show every intermediate implementation. The benefit is that the public source does not pretend reconstructed commits are original evidence.

## Relationship to the wider portfolio

TradingWEB is part of the operational-software line of the portfolio. It is not presented as a direct predecessor that mechanically "became" Mind Runtime or LCE.

What carries across the projects is a recurring engineering concern:

- pending work vs committed effect;
- parsed input vs admitted state;
- retries vs duplicate effects;
- client projection vs business authority;
- external events vs canonical state transitions.

Those concerns later appear in more abstract form in the AI infrastructure and runtime projects.
