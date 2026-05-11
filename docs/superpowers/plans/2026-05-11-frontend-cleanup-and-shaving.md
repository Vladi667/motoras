# Frontend Cleanup and Shaving — Phase 2

> **For agentic workers:** Same execution style as Phase 1 (`2026-04-24-supplier-gateway-performance.md`). Each task is independently shippable. Each task ends with a commit.

**Goal:** Strip the dead code paths Phase 1 made obsolete, remove the runtime mojibake fixers now that the server ships clean classified data, lazy-load images, and measure the perf delta. No new features. No new server logic. Just cleanup, hygiene, and validation.

**Architecture:** No changes. The gateway built in Phase 1 already does the work. This phase removes redundancy and proves the win.

**Tech stack:** unchanged.

---

## Success Criteria

- Browser no longer downloads `text-normalize.js`, `text-fix.js`, or `_mojibake_fix.js` on any page.
- `api.js` no longer contains `_ensureCatalog`, `_fetchCatalogJson`, `_fetchFeedCatalogs`, `_microCatalogCandidates`, `_liteCatalogCandidates`, `_fullCatalogCandidates`, or the localStorage catalog cache helpers.
- `api.js` ships under 60 KB raw (currently 85 KB).
- Product card `<img>` tags have `loading="lazy"` and `decoding="async"` everywhere except the first ~4 images above the fold.
- `catalog.json`, `catalog-lite.json`, `catalog-micro.json`, `supplier-feed.xml`, `supplier-feed-globiz.xml` are not reachable as static files from `pieseautomotoras.ro` (404). Serverless functions can still read them from the function bundle.
- Lighthouse mobile score for homepage improves by at least 10 points vs the post-Phase-1 baseline measured in Task 0.
- Admin, Stripe, orders, supplier browse, huse-prelate grid, Detailing/Accesorii landing pages all continue to work bit-for-bit identically to today's production.

## Non-Goals

- No new server features.
- No new pages.
- No changes to checkout, payments, admin auth.
- No supplier integration changes (the function-bundle slimming is reserved for Phase 3).
- No SSR / framework migration.

## Current Behavior To Preserve

- All localStorage data: `motoras_orders`, `motoras_cart`, `motoras_last_order`, `motoras_product_ratings_v1`, `motoras_catalog_cache_v1`, `motoras_perf_split`, `motoras_page_loader_nav`. Old entries may contain mojibake (e.g. `Meguiar&#039;s`); the storefront must still render these legibly even after the runtime fixers are removed.
- Bravus brand-grid modal, Casa Bateriilor, Carhub, Globiz endpoints — all four supplier flows.
- Admin product-overrides POST/DELETE flow added in Phase 1.
- Vercel rewrites (clean URLs, 17 SEO landings) in production `vercel.json` stay byte-identical.

---

## Task 0: Baseline Measurement

**Files:**
- Create: `_audit/lighthouse-pre.json`
- Create: `_audit/perf-baseline.md`

- [ ] **Step 1: Lighthouse on production homepage (mobile)**

  Run from a clean Chrome profile:

  ```bash
  npx lighthouse https://pieseautomotoras.ro/ --preset=desktop --output=json --output-path=_audit/lighthouse-pre-desktop.json --chrome-flags="--headless"
  npx lighthouse https://pieseautomotoras.ro/ --output=json --output-path=_audit/lighthouse-pre-mobile.json --chrome-flags="--headless"
  ```

  Capture: Performance, First Contentful Paint, Largest Contentful Paint, Total Blocking Time, Cumulative Layout Shift, Speed Index, Total Bytes.

- [ ] **Step 2: Record DevTools network on cold load**

  Fresh incognito tab → open `https://pieseautomotoras.ro/` → Network panel → record:
  - Total requests
  - Total transferred bytes
  - Total resources size
  - DOMContentLoaded time
  - Load time
  - Was `catalog-micro.json` requested? (Must be **No** post-Phase-1; this is the smoke test that Phase 1 actually worked.)

  Save screenshot to `_audit/network-pre-cold.png`.

- [ ] **Step 3: Note baseline in `_audit/perf-baseline.md`**

  Plain markdown table with the numbers from Steps 1-2. Both desktop and mobile.

- [ ] **Step 4: No commit yet** — measurement runs uncommitted, only the doc gets committed.

  ```bash
  git add _audit/perf-baseline.md
  git commit -m "chore: capture Phase 2 perf baseline"
  ```

---

## Task 1: Add Lazy Loading And Async Decoding To Product Images

**Files:**
- Modify: `index.html`, `category.html`, `product.html`, `search.html`
- Modify: any `<img>` template strings in `api.js`, `nav-subcategories.js`

- [ ] **Step 1: Audit `<img>` tags**

  ```bash
  grep -nE '<img[^>]*src=' index.html category.html product.html search.html api.js nav-subcategories.js | head -40
  ```

  Identify:
  - Hero/logo images that must NOT be lazy (the first ~4 above the fold)
  - Product card images (every product card thumbnail)
  - Category tile images on the homepage

- [ ] **Step 2: Add `loading="lazy" decoding="async"` to every non-above-the-fold `<img>`**

  Skip:
  - `assets/logo.png` (logo in header)
  - `assets/hero.mp4` is already `preload="none"`
  - The first 4 product card images on category.html (above fold on most viewports)

- [ ] **Step 3: Reserve image aspect-ratio to prevent CLS regression**

  Every product-card `<img>` must either have explicit `width`/`height` attributes or `style="aspect-ratio: 1/1"` (or whatever ratio the card uses). If CSS already handles this via the parent container, leave alone.

- [ ] **Step 4: Visual sanity check**

  Open each modified page in a browser at desktop and mobile widths. Confirm:
  - First viewport renders without missing images.
  - Scrolling triggers images to fade/load in below the fold.
  - No new layout shift.

- [ ] **Step 5: Commit**

  ```bash
  git add index.html category.html product.html search.html api.js nav-subcategories.js
  git commit -m "perf: lazy-load below-fold product images with aspect-ratio reservation"
  ```

---

## Task 2: Remove Runtime Mojibake Fixers From All HTML Pages

**Files:**
- Modify: every `.html` file that loads `text-normalize.js`, `text-fix.js`, or `_mojibake_fix.js`

**Pre-flight:** Server now ships clean classified data via gateway. The only risk is localStorage entries written before Phase 1 that may contain raw mojibake. Cart/order/favorite display code must still render them readably.

- [ ] **Step 1: Confirm the server data is clean**

  ```bash
  curl -s "https://pieseautomotoras.ro/api/products?limit=5" | grep -E "Ã|&#0[0-9]+|Ä|È|Ü|â€"
  ```

  Expected: no matches. If matches appear, halt — server data isn't actually clean and removing the fixers will regress text rendering.

- [ ] **Step 2: Identify all references**

  ```bash
  grep -lnE 'text-normalize\.js|text-fix\.js|_mojibake_fix\.js' *.html | sort
  ```

  Expected: 17 HTML files.

- [ ] **Step 3: Move the three scripts to a single "compat" stub**

  Create `text-compat.js`:

  ```js
  // Phase-2 compatibility stub. The legacy runtime mojibake fixers
  // were removed because the gateway now serves clean classified data.
  // Anything in localStorage written before Phase 1 (cart, orders,
  // ratings) is normalized lazily at read time only.
  (function () {
    function decode(value) {
      if (typeof value !== 'string' || !value) return value;
      const ta = document.createElement('textarea');
      ta.innerHTML = value;
      return ta.value.replace(/[ ]/g, ' ');
    }
    window.__motorasDecodeLegacy = decode;
  })();
  ```

  This tiny shim (≈400 bytes) replaces the three big scripts and provides a hook for cart/orders/favorites code that needs to read legacy localStorage entries.

- [ ] **Step 4: Replace `<script>` tags in every HTML file**

  Replace every line matching `<script src="text-normalize.js..." ...>` or `<script src="text-fix.js..." ...>` or `<script src="_mojibake_fix.js..." ...>` with a single line:

  ```html
  <script src="text-compat.js?v=20260511-compat-1" defer></script>
  ```

  Use a single global find-replace, then verify per file.

- [ ] **Step 5: Update `cart.js`, `favorites.js`, and the orders read path in `api.js`**

  Anywhere they read text fields from localStorage and write them to the DOM, wrap the string with `window.__motorasDecodeLegacy(value)` (defensive — only does work if entities are present).

- [ ] **Step 6: Local smoke**

  Start the local server, open every modified page, click through cart → checkout → confirmation → account. Ensure no double-encoded text appears anywhere.

- [ ] **Step 7: Delete the three legacy files**

  ```bash
  git rm text-normalize.js text-fix.js _mojibake_fix.js
  ```

- [ ] **Step 8: Commit**

  ```bash
  git add text-compat.js *.html cart.js favorites.js api.js
  git commit -m "perf: replace 18 KB of runtime mojibake fixers with a 400 B legacy decode shim"
  ```

---

## Task 3: Remove The Legacy `_ensureCatalog` Fallback From `api.js`

**Files:**
- Modify: `api.js`

**Pre-flight:** This deletes the safety net Phase 1 left in place. Only do this AFTER 48 hours of stable production traffic on `/api/products`. If the gateway has been throwing or returning empty, abort.

- [ ] **Step 1: Production health check (must be GREEN before continuing)**

  ```bash
  curl -s "https://pieseautomotoras.ro/api/products?limit=1" | head -c 200
  curl -s "https://pieseautomotoras.ro/api/products?view=categories" | head -c 200
  curl -s "https://pieseautomotoras.ro/api/products?view=featured&limit=3" | head -c 200
  ```

  All three must return `{"ok":true,...}` with non-empty items / categories.

  Also check Vercel logs for the past 48 h:

  ```bash
  vercel logs --since 48h pieseautomotoras.ro 2>&1 | grep -iE "error|fail|500" | head -20
  ```

  Expected: no recurring `/api/products` 500s.

- [ ] **Step 2: Remove constants and fallback fetchers from `api.js`**

  Delete:
  - `_liteCatalogCandidates`, `_fullCatalogCandidates`, `_microCatalogCandidates`
  - `_feedSources`
  - `_CATALOG_CACHE_VERSION`, `_CATALOG_CACHE_KEY`, `_CATALOG_CACHE_TTL`
  - `_readCatalogCache`, `_writeCatalogCache`
  - `_fetchCatalogJson`, `_fetchFeedCatalogs`
  - `_mergeCatalogItems`, `_normalizeCatalogItem` if no longer referenced
  - `_ensureCatalog`
  - `_resolveCategory`, `_resolveSubcategory`, `_scoreMatches`, `_subcategoryConfig`, `_categoryLabel` (server now does classification)
  - `_subcategoryLabel`, `_stripDiacritics`, `_flattenSpecText` if no longer referenced

  Leave intact:
  - All `window.MotApi.*` public methods (they should already be remote-first after Phase 1 Task 10).
  - `_applyRatingSummary` and the review/rating helpers (localStorage-backed).
  - Search-helper functions (`_normalizeSearchText`, `_compactSearchText`, `_tokenizeSearch`, `_scoreProductSearch`) — still used by client-side filter ranking in some MotApi paths.
  - All localStorage helpers (`motoras_orders`, `motoras_cart`, etc.).

- [ ] **Step 3: Verify every remaining `MotApi` method does NOT reference `_ensureCatalog`**

  ```bash
  grep -n "_ensureCatalog\|_fetchCatalogJson\|_fetchFeedCatalogs" api.js
  ```

  Expected: no matches.

- [ ] **Step 4: Run perf-audit**

  ```bash
  npm run perf:audit
  ```

  Expected: PASS. `api.js` raw size drops from ~85 KB to ~55 KB or less.

- [ ] **Step 5: Local browser smoke**

  Start local server, open homepage / category / product / search / cart / checkout / admin. Confirm everything still works against `/api/products`.

- [ ] **Step 6: Commit**

  ```bash
  git add api.js
  git commit -m "perf: remove dead _ensureCatalog fallback chain and client-side classifier"
  ```

---

## Task 4: Exclude Catalog Files From Public Static Serve

**Files:**
- Modify: `vercel.json`

**Pre-flight:** Functions read `catalog.json`, `supplier-feed.xml`, `supplier-feed-globiz.xml`, `api/casabateriilor/prices.generated.json` via `fs.readFileSync`. These MUST stay in the function bundle. We are only blocking the public HTTP path, not removing the files from deploy.

- [ ] **Step 1: Identify external consumers of the public catalog files**

  Ask the user before this step:
  - Does Google Merchant fetch any of these URLs?
  - Does any supplier integration / partner fetch them?
  - Are they used for anything outside the browser?

  If yes for any of the above, leave that specific file public (e.g. `catalog.json` may need to stay for Merchant). Block only the unused tiers (likely `catalog-lite.json` and `catalog-micro.json`).

- [ ] **Step 2: Add a public-path block via `vercel.json` headers + 404 route**

  Add a route entry near the top of `routes` (BEFORE the `filesystem` handle):

  ```json
  { "src": "/(catalog|catalog-lite|catalog-micro)\\.json", "dest": "/404.html", "status": 404 }
  ```

  Skip the entries the user wants to keep public.

  Same for supplier feeds if user confirms nothing external consumes them:

  ```json
  { "src": "/supplier-feed(?:-globiz)?\\.xml", "dest": "/404.html", "status": 404 }
  ```

- [ ] **Step 3: Verify functions still load catalog locally**

  ```bash
  npx vercel build --yes
  ```

  Expected: build succeeds. Functions still bundle catalog data.

- [ ] **Step 4: Commit**

  ```bash
  git add vercel.json
  git commit -m "chore: block public static serve of catalog files"
  ```

---

## Task 5: Deploy Once And Smoke

**Files:**
- No code changes.

- [ ] **Step 1: Pre-deploy gates**

  ```bash
  npm test
  npm run perf:audit
  ```

  Both must pass.

- [ ] **Step 2: Preview deploy first**

  ```bash
  npx vercel deploy --yes
  ```

  Inspect the preview URL once Vercel auth is configured for it (or skip preview if protection blocks all programmatic checks — go straight to production with rollback ready).

- [ ] **Step 3: Production deploy**

  ```bash
  npx vercel deploy --prod --yes
  ```

  Save the previous production deployment ID as the rollback target before this command runs.

- [ ] **Step 4: Production smoke**

  ```bash
  curl -sIL https://www.pieseautomotoras.ro/ | head -3
  curl -sL "https://www.pieseautomotoras.ro/api/products?limit=3" | head -c 200
  curl -sIL https://www.pieseautomotoras.ro/catalog-micro.json | head -3
  curl -sIL https://www.pieseautomotoras.ro/detailing | head -3
  curl -sIL https://www.pieseautomotoras.ro/text-normalize.js | head -3
  ```

  Expected:
  - Homepage: 200
  - `/api/products`: ok=true, items=3
  - `/catalog-micro.json`: **404** (Task 4 took effect)
  - `/detailing`: 200, content-type html
  - `/text-normalize.js`: 404 (Task 2 deleted it)

- [ ] **Step 5: Rollback rule**

  If anything fails:

  ```bash
  npx vercel rollback <PREVIOUS_PROD_DEPLOYMENT_ID>
  ```

---

## Task 6: Measure And Compare

**Files:**
- Create: `_audit/lighthouse-post-mobile.json`, `_audit/lighthouse-post-desktop.json`
- Modify: `_audit/perf-baseline.md`

- [ ] **Step 1: Lighthouse post-Phase-2**

  ```bash
  npx lighthouse https://pieseautomotoras.ro/ --preset=desktop --output=json --output-path=_audit/lighthouse-post-desktop.json --chrome-flags="--headless"
  npx lighthouse https://pieseautomotoras.ro/ --output=json --output-path=_audit/lighthouse-post-mobile.json --chrome-flags="--headless"
  ```

- [ ] **Step 2: Diff against Task 0 baseline**

  Update `_audit/perf-baseline.md` with side-by-side columns:

  | Metric | Pre-Phase-2 | Post-Phase-2 | Delta |
  |---|---|---|---|

  Required improvements:
  - Mobile Performance score: +10 points minimum
  - Total transferred bytes: −150 KB minimum (catalog files no longer public + 18 KB of mojibake scripts removed + 30 KB of api.js dead code removed)
  - First Contentful Paint: any improvement
  - Total Blocking Time: any improvement

  If any required improvement is missing, investigate before claiming Phase 2 done.

- [ ] **Step 3: Commit measurement**

  ```bash
  git add _audit/perf-baseline.md _audit/lighthouse-post-mobile.json _audit/lighthouse-post-desktop.json
  git commit -m "chore: capture Phase 2 perf delta"
  ```

---

## What This Phase Does NOT Touch

These are real wins but belong in Phase 3 (not here):

- **Function bundle slimming** — orders.func is 16 MB because the gateway pulls in all supplier data. Reducing this needs supplier data in blob storage or external APIs. Multi-PR work.
- **`defer` on `api.js`** — inline scripts on every page call `MotApi.*` directly. Adding defer would require either moving those inline blocks to wrapped functions or threading a "MotApi ready" promise through every page. Out of scope for cleanup.
- **Image CDN / responsive images** — current images come from `carhub.ro` at full resolution. Migrating to an image CDN is a separate effort.
- **Service worker / offline** — not needed for the current performance ceiling.

---

## Self-Review

- Spec coverage: removes the dead `_ensureCatalog` chain, removes runtime mojibake scripts, lazy-loads images, blocks public access to catalog files.
- Placeholder scan: every task has concrete commands and grep checks.
- Risk: Task 2's deletion of mojibake fixers depends on `_audit/perf-baseline.md` confirming the server data is clean. Task 3's deletion of `_ensureCatalog` depends on 48 h of green `/api/products` traffic. Both gates are explicit, not optional.
- Rollback: every task ends in one commit, revertible via `git revert <sha>` + `vercel deploy --prod`.
- Open question for the user: which of `catalog.json`, `catalog-lite.json`, `catalog-micro.json`, `supplier-feed.xml`, `supplier-feed-globiz.xml` are consumed by external partners (Google Merchant, supplier aggregators)? Task 4 needs that answer before blocking the public path.
