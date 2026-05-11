// Removed in Phase 2 (2026-05-11). The runtime CP-1252 / mojibake fixer is
// no longer necessary because lib/api/catalog/types.js::normalizeText cleans
// strings server-side before the browser ever sees them, and api.js no
// longer carries inline encoding artifacts. This file remains as a no-op
// stub for one release cycle so previously-cached HTML pages that still
// reference /text-normalize.js don't get a 404 in DevTools.
