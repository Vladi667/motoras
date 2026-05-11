# Hot Path Latency — Phase 3

> **For agentic workers:** Same execution style as Phase 1 and Phase 2. Each task is independently shippable. Each task ends with one commit. Gates are explicit.

**Goal:** Drop `/api/products` median latency from ~520 ms warm / ~3.3 s cold down toward edge-cache territory (<100 ms p95 for cached responses, <800 ms cold), without architectural rework.

**Architecture:** No changes. Same Vercel serverless functions, same gateway, same suppliers. Just smarter caching, observability, and legacy-code removal.

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

## Success Criteria

- `/api/products?view=categories` median latency: ≤ 100 ms (was 520 ms).
- `/api/products?view=featured&limit=12` median latency: ≤ 150 ms (was 520 ms).
- `/api/products?cat=<cat>&limit=24&page=1` median latency: ≤ 200 ms (was 530 ms).
- `/api/products?id=<id>` median latency: ≤ 300 ms (was 520 ms).
- Cache invalidation respects admin changes within ≤ 10 minutes (margin save → public price update).
- `api.js` raw size drops from ~85 KB to ≤ 60 KB.
- Production has no console 404s for `/text-normalize.js` / `/text-fix.js` / `/_mojibake_fix.js` after the legacy stubs are removed AND CDN caches rotate.
- Server-Timing headers expose `cache`, `db`, and `total` durations on every `/api/products` response so future regressions are detectable from any browser.

## Non-Goals

- No catalog migration to blob/database (reserved for Phase 4).
- No supplier-data refresh-by-cron (reserved for Phase 4).
- No SSR / framework migration.
- No `defer` on `api.js` (per-page inline-script rewrite is too costly for the gain).
- No image CDN migration.

---

## Task 1: Edge-cacheable `/api/products` Responses

**Files:**
- Modify: `vercel.json` (route headers for `/api/products*`)
- Modify: `api/products/index.js` (set `Cache-Control` on safe views)
- Modify: `lib/api/catalog/gateway.js` (cache key includes admin-config hash so margin changes invalidate)
- Modify: `api/admin/[action].js` (`writeMargins` and `writeProductOverride` clear gateway cache and respond with a cache-busting timestamp)

**Pre-flight:** The current `vercel.json` does not set Cache-Control on `/api/products`. Responses are returned with `Cache-Control: no-store` by default for serverless functions. We need to opt the function into edge caching deliberately.

- [ ] **Step 1: Add Server-Timing to gateway**

  In `lib/api/catalog/gateway.js`, wrap `queryProducts`, `getView`, `getProduct` with a thin timer that returns `{ result, timings }`. Surface `timings` to the handler via a hidden response property OR via a `Server-Timing` HTTP header. Header is preferred — DevTools shows it inline.

  Sketch:

  ```js
  // gateway.js
  async function timed(label, fn) {
    const t0 = Date.now();
    const result = await fn();
    return { result, durationMs: Date.now() - t0, label };
  }
  ```

  Handler attaches `Server-Timing: cache;dur=N, db;dur=N, total;dur=N`.

- [ ] **Step 2: Compute admin-config hash for cache key**

  In `lib/api/catalog/admin-config.js`, add `configHash()` that returns a short string built from margins + overrides JSON. Use that hash as the `_etag` value in gateway responses so the CDN can bust on admin change.

  ```js
  const crypto = require('crypto');
  function configHash(config) {
    return crypto.createHash('sha1').update(JSON.stringify(config)).digest('hex').slice(0, 12);
  }
  ```

- [ ] **Step 3: Set Cache-Control on safe responses**

  In `api/products/index.js`, after computing the response:

  ```js
  const isMutation = query.method && query.method !== 'GET';
  const isPersonalized = false; // /api/products is never user-specific
  if (!isMutation && !isPersonalized) {
    const tag = result.configHash || 'static';
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    res.setHeader('ETag', `"${tag}"`);
    res.setHeader('Vary', '');
  }
  ```

  Vercel's edge CDN respects `s-maxage` — 5 minutes hot cache, 1 hour stale-while-revalidate. Repeat visitors within 5 min get instant edge responses (~30 ms).

- [ ] **Step 4: Admin write paths must purge edge cache**

  In `api/admin/[action].js`, after a successful `writeMargins` or `writeProductOverride`, call Vercel's purge API:

  ```js
  async function purgeProductsCache() {
    if (!process.env.VERCEL_API_TOKEN || !process.env.VERCEL_PROJECT_ID) return;
    try {
      await fetch(`https://api.vercel.com/v1/data-cache/purge?projectId=${process.env.VERCEL_PROJECT_ID}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}` },
        body: JSON.stringify({ paths: ['/api/products*'] }),
      });
    } catch (_) { /* best-effort */ }
  }
  ```

  Also bump in-memory cache: call `clearCache('gateway:')` from `lib/api/catalog/cache.js`.

- [ ] **Step 5: Verify cache behavior**

  Local + production smoke:

  ```bash
  # First request → MISS, function runs
  curl -sI "https://www.pieseautomotoras.ro/api/products?view=categories" | grep -iE "cache|server-timing|x-vercel"
  # Second request → HIT, edge returns
  curl -sI "https://www.pieseautomotoras.ro/api/products?view=categories" | grep -iE "cache|server-timing|x-vercel"
  ```

  Expected: second call shows `x-vercel-cache: HIT` and dramatically shorter latency.

- [ ] **Step 6: Commit**

  ```bash
  git add vercel.json api/products/index.js lib/api/catalog/gateway.js lib/api/catalog/admin-config.js api/admin/[action].js
  git commit -m "perf: edge-cache /api/products with admin-config-aware invalidation"
  ```

---

## Task 2: Drop Legacy `_ensureCatalog` + Client-Side Classifier From `api.js`

**Files:**
- Modify: `api.js`

**Pre-flight gate:** Production must have ≥ 48 h of stable `/api/products` traffic with no recurring 500s. Run:

```bash
npx vercel logs https://www.pieseautomotoras.ro --since 48h 2>&1 | grep -iE "error|500" | head -20
```

If matches appear, halt and investigate.

- [ ] **Step 1: Inventory symbols to remove**

  ```bash
  grep -nE "^(function|const) (_ensureCatalog|_fetchCatalogJson|_fetchFeedCatalogs|_microCatalogCandidates|_liteCatalogCandidates|_fullCatalogCandidates|_feedSources|_CATALOG_CACHE_VERSION|_CATALOG_CACHE_KEY|_CATALOG_CACHE_TTL|_readCatalogCache|_writeCatalogCache|_needsFullCatalog|_getCatalogCandidates|_normalizeCatalogItem|_mergeCatalogItems|_resolveCategory|_resolveSubcategory|_subcategoryConfig|_subcategoryLabel|_categoryLabel|_stripDiacritics|_flattenSpecText|_inferCategory|_scoreMatches)\b" api.js
  ```

  Expected: ~20 declarations. Confirm zero MotApi public methods reference them after Phase 1 Task 10.

- [ ] **Step 2: Replace each fallback with a graceful empty-state response**

  Any remaining caller that does `(await _ensureCatalog()).filter(...)` should be rewritten to call `/api/products` with the same filter. If the request fails, return `{ ok: false, items: [], error: 'Catalogul nu este disponibil momentan.' }` instead of silently falling back to the local cache.

  Specifically, in `api.js` re-inspect:
  - `getCatalogSnapshot` — paginate `/api/products?limit=500` (already remote-first in Phase 1 — verify)
  - `getHomepageData` fallback to `getCatalogSnapshot()` — keep, it now hits the remote
  - `getBravusCatalog` fallback that uses `_filterLocalBravusItems(await _ensureCatalog(), …)` — rewrite to call `/api/bravus` only
  - `getProduct(id)` — already remote-first (Phase 1)
  - `_setupProductDataPrefetching` — already uses `_requestJson`

- [ ] **Step 3: Delete the legacy symbols**

  Remove their declarations and any orphaned helper they relied on. After this, the only places `catalog-micro.json` / `catalog-lite.json` / `catalog.json` / `supplier-feed.xml` appear are inside `_audit/` (immune) and in deploy-time bundles read by serverless functions.

- [ ] **Step 4: Static grep validation**

  ```bash
  grep -nE "_ensureCatalog|_fetchCatalogJson|_fetchFeedCatalogs|catalog-micro|catalog-lite|catalog\.json|supplier-feed" api.js
  ```

  Expected: zero matches (except inline comments referencing the removal).

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
  git commit -m "perf: remove legacy _ensureCatalog fallback and client-side classifier"
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

- [ ] **Step 2: Side-by-side**

  | Endpoint | Pre-Phase-3 warm | Post-Phase-3 HIT | Δ |
  |---|---:|---:|---:|

  Required improvements:
  - `view=categories`: ≤ 100 ms (from 520 ms) — **≥ 80% faster**
  - `view=featured`: ≤ 150 ms — **≥ 70% faster**
  - `cat=<cat>`: ≤ 200 ms — **≥ 60% faster**
  - `id=<id>`: ≤ 300 ms — **≥ 40% faster**
  - `api.js` raw: ≤ 60 KB (from ~85 KB) — **≥ 30% smaller**

- [ ] **Step 3: Commit**

  ```bash
  git add _audit/perf-baseline.md
  git commit -m "chore: capture Phase 3 latency delta"
  ```

---

## Risks And Mitigations (every task → zero)

### Task 1 (edge cache)
| Risk | Mitigation → zero |
|---|---|
| Admin saves margins → users see stale prices for 5 minutes | TTL is 5 min by design. Acceptable for non-flash-sale e-commerce. Admin write also fires Vercel cache purge for instant invalidation. |
| Cache key ignores admin overrides → hidden products leak | `ETag` includes `configHash(margins + overrides)`. Any change to either flips the cache key. |
| Edge cache pollution from query-string variations | Use `Vary` thoughtfully; cache on full URL incl. query. Vercel default is correct here. |
| `x-vercel-cache: STALE` returned during SWR window | That's the desired behavior — user gets stale fast, revalidation happens in background. |

### Task 2 (legacy code removal)
| Risk | Mitigation → zero |
|---|---|
| `/api/products` has unknown 500s in last 48 h | Explicit pre-flight `vercel logs --since 48h` grep. Halts if any errors. |
| Hidden caller still uses `_ensureCatalog` | Static grep before deletion; full HTML smoke after. |
| Removing fallback = site goes dark on /api/products outage | Replace silent fallback with explicit "Catalogul nu este disponibil momentan." message + retry hint. Better UX than the silent bug it was masking. |

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
| First post-deploy request shows MISS → users see normal latency | Pre-warm via 5 curl hits to each endpoint immediately after deploy. |
| Cache purge endpoint fails silently if env vars missing | Setup gate: confirm `VERCEL_API_TOKEN` + `VERCEL_PROJECT_ID` env vars present in Vercel before Task 1 deploy. |

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
