const {
  SUPPLIERS,
  readMargins,
  writeMargins,
  readProductOverrides,
  writeProductOverride,
  deleteProductOverride,
} = require('../../lib/api/catalog/admin-config');
const { readPublicCatalog, buildSummary } = require('../../lib/api/catalog/gateway');
const { json } = require('../../lib/api/catalog/types');

const ADMIN_USER = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || '';
const LOW_STOCK_THRESHOLD = 3;

function requireAdmin(req) {
  const auth = req.headers && req.headers.authorization;
  if (!auth) return false;
  const [scheme, encoded] = auth.split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  try {
    const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':');
    return user === ADMIN_USER && pass === ADMIN_PASS;
  } catch (_) {
    return false;
  }
}

async function readJson(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        if (data.startsWith('payload=')) {
          resolve(JSON.parse(decodeURIComponent(data.slice(8))));
        } else {
          resolve(JSON.parse(data || '{}'));
        }
      } catch (_) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

async function handleMargins(req, res) {
  if (!requireAdmin(req)) {
    return json(res, 401, { ok: false, error: 'Admin authentication required.' });
  }

  if (req.method === 'GET') {
    const margins = await readMargins();
    return json(res, 200, { ok: true, margins, suppliers: SUPPLIERS });
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    const input = body.margins || body;
    const { margins, persisted } = await writeMargins(input);
    return json(res, 200, { ok: true, margins, persisted });
  }

  res.setHeader('Allow', 'GET,POST');
  return json(res, 405, { ok: false, error: 'Method not allowed.' });
}

async function handleDashboard(req, res) {
  if (!requireAdmin(req)) {
    return json(res, 401, { ok: false, error: 'Admin authentication required.' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const catalog = await readPublicCatalog();
  const catalogSummary = buildSummary(catalog);
  const lowStock = catalog
    .filter(item => item.stock > 0 && item.stock <= LOW_STOCK_THRESHOLD)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 20)
    .map(item => ({ id: item.id, name: item.name, source: item.source, stock: item.stock, price: item.price }));

  return json(res, 200, {
    ok: true,
    total: catalogSummary.total,
    inStock: catalogSummary.inStock,
    outOfStock: catalogSummary.outOfStock,
    lowStock,
    categories: catalogSummary.categories,
    sources: catalogSummary.sources,
  });
}

async function handleProductOverrides(req, res) {
  if (!requireAdmin(req)) {
    return json(res, 401, { ok: false, error: 'Admin authentication required.' });
  }

  if (req.method === 'GET') {
    const overrides = await readProductOverrides();
    return json(res, 200, { ok: true, overrides });
  }

  const body = await readJson(req);
  const source = String(body.source || '').trim();
  const id = String(body.id || body.sku || '').trim();
  if (!source || !id) return json(res, 400, { ok: false, error: 'Missing source or id.' });

  if (req.method === 'DELETE') {
    const result = await deleteProductOverride(source, id);
    return json(res, 200, { ok: true, ...result });
  }

  if (req.method === 'POST' || req.method === 'PATCH') {
    const result = await writeProductOverride(source, id, body.override || body);
    return json(res, 200, { ok: true, ...result });
  }

  res.setHeader('Allow', 'GET,POST,PATCH,DELETE');
  return json(res, 405, { ok: false, error: 'Method not allowed.' });
}

module.exports = async function handler(req, res) {
  const action = String((req.query && req.query.action) || '').trim().toLowerCase();

  if (action === 'margins') return handleMargins(req, res);
  if (action === 'dashboard') return handleDashboard(req, res);
  if (action === 'product-overrides') return handleProductOverrides(req, res);

  return json(res, 404, { ok: false, error: 'Unknown admin action.' });
};
