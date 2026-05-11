const {
 DATA_FILE,
 buildSummary,
 filterItems,
 findByIdentity,
 json,
 paginate,
 rankSearchItems,
 readCatalog,
 sortItems,
} = require('../../lib/api/products');

module.exports = async function handler(req, res) {
 if (req.method !== 'GET') {
 res.setHeader('Allow', 'GET');
 return json(res, 405, { ok: false, error: 'Method not allowed.' });
 }

 try {
 const items = readCatalog();
 const item = findByIdentity(items, req.query || {});
 if (item) {
 return json(res, 200, {
 ok: true,
 sourceFile: 'catalog.json',
 dataFile: DATA_FILE,
 item,
 });
 }

 const filtered = filterItems(items, req.query || {});
 const summary = buildSummary(filtered);
 const textQuery = String(req.query?.q || '').trim();
 const searchRanked = textQuery ? rankSearchItems(filtered, textQuery) : null;
 const sorted = searchRanked
 ? searchRanked.map(entry => entry.item)
 : sortItems(filtered, req.query?.sort);
 const view = String(req.query?.view || 'items').trim().toLowerCase();

 if (view === 'summary') {
 return json(res, 200, {
 ok: true,
 sourceFile: 'catalog.json',
 dataFile: DATA_FILE,
 summary,
 });
 }

 if (view === 'categories') {
 return json(res, 200, {
 ok: true,
 sourceFile: 'catalog.json',
 dataFile: DATA_FILE,
 total: filtered.length,
 items: summary.categories,
 });
 }

 if (view === 'brands') {
 return json(res, 200, {
 ok: true,
 sourceFile: 'catalog.json',
 dataFile: DATA_FILE,
 total: filtered.length,
 items: summary.brands,
 });
 }

 if (view === 'sources') {
 return json(res, 200, {
 ok: true,
 sourceFile: 'catalog.json',
 dataFile: DATA_FILE,
 total: filtered.length,
 items: summary.sources,
 });
 }

 const page = paginate(sorted, req.query || {});
 return json(res, 200, {
 ok: true,
 sourceFile: 'catalog.json',
 dataFile: DATA_FILE,
 summary,
 ...page,
 });
 } catch (error) {
 return json(res, 500, {
 ok: false,
 error: error.message || 'Product catalog request failed.',
 });
 }
};
