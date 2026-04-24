const { filterBySource, filterItems, findByIdentity, buildBrandSummary } = require('../catalog-reader');
const { normalizeProduct, paginateItems } = require('../catalog/types');

const key = 'bardi';
const label = 'Bardi';

function all() {
  return filterBySource(key).map(item => normalizeProduct({ ...item, source: key }));
}

async function list(params = {}) {
  const filtered = filterItems(all(), params);
  return { ok: true, source: key, ...paginateItems(filtered, params) };
}

async function getById(id) {
  const item = findByIdentity(all(), { id, sku: id });
  if (!item) return { ok: false, source: key, status: 404, error: 'Product not found.' };
  return { ok: true, source: key, item: normalizeProduct(item) };
}

async function summary(params = {}) {
  const filtered = filterItems(all(), params);
  const brands = buildBrandSummary(filtered);
  return { ok: true, source: key, totalItems: filtered.length, totalBrands: brands.length, brands };
}

async function health() {
  const items = all();
  return { ok: true, source: key, status: 'active', detail: `${items.length} products loaded` };
}

module.exports = { key, label, list, getById, summary, health, all };
