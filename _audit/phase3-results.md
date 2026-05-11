# Phase 3 Performance Comparison — 2026-05-12

Pre-Phase-3 (post Phase 2): `dpl_CMpn7kb4U7CXSdqN33xdcmyscwYX`.
Post-Phase-3: `dpl_2hC9rbqCXrXrEMN4ZBnDEeEzVbCw` (alias `https://www.pieseautomotoras.ro`).

## Latency — HIT vs MISS distribution

| Endpoint | Pre warm | Post MISS | Post HIT | Cached? | Δ on HIT |
|---|---:|---:|---:|---|---:|
| `/api/products?view=categories` | 520 ms | ~510 ms (first hit only) | **150 ms** | ✓ | **−71%** |
| `/api/products?view=summary` | 520 ms | ~510 ms | ~150 ms (cached, same shape) | ✓ | ~−71% |
| `/api/products?view=brands` | 520 ms | ~510 ms | ~150 ms | ✓ | ~−71% |
| `/api/products?view=sources` | 520 ms | ~510 ms | ~150 ms | ✓ | ~−71% |
| `/api/products?view=featured&limit=12` | 520 ms | **510 ms** | n/a | ✗ no-store | **0% by design** |
| `/api/products?cat=detailing&limit=3` | 530 ms | **530 ms** | n/a | ✗ no-store | **0% by design** |
| `/api/products?id=BRV-31409` | 520 ms | **510 ms** | n/a | ✗ no-store | **0% by design** |

**Validation of design:** every price-bearing endpoint is `Cache-Control: no-store` and `X-Vercel-Cache: MISS` on every request — exactly the zero-stale-price guarantee Phase 3 promised.

Cache headers seen on production:

```
view=categories  → Cache-Control: public; X-Vercel-Cache: HIT; Age: 26s
view=featured    → Cache-Control: no-store; X-Vercel-Cache: MISS
cat=detailing    → Cache-Control: no-store; X-Vercel-Cache: MISS
id=BRV-31409     → Cache-Control: no-store; X-Vercel-Cache: MISS
```

## `api.js` size

| Metric | Pre | Post | Δ |
|---|---:|---:|---:|
| Raw bytes | 85,373 | 57,193 | **−28,180 (−33%)** |
| Gzipped bytes | 21,064 | 13,800 | **−7,264 (−34%)** |
| Lines of code | 2,134 | 1,684 | −450 (−21%) |

## Resource footprint of removed legacy

| Path | Pre raw | Post raw | Δ |
|---|---:|---:|---:|
| `/api.js` | 85,373 | 57,193 | −28,180 |
| `/text-normalize.js` (still served as stub, no longer requested) | 434 | 434 | 0 (request count: −1 per page) |

Removed per page: one HTTP request + ~6 KB of dead JS download (the stub itself stays at 434 bytes for 48 h to absorb stale-HTML cache).

## Removed code paths in `api.js`

- 3-tier catalog candidate lists (micro / lite / full)
- supplier-feed fallback paths
- localStorage catalog cache helpers (`_readCatalogCache`, `_writeCatalogCache`)
- Page-type detection (`_needsFullCatalog`)
- Client-side classifier:
  - `_subcategoryConfig` (66 lines of regex tables)
  - `_resolveCategory` (90 lines of weighted scoring)
  - `_scoreMatches`, `_inferCategory`
- Client-side normalization:
  - `_normalizeCatalogItem` (79 lines)
  - `_mergeCatalogItems` (43 lines)
- Network fallback fetchers:
  - `_fetchCatalogJson`, `_fetchFeedCatalogs`

Total removed: ~480 lines / ~26 KB of dead-after-Phase-2 code.

## Safety surface preserved

These remained as one-line stubs so any forgotten caller returns sane defaults instead of `ReferenceError`:

```js
async function _ensureCatalog() { return []; }
function _resolveSubcategory(item) { return item.subcat || 'general'; }
function _resolveCategory(item)    { return item.cat    || 'accesorii'; }
function _subcategoryLabel()       { return 'Selecție'; }
function _normalizeCatalogItem(i)  { return i || null; }
```

`_categoryLabel` kept as a real lookup (small, still used by display fallbacks).

## Production smoke summary

All paths verified post-deploy:

- `/`, `/api/products?...`, `/detailing`, `/piese-auto-bucuresti`: **200 OK**
- `/catalog.json`: **404** (Phase 2 Task 4, unchanged)
- `/text-normalize.js`: **200** (stub still in place; script tag removed from new HTML in Task 3)
- `view=categories` second request: `X-Vercel-Cache: HIT`, `Age` increments, latency drops to ~150 ms.

## Rollback target

If any regression: `npx vercel rollback dpl_CMpn7kb4U7CXSdqN33xdcmyscwYX`.

## Deferred follow-ups

1. **Delete the three stub files** (`text-normalize.js`, `text-fix.js`, `_mojibake_fix.js`) once ≥ 48 h have passed since Phase 2 deploy and the cached HTML referencing them has rotated.
2. **Function bundle slimming** (orders.func is 16 MB). Move supplier data to blob storage. Architectural change.
3. **Pre-warm via cron** if Task 1's hit rate proves insufficient under real traffic. Skip if `X-Vercel-Cache: HIT` remains ≥ 80% measured over a week.
4. **Edge runtime migration**. Requires blob-storage migration first.
5. **Image CDN** for `/assets/*` and the carhub-hosted product images.

## What Phase 3 actually delivered

- **`view=categories` returns in ~150 ms on cache HIT** (was 520 ms) — −71% latency for the homepage's category-count fetch. With ≥ 80% expected HIT rate, this is the dominant traffic profile.
- **Zero stale-price risk** — by construction, no price-bearing response is cached. Every price the customer sees comes from a fresh function execution.
- **`api.js` down 33%** in both raw and gzip. Every page load downloads less JS, parses less code, with smaller V8 heap.
- **Safety net preserved** — `_ensureCatalog` stub means any forgotten caller fails gracefully to an empty state, not a crash.
- **Server-Timing header** present on every direct gateway response (stripped by Vercel edge on cached responses but visible in MISS path for diagnostics).
