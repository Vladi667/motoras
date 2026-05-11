# Supplier Gateway Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild product loading around a fast supplier gateway so the storefront never downloads or parses giant catalog/feed files, while preserving Admin supplier margins, supplier enable/disable controls, supplier browsing, and order workflows.

**Architecture:** Keep the storefront static and lightweight. Move all catalog composition, supplier visibility, margin application, product overrides, pagination, and caching into server-side gateway modules. Supplier-specific code becomes small adapters behind one shared contract, so adding a new supplier later means creating one adapter file and registering it.

**Tech Stack:** Vercel Serverless Functions, plain Node.js CommonJS, static HTML/CSS/JS, Upstash Redis REST when configured, Stripe APIs, existing `nodemailer` and `pdfkit` dependencies.

---

## Success Criteria

- Homepage initial load does not fetch `catalog.json`, `catalog-lite.json`, `catalog-micro.json`, `supplier-feed.xml`, or `supplier-feed-globiz.xml`.
- Category/search pages request paginated JSON from `/api/products` and render the first page without loading the full catalog in the browser.
- Product pages request one product by id from `/api/products?id=...` and do not fetch full catalog snapshots.
- Admin supplier margin changes continue to update website prices.
- Admin supplier enable/disable continues to hide or show all products from that supplier.
- Admin supplier browse modal still works for all suppliers.
- Admin dashboard still shows catalog totals, low-stock products, supplier queue, and ordered products.
- Product overrides support hiding one individual product without disabling the whole supplier.
- Adding a new supplier requires one adapter file plus one registry entry.
- Vercel function bundles stop duplicating the full `catalog.json` into unrelated functions such as orders, admin auth, and supplier endpoints.

## Non-Goals

- Do not redesign the website visually.
- Do not change checkout UX.
- Do not change Stripe payment behavior except where order enrichment reads product source.
- Do not split suppliers into separate Vercel projects in this first implementation. The adapter boundary must make that possible later without storefront changes.
- Do not add a heavy framework or build system.

## Current Behavior To Preserve

- `api/admin/[action].js` stores supplier margins in Upstash under `motoras:supplier_margins`.
- Existing supplier keys are `bravus`, `carhub`, `globiz`, `bardi`, and `casabateriilor`.
- Existing default margins are `bravus: 30`, `carhub: 25`, `globiz: 22`, `bardi: 35`, and `casabateriilor: 28`.
- The frontend currently applies supplier visibility with `margins[p.source]?.enabled !== false`.
- The frontend currently applies price margin as `price * (1 + margin / 100)`.
- Admin dashboard JS uses `/api/admin/margins`, `/api/admin/dashboard`, `/api/<supplier>`, `/api/products`, and order endpoints.

## Target File Structure

- Create `lib/api/catalog/types.js`: shared product normalization, source key validation, paging helpers, and response shape helpers.
- Create `lib/api/catalog/admin-config.js`: read/write supplier margins and product overrides from Upstash with safe defaults.
- Create `lib/api/catalog/apply-admin-rules.js`: apply supplier enabled flags, margins, and individual product overrides.
- Create `lib/api/catalog/cache.js`: small in-memory TTL cache plus optional Upstash cache helpers.
- Create `lib/api/catalog/registry.js`: supplier adapter registry and helper methods for all suppliers.
- Create `lib/api/catalog/gateway.js`: query orchestration for `/api/products`, summaries, featured products, product detail, and supplier-specific browsing.
- Create `lib/api/suppliers/bravus.js`: adapter for Bravus using the existing Bravus parsing logic.
- Create `lib/api/suppliers/carhub.js`: adapter for CarHub using the existing XML parsing logic.
- Create `lib/api/suppliers/globiz.js`: adapter for Globiz using the existing XML parsing logic.
- Create `lib/api/suppliers/bardi.js`: adapter for Bardi using the existing Bardi parsing logic.
- Create `lib/api/suppliers/casabateriilor.js`: adapter for Casa Bateriilor using the existing fetch/static price logic.
- Modify `api/products/index.js`: delegate all product requests to the gateway.
- Modify `api/bravus/index.js`, `api/carhub/index.js`, `api/globiz/index.js`, `api/bardi/index.js`, `api/casabateriilor/index.js`: use registry adapters instead of duplicated supplier-specific logic.
- Modify `api/admin/[action].js`: read dashboard data from gateway summaries and expose product override endpoints.
- Modify `api/orders.js`: remove top-level full-catalog import and use a lightweight gateway lookup only when enriching order details.
- Modify `api/product-sitemap.js`: generate sitemap from gateway ids without importing the full catalog into unrelated functions.
- Modify `api.js`: make browser API remote-first only for products/category/search/homepage/product detail; remove direct catalog/feed fallback from normal storefront paths.
- Modify `index.html`, `category.html`, `product.html`, and `search.html`: remove catalog preload links and ensure page scripts call paginated/targeted API methods.
- Modify `admin-dashboard.js`: preserve current supplier margin UI and add individual product hide/show override actions in supplier browse modal.
- Modify `.vercelignore`: exclude scratch files, raw generated chunks, local browser profiles, deploy zips, and unrelated brand assets.
- Create `scripts/perf-audit.js`: local checks for payload sizes, accidental catalog preloads, and Vercel function bundle risks.
- Create `scripts/gateway-smoke.js`: local smoke tests against gateway functions without needing a Vercel deploy.
- Modify `package.json`: add `test`, `test:gateway`, and `perf:audit` scripts.

---

## Shared Contracts

### Canonical Product Shape

Every adapter must return products shaped like this before Admin rules are applied:

```js
{
  id: 'supplier-stable-id',
  sku: 'supplier-sku-or-id',
  source: 'bardi',
  name: 'Product name',
  brand: 'Brand',
  cat: 'uleiuri',
  subcat: 'ulei-motor',
  price: 123.45,
  stock: 4,
  img: 'https://...',
  images: ['https://...'],
  desc: 'Short description',
  oem: 'OEM or SKU',
  compat: '',
  specs: {},
  eta: ''
}
```

### Adapter Contract

Every supplier adapter must export this shape:

```js
module.exports = {
  key: 'bardi',
  label: 'Bardi',
  async list(params = {}) {},
  async getById(id) {},
  async summary(params = {}) {},
  async health() {}
};
```

`list(params)` returns `{ ok, source, total, page, pages, items }`.

`getById(id)` returns `{ ok, source, item }` or `{ ok: false, status: 404, error }`.

`summary(params)` returns `{ ok, source, totalItems, totalBrands, brands, categories }`.

`health()` returns `{ ok, source, status, detail }`.

### Product Override Shape

Store overrides under Upstash key `motoras:product_overrides`.

```js
{
  "bardi:12345": {
    "hidden": true,
    "priceOverride": null,
    "stockOverride": null,
    "nameOverride": "",
    "updatedAt": "2026-04-24T00:00:00.000Z"
  }
}
```

Override key format is `${source}:${id}`. Use the product `sku` as a fallback only when `id` is missing.

---

## Task 1: Add Gateway Test Harness

**Files:**
- Create: `scripts/gateway-smoke.js`
- Modify: `package.json`

- [ ] **Step 1: Create the smoke-test script**

Create `scripts/gateway-smoke.js` with:

```js
const assert = require('assert');

async function run() {
  const { normalizeProduct, paginateItems, normalizeSourceKey } = require('../lib/api/catalog/types');

  assert.strictEqual(normalizeSourceKey(' Bardi '), 'bardi');
  assert.strictEqual(normalizeSourceKey('Casa Bateriilor'), 'casabateriilor');

  const product = normalizeProduct({
    id: 123,
    source: 'Bardi',
    name: 'Test Oil',
    price: '100.50',
    stock: '3',
  });

  assert.strictEqual(product.id, '123');
  assert.strictEqual(product.source, 'bardi');
  assert.strictEqual(product.price, 100.5);
  assert.strictEqual(product.stock, 3);
  assert.strictEqual(product.inStock, true);

  const page = paginateItems([1, 2, 3, 4, 5], { page: 2, limit: 2 });
  assert.deepStrictEqual(page.items, [3, 4]);
  assert.strictEqual(page.total, 5);
  assert.strictEqual(page.page, 2);
  assert.strictEqual(page.pages, 3);

  console.log('gateway smoke tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Add package scripts**

Modify `package.json` scripts to include:

```json
"scripts": {
  "test": "node scripts/gateway-smoke.js",
  "test:gateway": "node scripts/gateway-smoke.js",
  "perf:audit": "node scripts/perf-audit.js"
}
```

Preserve existing `dependencies` and `devDependencies`.

- [ ] **Step 3: Run the failing test**

Run:

```bash
npm test
```

Expected: FAIL with `Cannot find module '../lib/api/catalog/types'`.

- [ ] **Step 4: Commit**

```bash
git add package.json scripts/gateway-smoke.js
git commit -m "test: add gateway smoke harness"
```

---

## Task 2: Create Shared Catalog Types

**Files:**
- Create: `lib/api/catalog/types.js`
- Test: `scripts/gateway-smoke.js`

- [ ] **Step 1: Implement shared type helpers**

Create `lib/api/catalog/types.js`:

```js
function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeSourceKey(value) {
  const normalized = normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (normalized === 'casa-bateriilor') return 'casabateriilor';
  return normalized || 'catalog';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toPositiveInt(value, fallback, max) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return typeof max === 'number' ? Math.min(parsed, max) : parsed;
}

function normalizeImageList(value) {
  const list = Array.isArray(value) ? value : [value];
  return Array.from(new Set(
    list.map(item => normalizeText(item)).filter(Boolean)
  ));
}

function normalizeProduct(item = {}) {
  const id = normalizeText(item.id || item.sku);
  const sku = normalizeText(item.sku || item.id);
  const source = normalizeSourceKey(item.source);
  const price = toNumber(item.price, 0);
  const stock = toNumber(item.stock, 0);
  const images = normalizeImageList(item.images && item.images.length ? item.images : item.img);

  return {
    ...item,
    id,
    sku,
    source,
    name: normalizeText(item.name || item.title || sku || id),
    brand: normalizeText(item.brand || item.subcatLabel || 'General'),
    cat: normalizeText(item.cat || item.category || 'piese'),
    subcat: normalizeText(item.subcat || item.subcategory || 'general'),
    price,
    stock,
    inStock: stock > 0,
    img: normalizeText(item.img || images[0] || 'assets/product-placeholder.svg'),
    images,
    desc: normalizeText(item.desc || item.description || ''),
    oem: normalizeText(item.oem || sku || id),
    compat: normalizeText(item.compat || ''),
    specs: item.specs && typeof item.specs === 'object' ? item.specs : {},
    eta: normalizeText(item.eta || ''),
  };
}

function paginateItems(items, params = {}) {
  const page = toPositiveInt(params.page, 1, 100000);
  const limit = toPositiveInt(params.limit, 24, 500);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * limit;

  return {
    total,
    page: safePage,
    pages,
    limit,
    items: items.slice(start, start + limit),
  };
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

module.exports = {
  json,
  normalizeProduct,
  normalizeSourceKey,
  normalizeText,
  paginateItems,
  toNumber,
  toPositiveInt,
};
```

- [ ] **Step 2: Run the smoke test**

Run:

```bash
npm test
```

Expected: PASS with `gateway smoke tests passed`.

- [ ] **Step 3: Commit**

```bash
git add lib/api/catalog/types.js scripts/gateway-smoke.js package.json
git commit -m "feat: add shared catalog type helpers"
```

---

## Task 3: Add Admin Config Layer

**Files:**
- Create: `lib/api/catalog/admin-config.js`
- Modify: `api/admin/[action].js`
- Test: `scripts/gateway-smoke.js`

- [ ] **Step 1: Create Admin config module**

Create `lib/api/catalog/admin-config.js`:

```js
const { normalizeSourceKey } = require('./types');

const KV_URL = process.env.UPSTASH_REDIS_REST_KV_REST_API_URL;
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
const MARGINS_KEY = 'motoras:supplier_margins';
const OVERRIDES_KEY = 'motoras:product_overrides';

const SUPPLIERS = ['bravus', 'carhub', 'globiz', 'bardi', 'casabateriilor'];

const DEFAULT_MARGINS = {
  bravus: { enabled: true, margin: 30 },
  carhub: { enabled: true, margin: 25 },
  globiz: { enabled: true, margin: 22 },
  bardi: { enabled: true, margin: 35 },
  casabateriilor: { enabled: true, margin: 28 },
};

async function kvExec(command) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const res = await fetch(KV_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });
    return res.json();
  } catch (_) {
    return null;
  }
}

async function kvGet(key) {
  const data = await kvExec(['GET', key]);
  const raw = data && data.result;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return raw;
  }
}

async function kvSet(key, value) {
  const data = await kvExec(['SET', key, JSON.stringify(value)]);
  return data && data.result === 'OK';
}

function sanitizeMarginConfig(input = {}) {
  const merged = { ...DEFAULT_MARGINS };
  SUPPLIERS.forEach((key) => {
    const source = input[key];
    if (!source || typeof source !== 'object') return;
    merged[key] = {
      enabled: Boolean(source.enabled),
      margin: Math.max(0, Math.min(500, Number(source.margin) || 0)),
    };
  });
  return merged;
}

async function readMargins() {
  const stored = await kvGet(MARGINS_KEY);
  if (stored && typeof stored === 'object') return sanitizeMarginConfig(stored);
  return { ...DEFAULT_MARGINS };
}

async function writeMargins(input) {
  const merged = sanitizeMarginConfig({ ...(await readMargins()), ...(input || {}) });
  const persisted = await kvSet(MARGINS_KEY, merged);
  return { margins: merged, persisted };
}

function overrideKey(source, id) {
  return `${normalizeSourceKey(source)}:${String(id || '').trim()}`;
}

function sanitizeOverride(input = {}) {
  return {
    hidden: Boolean(input.hidden),
    priceOverride: input.priceOverride === null || input.priceOverride === '' || input.priceOverride === undefined
      ? null
      : Math.max(0, Number(input.priceOverride) || 0),
    stockOverride: input.stockOverride === null || input.stockOverride === '' || input.stockOverride === undefined
      ? null
      : Math.max(0, Number(input.stockOverride) || 0),
    nameOverride: String(input.nameOverride || '').trim(),
    updatedAt: new Date().toISOString(),
  };
}

async function readProductOverrides() {
  const stored = await kvGet(OVERRIDES_KEY);
  return stored && typeof stored === 'object' ? stored : {};
}

async function writeProductOverride(source, id, input) {
  const key = overrideKey(source, id);
  const all = await readProductOverrides();
  all[key] = sanitizeOverride(input);
  const persisted = await kvSet(OVERRIDES_KEY, all);
  return { key, override: all[key], overrides: all, persisted };
}

async function deleteProductOverride(source, id) {
  const key = overrideKey(source, id);
  const all = await readProductOverrides();
  delete all[key];
  const persisted = await kvSet(OVERRIDES_KEY, all);
  return { key, overrides: all, persisted };
}

module.exports = {
  DEFAULT_MARGINS,
  MARGINS_KEY,
  OVERRIDES_KEY,
  SUPPLIERS,
  deleteProductOverride,
  overrideKey,
  readMargins,
  readProductOverrides,
  sanitizeMarginConfig,
  sanitizeOverride,
  writeMargins,
  writeProductOverride,
};
```

- [ ] **Step 2: Extend smoke test for config**

Append these assertions inside `run()` in `scripts/gateway-smoke.js`:

```js
  const { sanitizeMarginConfig, overrideKey, sanitizeOverride } = require('../lib/api/catalog/admin-config');
  const config = sanitizeMarginConfig({ bardi: { enabled: false, margin: 42 } });
  assert.strictEqual(config.bardi.enabled, false);
  assert.strictEqual(config.bardi.margin, 42);
  assert.strictEqual(config.carhub.enabled, true);
  assert.strictEqual(overrideKey('Bardi', 'ABC'), 'bardi:ABC');
  assert.deepStrictEqual(
    sanitizeOverride({ hidden: true, priceOverride: '88.5', stockOverride: '2', nameOverride: 'Custom' }).hidden,
    true
  );
```

- [ ] **Step 3: Run test**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Replace duplicate Admin margin helpers**

In `api/admin/[action].js`, replace local `KV_URL`, `KV_TOKEN`, `MARGINS_KEY`, `SUPPLIERS`, `DEFAULTS`, `kvExec`, `kvGet`, `kvSet`, and `readMargins` definitions with imports:

```js
const {
  SUPPLIERS,
  readMargins,
  writeMargins,
  readProductOverrides,
  writeProductOverride,
  deleteProductOverride,
} = require('../../lib/api/catalog/admin-config');
```

Update `handleMargins` POST save logic to:

```js
const input = body.margins || body;
const { margins, persisted } = await writeMargins(input);
return json(res, 200, { ok: true, margins, persisted });
```

- [ ] **Step 5: Add Admin product override route**

In `api/admin/[action].js`, add:

```js
async function handleProductOverrides(req, res) {
  if (!requireAdmin(req)) {
    return json(res, 401, { ok: false, error: 'Admin authentication required.' });
  }

  if (req.method === 'GET') {
    const overrides = await readProductOverrides();
    return json(res, 200, { ok: true, overrides });
  }

  const body = await readJson(req);
  const source = String(body.source || '').trim();
  const id = String(body.id || body.sku || '').trim();
  if (!source || !id) return json(res, 400, { ok: false, error: 'Missing source or id.' });

  if (req.method === 'DELETE') {
    const result = await deleteProductOverride(source, id);
    return json(res, 200, { ok: true, ...result });
  }

  if (req.method === 'POST' || req.method === 'PATCH') {
    const result = await writeProductOverride(source, id, body.override || body);
    return json(res, 200, { ok: true, ...result });
  }

  res.setHeader('Allow', 'GET,POST,PATCH,DELETE');
  return json(res, 405, { ok: false, error: 'Method not allowed.' });
}
```

Add router line:

```js
if (action === 'product-overrides') return handleProductOverrides(req, res);
```

- [ ] **Step 6: Run test**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/api/catalog/admin-config.js scripts/gateway-smoke.js api/admin/[action].js
git commit -m "feat: centralize admin catalog config"
```

---

## Task 4: Apply Admin Rules Server-Side

**Files:**
- Create: `lib/api/catalog/apply-admin-rules.js`
- Test: `scripts/gateway-smoke.js`

- [ ] **Step 1: Implement rule application**

Create `lib/api/catalog/apply-admin-rules.js`:

```js
const { normalizeProduct, toNumber } = require('./types');
const { overrideKey } = require('./admin-config');

function applyMargin(product, margins) {
  const item = normalizeProduct(product);
  const cfg = margins[item.source];
  if (!cfg) return item;
  const margin = toNumber(cfg.margin, 0);
  if (margin === 0) return item;
  return {
    ...item,
    basePrice: item.basePrice || item.price,
    price: Math.round(item.price * (1 + margin / 100) * 100) / 100,
    marginApplied: margin,
  };
}

function applyProductOverride(product, overrides) {
  const item = normalizeProduct(product);
  const override = overrides[overrideKey(item.source, item.id)] || overrides[overrideKey(item.source, item.sku)];
  if (!override) return item;
  if (override.hidden) return null;

  return normalizeProduct({
    ...item,
    name: override.nameOverride || item.name,
    price: override.priceOverride === null || override.priceOverride === undefined ? item.price : override.priceOverride,
    stock: override.stockOverride === null || override.stockOverride === undefined ? item.stock : override.stockOverride,
    overrideApplied: true,
  });
}

function applyAdminRules(items, config = {}) {
  const margins = config.margins || {};
  const overrides = config.overrides || {};
  return items
    .map(normalizeProduct)
    .filter(item => margins[item.source] ? margins[item.source].enabled !== false : true)
    .map(item => applyProductOverride(item, overrides))
    .filter(Boolean)
    .map(item => applyMargin(item, margins));
}

module.exports = {
  applyAdminRules,
  applyMargin,
  applyProductOverride,
};
```

- [ ] **Step 2: Extend smoke test**

Append to `run()`:

```js
  const { applyAdminRules } = require('../lib/api/catalog/apply-admin-rules');
  const ruled = applyAdminRules(
    [
      { id: '1', source: 'bardi', name: 'Visible', price: 100, stock: 1 },
      { id: '2', source: 'carhub', name: 'Disabled', price: 100, stock: 1 },
      { id: '3', source: 'bardi', name: 'Hidden', price: 100, stock: 1 },
    ],
    {
      margins: {
        bardi: { enabled: true, margin: 35 },
        carhub: { enabled: false, margin: 25 },
      },
      overrides: {
        'bardi:3': { hidden: true },
      },
    }
  );
  assert.strictEqual(ruled.length, 1);
  assert.strictEqual(ruled[0].price, 135);
```

- [ ] **Step 3: Run test**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/api/catalog/apply-admin-rules.js scripts/gateway-smoke.js
git commit -m "feat: apply admin catalog rules server-side"
```

---

## Task 5: Add Cache Helpers

**Files:**
- Create: `lib/api/catalog/cache.js`

- [ ] **Step 1: Implement memory TTL cache**

Create `lib/api/catalog/cache.js`:

```js
const memory = new Map();

function now() {
  return Date.now();
}

function getCache(key) {
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= now()) {
    memory.delete(key);
    return null;
  }
  return hit.value;
}

function setCache(key, value, ttlMs) {
  memory.set(key, {
    value,
    expiresAt: now() + Math.max(1000, Number(ttlMs) || 60000),
  });
  return value;
}

function clearCache(prefix = '') {
  Array.from(memory.keys()).forEach((key) => {
    if (!prefix || key.startsWith(prefix)) memory.delete(key);
  });
}

async function withCache(key, ttlMs, loader) {
  const hit = getCache(key);
  if (hit !== null) return hit;
  const value = await loader();
  return setCache(key, value, ttlMs);
}

module.exports = {
  clearCache,
  getCache,
  setCache,
  withCache,
};
```

- [ ] **Step 2: Commit**

```bash
git add lib/api/catalog/cache.js
git commit -m "feat: add catalog gateway cache helpers"
```

---

## Task 6: Build Supplier Adapters

**Files:**
- Create: `lib/api/suppliers/bravus.js`
- Create: `lib/api/suppliers/carhub.js`
- Create: `lib/api/suppliers/globiz.js`
- Create: `lib/api/suppliers/bardi.js`
- Create: `lib/api/suppliers/casabateriilor.js`
- Create: `lib/api/catalog/registry.js`
- Modify: existing `lib/api/bravus.js`, `lib/api/carhub.js`, `lib/api/globiz.js`, `lib/api/bardi.js`, `lib/api/casabateriilor.js` only if needed to export parser helpers without changing behavior.

- [ ] **Step 1: Create adapter factory pattern**

Each adapter should wrap the existing library first, not rewrite parsing from scratch.

For Bravus, create `lib/api/suppliers/bravus.js`:

```js
const legacy = require('../bravus');
const { normalizeProduct, paginateItems } = require('../catalog/types');

const key = 'bravus';
const label = 'Bravus';

async function all() {
  return legacy.readBravusCatalog().map(item => normalizeProduct({ ...item, source: key }));
}

async function list(params = {}) {
  const filtered = legacy.filterItems(await all(), params);
  return { ok: true, source: key, ...paginateItems(filtered, params) };
}

async function getById(id) {
  const item = legacy.findByIdentity(await all(), { id, sku: id });
  if (!item) return { ok: false, source: key, status: 404, error: 'Product not found.' };
  return { ok: true, source: key, item: normalizeProduct(item) };
}

async function summary(params = {}) {
  const filtered = legacy.filterItems(await all(), params);
  const brands = legacy.buildBrandSummary(filtered);
  return { ok: true, source: key, totalItems: filtered.length, totalBrands: brands.length, brands };
}

async function health() {
  const items = await all();
  return { ok: true, source: key, status: 'active', detail: `${items.length} products loaded` };
}

module.exports = { key, label, list, getById, summary, health, all };
```

- [ ] **Step 2: Create equivalent adapters**

Create the other supplier adapter files using the same contract:

```js
// carhub.js uses require('../carhub') and legacy.readCarHubCatalog()
// globiz.js uses require('../globiz') and legacy.readGlobizCatalog()
// bardi.js uses require('../bardi') and legacy.readBardiCatalog()
// casabateriilor.js uses require('../casabateriilor') and legacy.fetchCatalog()
```

For Casa Bateriilor, because `fetchCatalog()` is async, use:

```js
async function all() {
  return (await legacy.fetchCatalog()).map(item => normalizeProduct({ ...item, source: key }));
}
```

- [ ] **Step 3: Create registry**

Create `lib/api/catalog/registry.js`:

```js
const bravus = require('../suppliers/bravus');
const carhub = require('../suppliers/carhub');
const globiz = require('../suppliers/globiz');
const bardi = require('../suppliers/bardi');
const casabateriilor = require('../suppliers/casabateriilor');
const { normalizeSourceKey } = require('./types');

const adapters = [bravus, carhub, globiz, bardi, casabateriilor];
const byKey = new Map(adapters.map(adapter => [adapter.key, adapter]));

function getAdapter(source) {
  return byKey.get(normalizeSourceKey(source)) || null;
}

function listAdapters() {
  return adapters.slice();
}

module.exports = {
  getAdapter,
  listAdapters,
};
```

- [ ] **Step 4: Run smoke checks**

Run:

```bash
node -e "const {listAdapters}=require('./lib/api/catalog/registry'); Promise.all(listAdapters().map(a=>a.health())).then(x=>console.log(JSON.stringify(x,null,2)))"
```

Expected: JSON list with five active suppliers and product counts.

- [ ] **Step 5: Commit**

```bash
git add lib/api/suppliers lib/api/catalog/registry.js
git commit -m "feat: add supplier adapter registry"
```

---

## Task 7: Build Product Gateway

**Files:**
- Create: `lib/api/catalog/gateway.js`
- Modify: `scripts/gateway-smoke.js`

- [ ] **Step 1: Implement gateway orchestration**

Create `lib/api/catalog/gateway.js`:

```js
const { applyAdminRules } = require('./apply-admin-rules');
const { readMargins, readProductOverrides } = require('./admin-config');
const { listAdapters, getAdapter } = require('./registry');
const { normalizeProduct, normalizeText, paginateItems } = require('./types');
const { withCache } = require('./cache');

const CATALOG_TTL = 5 * 60 * 1000;

async function readAdminConfig() {
  const [margins, overrides] = await Promise.all([
    readMargins(),
    readProductOverrides(),
  ]);
  return { margins, overrides };
}

function scoreProduct(item, query) {
  const q = normalizeText(query).toLowerCase();
  if (!q) return 0;
  const haystack = [
    item.id,
    item.sku,
    item.oem,
    item.brand,
    item.name,
    item.cat,
    item.subcat,
    item.source,
  ].join(' ').toLowerCase();
  if (haystack.includes(q)) return 1000;
  return q.split(/\s+/).filter(Boolean).reduce((score, part) => score + (haystack.includes(part) ? 100 : 0), 0);
}

function filterItems(items, params = {}) {
  const q = normalizeText(params.q);
  const cat = normalizeText(params.cat || params.category).toLowerCase();
  const subcat = normalizeText(params.subcat || params.subcategory).toLowerCase();
  const brand = normalizeText(params.brand).toLowerCase();
  const source = normalizeText(params.source).toLowerCase();

  let result = items.filter((item) => {
    if (cat && String(item.cat || '').toLowerCase() !== cat) return false;
    if (subcat && String(item.subcat || '').toLowerCase() !== subcat) return false;
    if (brand && String(item.brand || '').toLowerCase() !== brand) return false;
    if (source && String(item.source || '').toLowerCase() !== source) return false;
    return true;
  });

  if (q) {
    result = result
      .map(item => ({ item, score: scoreProduct(item, q) }))
      .filter(entry => entry.score > 0)
      .sort((left, right) => right.score - left.score || Number(right.item.stock || 0) - Number(left.item.stock || 0))
      .map(entry => entry.item);
  }

  return result;
}

function sortItems(items, sort) {
  const list = items.slice();
  if (sort === 'price_asc') list.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name, 'ro'));
  else if (sort === 'price_desc') list.sort((a, b) => b.price - a.price || a.name.localeCompare(b.name, 'ro'));
  else if (sort === 'rating') list.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0) || a.name.localeCompare(b.name, 'ro'));
  else list.sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0) || a.name.localeCompare(b.name, 'ro'));
  return list;
}

async function readRawCatalog() {
  return withCache('gateway:raw-catalog', CATALOG_TTL, async () => {
    const batches = await Promise.all(listAdapters().map(async (adapter) => {
      try {
        return await adapter.all();
      } catch (error) {
        return [];
      }
    }));
    return batches.flat().map(normalizeProduct);
  });
}

async function readPublicCatalog() {
  const [items, config] = await Promise.all([readRawCatalog(), readAdminConfig()]);
  return applyAdminRules(items, config);
}

function buildSummary(items) {
  const categories = new Map();
  const brands = new Map();
  const sources = new Map();
  items.forEach((item) => {
    const catKey = item.cat || 'general';
    const brandKey = item.brand || 'General';
    const sourceKey = item.source || 'catalog';
    categories.set(catKey, (categories.get(catKey) || 0) + 1);
    brands.set(brandKey, (brands.get(brandKey) || 0) + 1);
    sources.set(sourceKey, (sources.get(sourceKey) || 0) + 1);
  });
  const mapToItems = map => Array.from(map.entries()).map(([key, count]) => ({ key, label: key, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ro'));
  return {
    total: items.length,
    inStock: items.filter(item => item.stock > 0).length,
    outOfStock: items.filter(item => item.stock <= 0).length,
    categories: mapToItems(categories),
    brands: mapToItems(brands),
    sources: mapToItems(sources),
  };
}

async function queryProducts(params = {}) {
  const catalog = await readPublicCatalog();
  const filtered = sortItems(filterItems(catalog, params), params.sort);
  return { ok: true, summary: buildSummary(filtered), ...paginateItems(filtered, params) };
}

async function getProduct(params = {}) {
  const id = normalizeText(params.id || params.sku || params.oem);
  if (!id) return { ok: false, status: 400, error: 'Missing product id.' };
  const catalog = await readPublicCatalog();
  const item = catalog.find(product => product.id === id || product.sku === id || product.oem === id);
  if (!item) return { ok: false, status: 404, error: 'Product not found.' };
  return { ok: true, item };
}

async function getView(view, params = {}) {
  const catalog = await readPublicCatalog();
  const filtered = filterItems(catalog, params);
  const summary = buildSummary(filtered);
  if (view === 'summary') return { ok: true, summary };
  if (view === 'categories') return { ok: true, total: filtered.length, items: summary.categories };
  if (view === 'brands') return { ok: true, total: filtered.length, items: summary.brands };
  if (view === 'sources') return { ok: true, total: filtered.length, items: summary.sources };
  if (view === 'featured') {
    const featured = sortItems(filtered.filter(item => item.stock > 0), 'rating').slice(0, Number(params.limit || 12));
    return { ok: true, total: featured.length, items: featured };
  }
  return queryProducts(params);
}

async function supplierQuery(source, params = {}) {
  const adapter = getAdapter(source);
  if (!adapter) return { ok: false, status: 404, error: 'Unknown supplier.' };
  const response = await adapter.list(params);
  const config = await readAdminConfig();
  return { ...response, items: applyAdminRules(response.items || [], config) };
}

module.exports = {
  buildSummary,
  getProduct,
  getView,
  queryProducts,
  readPublicCatalog,
  readRawCatalog,
  supplierQuery,
};
```

- [ ] **Step 2: Extend smoke test for gateway exports**

Append to `run()`:

```js
  const gateway = require('../lib/api/catalog/gateway');
  assert.strictEqual(typeof gateway.queryProducts, 'function');
  assert.strictEqual(typeof gateway.getProduct, 'function');
```

- [ ] **Step 3: Run smoke test**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/api/catalog/gateway.js scripts/gateway-smoke.js
git commit -m "feat: add product gateway"
```

---

## Task 8: Route APIs Through Gateway

**Files:**
- Modify: `api/products/index.js`
- Modify: `api/bravus/index.js`
- Modify: `api/carhub/index.js`
- Modify: `api/globiz/index.js`
- Modify: `api/bardi/index.js`
- Modify: `api/casabateriilor/index.js`

- [ ] **Step 1: Replace products API handler**

Replace `api/products/index.js` with:

```js
const { getProduct, getView, queryProducts } = require('../../lib/api/catalog/gateway');
const { json } = require('../../lib/api/catalog/types');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  try {
    const query = req.query || {};
    if (query.id || query.sku || query.oem) {
      const result = await getProduct(query);
      return json(res, result.status || (result.ok ? 200 : 404), result);
    }

    const view = String(query.view || '').trim().toLowerCase();
    const result = view ? await getView(view, query) : await queryProducts(query);
    return json(res, 200, result);
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'Product request failed.' });
  }
};
```

- [ ] **Step 2: Replace supplier API handlers**

For each supplier handler, use this shape with the correct supplier key:

```js
const { supplierQuery } = require('../../lib/api/catalog/gateway');
const { json } = require('../../lib/api/catalog/types');

const SOURCE = 'bardi';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  try {
    const result = await supplierQuery(SOURCE, req.query || {});
    return json(res, result.status || (result.ok ? 200 : 400), result);
  } catch (error) {
    return json(res, 500, { ok: false, source: SOURCE, error: error.message || 'Supplier request failed.' });
  }
};
```

Set `SOURCE` to `bravus`, `carhub`, `globiz`, `bardi`, or `casabateriilor`.

- [ ] **Step 3: Local API smoke check**

Run:

```bash
node -e "const h=require('./api/products'); const req={method:'GET',query:{limit:3}}; const res={setHeader(){},end(x){console.log(x.slice(0,300))}}; h(req,res)"
```

Expected: JSON with `"ok":true` and an `"items"` array.

- [ ] **Step 4: Commit**

```bash
git add api/products/index.js api/bravus/index.js api/carhub/index.js api/globiz/index.js api/bardi/index.js api/casabateriilor/index.js
git commit -m "refactor: route product APIs through gateway"
```

---

## Task 9: Preserve And Extend Admin

**Files:**
- Modify: `api/admin/[action].js`
- Modify: `admin-dashboard.js`

- [ ] **Step 1: Replace dashboard catalog reads**

In `api/admin/[action].js`, replace:

```js
const { readCatalog, buildSummary, summarizeBy, LOW_STOCK_THRESHOLD } = require('../../lib/api/products');
```

with:

```js
const { readPublicCatalog, buildSummary } = require('../../lib/api/catalog/gateway');
const { normalizeSourceKey } = require('../../lib/api/catalog/types');
const LOW_STOCK_THRESHOLD = 3;
```

Replace:

```js
const catalog = readCatalog();
```

with:

```js
const catalog = await readPublicCatalog();
```

Replace `sourceGroups` and `categoryGroups` construction with:

```js
const sourceGroups = catalogSummary.sources;
const categoryGroups = catalogSummary.categories;
```

When code references `item.sourceKey`, compute `normalizeSourceKey(item.source)`.

- [ ] **Step 2: Add override actions in supplier browse modal**

In `admin-dashboard.js`, inside supplier browse table rows, add a button next to each product:

```html
<button class="btn-sm btn-outline" onclick="toggleProductHidden('${escapeHtml(item.source)}','${escapeHtml(item.id)}',true)">Ascunde</button>
```

Also show an unhide button when `item.overrideApplied` or hidden state is represented by a future override response.

- [ ] **Step 3: Add Admin JS function**

Add:

```js
async function toggleProductHidden(source, id, hidden) {
  const result = await requestJson('/api/admin/product-overrides', {
    method: 'POST',
    body: { source, id, hidden: Boolean(hidden) },
  });
  if (!result?.ok) {
    showAdminToast(result?.error || 'Nu am putut salva regula produsului.', 'error');
    return;
  }
  showAdminToast(hidden ? 'Produs ascuns de pe website.' : 'Produs reactivat pe website.');
  const key = state.activeBrowseSupplier || source;
  browseSupplierLoad(key, state.browsePage || 1);
}
window.toggleProductHidden = toggleProductHidden;
```

- [ ] **Step 4: Preserve existing margin save functions**

Verify `saveMarginConfig(key)` and supplier toggle still POST to:

```js
'/api/admin/margins'
```

with `{ margins: state.marginConfig }`.

- [ ] **Step 5: Local admin API smoke**

Run:

```bash
node -e "const h=require('./api/admin/[action].js'); const req={method:'GET',query:{action:'margins'},headers:{}}; const res={setHeader(){},end(x){console.log(x)}}; h(req,res)"
```

Expected: JSON with `"ok":true` and `margins`.

- [ ] **Step 6: Commit**

```bash
git add api/admin/[action].js admin-dashboard.js
git commit -m "feat: preserve admin controls on product gateway"
```

---

## Task 10: Remove Browser Catalog Loading From Storefront

**Files:**
- Modify: `api.js`
- Modify: `index.html`
- Modify: `category.html`
- Modify: `product.html`
- Modify: `search.html`

- [ ] **Step 1: Remove catalog preloads**

Delete this line from `index.html`, `category.html`, and `search.html`:

```html
<link rel="preload" href="/catalog-micro.json?v=20260418-micro-1" as="fetch" crossorigin="anonymous"/>
```

Do not add a replacement preload for catalog data.

- [ ] **Step 2: Make browser API remote-first with no catalog fallback**

In `api.js`, keep functions that call:

```js
_requestJson('/api/products...')
```

Remove normal page execution paths that call:

```js
_fetchCatalogJson()
_fetchFeedCatalogs()
window.MotApi.getCatalogSnapshot()
```

For compatibility, keep `getCatalogSnapshot()` but make it fetch paginated products from `/api/products?limit=500&page=N` only when Admin/legacy code explicitly calls it. Do not call it during homepage startup.

- [ ] **Step 3: Homepage data**

Ensure `window.MotApi.getHomepageData()` uses:

```js
const featuredResponse = await window.MotApi.getFeatured(featuredLimit);
const categoriesRemote = await _requestJson(`${_serverProductsEndpoint}?view=categories`);
```

If either request fails, return small empty defaults instead of loading catalog JSON:

```js
return { ok: false, counts: {}, featured: [] };
```

- [ ] **Step 4: Product detail**

Ensure `window.MotApi.getProduct(id)` only calls:

```js
_requestJson(`${_serverProductsEndpoint}?${_buildQueryString({ id })}`)
```

If the request fails, show product-not-found UI. Do not fetch `catalog.json`.

- [ ] **Step 5: Category/search**

Ensure category and search pages use:

```js
window.MotApi.getProducts({ cat, q, page, limit, sort })
```

and that `getProducts` only calls `/api/products`.

- [ ] **Step 6: Static grep check**

Run:

```bash
Select-String -Path index.html,category.html,product.html,search.html,api.js -Pattern 'catalog-micro|catalog-lite|catalog\\.json|supplier-feed\\.xml|supplier-feed-globiz'
```

Expected: no matches in HTML files. Any remaining `api.js` matches must be inside comments or explicitly disabled legacy compatibility code that is not called by page startup.

- [ ] **Step 7: Commit**

```bash
git add api.js index.html category.html product.html search.html
git commit -m "perf: remove browser-side catalog loading"
```

---

## Task 11: Slim Order And Sitemap Functions

**Files:**
- Modify: `api/orders.js`
- Modify: `api/product-sitemap.js`

- [ ] **Step 1: Remove top-level catalog import from orders**

In `api/orders.js`, remove:

```js
const { readCatalog } = require('../lib/api/products');
```

Add:

```js
const { getProduct } = require('../lib/api/catalog/gateway');
```

- [ ] **Step 2: Replace order enrichment loop**

Replace the block that reads the full catalog to map item sources with targeted lookups:

```js
order.items = await Promise.all(order.items.map(async (item) => {
  try {
    const found = await getProduct({ id: item.id || item.sku });
    return { ...item, source: found.item?.source || '' };
  } catch (_) {
    return { ...item, source: '' };
  }
}));
```

- [ ] **Step 3: Make sitemap use gateway**

In `api/product-sitemap.js`, replace `readCatalog()` usage with:

```js
const { readPublicCatalog } = require('../lib/api/catalog/gateway');
```

and:

```js
const catalog = await readPublicCatalog();
```

- [ ] **Step 4: Commit**

```bash
git add api/orders.js api/product-sitemap.js
git commit -m "perf: avoid full catalog imports in utility APIs"
```

---

## Task 12: Deploy Package Hygiene

**Files:**
- Modify: `.vercelignore`
- Create: `scripts/perf-audit.js`

- [ ] **Step 1: Update `.vercelignore`**

Replace `.vercelignore` with:

```gitignore
.git
.claude
.chrome*
.playwright-cli
node_modules/.cache
output
deploy-package
Becca (friedmann_)
*.zip
*.pdf
*.psd
*.ai
*.sketch
*.fig
*.log
*.pid
.codex-*
codex-last.txt
tools
chunk_*.json
bigchunk_*.json
inject_*.txt
inject-chunk*.js
inj*.js
*_scraper*.json
*_scraper*.js
bardi-chunk*.json
bardi-all-skus.json
bardi-skus.json
bardi_img_results.json
bardi_oil_scraper.json
missing_skus.json
add_whatsapp.py
append_bardi.py
update-bardi-images.py
update_bardi_images.py
scrape-bardi-images.js
```

Do not ignore runtime files still required by adapters until the gateway has a database/blob-backed source. Keep `catalog.json`, `supplier-feed.xml`, `supplier-feed-globiz.xml`, `bardi-products-api.json`, and `api/casabateriilor/prices.generated.json` for this phase.

- [ ] **Step 2: Create performance audit script**

Create `scripts/perf-audit.js`:

```js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = process.cwd();
const files = ['index.html', 'category.html', 'product.html', 'search.html', 'api.js'];
const forbiddenHtml = /catalog-micro|catalog-lite|catalog\.json|supplier-feed\.xml|supplier-feed-globiz/;

let failed = false;

for (const file of files) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) continue;
  const text = fs.readFileSync(full, 'utf8');
  if (file.endsWith('.html') && forbiddenHtml.test(text)) {
    console.error(`FAIL ${file}: forbidden catalog/feed reference`);
    failed = true;
  }
  const raw = Buffer.from(text);
  const gzip = zlib.gzipSync(raw);
  console.log(`${file}: ${(raw.length / 1024).toFixed(1)} KB raw, ${(gzip.length / 1024).toFixed(1)} KB gzip`);
}

if (failed) process.exit(1);
```

- [ ] **Step 3: Run audit**

Run:

```bash
npm run perf:audit
```

Expected: PASS and file size output. No forbidden catalog/feed references in HTML.

- [ ] **Step 4: Commit**

```bash
git add .vercelignore scripts/perf-audit.js package.json
git commit -m "chore: tighten deployment performance audit"
```

---

## Task 13: Verify Bundle Risk Locally

**Files:**
- No code changes unless verification fails.

- [ ] **Step 1: Build or inspect Vercel output**

Run:

```bash
npx vercel build
```

Expected: build completes. If network/login blocks this, run the next local fallback instead.

- [ ] **Step 2: Fallback local function-size inspection**

Run:

```bash
Get-ChildItem .vercel\output\functions -Directory -Recurse | Where-Object { $_.Name -like '*.func' } | ForEach-Object { $sum=(Get-ChildItem $_.FullName -Recurse -File | Measure-Object Length -Sum).Sum; [pscustomobject]@{Function=$_.FullName; MB=[math]::Round($sum/1MB,2)} } | Sort-Object MB -Descending | Format-Table -AutoSize
```

Expected after a fresh Vercel build: no unrelated API function bundles should contain duplicated copies of `catalog.json` except functions that still directly need local runtime source files during this phase.

- [ ] **Step 3: Check for catalog imports in utility APIs**

Run:

```bash
Select-String -Path api\orders.js,api\product-sitemap.js,api\admin\[action].js -Pattern "lib/api/products|readCatalog"
```

Expected: no matches.

- [ ] **Step 4: Commit any required fixes**

If fixes were needed:

```bash
git add api lib scripts .vercelignore package.json
git commit -m "fix: remove remaining heavy catalog imports"
```

If no fixes were needed, do not commit.

---

## Task 14: Browser Verification Before Deployment

**Files:**
- No code changes unless verification fails.

- [ ] **Step 1: Start local server**

Run:

```bash
node .codex-mobile-shot-server.js
```

Expected: local server starts on `http://127.0.0.1:4173`.

- [ ] **Step 2: Verify homepage**

Open:

```text
http://127.0.0.1:4173/index.html
```

Expected:

- Header renders.
- Hero renders.
- Featured products render or empty state renders without console errors.
- Network panel does not show `catalog.json`, `catalog-lite.json`, `catalog-micro.json`, `supplier-feed.xml`, or `supplier-feed-globiz.xml`.

- [ ] **Step 3: Verify category**

Open:

```text
http://127.0.0.1:4173/category.html?cat=uleiuri
```

Expected:

- Products render from `/api/products?cat=uleiuri...`.
- Pagination/filtering works.
- No full catalog JSON fetch appears.

- [ ] **Step 4: Verify product detail**

Open a product from the category page.

Expected:

- Product details render from `/api/products?id=...`.
- Related products render from `/api/products`.
- No full catalog JSON fetch appears.

- [ ] **Step 5: Verify Admin margins**

Open:

```text
http://127.0.0.1:4173/admin.html
```

Expected:

- Login works with configured local env or returns the existing configured-auth warning.
- Supplier panel loads.
- Margin save posts to `/api/admin/margins`.
- Supplier enable/disable posts to `/api/admin/margins`.
- Browse supplier modal loads products through supplier endpoints.

- [ ] **Step 6: Commit any fixes**

If fixes were needed:

```bash
git add api lib api.js *.html admin-dashboard.js
git commit -m "fix: complete gateway browser verification"
```

If no fixes were needed, do not commit.

---

## Task 15: Deployment Strategy

**Files:**
- No code changes.

- [ ] **Step 1: Confirm deployment quota**

Run:

```bash
npx vercel list --scope terocontact-8531s-projects
```

Expected: recent deployments visible. If quota is exhausted, wait for reset or use a prebuilt deployment only when allowed.

- [ ] **Step 2: Deploy once**

Run:

```bash
npm test
npm run perf:audit
npx vercel deploy --prod --yes --scope terocontact-8531s-projects
```

Expected: one production deployment created.

- [ ] **Step 3: Production smoke**

Check:

```text
https://www.pieseautomotoras.ro/
https://www.pieseautomotoras.ro/category.html?cat=uleiuri
https://www.pieseautomotoras.ro/api/products?limit=3
https://www.pieseautomotoras.ro/api/products?view=categories
```

Expected:

- Site loads.
- API returns small JSON responses.
- Browser network does not fetch full catalog files on homepage/category/product/search.

- [ ] **Step 4: Rollback rule**

If checkout, Admin login, or product pages fail in production, roll back immediately to the previous production deployment. Then fix locally and redeploy once.

---

## Later Phase: True Separate Supplier Deployments

Only do this after the gateway is stable.

- Move each adapter behind an external base URL.
- Keep the same adapter contract.
- Change registry entries to call remote supplier deployments when env vars are present:

```js
SUPPLIER_BARDI_URL=https://supplier-bardi.vercel.app
SUPPLIER_CARHUB_URL=https://supplier-carhub.vercel.app
```

- Keep local adapters as fallback.
- Do not change storefront code.
- Do not change Admin UI.

This later phase becomes safe because the storefront only talks to the gateway, and the gateway only talks to the adapter contract.

---

## Self-Review

- Spec coverage: The plan covers speed, Admin margins, supplier enable/disable, individual product hiding, supplier browse, product gateway, cache, deployment hygiene, and future supplier additions.
- Placeholder scan: No task depends on vague “do later” implementation steps. The only later phase is explicitly out of scope and documented as future architecture.
- Type consistency: Product shape, adapter contract, override shape, and gateway response shapes are defined once and reused in later tasks.
- Risk: The largest risk is modifying `api.js`, which is currently large and contains duplicate/legacy catalog paths. Execute Task 10 carefully and verify with browser network checks before deployment.
