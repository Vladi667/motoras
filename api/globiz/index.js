const { supplierQuery } = require('../../lib/api/catalog/gateway');
const { json } = require('../../lib/api/catalog/types');

const SOURCE = 'globiz';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  try {
    const result = await supplierQuery(SOURCE, req.query || {});
    return json(res, result.status || (result.ok ? 200 : 400), result);
  } catch (error) {
    return json(res, 500, { ok: false, source: SOURCE, error: error.message || 'Supplier request failed.' });
  }
};
