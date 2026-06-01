const { getProduct, getView, queryProducts } = require('../../lib/api/catalog/gateway');
const { json } = require('../../lib/api/catalog/types');
const { renderProductPage, renderCategoryPage } = require('../../lib/api/render-seo');
const { getProductReviews, addReview } = require('../../lib/api/reviews');
const { verifyUserToken, readBearerToken } = require('../../lib/api/auth-lib');
const { readJson } = require('../../lib/api/stripe');

// Phase 3 Task 1: only price-free response types are safe to cache at the
// edge. Anything carrying prices/stock/badges/overrides must always run
// through the function so admin changes propagate on the next request.
const CACHEABLE_VIEWS = new Set(['categories', 'summary', 'brands', 'sources']);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Token');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

  // Product reviews API (folded in to respect the 12-function limit).
  // GET ?reviews=<id> is public; POST requires a valid user token.
  if (req.query && req.query.reviews !== undefined) {
    if (req.method === 'GET') {
      const id = String(req.query.reviews || req.query.id || '');
      const data = await getProductReviews(id);
      res.setHeader('Cache-Control', 'no-store');
      return json(res, data.ok ? 200 : 400, data);
    }
    if (req.method === 'POST') {
      const user = verifyUserToken(readBearerToken(req));
      if (!user) return json(res, 401, { ok: false, error: 'Trebuie să fii autentificat pentru a lăsa o recenzie.' });
      let body = {};
      try { body = await readJson(req); } catch (_) { body = {}; }
      const id = String(body.id || body.productId || req.query.reviews || '');
      const result = await addReview(id, user, body);
      res.setHeader('Cache-Control', 'no-store');
      return json(res, result.ok ? 200 : (result.status || 400), result);
    }
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  // Server-side SEO render for /product.html and /category.html
  // (routed here via ?render=product|category).
  const renderMode = req.method === 'GET' ? String((req.query && req.query.render) || '') : '';
  if (renderMode === 'product' || renderMode === 'category') {
    const out = renderMode === 'category'
      ? await renderCategoryPage(req.query || {})
      : await renderProductPage(req.query || {});
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
