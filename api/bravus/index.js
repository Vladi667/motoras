const {
 buildBrandSummary,
 DATA_FILE,
 filterItems,
 findByIdentity,
 json,
 paginate,
 readBravusCatalog,
} = require('../../lib/api/bravus');
const { readMargins, applyMargin } = require('../../lib/api/margins');

function withMargin(item, marginPct) {
 if (item.price == null) return item;
 const salePrice = applyMargin(item.price, marginPct);
 const listPrice = item.old != null ? applyMargin(item.old, marginPct) : undefined;
 const old = listPrice != null && listPrice > salePrice ? listPrice : undefined;
 const stock = Math.max(item.stock || 0, 10);
 return Object.assign({}, item, { price: salePrice, salePrice, listPrice, old, marginPct, stock, quantity: stock });
}

module.exports = async function handler(req, res) {
 if (req.method !== 'GET') {
 res.setHeader('Allow', 'GET');
 return json(res, 405, { ok: false, error: 'Method not allowed.' });
 }

 try {
 const margins = await readMargins();
 const marginPct = (margins.bravus && margins.bravus.enabled) ? (margins.bravus.margin || 0) : 0;
 const items = readBravusCatalog().map(i => withMargin(i, marginPct));
 const item = findByIdentity(items, req.query || {});
 if (item) {
 return json(res, 200, { ok: true, source: 'bravus', sourceFile: 'catalog.json', marginPct, item });
 }

 const filtered = filterItems(items, req.query || {});
 const brands = buildBrandSummary(filtered);
 const view = String(req.query?.view || 'items').trim().toLowerCase();

 if (view === 'count') {
 const inStock = filtered.filter(i => i.inStock).length;
 return json(res, 200, { ok: true, source: 'bravus', total: filtered.length, totalBrands: brands.length, inStock, outOfStock: filtered.length - inStock, marginPct });
 }

 if (view === 'brands' || view === 'summary') {
 return json(res, 200, { ok: true, source: 'bravus', sourceFile: 'catalog.json', totalItems: filtered.length, totalBrands: brands.length, marginPct, brands });
 }

 const page = paginate(filtered, req.query || {});
 return json(res, 200, { ok: true, source: 'bravus', sourceFile: 'catalog.json', dataFile: DATA_FILE, totalBrands: brands.length, marginPct, brands, ...page });
 } catch (error) {
 return json(res, 500, {
 ok: false,
 error: error.message || 'Bravus catalog request failed.',
 });
 }
};
