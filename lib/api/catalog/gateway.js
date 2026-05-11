const { applyAdminRules } = require('./apply-admin-rules');
const { readMargins, readProductOverrides } = require('./admin-config');
const { listAdapters, getAdapter } = require('./registry');
const { classifyItem } = require('./classify');
const { normalizeProduct, normalizeText, paginateItems } = require('./types');
const { withCache } = require('./cache');

const CATALOG_TTL = 5 * 60 * 1000;
const ADMIN_TTL = 60 * 1000;

async function readAdminConfig() {
  return withCache('gateway:admin-config', ADMIN_TTL, async () => {
    const [margins, overrides] = await Promise.all([
      readMargins(),
      readProductOverrides(),
    ]);
    return { margins, overrides };
  });
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
  const stockFilter = normalizeText(params.stock).toLowerCase();

  let result = items.filter((item) => {
    if (cat && String(item.cat || '').toLowerCase() !== cat) return false;
    if (subcat && String(item.subcat || '').toLowerCase() !== subcat) return false;
    if (brand && String(item.brand || '').toLowerCase() !== brand) return false;
    if (source && String(item.source || '').toLowerCase() !== source) return false;
    if (stockFilter === 'in' && !(Number(item.stock) > 0)) return false;
    if (stockFilter === 'out' && Number(item.stock) > 0) return false;
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
        console.warn(`[gateway] adapter ${adapter.key} failed:`, error.message);
        return [];
      }
    }));
    return batches.flat()
      .map(item => classifyItem(item))
      .map(normalizeProduct);
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
  const mapToItems = map => Array.from(map.entries())
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ro'));
  return {
    total: items.length,
    inStock: items.filter(item => Number(item.stock) > 0).length,
    outOfStock: items.filter(item => !(Number(item.stock) > 0)).length,
    lowStock: items.filter(item => Number(item.stock) > 0 && Number(item.stock) <= 3).length,
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
    const featured = sortItems(filtered.filter(item => Number(item.stock) > 0), 'rating').slice(0, Number(params.limit || 12));
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
  filterItems,
  getProduct,
  getView,
  queryProducts,
  readPublicCatalog,
  readRawCatalog,
  sortItems,
  supplierQuery,
};
