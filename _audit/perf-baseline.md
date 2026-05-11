# Phase 2 Performance Baseline — 2026-05-11

Captured against production `https://www.pieseautomotoras.ro/` immediately
after the Phase 1 deploy (`dpl_CM8fPzJ6pwKFwkGcybjSAJMvmJmY`) and before
Phase 2 begins.

## Cold-load resource sizes

| Path | Raw (B) | Gzip (B) |
|---|---:|---:|
| `/` (homepage HTML) | 137,291 | 32,258 |
| `/api.js` | 85,373 | 21,064 |
| `/cart.js` | 9,748 | 2,755 |
| `/favorites.js` | 6,284 | 2,054 |
| `/page-loader.js` | 16,027 | 4,366 |
| `/page-loader-boot.js` | 170 | 170 |
| `/nav-subcategories.js` | 5,660 | 1,883 |
| `/nav-subcategories.css` | 5,259 | 1,469 |
| `/page-loader.css` | 4,618 | 1,186 |
| `/text-normalize.js` (to be stubbed) | 6,301 | 2,231 |
| `/text-fix.js` (already dead; to be stubbed) | 4,033 | 1,539 |
| `/_mojibake_fix.js` (CLI; to be removed from deploy) | 8,231 | 2,702 |
| `/vehicle-selector-data.js` | 5,912 | 2,817 |
| `/css/app.css` | 253 | 253 |
| **Cold homepage total (gzip)** | — | **~76,747** |

## API responses

| Endpoint | Raw (B) | Gzip (B) | Latency |
|---|---:|---:|---:|
| `/api/products?limit=3` | 16,291 | 3,211 | 0.35 s |
| `/api/products?view=categories` | 376 | 376 | 0.31 s |
| `/api/products?view=featured&limit=12` | 23,106 | 2,219 | 0.31 s |
| `/api/products?cat=detailing&limit=24` | 40,481 | 6,286 | 0.31 s |
| `/api/products?id=BRV-31409` | 4,794 | 1,128 | 0.30 s |

## Content health

- Mojibake artifacts in `catalog.json`: smart apos `’` ×51, smart quote `“` ×21, smart quote `”` ×67, double-encoded `â€³` ×1, BOM ×1.
- Mojibake artifacts in production HTML served to browsers: **0** (verified).
- Romanian diacritics correctly encoded: `ă` 168, `â` 18, `î` 35, `ș` 95, `ț` 53 in `/` alone; 88,500+ across `catalog.json`.
- Mojibake artifacts in `api.js` inline strings: 65 (legacy `_subcategoryConfig` labels, unreachable but shipped).

## Target deltas

| Metric | Pre-Phase-2 | Goal |
|---|---|---|
| `api.js` raw size | 85,373 B | ≤ 60,000 B (≈ −30 %) |
| `text-normalize.js` (live) | 6,301 B | ≤ 200 B stub |
| Mojibake patterns in catalog files | 140 | 0 |
| Mojibake patterns in `api.js` | 65 | 0 |
| Public 200s on `catalog*.json` / `supplier-feed*.xml` | 5 | 0 (all 404) |
| Above-fold-only image loading | not enforced | enforced |
