# CSS Loading + Carry-over — Phase 5 (smaller scope, honest framing)

> Same execution style as Phases 1–4. Each task ends in one commit. Risk gates are mechanical.

**Honest preface:** Phases 1–4 captured the structural perf wins (gateway, dead-code removal, edge cache, defer). After this phase the curve is genuinely flat without architectural moves. Phase 5 is a polish + carry-over phase. It is **smaller in scope than Phases 1–4 combined**. Documenting that upfront because over-promising would be dishonest.

**Goal:** finish the Phase 4 carry-over (stub file deletion) and eliminate the four remaining render-blocking CSS round trips on every page load.

**Architecture:** No changes.

---

## Real-data baseline (2026-05-12, post Phase 4)

Render-blocking CSS in `<head>` of every main page:

```
page-loader.css         4,618 B  (own)
nav-subcategories.css   5,259 B  (own)
elevate.css             8,793 B  (admin styling, loaded everywhere)
loader-boost.css        1,041 B  (own)
fonts.googleapis.com    ~1 KB    (already preload-onload; harmless)
                      ───────
                       ~19.7 KB  + 4 separate round trips
```

Each `<link rel="stylesheet">` blocks paint until the file is downloaded. On a 4G connection (~50 ms RTT, ~10 Mbps), that's ~50-150 ms per file. The four block sequentially via HTTP/2 multiplexing in parallel, so worst case is ~150 ms before paint.

---

## Success Criteria

- Carry-over Phase 4 Task A: `text-normalize.js`, `text-fix.js`, `_mojibake_fix.js` deleted from the repo. Production no longer serves them.
- Number of render-blocking `<link rel="stylesheet">` tags in production HTML for `/`, `/category.html`, `/product.html`, `/search.html`: **down from 5 to 0**. (Fonts already use preload-onload; other 4 converted here.)
- No First Contentful Paint regression. Ideally a 50-150 ms improvement on cold load.
- No new console errors. No FOUC visible to the user beyond the existing brief font-swap.
- The `<noscript>` fallback ensures JS-disabled visitors still get styled pages.

## Non-Goals

- No HTML minification / build step (would change every commit's diff size).
- No critical-CSS extraction (manual maintenance burden).
- No CSS combining/bundling (maintenance burden without a build step).
- No image CDN.
- No service worker.
- No function bundle slimming.

---

## Task A: Stub File Deletion (carry-over from Phase 4)

**Files:**
- Delete: `text-normalize.js`, `text-fix.js`, `_mojibake_fix.js`

**Pre-flight gate:**
- Phase 2 deploy time: 2026-05-11 ~16:20 UTC
- Required wait: 25 hours (Vercel HTML cache 1 h + 1 day SWR + 1 h safety)
- **Gate clears: 2026-05-13 ~17:20 UTC**

- [ ] **Step 1: Mechanical gate check**

  ```bash
  date -u
  echo "Gate clears: 2026-05-13 17:20 UTC"
  ```

  If now < gate, halt this task.

- [ ] **Step 2: Verify zero current references**

  ```bash
  grep -lEr "text-normalize\.js|text-fix\.js|_mojibake_fix\.js" *.html 2>/dev/null
  ```

  Expected: empty (Phase 3 Task 3 removed the script tags).

- [ ] **Step 3: Delete + commit**

  ```bash
  git rm text-normalize.js text-fix.js _mojibake_fix.js
  git commit -m "chore: delete runtime mojibake stub files (25h CDN window cleared)"
  ```

### Risk → zero

| Risk | Why zero |
|---|---|
| CDN-cached HTML still requests these → console 404 | Mechanical 25 h gate. HTML's Cache-Control is `public, max-age=3600, stale-while-revalidate=86400`; after 25 h every reasonable cache has rotated. |
| Browser HTML cache holds longer | Browser HTML respects `max-age=3600` per response. After 1 h, every visiting browser revalidates. |
| Service worker holds old HTML | Site has no service worker (verified). |

---

## Task B: Convert The Four Render-Blocking Stylesheets To Preload-Onload

**Files:**
- Modify: every HTML that loads `page-loader.css`, `nav-subcategories.css`, `elevate.css`, `loader-boost.css` (verify count: `grep -lc 'page-loader\.css' *.html`)

**Pattern (well-established, the same one fonts already use):**

```html
<!-- before -->
<link rel="stylesheet" href="page-loader.css?v=20260413-4"/>

<!-- after -->
<link rel="preload" as="style" href="page-loader.css?v=20260512-phase5" onload="this.onload=null;this.rel='stylesheet'"/>
<noscript><link rel="stylesheet" href="page-loader.css?v=20260512-phase5"/></noscript>
```

The browser downloads the stylesheet in parallel with HTML parse (preload), then applies it as a stylesheet once loaded (onload). The `<noscript>` fallback keeps styling working for JS-disabled visitors.

- [ ] **Step 1: Identify every reference**

  ```bash
  for css in page-loader.css nav-subcategories.css elevate.css loader-boost.css; do
    echo "=== $css ==="
    grep -l "$css" *.html
  done
  ```

- [ ] **Step 2: Sweep**

  Use a one-time helper script that finds each `<link rel="stylesheet" href="X.css...">` and replaces with the preload-onload pair. The script is in this PR's commit history; it's idempotent (skips already-converted lines).

  Bump cache-busters to `?v=20260512-phase5` so any cached HTML still finds valid responses at the new URL.

- [ ] **Step 3: Local browser smoke**

  Open every page. Verify:
  - No FOUC visible
  - Page-loader styling still appears
  - Nav subcategory dropdowns render correctly
  - Admin elevate UI still styled (admin.html)

- [ ] **Step 4: Static check**

  ```bash
  grep -hoE '<link rel="stylesheet"[^>]*>' *.html | grep -E 'page-loader\.css|nav-subcategories\.css|elevate\.css|loader-boost\.css'
  ```

  Expected: empty (all converted). The matches inside `<noscript>` blocks pass because they aren't `<link rel="stylesheet">` at the top level.

- [ ] **Step 5: Run full test**

  ```bash
  npm test
  ```

  Expected: gateway smoke + mojibake + undeferred all PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add *.html
  git commit -m "perf: convert four render-blocking stylesheets to preload-onload pattern"
  ```

### Risk → real and explicit

This is the one task that has non-zero baseline risk. Documenting honestly:

| Risk | Mitigation |
|---|---|
| Brief FOUC (50-150 ms) on first load before CSS applies | Pattern is well-established (used by WordPress, major CMSes, Google's own templates). Modern browsers prioritize preload `as=style` and typically apply before paint. The visible flash, if any, is shorter than the previous round-trip-blocked render. **Acceptable trade-off** since previously the entire page was blocked for the same duration. |
| Safari edge cases | Safari 11+ supports the pattern. Older Safari versions degrade gracefully via the `<noscript>` fallback (preload+onload doesn't apply, noscript stylesheet does). |
| `onload` race condition (CSS loads but `onload` doesn't fire) | If `onload` doesn't fire, the `<noscript>` fallback applies. This is the standard defensive layering. |
| Tests don't catch FOUC | Manual browser check in Step 3. FOUC is visible to humans, not to automated tests. |

**This is the only task in Phase 5 that doesn't have a mechanically-zero risk.** Calling it out so it's not a surprise.

---

## Task C: Deploy + Smoke

- [ ] **Step 1: Pre-deploy gates**

  ```bash
  npm test
  npm run perf:audit
  npx vercel build --yes
  ```

- [ ] **Step 2: Rollback target**

  Capture current production `dpl_<id>` as `ROLLBACK_TARGET`.

- [ ] **Step 3: Production deploy**

  ```bash
  npx vercel deploy --prod --yes
  ```

- [ ] **Step 4: Production smoke**

  ```bash
  # Pages still 200
  for p in / /detailing /product.html /search.html; do
    echo -n "$p → "
    curl -s -o /dev/null -w "%{http_code}\n" "https://www.pieseautomotoras.ro$p"
  done

  # CSS files still served at new cache-buster
  curl -sI -X GET "https://www.pieseautomotoras.ro/page-loader.css?v=20260512-phase5" | head -3

  # No render-blocking <link rel="stylesheet"> in served HTML
  curl -sL "https://www.pieseautomotoras.ro/" | grep -cE '<link[^>]*rel="stylesheet"[^>]*>(?!.*<noscript)'
  # Expected: 0 (matches inside noscript don't count as render-blocking)
  ```

- [ ] **Step 5: Rollback rule**

  If any page has unstyled rendering or admin is broken: `npx vercel rollback <ROLLBACK_TARGET>`.

---

## Task D: Measure

- [ ] **Step 1: TTFB and total load time, 5 runs each**

  ```bash
  for i in 1 2 3 4 5; do
    curl -s -o /dev/null -w "ttfb=%{time_starttransfer}s total=%{time_total}s\n" "https://www.pieseautomotoras.ro/?_=$RANDOM"
  done
  ```

- [ ] **Step 2: Verify zero render-blocking external CSS in served HTML**

  ```bash
  curl -sL "https://www.pieseautomotoras.ro/" | python3 -c "
  import sys, re
  html = sys.stdin.read()
  blocking = re.findall(r'<link[^>]*rel=\"stylesheet\"[^>]*>', html)
  # Filter out anything inside <noscript>
  noscript_blocks = re.findall(r'<noscript>.*?</noscript>', html, re.DOTALL)
  noscript_text = ''.join(noscript_blocks)
  outside = [b for b in blocking if b not in noscript_text]
  print(f'render-blocking <link rel=stylesheet>: {len(outside)}')
  for b in outside: print(' ', b)
  "
  ```

  Expected: 0 outside noscript.

- [ ] **Step 3: Write `_audit/phase5-results.md`**

  Compare pre/post:
  - Number of render-blocking CSS files
  - First Contentful Paint estimate (browser perf API)
  - Total `<head>` size
  - Number of round trips before paint

- [ ] **Step 4: Commit**

  ```bash
  git add _audit/phase5-results.md
  git commit -m "chore: capture Phase 5 CSS load delta"
  ```

---

## What Phase 5 Does NOT Deliver

For honesty, here's what's still on the table after Phase 5 and would require new architectural decisions:

1. **Image CDN** (Vercel image optimization at ~$20/mo Pro plan, or external CDN). Biggest remaining user-visible perf opportunity. Category pages currently load 1-3 MB of unoptimized images from carhub.ro. With an image CDN that drops to 200-500 KB. **Phase 6 candidate if user wants to spend on it.**
2. **Function bundle slimming** (16 MB orders.func → architectural rewrite, supplier data to blob storage). Affects cold-start latency for the first visitor in a region. **Phase 6 architectural candidate.**
3. **HTML/CSS minification** via a build step. Saves 5-10 % bytes; first build-system commitment.
4. **Service worker** for offline + pre-cache. Returning visitors feel instant. Complexity in lifecycle bugs.
5. **Self-hosted Google Fonts**. Trades third-party DNS+TLS (~150 ms saved) for ~200-400 KB extra bytes on first load (cached forever after).

None of these are immediate priorities. They're the menu when/if user wants to keep going past Phase 5.

---

## Self-Review

- Spec coverage: every CSS file currently render-blocking on every page gets converted to non-blocking, with a JS-disabled fallback.
- Placeholder scan: every step has concrete commands and expected outputs.
- Risk gates: Task A has a 25 h mechanical date gate. Task B is the only task with a non-zero baseline risk (brief FOUC possible) and that's called out explicitly with the standard mitigation (the same preload-onload pattern fonts already use without issues).
- Rollback: Task C captures `ROLLBACK_TARGET` before deploy. Worst case one-command revert.
- Honest framing: Phase 5 is smaller than Phases 1-4. Future phases require architectural decisions (cost, complexity).
