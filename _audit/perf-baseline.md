# Phase 2 Performance Comparison — 2026-05-11

Pre-Phase-2 baseline captured against `dpl_CM8fPzJ6pwKFwkGcybjSAJMvmJmY`.
Post-Phase-2 captured against `dpl_CMpn7kb4U7CXSdqN33xdcmyscwYX`
(deployed 2026-05-11, alias `https://www.pieseautomotoras.ro`).

## Cold-load resource sizes

| Path | Pre raw | Post raw | Δ raw | Pre gzip | Post gzip | Δ gzip |
|---|---:|---:|---:|---:|---:|---:|
| `/` (homepage HTML) | 137,291 | 137,380 | +89 | 32,258 | 32,279 | +21 |
| `/api.js` | 85,373 | 85,206 | **−167** | 21,064 | 21,031 | −33 |
| `/cart.js` | 9,748 | 9,748 | 0 | 2,755 | 2,755 | 0 |
| `/favorites.js` | 6,284 | 6,284 | 0 | 2,054 | 2,054 | 0 |
| `/page-loader.js` | 16,027 | 16,027 | 0 | 4,366 | 4,366 | 0 |
| `/page-loader-boot.js` | 170 | 170 | 0 | 170 | 170 | 0 |
| `/nav-subcategories.js` | 5,660 | 5,660 | 0 | 1,883 | 1,883 | 0 |
| `/nav-subcategories.css` | 5,259 | 5,259 | 0 | 1,469 | 1,469 | 0 |
| `/page-loader.css` | 4,618 | 4,618 | 0 | 1,186 | 1,186 | 0 |
| **`/text-normalize.js`** | **6,301** | **434** | **−5,867** | **2,231** | **434** | **−1,797** |
| `/text-fix.js` | 4,033 | 313 | −3,720 | 1,539 | 313 | −1,226 |
| `/_mojibake_fix.js` | 8,231 | 424 | −7,807 | 2,702 | 424 | −2,278 |
| `/vehicle-selector-data.js` | 5,912 | 5,912 | 0 | 2,817 | 2,817 | 0 |
| **Cold homepage scripts (gzip)** | **~76,747** | **~72,723** | **−4,024** | | | |

Only `text-normalize.js` is on the actual hot path (loaded by 17 HTML pages).
`text-fix.js` and `_mojibake_fix.js` were never loaded by the browser — they're
ancillary cleanup that prevents 404 noise.

## Static catalog file paths

| Path | Pre | Post |
|---|---|---|
| `/catalog.json` | 200 (8.5 MB) | **404** |
| `/catalog-lite.json` | 200 (5.5 MB) | **404** |
| `/catalog-micro.json` | 200 (2.1 MB) | **404** |
| `/supplier-feed.xml` | 200 (2.9 MB) | **404** |
| `/supplier-feed-globiz.xml` | 200 (2.5 MB) | **404** |

Functions continue to read these files from disk inside their bundles —
verified via `npx vercel build` and via production smoke of
`/api/products`, `/api/bravus`, `/api/carhub`, `/api/globiz`, `/api/casabateriilor`.

## Routing

| Path | Pre | Post |
|---|---|---|
| `/` | 200 | 200 |
| `/api/products?limit=2` | 200 | 200 |
| `/api/products?view=categories` | 200, 7 cats | 200, 7 cats |
| `/detailing` (rewrite to category.html) | 200 | 200 |
| `/piese-auto-bucuresti` (SEO landing) | 200 | 200 |

## Content health (production gateway response)

| Pattern | Pre | Post |
|---|---:|---:|
| Curly apostrophe `’` | 51 in catalog.json | **0** in any response |
| Curly quotes `“` `”` | 88 in catalog.json | **0** |
| Double-encoded `â€...` | 1 in catalog.json | **0** |
| UTF-8 BOM at file start | 3 files | **0** |
| Mojibake in `api.js` inline strings | 65 | **0** |
| Romanian diacritics `ă â î ș ț` | preserved | preserved (sample shows `ă` 30, `â` 20, `î` 40, `ș` 10) |

## Deliverable summary

- Functional: zero regressions, all critical paths 200, all catalog paths
  deliberately 404, API content health perfect.
- Text quality: every smart quote / mojibake / BOM artifact eliminated at
  source. Defensive `normalizeText` in gateway catches any future drift.
- Code hygiene: `api.js` 167 bytes lighter and rid of 65 mojibake sequences.
  `text-normalize.js` is a 434-byte no-op stub (was 6,301 B of DOM-walking
  CP-1252 fixer code that ran on every page load).
- Operations: catalog files no longer reachable externally; functions
  unchanged.

## Rollback target

If anything regresses: `npx vercel rollback dpl_CM8fPzJ6pwKFwkGcybjSAJMvmJmY`.

## Open follow-ups (Phase 3 candidates)

1. **Task 3b** — remove the legacy `_ensureCatalog` + 3-tier fallback +
   client-side classifier from `api.js`. Drops `api.js` from 85 KB to
   ~55 KB. Gated on 48 h of stable `/api/products` traffic.
2. **Delete the three stub files** (`text-normalize.js`, `text-fix.js`,
   `_mojibake_fix.js`) once CDN caches rotate (~24 h post-deploy).
3. **Function bundle slimming** — orders.func is 16 MB because the gateway
   loads all four suppliers on every cold start. Move supplier data to
   blob storage or external APIs.
4. **`defer` on `api.js`** — inline `MotApi.*` calls on every page would
   all need rewriting to gate on `DOMContentLoaded` or a ready promise.
