// Shared HTTP handler wiring for /api/<supplier> endpoints.
// Delegates data to the registry adapter, applies admin rules via the gateway,
// and preserves the legacy response shapes (brands grid, count view, summary view).
const { getAdapter } = require('./registry');
const { readMargins, readProductOverrides } = require('./admin-config');
const { applyAdminRules } = require('./apply-admin-rules');
const { json } = require('./types');

async function readAdminConfig() {
  const [margins, overrides] = await Promise.all([readMargins(), readProductOverrides()]);
  return { margins, overrides };
}

function pickMarginPct(margins, source) {
  const cfg = margins && margins[source];
  if (!cfg || cfg.enabled === false) return 0;
  return Number(cfg.margin) || 0;
}

module.exports = function makeSupplierHandler(source) {
  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { ok: false, error: 'Method not allowed.' });
    }

    const adapter = getAdapter(source);
    if (!adapter) return json(res, 404, { ok: false, source, error: 'Unknown supplier.' });

    try {
      const query = req.query || {};
      const config = await readAdminConfig();
      const marginPct = pickMarginPct(config.margins, source);

      // Single-item lookup
      if (query.id || query.sku || query.oem) {
        const detail = await adapter.getById(String(query.id || query.sku || query.oem));
        if (!detail.ok) return json(res, detail.status || 404, detail);
        const ruled = applyAdminRules([detail.item], config);
        if (!ruled.length) return json(res, 404, { ok: false, source, error: 'Product hidden.' });
        return json(res, 200, { ok: true, source, marginPct, item: ruled[0] });
      }

      // Paged list + summary
      const list = await adapter.list(query);
      const items = applyAdminRules(list.items || [], config);
      const summary = await adapter.summary(query);
      const brands = summary.brands || [];
      const view = String(query.view || '').trim().toLowerCase();

      if (view === 'count') {
        const inStock = items.filter(item => Number(item.stock) > 0).length;
        return json(res, 200, {
          ok: true,
          source,
          total: list.total,
          totalBrands: brands.length,
          inStock,
          outOfStock: items.length - inStock,
          marginPct,
        });
      }

      if (view === 'brands' || view === 'summary') {
        return json(res, 200, {
          ok: true,
          source,
          totalItems: list.total,
          totalBrands: brands.length,
          marginPct,
          brands,
        });
      }

      return json(res, 200, {
        ok: true,
        source,
        total: list.total,
        page: list.page,
        pages: list.pages,
        limit: list.limit,
        totalBrands: brands.length,
        marginPct,
        brands,
        items,
      });
    } catch (error) {
      return json(res, 500, { ok: false, source, error: error.message || 'Supplier request failed.' });
    }
  };
};
