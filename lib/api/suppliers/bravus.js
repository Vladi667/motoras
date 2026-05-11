const legacy = require('../bravus');
const { normalizeProduct, paginateItems } = require('../catalog/types');

const key = 'bravus';
const label = 'Bravus';

function all() {
  return legacy.readBravusCatalog().map(item => normalizeProduct({ ...item, source: key }));
}

async function list(params = {}) {
  const filtered = legacy.filterItems(all(), params);
  return { ok: true, source: key, ...paginateItems(filtered, params) };
}

async function getById(id) {
  const item = legacy.findByIdentity(all(), { id, sku: id });
  if (!item) return { ok: false, source: key, status: 404, error: 'Product not found.' };
  return { ok: true, source: key, item: normalizeProduct({ ...item, source: key }) };
}

async function summary(params = {}) {
  const filtered = legacy.filterItems(all(), params);
  const brands = legacy.buildBrandSummary(filtered);
  return { ok: true, source: key, totalItems: filtered.length, totalBrands: brands.length, brands };
}

async function health() {
  try {
    const items = all();
    return { ok: true, source: key, status: 'active', detail: `${items.length} products loaded` };
  } catch (error) {
    return { ok: false, source: key, status: 'error', detail: error.message };
  }
}

module.exports = { key, label, list, getById, summary, health, all };
