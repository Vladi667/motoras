const fs = require('fs');
const path = require('path');

let _catalog = null;

function readCatalog() {
  if (_catalog) return _catalog;
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'catalog.json'), 'utf8');
    _catalog = JSON.parse(raw);
  } catch (_) {
    _catalog = [];
  }
  return _catalog;
}

function filterBySource(sourceKey) {
  return readCatalog().filter(item => item.source === sourceKey);
}

function filterItems(items, params = {}) {
  let result = items;
  if (params.cat) result = result.filter(item => item.cat === params.cat);
  if (params.subcat) result = result.filter(item => item.subcat === params.subcat);
  if (params.brand) result = result.filter(item => String(item.brand || '').toLowerCase() === String(params.brand).toLowerCase());
  if (params.q) {
    const q = String(params.q).toLowerCase();
    result = result.filter(item =>
      String(item.name || '').toLowerCase().includes(q) ||
      String(item.sku || '').toLowerCase().includes(q) ||
      String(item.oem || '').toLowerCase().includes(q) ||
      String(item.brand || '').toLowerCase().includes(q)
    );
  }
  return result;
}

function findByIdentity(items, { id, sku }) {
  return items.find(item =>
    (id && (item.id === String(id) || item.sku === String(id))) ||
    (sku && (item.sku === String(sku) || item.id === String(sku)))
  ) || null;
}

function buildBrandSummary(items) {
  const counts = new Map();
  items.forEach(item => {
    const brand = item.brand || 'General';
    counts.set(brand, (counts.get(brand) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

module.exports = { readCatalog, filterBySource, filterItems, findByIdentity, buildBrandSummary };
