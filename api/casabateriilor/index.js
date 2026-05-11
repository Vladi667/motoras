const { fetchCatalog, filterItems, paginate, buildBrandSummary, buildCategorySummary, json } = require('../../lib/api/casabateriilor');
const { readMargins, applyMargin } = require('../../lib/api/margins');

function withMargin(item, marginPct) {
 if (item.price == null) return item;
 const salePrice = applyMargin(item.price, marginPct);
 const stock = Math.max(item.stock || 0, 10);
 return Object.assign({}, item, { price: salePrice, salePrice, listPrice: salePrice, marginPct, stock, quantity: stock });
}

module.exports = async function handler(req, res) {
 res.setHeader('Access-Control-Allow-Origin', '*');

 if (req.method !== 'GET') {
 res.setHeader('Allow', 'GET');
 return json(res, 405, { ok: false, error: 'Method not allowed.' });
 }

 try {
 const query = req.query || {};
 const view = String(query.view || 'items').trim().toLowerCase();

 const margins = await readMargins();
 const marginPct = (margins.casabateriilor && margins.casabateriilor.enabled) ? (margins.casabateriilor.margin || 0) : 0;

 const raw = await fetchCatalog();
 const items = raw.map(i => withMargin(i, marginPct));
 const filtered = filterItems(items, query);
 const brands = buildBrandSummary(filtered);

 // Single product by SKU/EAN
 if (query.id || query.sku) {
 const needle = String(query.id || query.sku).trim();
 const item = items.find(p => p.sku === needle || p.ean === needle);
 if (item) return json(res, 200, { ok: true, source: 'casabateriilor', marginPct, item });
 return json(res, 404, { ok: false, error: 'Product not found.' });
 }

 if (view === 'count') {
 return json(res, 200, { ok: true, source: 'casabateriilor', total: filtered.length, totalBrands: brands.length, inStock: filtered.filter(i => i.inStock).length, outOfStock: filtered.filter(i => !i.inStock).length, marginPct });
 }

 if (view === 'brands' || view === 'summary') {
 return json(res, 200, { ok: true, source: 'casabateriilor', totalItems: filtered.length, totalBrands: brands.length, marginPct, brands });
 }

 if (view === 'categories') {
 return json(res, 200, { ok: true, source: 'casabateriilor', marginPct, categories: buildCategorySummary(filtered) });
 }

 const page = paginate(filtered, query);
 return json(res, 200, { ok: true, source: 'casabateriilor', totalBrands: brands.length, marginPct, brands, ...page });

 } catch (err) {
 return json(res, 500, { ok: false, error: err.message || 'Casa Bateriilor request failed.' });
 }
};
