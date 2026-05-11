// Phase 5 (Task 5A, 2026-05-12): refactored to eliminate redundant normalize
// passes. Every caller of applyAdminRules (gateway.readPublicCatalog,
// gateway.supplierQuery, supplier-handler.js) feeds items that have already
// been classified + normalized by readRawCatalog / readSupplierCatalog /
// adapter.all(). Re-normalizing inside the apply chain was wasted CPU —
// roughly 3 calls × 3,567 items × ~15 string-trims per call on every
// uncached /api/products request.
//
// Invariants the callers must keep (gateway smoke test enforces them):
//   1. Items entering applyAdminRules are already normalizeProduct()'d.
//   2. Margin and override sanitization happened at write time
//      (admin-config.sanitizeMarginConfig / sanitizeOverride), so the
//      override fields can be assigned without re-normalizing.
//
// One normalize call remains: when an override actually mutates name/price/
// stock, the resulting object is re-spread through normalizeProduct so the
// shape stays consistent with what gateway expects.

const { normalizeProduct, toNumber } = require('./types');
const { overrideKey } = require('./admin-config');

function applyMargin(item, margins) {
  const cfg = margins[item.source];
  if (!cfg) return item;
  const margin = toNumber(cfg.margin, 0);
  if (margin === 0) return item;
  return {
    ...item,
    basePrice: item.basePrice || item.price,
    price: Math.round(item.price * (1 + margin / 100) * 100) / 100,
    marginApplied: margin,
  };
}

function applyProductOverride(item, overrides) {
  const override =
    overrides[overrideKey(item.source, item.id)] ||
    overrides[overrideKey(item.source, item.sku)];
  if (!override) return item;
  if (override.hidden) return null;

  return normalizeProduct({
    ...item,
    name: override.nameOverride || item.name,
    price:
      override.priceOverride === null || override.priceOverride === undefined
        ? item.price
        : override.priceOverride,
    stock:
      override.stockOverride === null || override.stockOverride === undefined
        ? item.stock
        : override.stockOverride,
    overrideApplied: true,
  });
}

function applyAdminRules(items, config = {}) {
  const margins = config.margins || {};
  const overrides = config.overrides || {};
  const hasOverrides = Object.keys(overrides).length > 0;

  // Fast path: no overrides at all — just filter disabled suppliers and apply
  // margins. No normalize calls anywhere in the hot loop.
  if (!hasOverrides) {
    const out = [];
    for (const item of items) {
      const cfg = margins[item.source];
      if (cfg && cfg.enabled === false) continue;
      out.push(applyMargin(item, margins));
    }
    return out;
  }

  // Slow path: overrides exist — apply per-item override after the supplier-
  // enable filter, drop hidden ones, then margin.
  const out = [];
  for (const item of items) {
    const cfg = margins[item.source];
    if (cfg && cfg.enabled === false) continue;
    const overridden = applyProductOverride(item, overrides);
    if (!overridden) continue;
    out.push(applyMargin(overridden, margins));
  }
  return out;
}

module.exports = {
  applyAdminRules,
  applyMargin,
  applyProductOverride,
};
