const {
 buildBrandSummary,
 DATA_FILE,
 filterItems,
 findByIdentity,
 json,
 paginate,
 readGlobizCatalog,
} = require('../../lib/api/globiz');
const { readMargins, applyMargin } = require('../../lib/api/margins');

function withMargin(item, marginPct) {
 if (item.salePrice == null) return item;
 const salePrice = applyMargin(item.salePrice, marginPct);
 const listPrice = applyMargin(item.listPrice, marginPct);
 const price = salePrice;
 const old = listPrice > salePrice ? listPrice : undefined;
 const stock = Math.max(item.stock || 0, 10);
 return Object.assign({}, item, { price, salePrice, listPrice, old, marginPct, stock, quantity: stock });
}

module.exports = async function handler(req, res) {
 res.setHeader('Access-Control-Allow-Origin', '*');

 if (req.method !== 'GET') {
 res.setHeader('Allow', 'GET');
 return json(res, 405, { ok: false, error: 'Method not allowed.' });
 }

 try {
 const margins = await readMargins();
 const globizConfig = margins.globiz || { enabled: true, margin: 22 };
 const marginPct = globizConfig.enabled ? (globizConfig.margin || 0) : 0;

 const raw = readGlobizCatalog();
 const items = raw.map(i => withMargin(i, marginPct));

 const item = findByIdentity(items, req.query || {});
 if (item) {
 return json(res, 200, {
 ok: true,
 source: 'globiz',
 sourceFile: DATA_FILE,
 marginPct,
 item,
 });
 }

 const filtered = filterItems(items, req.query || {});
 const brands = buildBrandSummary(filtered);
 const view = String((req.query && req.query.view) || 'items').trim().toLowerCase();

 if (view === 'count') {
 const inStock = filtered.filter(i => i.inStock).length;
 const outOfStock = filtered.length - inStock;
 return json(res, 200, {
 ok: true,
 source: 'globiz',
 total: filtered.length,
 totalBrands: brands.length,
 inStock,
 outOfStock,
 marginPct,
 });
 }

 if (view === 'brands' || view === 'summary') {
 return json(res, 200, {
 ok: true,
 source: 'globiz',
 sourceFile: DATA_FILE,
 totalItems: filtered.length,
 totalBrands: brands.length,
 marginPct,
 brands,
 });
 }

 const page = paginate(filtered, req.query || {});
 return json(res, 200, {
 ok: true,
 source: 'globiz',
 sourceFile: DATA_FILE,
 dataFile: DATA_FILE,
 totalBrands: brands.length,
 marginPct,
 brands,
 ...page,
 });
 } catch (error) {
 return json(res, 500, {
 ok: false,
 error: error.message || 'Globiz catalog request failed.',
 });
 }
};
