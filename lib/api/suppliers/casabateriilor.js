const legacy = require('../casabateriilor');
const { normalizeProduct, paginateItems, normalizeText } = require('../catalog/types');

const key = 'casabateriilor';
const label = 'Casa Bateriilor';

async function all() {
  const items = await legacy.fetchCatalog();
  return items.map(item => normalizeProduct({ ...item, source: key }));
}

function findByIdentity(items, query = {}) {
  const wanted = normalizeText(query.id || query.sku || query.oem).toLowerCase();
  if (!wanted) return null;
  return items.find((item) => {
    return [item.id, item.sku, item.oem]
      .map(value => normalizeText(value).toLowerCase())
      .filter(Boolean)
      .includes(wanted);
  }) || null;
}

async function list(params = {}) {
  const items = await all();
  const filtered = legacy.filterItems(items, params);
  return { ok: true, source: key, ...paginateItems(filtered, params) };
}

async function getById(id) {
  const items = await all();
  const item = findByIdentity(items, { id, sku: id });
  if (!item) return { ok: false, source: key, status: 404, error: 'Product not found.' };
  return { ok: true, source: key, item: normalizeProduct({ ...item, source: key }) };
}

async function summary(params = {}) {
  const items = await all();
  const filtered = legacy.filterItems(items, params);
  const brands = legacy.buildBrandSummary(filtered);
  return { ok: true, source: key, totalItems: filtered.length, totalBrands: brands.length, brands };
}

async function health() {
  try {
    const items = await all();
    return { ok: true, source: key, status: 'active', detail: `${items.length} products loaded` };
  } catch (error) {
    return { ok: false, source: key, status: 'error', detail: error.message };
  }
}

module.exports = { key, label, list, getById, summary, health, all };
