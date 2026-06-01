const { getProduct, getView, queryProducts } = require('../../lib/api/catalog/gateway');
const { json } = require('../../lib/api/catalog/types');
const { renderProductPage } = require('../../lib/api/render-seo');

// Phase 3 Task 1: only price-free response types are safe to cache at the
// edge. Anything carrying prices/stock/badges/overrides must always run
// through the function so admin changes propagate on the next request.
const CACHEABLE_VIEWS = new Set(['categories', 'summary', 'brands', 'sources']);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Server-side SEO render for /product.html (routed here via ?render=product).
  if (req.method === 'GET' && String((req.query && req.query.render) || '') === 'product') {
    const out = await renderProductPage(req.query || {});
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', out.cacheControl);
    return res.end(out.html);
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.setHeader('Cache-Control', 'no-store');
    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const t0 = Date.now();
  try {
    const query = req.query || {};
    const isIdLookup = Boolean(query.id || query.sku || query.oem);
    const view = String(query.view || '').trim().toLowerCase();
    const priceFree = !isIdLookup && CACHEABLE_VIEWS.has(view);

    // Set cache headers BEFORE running the handler so they take effect
    // even if the response is later overridden by an error path.
    if (priceFree) {
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }

    let result;
    if (isIdLookup) {
      result = await getProduct(query);
    } else if (view) {
      result = await getView(view, query);
    } else {
      result = await queryProducts(query);
    }

    const totalMs = Date.now() - t0;
    res.setHeader('Server-Timing', `gateway;dur=${totalMs}`);

    const status = isIdLookup ? (result.status || (result.ok ? 200 : 404)) : 200;
    return json(res, status, result);
  } catch (error) {
    const totalMs = Date.now() - t0;
    res.setHeader('Server-Timing', `gateway;dur=${totalMs};desc="error"`);
    res.setHeader('Cache-Control', 'no-store');
    return json(res, 500, { ok: false, error: error.message || 'Product request failed.' });
  }
};
