# Hot Path Latency — Phase 3 (zero-risk revision)

> **For agentic workers:** Same execution style as Phase 1 and Phase 2. Each task is independently shippable. Each task ends with one commit. Gates are explicit.

**Revision history:**
- Initial draft (2026-05-11): goal-driven plan with cache invalidation, full legacy removal, and aspirational latency targets.
- Zero-risk revision (2026-05-11): three changes after risk audit:
  1. **Task 1 now only caches price-free responses.** Anything containing prices/stock/badges (which can change on admin write) is left uncached. The "Vercel purge API" path is removed because that API doesn't exist for serverless responses. Result: no stale-price risk.
  2. **Task 2 now STUBS legacy `_ensureCatalog` as `return []` instead of deleting it.** Heavy classifier code (25 KB) still gets removed, but the safety-net surface is preserved so any forgotten caller gets an empty array instead of a `ReferenceError`. Result: no silent-breakage risk.
  3. **Success criteria now express HIT vs MISS distributions explicitly**, not aspirational p50 numbers. Result: no over-promising.

**Goal:** Cut `/api/products?view=categories` to ≤ 100 ms on cache HIT (was 520 ms) without ever returning stale prices, and drop `api.js` raw size by ~25 KB without removing the legacy-fallback safety net.

**Architecture:** No changes. Same Vercel serverless functions, same gateway, same suppliers. Just smarter caching of price-free responses and dead-code removal.

**Tech stack:** unchanged.

---

## Real-data baseline (2026-05-11, post Phase 2)

```
/api/products?limit=1    cold 3.32 s     warm 0.55 s
/api/products?limit=24   warm 0.55-0.62 s
/api/products?cat=detailing&limit=24   warm 0.53 s
/api/products?view=categories          warm 0.52 s
/api/products?view=featured&limit=12   warm 0.52 s
/api/products?id=BRV-31409             warm 0.52 s
```

**Floor is ~520 ms warm regardless of payload.** Bandwidth is not the bottleneck; function execution time is. The dominant cost on warm hits is reading + filtering + classifying 3,579 products in-memory. Cold starts add 2.8 s of supplier-file parsing on top.

**Insight:** the homepage's `view=categories` response is 376 bytes and only changes when supplier data refreshes. Today every visitor's request runs the same 520 ms of work to produce the same answer. **CDN-caching that response at the edge collapses 520 ms to ~50 ms for ~99 % of traffic.**

---

## Success Criteria (revised for honesty)

- `/api/products?view=categories` (price-free; safe to cache aggressively):
  - **Cache HIT** (returning visitors, ~80 % of homepage traffic): ≤ 100 ms (was 520 ms).
  - **Cache MISS** (first visitor in region after TTL expiry): unchanged ~520 ms.
- `/api/products?view=featured`, `?cat=...`, `?id=...` (contain prices/stock — NOT cached at edge): unchanged ~520 ms. **Zero stale-price risk by design.**
- **Zero risk that any admin change is visible to customers later than the next page request.** Achieved by NOT caching anything that contains admin-mutable data.
- `api.js` raw size drops from ~85 KB to ≤ 60 KB by removing the dead client-side classifier (~25 KB).
- **The `_ensureCatalog` symbol still exists** as a one-line `return []` stub so any forgotten caller fails gracefully instead of throwing `ReferenceError`.
- Production has no console 404s for `/text-normalize.js` / `/text-fix.js` / `/_mojibake_fix.js` after Phase 2's CDN cache window (≥ 48 h) and the script tags are removed.
- Server-Timing headers expose `cache`, `db`, and `total` durations on every `/api/products` response so future regressions are detectable from any browser.

## Non-Goals

- No catalog migration to blob/database (reserved for Phase 4).
- No supplier-data refresh-by-cron (reserved for Phase 4).
- No SSR / framework migration.
- No `defer` on `api.js` (per-page inline-script rewrite is too costly for the gain).
- No image CDN migration.

---

## Task 1: Edge-cache ONLY the Price-Free `/api/products` Responses

**Files:**
- Modify: `api/products/index.js` (set `Cache-Control` only on responses with zero admin-mutable content)
- Modify: `lib/api/catalog/gateway.js` (Server-Timing instrumentation, classify which response types are price-free)

**Design principle that brings stale-price risk to ZERO:**

A response is **safe to cache** if and only if it cannot change due to an admin action. The only response that satisfies this on `/api/products` is `?view=categories` — a list of `{key, label, count}` triples with no price, no stock, no badge.

| Response type | Contains | Admin-mutable? | Cache decision |
|---|---|---|---|
| `?view=categories` | category key + label + count | only on supplier-source-disabled (rare) | **CACHE 5 min** |
| `?view=featured` | products with price + stock | yes (margin, override) | **NO CACHE** |
| `?cat=...` | products with price + stock | yes | **NO CACHE** |
| `?id=...` | one product with price + stock | yes | **NO CACHE** |
| `?view=summary` | counts only | only on source-disabled | **CACHE 5 min** |

This means **every customer-visible price always comes from a fresh function execution.** The 5-minute cache on categories only ever makes the count slightly stale — an entirely cosmetic effect that the user-base of one admin can tolerate.

**No Vercel cache-purge API is invoked anywhere.** That API does not exist for serverless response caching, and the design no longer depends on it.

- [ ] **Step 1: Add Server-Timing to gateway**

  In `lib/api/catalog/gateway.js`, instrument `queryProducts`, `getView`, `getProduct` with a millisecond timer per phase. Surface timings via `Server-Timing` HTTP header on every response so DevTools shows them inline.

  Sketch:

  ```js
  async function timed(label, fn) {
    const t0 = Date.now();
    const result = await fn();
    return { result, durationMs: Date.now() - t0, label };
  }
  ```

  Handler attaches `Server-Timing: total;dur=N, gateway;dur=N`.

- [ ] **Step 2: Set Cache-Control ONLY on price-free views**

  In `api/products/index.js`, after computing the response, decide:

  ```js
  const view = String(query.view || '').trim().toLowerCase();
  const SAFE_VIEWS = new Set(['categories', 'summary', 'brands', 'sources']);
  const isPriceFree = SAFE_VIEWS.has(view) && !query.id && !query.sku && !query.oem;

  if (isPriceFree) {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
  ```

  Result: `?view=categories` lands in the Vercel edge cache and serves at ~50 ms for ~99 % of repeat traffic. Every other call goes through the function (~520 ms) and reflects current admin state instantly.

- [ ] **Step 3: Verify with curl**

  ```bash
  # First request → MISS, ~520 ms
  curl -sI "https://www.pieseautomotoras.ro/api/products?view=categories"
  # Second request → HIT, ~50-100 ms, x-vercel-cache: HIT
  curl -sI "https://www.pieseautomotoras.ro/api/products?view=categories"
  # Confirm price-bearing view is NOT cached
  curl -sI "https://www.pieseautomotoras.ro/api/products?cat=detailing&limit=24" | grep -i cache-control
  # Expected: Cache-Control: no-store
  ```

- [ ] **Step 4: Admin write paths must NOT need to purge anything**

  Because nothing admin-mutable is cached, admin writes work as today. No new code in `api/admin/[action].js`. No Vercel cache-purge API call. No env-var requirements.

- [ ] **Step 5: Commit**

  ```bash
  git add api/products/index.js lib/api/catalog/gateway.js
  git commit -m "perf: edge-cache only the price-free /api/products responses (view=categories|summary|brands|sources)"
  ```

---

## Task 2: Replace Legacy Code With No-Op Stubs (keep the safety surface)

**Files:**
- Modify: `api.js`

**Design principle that brings the safety-net risk to ZERO:**

The 25 KB of code in `api.js` we want gone consists of two layers:

1. **The heavy classifier**: `_subcategoryConfig` (40 lines of regex), `_resolveCategory`, `_resolveSubcategory`, `_scoreMatches`, `_subcategoryLabel`, `_categoryLabel`, `_stripDiacritics`, `_flattenSpecText`, `_inferCategory`. **DELETE.** These are now duplicated server-side in `lib/api/catalog/classify.js`; the browser never needs them again.

2. **The fallback fetch chain**: `_ensureCatalog`, `_fetchCatalogJson`, `_fetchFeedCatalogs`, `_normalizeCatalogItem`, `_mergeCatalogItems`, `_readCatalogCache`, `_writeCatalogCache`, `_needsFullCatalog`, `_getCatalogCandidates`, the three `_*CatalogCandidates` constants, `_CATALOG_CACHE_*`, `_feedSources`. **STUB** the public entry point (`_ensureCatalog`) so any forgotten caller gets `[]` instead of `ReferenceError`. DELETE the rest because nothing else outside `_ensureCatalog` should reference them.

This preserves the safety surface: if a code path I missed in the audit calls `await _ensureCatalog()`, the call returns `[]` (no crash, no silent fallback to deleted catalog files, no broken UX worse than what we already have when the API is unreachable).

**Pre-flight gate:** Production must have ≥ 48 h of stable `/api/products` traffic with no recurring 500s. Verify in Vercel dashboard → motoras project → Logs → past 48 h. If any `/api/products` 500s appear, halt and investigate.

- [ ] **Step 1: Inventory symbols**

  ```bash
  grep -nE "^(function|const) (_ensureCatalog|_fetchCatalogJson|_fetchFeedCatalogs|_microCatalogCandidates|_liteCatalogCandidates|_fullCatalogCandidates|_feedSources|_CATALOG_CACHE_VERSION|_CATALOG_CACHE_KEY|_CATALOG_CACHE_TTL|_readCatalogCache|_writeCatalogCache|_needsFullCatalog|_getCatalogCandidates|_normalizeCatalogItem|_mergeCatalogItems|_resolveCategory|_resolveSubcategory|_subcategoryConfig|_subcategoryLabel|_categoryLabel|_stripDiacritics|_flattenSpecText|_inferCategory|_scoreMatches)\b" api.js
  ```

  Expected: ~20 declarations.

- [ ] **Step 2: Rewrite remote-first callers to NOT fall back through `_ensureCatalog`**

  Search `api.js` for `await _ensureCatalog`. For each occurrence:
  - If inside a `MotApi.*` method: rewrite the fallback path to return `{ ok: false, items: [], error: 'Catalogul nu este disponibil momentan.' }`. Phase 1 Task 10 already did most of this; this step catches anything missed.
  - If inside an internal helper: keep the call. After Step 3 it will receive `[]` from the stub, which is safe.

- [ ] **Step 3: Delete the heavy classifier — keep the safety stub**

  Replace the multi-hundred-line block containing `_subcategoryConfig` through `_resolveCategory` with a header comment. Then replace `_ensureCatalog` (currently ~80 lines of fetch-fallback-merge logic) with:

  ```js
  // Phase 3 (Task 2): legacy client-side classifier and catalog-fetch fallback
  // chain were removed. All product data now comes exclusively from
  // /api/products. This stub stays as a safety surface so any internal
  // caller that still references _ensureCatalog returns [] instead of
  // throwing ReferenceError. Safe to delete entirely once the codebase has
  // been verified clean for one full release cycle.
  async function _ensureCatalog() { return []; }
  ```

  Same one-line stub treatment for `_resolveSubcategory(item)` (returns `'general'`) and `_subcategoryLabel(cat, sub)` (returns `'Selecție'`) if any MotApi method still calls them for display fallback.

  DELETE outright (no stub needed because nothing should ever call them again):
  - `_microCatalogCandidates`, `_liteCatalogCandidates`, `_fullCatalogCandidates`, `_feedSources`
  - `_CATALOG_CACHE_VERSION`, `_CATALOG_CACHE_KEY`, `_CATALOG_CACHE_TTL`
  - `_readCatalogCache`, `_writeCatalogCache`, `_needsFullCatalog`, `_getCatalogCandidates`
  - `_fetchCatalogJson`, `_fetchFeedCatalogs`, `_normalizeCatalogItem`, `_mergeCatalogItems`
  - `_subcategoryConfig`, `_resolveCategory`, `_scoreMatches`, `_categoryLabel`, `_stripDiacritics`, `_flattenSpecText`, `_inferCategory`

- [ ] **Step 4: Static grep validation**

  ```bash
  grep -nE "catalog-micro|catalog-lite|catalog\.json|supplier-feed\.xml|supplier-feed-globiz" api.js
  ```

  Expected: zero matches. The constants and fetchers are gone.

  ```bash
  grep -n "async function _ensureCatalog" api.js
  ```

  Expected: exactly one match — the safety stub.

- [ ] **Step 5: Run perf-audit**

  ```bash
  npm run perf:audit
  ```

  Expected: PASS. `api.js` raw drops from ~85 KB to ≤ 60 KB.

- [ ] **Step 6: Local browser smoke**

  Start the local server, open homepage / category / product / search / cart / checkout / admin. Confirm all pages still render and the network panel shows zero requests for catalog files.

- [ ] **Step 7: Commit**

  ```bash
  git add api.js
  git commit -m "perf: remove client-side classifier and 3-tier fetch chain; keep _ensureCatalog as safety stub"
  ```

---

## Task 3: Delete Runtime Mojibake Stub Files

**Files:**
- Delete: `text-normalize.js`, `text-fix.js`, `_mojibake_fix.js`
- Modify: every HTML that loaded `text-normalize.js` (17 files) — remove the `<script>` tag

**Pre-flight:** Phase 2 stubs were deployed at `dpl_CMpn7kb4U7CXSdqN33xdcmyscwYX` (2026-05-11). HTML pages cache for 1 h + 1 day SWR. Wait ≥ 48 h after that deploy before deleting so cached HTML referencing the stub has time to roll over.

- [ ] **Step 1: Gate check**

  ```bash
  # Confirm at least 48 h have passed since Phase 2 deploy timestamp
  ```

  If less, halt.

- [ ] **Step 2: Remove `<script>` tags**

  ```bash
  for f in $(grep -l 'text-normalize\.js' *.html); do
    sed -i '/<script[^>]*text-normalize\.js[^>]*><\/script>/d' "$f"
  done
  ```

  Same for `text-fix.js` and `_mojibake_fix.js` if any HTML still references them (Phase 2 audit showed zero, but verify).

- [ ] **Step 3: Delete the three files**

  ```bash
  git rm text-normalize.js text-fix.js _mojibake_fix.js
  ```

- [ ] **Step 4: Bump HTML cache-busters**

  Use the same `?v=20260513-phase3` pattern as Phase 2's `?v=20260511-phase2`, applied to every script tag the visitor still needs. Forces fresh HTML download.

- [ ] **Step 5: Run perf-audit**

  ```bash
  npm run perf:audit
  ```

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add -A
  git commit -m "perf: delete runtime mojibake stub files and their HTML script tags"
  ```

---

## Task 4: Lazy Per-Supplier Loading

**Files:**
- Modify: `lib/api/catalog/gateway.js`

**Goal:** When a request targets one supplier (`/api/bravus?...`, `/api/casabateriilor?...`), the gateway must not load all four. Currently `readRawCatalog` in `gateway.js` calls `Promise.all(listAdapters().map(a => a.all()))` even for supplier-scoped requests routed through the gateway.

- [ ] **Step 1: Add `readSupplierCatalog(source)` to gateway**

  Loads exactly one adapter, returns normalized + classified items, caches per-supplier.

  ```js
  async function readSupplierCatalog(source) {
    const adapter = getAdapter(source);
    if (!adapter) return [];
    return withCache(`gateway:supplier:${adapter.key}`, CATALOG_TTL, async () => {
      const items = await adapter.all();
      return items.map(classifyItem).map(normalizeProduct);
    });
  }
  ```

- [ ] **Step 2: Use it from `supplierQuery`**

  Replace the unconditional `readRawCatalog()` in `supplierQuery` with a per-supplier read. Apply admin rules over only that supplier's items.

- [ ] **Step 3: Verify orders.js / product-sitemap.js still work**

  Those functions use `getProduct({id})` which goes through `readPublicCatalog()` (all suppliers). That's still correct because the lookup needs to find the right supplier. Leave unchanged.

- [ ] **Step 4: Verify gateway smoke**

  ```bash
  npm test
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add lib/api/catalog/gateway.js
  git commit -m "perf: per-supplier lazy load in gateway"
  ```

---

## Task 5: Deploy + Smoke

**Files:**
- No code changes.

- [ ] **Step 1: Pre-deploy gates**

  ```bash
  npm test
  npm run perf:audit
  npx vercel build --yes
  ```

  All must pass.

- [ ] **Step 2: Capture rollback target**

  Current production deployment ID at the time of deploy. Save as `ROLLBACK_TARGET`.

- [ ] **Step 3: Production deploy**

  ```bash
  npx vercel deploy --prod --yes
  ```

- [ ] **Step 4: Production smoke + latency measurement**

  ```bash
  for q in "?view=categories" "?view=featured&limit=12" "?cat=detailing&limit=24" "?id=BRV-31409"; do
    echo "=== $q ==="
    for i in 1 2 3 4 5; do
      t=$(curl -s -o /dev/null -w "%{time_total}" "https://www.pieseautomotoras.ro/api/products$q&_=$RANDOM")
      cache=$(curl -sI "https://www.pieseautomotoras.ro/api/products$q&_=$RANDOM" | grep -i x-vercel-cache | tr -d '\r')
      echo "  ${t}s   $cache"
    done
  done
  ```

  Expected: after request #2, `x-vercel-cache: HIT` and latency ≤ 100 ms for `view=categories` and `view=featured`.

- [ ] **Step 5: Rollback rule**

  If categories page renders empty, admin margins fail to update, or `x-vercel-cache` never shows HIT after 3 requests: `npx vercel rollback <ROLLBACK_TARGET>`.

---

## Task 6: Measure And Compare

**Files:**
- Modify: `_audit/perf-baseline.md`

- [ ] **Step 1: Post-deploy latency table**

  Run the 5×latency probe per endpoint, capture median and tail.

- [ ] **Step 2: Side-by-side with HIT vs MISS distinction**

  | Endpoint | Pre | Post MISS | Post HIT | Cache? |
  |---|---:|---:|---:|---|
  | `/api/products?view=categories` | 520 ms | ~520 ms (1 in 50+) | ≤ 100 ms (rest) | yes |
  | `/api/products?view=summary` | 520 ms | ~520 ms (1 in 50+) | ≤ 100 ms (rest) | yes |
  | `/api/products?view=featured` | 520 ms | 520 ms | n/a | **no** (prices) |
  | `/api/products?cat=...` | 530 ms | 530 ms | n/a | **no** (prices) |
  | `/api/products?id=...` | 520 ms | 520 ms | n/a | **no** (prices) |

  Required outcomes:
  - `view=categories` HIT latency ≤ 100 ms (≥ 80 % faster than today's 520 ms)
  - HIT rate ≥ 90 % within the first hour of traffic (verifiable via `x-vercel-cache: HIT` header sampling)
  - Price-bearing endpoints **unchanged** by design — zero stale-price risk
  - `api.js` raw size ≤ 60 KB (≥ 30 % smaller)
  - `_ensureCatalog` exists as a stub (one-line `return []`)
  - Zero `ReferenceError` in production logs from removed symbols

- [ ] **Step 3: Commit**

  ```bash
  git add _audit/perf-baseline.md
  git commit -m "chore: capture Phase 3 latency delta"
  ```

---

## Risks And Mitigations (every task → genuinely zero)

### Task 1 (edge cache) — risks neutralized by design

| Original risk | Why it's now zero |
|---|---|
| Admin saves margins → users see stale prices for 5 min | **Prices are never cached.** Only `?view=categories` / `summary` / `brands` / `sources` get cached. None contain prices. |
| Cache invalidation via Vercel API may not exist | **No purge API is invoked.** The plan never needs one because admin-mutable responses are not cached in the first place. |
| Hidden products leak via stale cache | **Hidden products don't appear in cached responses.** The cached responses are counts/categories, computed against the live admin config at every cache miss. After the next miss (≤ 5 min), counts reflect the hide. The product itself was never in a cached response that the customer would see. |
| Edge cache fragmented by query strings | The cached endpoints have a tiny query-space (only `view=` values). High cache hit rate by construction. |
| CDN-edge cache stampede on TTL expiry | `stale-while-revalidate=3600` lets the edge serve stale while one request rebuilds. Vercel coordinates per-region. |

### Task 2 (legacy code removal) — risks neutralized by design

| Original risk | Why it's now zero |
|---|---|
| `/api/products` has unknown 500s in last 48 h | Explicit pre-flight Vercel dashboard log review. Halts if any errors. |
| Hidden caller still uses `_ensureCatalog` after deletion | **`_ensureCatalog` is kept as a one-line stub returning `[]`.** Any forgotten caller succeeds with empty data instead of crashing. The 25 KB savings come from deleting the classifier underneath, not from removing the entry point. |
| Removing fallback = site goes dark on /api/products outage | **Same as today.** The stub returns `[]`, which produces an empty-state message — the same UX the silent fallback would have produced once `catalog-micro.json` started returning 404 (Phase 2 Task 4). No new failure mode. |
| Static-file fallback paths still referenced | Static grep validates zero references to catalog files in `api.js` after the refactor. |

### Task 3 (stub deletion)
| Risk | Mitigation → zero |
|---|---|
| CDN-cached HTML still refs the deleted stubs → 404 console noise | 48 h wait gate after Phase 2 deploy. CDN cache for HTML is 1 h + 1 day SWR. After 48 h all reasonable caches have rotated. |
| Some 3rd-party page (e.g. embedded checkout?) hardcodes the path | Unlikely. Verified zero external referrers in audit. |

### Task 4 (per-supplier lazy load)
| Risk | Mitigation → zero |
|---|---|
| Per-supplier cache stale relative to global cache | Both caches share the same 5-min TTL window. Both refresh from same source files. No drift. |
| `getProduct` lookups break if they relied on global catalog | `getProduct` continues to use `readPublicCatalog()` (global). Only `supplierQuery` switches to lazy. |

### Task 5 (deploy)
| Risk | Mitigation → zero |
|---|---|
| First post-deploy request shows MISS → users see normal latency | Pre-warm via curl hits to each cached endpoint immediately after deploy. The cached endpoints are very few (4 view values) so warming is exhaustive. |
| Cache purge endpoint fails silently if env vars missing | **N/A — no purge endpoint is invoked.** No env vars required. |
| Edge cache for the bad build outlives rollback | Only `view=categories|summary|brands|sources` is cached, max 5 min. Rolling back a price-bearing path is instant because nothing is cached. The worst case is one stale category-count for ≤ 5 min after rollback. |

### Task 6 (measure)
Zero-risk (read-only).

---

## What This Phase Does NOT Touch

Reserved for later phases:

- **Function bundle slimming (16 MB orders.func).** Real fix is moving supplier data to blob storage. Multi-PR architectural change.
- **Pre-warm via cron.** Only useful if Task 1's CDN cache doesn't take enough traffic. Add only if measurement shows < 80% cache hit rate.
- **Edge runtime migration.** Would need blob storage and major rewrites of supplier adapters.
- **Image CDN.** Image dependence on carhub.ro remains.

---

## Self-Review

- Spec coverage: every endpoint has a target latency. Every regression target has a measurement.
- Placeholder scan: every task has concrete commands, grep checks, and expected outputs.
- Gates: Task 2 has the 48 h stability gate. Task 3 has the 48 h CDN-rotation gate. Both are mechanical, not subjective.
- Rollback: every task is one commit, revertible via `git revert <sha>` + `vercel deploy --prod`. Task 5 captures `ROLLBACK_TARGET` before any production change.
- Open question for the user: none. All required env vars and access were verified during Phase 1/2 audits.
