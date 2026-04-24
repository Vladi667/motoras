const { normalizeProduct, toNumber } = require('./types');
const { overrideKey } = require('./admin-config');

function applyMargin(product, margins) {
  const item = normalizeProduct(product);
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

function applyProductOverride(product, overrides) {
  const item = normalizeProduct(product);
  const override = overrides[overrideKey(item.source, item.id)] || overrides[overrideKey(item.source, item.sku)];
  if (!override) return item;
  if (override.hidden) return null;

  return normalizeProduct({
    ...item,
    name: override.nameOverride || item.name,
    price: override.priceOverride === null || override.priceOverride === undefined ? item.price : override.priceOverride,
    stock: override.stockOverride === null || override.stockOverride === undefined ? item.stock : override.stockOverride,
    overrideApplied: true,
  });
}

function applyAdminRules(items, config = {}) {
  const margins = config.margins || {};
  const overrides = config.overrides || {};
  return items
    .map(normalizeProduct)
    .filter(item => margins[item.source] ? margins[item.source].enabled !== false : true)
    .map(item => applyProductOverride(item, overrides))
    .filter(Boolean)
    .map(item => applyMargin(item, margins));
}

module.exports = {
  applyAdminRules,
  applyMargin,
  applyProductOverride,
};
