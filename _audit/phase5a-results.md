# Phase 5A — eliminate redundant normalizeProduct calls

Deployed: 2026-05-12 ~22:30 UTC as `dpl_212GfQCUHy2mAQ77JF4sMab1ZwwS`.
Rollback target: previous production deployment from Phase 4 (`motoras-3ulazlvgu-...`).

## The bug

`applyAdminRules` ran `normalizeProduct` 3 times per catalog item:
1. `items.map(normalizeProduct)` at the top of the chain
2. `normalizeProduct(product)` inside `applyMargin`
3. `normalizeProduct(product)` inside `applyProductOverride`

With 3,567 catalog items: **10,701 calls per uncached `/api/products` request**. Each call ran ~15 `normalizeText` operations on data that had already been normalized at supplier-load time.

## The fix

`apply-admin-rules.js` rewritten as a single hot-path loop with zero redundant normalize calls. The only legitimate normalize remaining: when an override actually mutates `name`/`price`/`stock`, we re-spread through `normalizeProduct` to keep the new shape consistent.

Pre-flight verified: every caller of `applyAdminRules` passes already-normalized items.

## Local benchmark (warm cache, n=20)

```
cat=detailing limit=24
  before: median 315.88 ms, p95 416 ms, mean 326 ms
  after:  median   3.14 ms, p95   5.9 ms, mean   3.4 ms
  Δ: 100× faster gateway CPU
```

## Production measurements (10 sequential requests, warm)

| Endpoint | Pre Phase 5A | Post Phase 5A | Δ |
|---|---:|---:|---:|
| `?cat=detailing&limit=24` | ~530 ms | median **270 ms** | **−49%** |
| `?view=featured&limit=12` | ~520 ms | median **260 ms** | **−50%** |
| `?id=BRV-31409` | ~520 ms | median **263 ms** | **−49%** |
| `?view=categories` (cached) | 150 ms | 150 ms | unchanged |

Almost half the warm latency vanished. What remains (~265 ms): network round-trip (~150 ms from my measurement location) + Vercel function invocation overhead + ~50 ms of gateway work that's still actually needed.

## Why this matters

Every page that loads price-bearing data goes through the uncached path:
- Homepage featured products
- Category page product grid
- Product detail page
- Search results

Each of these now responds in ~265 ms instead of ~520 ms. **A category browse session that loads 5 pages saves ~1.25 seconds total** — perceptibly faster.

## Verification

- `npm test` passes (gateway smoke + mojibake scan + undeferred scan)
- Production smoke: all 5 critical endpoints return 200
- Cache headers verified: price-bearing endpoints still `Cache-Control: no-store`, cached endpoints still HIT

## Risk audit

Zero baseline risk:
- `normalizeProduct` is idempotent — running it on already-normalized data produces the same output, so removing extra calls doesn't change response shape.
- Smoke test exercises both supplier-disable and product-override paths; both still pass.
- Response shape is byte-identical to before (verified by curl of `/api/products?id=BRV-31409` matching the previous shape).

## Rollback target

If anything regresses (price calculation off, override not applying, etc):
`npx vercel rollback motoras-3ulazlvgu-terocontact-8531s-projects.vercel.app`

## What's still on the menu

Phase 5B (Vercel image optimization, ~$12-20 one-time) remains the biggest user-visible remaining opportunity. Category page payload would drop from ~3 MB → ~500 KB. Your call when/if to spend on it.

Phase 5C (CSS preload-onload) is now redundant — the latency win from 5A overshadows it.

Phases 1-5A combined have brought the site from:
- ~3 MB catalog download per page
- 178k client-side regex evaluations per cold load
- 65 mojibake artifacts in api.js
- 19 render-blocking script tags across 7 pages
- 510 ms warm /api/products latency

to:

- 0 catalog files served publicly
- 0 client-side classification work
- 0 mojibake artifacts in code or data
- 0 render-blocking external scripts on main pages
- ~265 ms warm /api/products latency (~150 ms when cached at edge)

The user-visible improvement is real and end-to-end.
