# Unwrap Phase 4 — Phase 6

> **Honest preface:** Phase 4's `phase4-defer-gate` wrap caused three production regressions in a row:
> 1. Trapped inner `DOMContentLoaded` listeners → category pages showed "0 produse"
> 2. Outer gate mangled by over-eager unwrap → `__run` executed before defer scripts
> 3. Function declarations scoped into the closure → every inline `onclick` (add-to-cart, open-cart, filters, mobile menu, cookie banner) silently failed
>
> The bandaid fixes work but the design is unsalvageable. Phase 6 removes the wrap entirely and replaces it with explicit lazy initialization, which is the architecture I should have used in Phase 4.

**Goal:** make every inline `onclick` handler work again without depending on the bandaid `phase4-expose-globals` block. Preserve the original reason the wrap existed (deferred globals like `MotorasVehicleData` must be available before code uses them).

**Architecture:** flat top-level inline scripts. Function declarations are script-scope (= window-accessible). Variables that depend on deferred globals start as `let X = {}` and get assigned inside one `DOMContentLoaded` listener.

---

## Success Criteria

- Zero `phase4-defer-gate` markers anywhere in HTML.
- Zero `phase4-expose-globals` blocks anywhere in HTML.
- Every inline `<button onclick="FOO()">` works on every page (add-to-cart, cart open/close, filters, mobile menu, search, vehicle selector, cookie banner).
- No `ReferenceError` in console on any page.
- `npm test` still passes with the updated scanner.
- `/api/products` latency unchanged (this is a client-side refactor).

---

## Task 1: Audit Every Wrapped Block

**Files:**
- Read-only audit of: `account.html`, `category.html`, `checkout.html`, `confirmation.html`, `index.html`, `product.html`, `search.html`

Per page, identify:
- Top-level statements between `var __run = function () {` and `};` that reference `window.MotorasVehicleData` (or any other deferred global) at parse-time evaluation.
- Bottom-of-body invocations (IIFEs, function calls) that should run at DOM-ready.

Expected pattern (all 4 main pages): `const MODELS = window.MotorasVehicleData?.MODELS || {}; const YEARS = window.MotorasVehicleData?.YEARS || {};` near the top, plus an async IIFE at the bottom that calls `loadCategoryCatalog`/page init.

---

## Task 2: Unwrap + Refactor

**Files:** every HTML with a `phase4-defer-gate` marker.

For each wrapped block:

1. Strip the outer IIFE `(function () { var __run = function () { ... }; if (document.readyState ...) ... })()`.
2. Strip the `/* phase4-expose-globals */ try { Object.assign(window, {...}); } catch (_) {}` line.
3. Top-level `const X = window.SomeGlobal.Y || {}` → `let X = {};` (uninitialized at parse time).
4. Add at end of the block: `document.addEventListener('DOMContentLoaded', () => { X = window.SomeGlobal.Y || {}; ... });` — populates the lazy variables.
5. Bottom-of-body IIFEs (`(async () => { ... })();`) that depend on deferred globals: move INTO the same DOMContentLoaded listener so they run after the lazy variables are populated.

After unwrap:
- Function declarations are script-scope (= globally accessible from inline `onclick`).
- Variables read lazily at DOM-ready time.
- One simple `DOMContentLoaded` listener replaces the entire wrap.

---

## Task 3: Update The Scanner

**Files:** `scripts/scan-undeferred.js`

Drop the now-obsolete checks:
- "phase4-defer-gate block has nested document.addEventListener"
- "phase4-defer-gate outer gate is missing or mangled"

Add a new, simpler check:
- Inside any inline `<script>` body, no **top-level** read of a deferred global (`MotorasVehicleData`, etc.) outside a `DOMContentLoaded` listener.

Heuristic: scan for top-level statements (depth 0 in brace tracking) that reference `window.MotorasVehicleData`. If found AND not inside a `function` declaration body or a `DOMContentLoaded` listener body, fail.

Conservative trade-off: it's OK to false-positive on legitimate-but-unusual code; better to flag than miss.

---

## Task 4: Deploy + Smoke

- [ ] Pre-deploy: `npm test` passes
- [ ] Capture rollback target
- [ ] `vercel deploy --prod --yes`
- [ ] Production smoke:
  - product page: hit add-to-cart, verify cart drawer opens
  - category page: apply a filter, verify list updates
  - homepage: search vehicle selector
  - mobile menu toggle works (test via DevTools mobile preview)
  - cookie banner accept/decline buttons

---

## Risk → zero

| Risk | Mitigation |
|---|---|
| Some inline script has a top-level statement I miss that depends on a deferred global | Task 1's audit + scanner check catches all known patterns. After unwrap, the page still loads (parse doesn't fail); the missed statement just produces `undefined` at parse time. The DOMContentLoaded init catches it on the second pass. |
| Removing the wrap breaks a page in some other way | Local smoke + production smoke before declaring done. Rollback target captured. |
| Functions that were inside the closure relied on closure variables | Audit will detect any non-global state. None expected because the original code (pre-Phase 4) had everything at script scope. |
| Scanner regression — new check has false negatives | Acceptable. Tighten over time as new patterns emerge. |

---

## What this delivers

- One single tested pattern across all 7 HTML files (down from the current mix of wrap + bandaid).
- Inline `onclick` handlers naturally find their functions on `window` (no exposure trick needed).
- No more "this clicks does nothing" reports from users.
- Scanner enforces the simpler rule going forward.

After Phase 6 the codebase returns to the "scripts are deferred, inline scripts use DOMContentLoaded when they need deferred globals" pattern — which is the standard web pattern Phase 4 deviated from.
