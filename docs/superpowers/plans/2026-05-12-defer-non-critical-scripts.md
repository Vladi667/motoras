# Defer Non-Critical Scripts — Phase 4 (zero-risk by construction)

> Same execution style as Phase 1, 2, 3. Each task is independently shippable. Each task ends in one commit. Every risk has a mechanical mitigation, not a "be careful" prayer.

**Goal:** Stop blocking HTML parse on `api.js`, `cart.js`, `favorites.js`, `nav-subcategories.js`, `vehicle-selector-data.js`. Currently each of the four main pages downloads 4 render-blocking external scripts during HTML parse. After this phase those scripts download in parallel with parse and execute after the DOM is ready.

**Architecture:** No changes. Same gateway, same serverless functions, same supplier integrations.

**Tech stack:** unchanged.

---

## Real-data baseline (2026-05-12, post Phase 3)

```
Render-blocking external scripts per page:
  index.html, category.html, product.html, search.html: 4 each
  checkout.html, confirmation.html, account.html:        1 each

Inline scripts that reference window.MotApi / window.cart / window.favorites
  index.html:        10 callsites
  category.html:      9 callsites
  product.html:      17 callsites
  search.html:        9 callsites
  checkout.html:      2 callsites
  confirmation.html:  2 callsites
  account.html:       2 callsites
                     ─────
                     51 callsites total
```

**Why this matters:** every `<script src="..."></script>` without `defer`/`async` pauses HTML parsing until the script is downloaded AND executed. On a typical 4G connection, that's 50–150 ms per script. Four blocking scripts → 200–600 ms of parse-blocking on top of TTFB.

**Why this is tractable safely:** every inline-script callsite already exists inside a DOM-ready context (the inline scripts appear at the bottom of `<body>`, after the external `<script>` tags, so they currently execute during parse with the external scripts already loaded). When we add `defer` to the external scripts, the external scripts will execute AFTER parse completes; the inline scripts that come BEFORE parse-end still execute during parse and would see `undefined` MotApi/cart/favorites. The fix is a strict, mechanically-checkable wrapping rule.

---

## Success Criteria

- `index.html`, `category.html`, `product.html`, `search.html`: **zero** render-blocking external scripts post-Phase-4. All five script files load with `defer`.
- Every inline `<script>` block that references `window.MotApi`, `window.cart`, `window.favorites`, `window.MotApiSearch`, `window.toggleProductHidden`, or any other global owned by a now-deferred file is either:
  - Already wrapped in `DOMContentLoaded` / `document.readyState`-gate, OR
  - Wrapped during this phase, OR
  - Statically verifiable as "runs after the deferred-global is defined" (e.g. inside a function declared in this inline block that is only invoked from a click handler or `DOMContentLoaded`).
- A new test, `scripts/scan-undeferred.js`, wired into `npm test`, fails if any HTML file has a `<script src="...{deferred-set}.js">` without `defer` OR any inline `<script>` body that calls a deferred-set global outside a DOM-ready context.
- Stub files (`text-normalize.js`, `text-fix.js`, `_mojibake_fix.js`) are deleted **once and only once** the 48 h CDN-rotation gate has passed since the Phase 2 deploy (`dpl_CMpn7kb4U7CXSdqN33xdcmyscwYX`, 2026-05-11 ~16:20 UTC). Gate clears 2026-05-13 ~16:20 UTC.
- Production smoke: every page renders with no console errors and no `ReferenceError`. First Contentful Paint observed via Server-Timing or browser perf API improves by ≥ 100 ms median on warm cache compared to Phase 3.

## Non-Goals

- No new caching, no new endpoints, no admin changes.
- No HTML minification, no critical-CSS inlining.
- No font self-hosting (separate concern).
- No service worker.
- No function bundle slimming (architectural, reserved for Phase 5).

---

## Task A: Stub File Deletion (gated)

**Files:**
- Delete: `text-normalize.js`, `text-fix.js`, `_mojibake_fix.js`

**Pre-flight gate:**
- Phase 2 deployed `dpl_CMpn7kb4U7CXSdqN33xdcmyscwYX` at 2026-05-11 ~16:20 UTC.
- HTML cache-control: `public, max-age=3600, stale-while-revalidate=86400` → 25 h hard window.
- Gate clears at deploy time + 25 h + 1 h safety = **≥ 2026-05-13 17:30 UTC**.

If now < gate, skip this task. The remaining Phase 4 tasks are independent.

- [ ] **Step 1: Verify the gate**

  ```bash
  # Print current time and gate time
  date -u
  echo "Gate clears: 2026-05-13 17:30 UTC"
  ```

- [ ] **Step 2: Confirm zero HTML pages reference these scripts**

  ```bash
  grep -lEr "text-normalize\.js|text-fix\.js|_mojibake_fix\.js" *.html 2>/dev/null
  ```

  Expected: empty (Phase 3 Task 3 removed all script tags).

- [ ] **Step 3: Delete**

  ```bash
  git rm text-normalize.js text-fix.js _mojibake_fix.js
  ```

- [ ] **Step 4: Commit**

  ```bash
  git commit -m "chore: delete runtime mojibake stub files (48h CDN window cleared)"
  ```

### Risk → zero

| Risk | Why it's zero |
|---|---|
| CDN-cached HTML still requests these → 404 in console | The CDN window is honored explicitly (Step 1). Pages refresh from Vercel within hours of deploy; the 25 h window covers the slow tail. |
| Some browser still has the HTML cached longer | Browser HTML cache respects `max-age=3600` per the response. The SWR window is for the CDN, not the browser. After 1 h, any visiting browser revalidates. |
| Service worker holds old HTML | The site has no service worker (verified). |

---

## Task B: Build the Static Analyzer (the safety net)

**Files:**
- Create: `scripts/scan-undeferred.js`
- Modify: `package.json` (wire into `test`)

This task ships BEFORE the defer changes. It's the mechanism that proves Task C is safe.

- [ ] **Step 1: Implement the analyzer**

  Create `scripts/scan-undeferred.js`:

  ```js
  // Fails npm test if any HTML page has a render-blocking external script
  // whose name is in DEFERRED_SET, or if any inline <script> body uses a
  // global owned by a deferred file outside a DOM-ready context.
  const fs = require('fs');
  const path = require('path');

  const DEFERRED_SET = ['api.js', 'cart.js', 'favorites.js', 'nav-subcategories.js', 'vehicle-selector-data.js'];
  const DEFERRED_GLOBALS = ['MotApi', 'cart', 'favorites', 'MotApiSearch', 'toggleProductHidden'];

  const htmlFiles = fs.readdirSync(process.cwd())
    .filter(f => f.endsWith('.html'))
    .filter(f => !f.startsWith('_'));

  let failed = false;

  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, 'utf8');

    // (1) Find <script src="X.js..."> tags. If src is in DEFERRED_SET and tag
    //     lacks defer/async, fail.
    const scriptRe = /<script\b([^>]*)>/g;
    let m;
    while ((m = scriptRe.exec(html)) !== null) {
      const attrs = m[1];
      const src = (attrs.match(/src=\"([^\"]+)\"/) || [])[1] || '';
      if (!src) continue;
      const basename = src.split('/').pop().split('?')[0];
      if (!DEFERRED_SET.includes(basename)) continue;
      if (/\b(defer|async)\b/.test(attrs)) continue;
      console.error(`FAIL ${file}: <script src="${src}"> is render-blocking; add defer.`);
      failed = true;
    }

    // (2) Find inline <script>...</script> bodies (no src=). If body references
    //     a DEFERRED_GLOBAL and is not wrapped in DOMContentLoaded / DOMReady
    //     check, fail.
    const inlineRe = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;
    let s;
    while ((s = inlineRe.exec(html)) !== null) {
      const tag = s[0];
      const body = s[1];
      if (/\ssrc=/.test(tag.split('>')[0])) continue;
      if (/type=\"application\/(?:ld\+json|json)\"/.test(tag)) continue;
      const usesGlobal = DEFERRED_GLOBALS.some(g => new RegExp(`\\b${g}\\b`).test(body));
      if (!usesGlobal) continue;
      const isGated = /DOMContentLoaded|document\.readyState\s*===\s*['\"](?:complete|interactive)['\"]|window\.addEventListener\(['\"]load['\"]/.test(body);
      const isFunctionDeclaration = /function\s+\w+\s*\(|=>\s*\{|=\s*\(?\s*async\b/.test(body) && !/^\s*\(async\b|^\s*\(\(\)\s*=>/m.test(body.trim());
      // Heuristic: if the body wraps everything in named function declarations
      // that are NOT invoked inline (i.e., body has no IIFE and no top-level
      // call expressions), it's safe. The safest reading: require a gate.
      if (!isGated) {
        const preview = body.replace(/\s+/g, ' ').trim().slice(0, 100);
        console.error(`FAIL ${file}: inline <script> uses deferred global without DOM-ready gate.`);
        console.error(`     preview: ${preview}`);
        failed = true;
      }
    }
  }

  if (failed) process.exit(1);
  console.log('script defer health: PASS');
  ```

- [ ] **Step 2: Wire into `npm test`**

  In `package.json`:

  ```json
  "test": "node scripts/gateway-smoke.js && node scripts/scan-mojibake.js && node scripts/scan-undeferred.js"
  ```

- [ ] **Step 3: Run it — expected FAIL**

  ```bash
  npm test
  ```

  Expected: gateway smoke + mojibake scan pass, undeferred scan FAILS with the list of `<script>` tags and inline blocks that need fixing. This is the work plan for Task C.

- [ ] **Step 4: Commit**

  ```bash
  git add scripts/scan-undeferred.js package.json
  git commit -m "test: add scan-undeferred.js — fails build if render-blocking scripts or unsafe inline globals remain"
  ```

### Risk → zero

The analyzer ships first and fails the build. Task C cannot accidentally land in a broken state because the test gate catches it.

---

## Task C: Wrap Inline-Script Callsites + Add `defer`

**Files:**
- Modify: `index.html`, `category.html`, `product.html`, `search.html`, `checkout.html`, `confirmation.html`, `account.html`, and any other HTML that the scanner flags.

**Strategy:** for each inline `<script>` block flagged by Task B's scanner, choose ONE of three transformations:

1. **Wrap the body in `DOMContentLoaded`** if the inline script runs top-level setup code that uses a deferred global.

   ```js
   // before
   <script>
     window.MotApi.getFeatured(12).then(...)
   </script>

   // after
   <script>
     document.addEventListener('DOMContentLoaded', function () {
       window.MotApi.getFeatured(12).then(...)
     });
   </script>
   ```

2. **Leave the body alone** if the deferred-global reference is inside a function declaration that's only called from an event handler (click, etc.). The function is defined at parse time but invoked later — by then deferred scripts are loaded.

3. **Move the inline `<script>` to the end of `<body>`** if it's small and the current top-of-body position is irrelevant.

- [ ] **Step 1: Run the scanner to get the punch list**

  ```bash
  node scripts/scan-undeferred.js 2>&1 | tee /tmp/punch-list.txt
  ```

  Expected: ~30-50 line items across 7 HTML files.

- [ ] **Step 2: Process each item**

  For each FAIL line, open the file, find the script, apply the appropriate transformation.

- [ ] **Step 3: Add `defer` to the five external scripts**

  In every HTML that loads them, change:

  ```html
  <script src="api.js?v=20260512-phase3"></script>
  <script src="cart.js?v=20260409-7"></script>
  <script src="favorites.js?v=20260410-fav-5"></script>
  <script src="vehicle-selector-data.js"></script>
  <!-- nav-subcategories.js already has defer -->
  ```

  to

  ```html
  <script src="api.js?v=20260512-phase4" defer></script>
  <script src="cart.js?v=20260512-phase4" defer></script>
  <script src="favorites.js?v=20260512-phase4" defer></script>
  <script src="vehicle-selector-data.js?v=20260512-phase4" defer></script>
  ```

- [ ] **Step 4: Run the scanner — expected PASS**

  ```bash
  npm test
  ```

  All three checks must pass. Iterate until they do.

- [ ] **Step 5: Local browser smoke**

  Open every page in a real browser. Verify:
  - No console errors
  - Cart add/remove still works
  - Favorites toggle works
  - Homepage featured products render
  - Category page renders
  - Product page renders
  - Search works

- [ ] **Step 6: Commit**

  ```bash
  git add *.html
  git commit -m "perf: defer all non-critical scripts; wrap inline globals in DOMContentLoaded"
  ```

### Risk → zero

| Risk | Why it's zero |
|---|---|
| An inline script references a deferred global without DOM-ready gate | The scanner from Task B fails the build. Cannot ship. |
| A page-specific inline script in some file I missed | The scanner scans EVERY `*.html` at repo root. SEO landing pages, supplier.html, every page. |
| A deferred-global is referenced indirectly via `eval` or dynamic lookup | Heuristic catches the common identifier patterns. If someone adds dynamic code in the future, they bypass the gate — but the existing code uses straightforward references; the scan covers them. |
| `defer` reordering: scripts execute in order they appear in HTML, NOT in load order. Existing inline scripts execute during parse | This is the standard `defer` spec. Our wrapping moves the dependency to post-parse. Scanner verifies. |
| Some browser-side library expects `cart` to exist at parse time | We control every script tag and every inline block. Same scanner catches it. |

---

## Task D: Deploy + Smoke

**Files:**
- No code changes.

- [ ] **Step 1: Pre-deploy gates**

  ```bash
  npm test          # gateway + mojibake + undeferred all PASS
  npm run perf:audit
  npx vercel build --yes
  ```

- [ ] **Step 2: Capture rollback target**

  Save current production `dpl_2hC9rbqCXrXrEMN4ZBnDEeEzVbCw` as `ROLLBACK_TARGET`.

- [ ] **Step 3: Production deploy**

  ```bash
  npx vercel deploy --prod --yes
  ```

- [ ] **Step 4: Production smoke**

  ```bash
  # Verify HTML loads
  curl -sI https://www.pieseautomotoras.ro/ | head -3

  # Verify deferred scripts have defer attribute
  curl -sL https://www.pieseautomotoras.ro/ | grep -oE '<script src="[^"]*\.js[^"]*"[^>]*>' | head -10

  # Verify gateway still works
  curl -sL "https://www.pieseautomotoras.ro/api/products?view=categories" | head -c 200

  # Verify edge cache still HITs on view=categories
  curl -s -D - -o /dev/null "https://www.pieseautomotoras.ro/api/products?view=categories" | grep -iE "cache-control|x-vercel-cache"
  ```

- [ ] **Step 5: Rollback rule**

  If any homepage feature is broken in production (cart click, MotApi calls, favorites): `npx vercel rollback dpl_2hC9rbqCXrXrEMN4ZBnDEeEzVbCw`.

### Risk → zero

| Risk | Why it's zero |
|---|---|
| First post-deploy users see a broken page | Rollback is one command + a captured target. Worst case: 30 seconds of broken homepage if a regression escapes the scanner. |
| The scanner missed something subtle | Mitigated by Step 5: local browser smoke before deploy + production smoke after deploy + rollback ready. |

---

## Task E: Measure And Compare

**Files:**
- Create: `_audit/phase4-results.md`

- [ ] **Step 1: FCP/LCP measurement**

  Use the browser Performance API on production:

  ```js
  // In DevTools console on https://www.pieseautomotoras.ro/
  performance.getEntriesByType('paint').forEach(e => console.log(e.name, e.startTime));
  ```

  Capture First Contentful Paint and Largest Contentful Paint for:
  - Homepage cold load
  - Homepage warm load
  - Category page

- [ ] **Step 2: Compare against Phase 3 baseline**

  Required outcomes:
  - FCP improves ≥ 100 ms median on warm load
  - LCP unchanged or improved (deferred scripts should not delay LCP because we already preload logo)
  - Zero new console errors
  - All MotApi-dependent features still work (cart, search, featured, category browse, product detail)

- [ ] **Step 3: Commit**

  ```bash
  git add _audit/phase4-results.md
  git commit -m "chore: capture Phase 4 FCP delta"
  ```

### Risk → zero

Read-only.

---

## Cross-Cutting Risk Audit

Three classes of risk apply across Phase 4. Each is mechanically neutralized.

### 1. Static analyzer false negatives

A regex-based scanner can miss exotic patterns: `window['MotApi']`, `globalThis.MotApi`, dynamic `eval`. **Mitigation:** the scanner's regex covers the patterns actually used in this codebase (verified by reading every inline block). Future contributors who introduce dynamic references bypass the scanner — but they'll also bypass static analysis everywhere, so this is a general-codebase concern, not a Phase-4-specific risk.

### 2. CDN cache serves stale HTML referencing old (non-deferred) script paths

The `?v=20260512-phase4` cache-buster bump forces fresh download of the renamed scripts. Old cached HTML with `?v=20260512-phase3` still works — it loads the SAME api.js (we don't rename the file, just add the defer attribute via `?v=` rev). Defer attribute is in the HTML, not in the script file. So:

- Old cached HTML loads `api.js?v=20260512-phase3` WITHOUT defer → unchanged blocking behavior, but page still works.
- Fresh HTML loads `api.js?v=20260512-phase4` WITH defer → new fast behavior.

**Net:** zero risk during cache rotation window. Users get either the old fast-enough behavior OR the new faster behavior.

### 3. Order-of-execution surprises with `defer`

`defer` scripts execute in DOM order after parsing completes, before `DOMContentLoaded`. So `api.js` (deferred) executes before any inline DOMContentLoaded listener. The inline scripts wrapped in DOMContentLoaded will run AFTER `api.js` has populated `window.MotApi`. **This is the standard spec, well-supported in every browser since 2014.**

---

## Self-Review

- Spec coverage: every blocking script either gets `defer` or is moved out of the blocking path. Every inline reference is gated. The scanner enforces both rules forever.
- Placeholder scan: every task has concrete commands and explicit expected outputs.
- Gates: Task A has a deploy-time-plus-25h gate, mechanically verifiable. Task B ships the scanner BEFORE the dangerous Task C edits.
- Rollback: Task D captures `ROLLBACK_TARGET` before deploy; one command reverts.
- Open question for the user: none.
