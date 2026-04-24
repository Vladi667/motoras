const { getProduct, getView, queryProducts } = require('../../lib/api/catalog/gateway');
const { json } = require('../../lib/api/catalog/types');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

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
