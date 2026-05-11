// Compatibility shim. The canonical implementation now lives in
// lib/api/catalog/admin-config.js. Keep this file so callers that
// require('../lib/api/margins') continue to resolve.
const {
  DEFAULT_MARGINS,
  SUPPLIERS,
  applyMarginToPrice,
  readMargins,
} = require('./catalog/admin-config');

module.exports = {
  readMargins,
  applyMargin: applyMarginToPrice,
  DEFAULTS: DEFAULT_MARGINS,
  SUPPLIERS,
};
