// IndexNow integration — instantly push URL changes to Bing (and from there,
// to DuckDuckGo, ChatGPT Search, Perplexity, Yandex). Spec: https://indexnow.org
//
// GET  /api/indexnow         → pings the homepage + top static URLs (smoke test)
// GET  /api/indexnow?full=1  → pings ALL public URLs (sitemap + product catalog)
// POST /api/indexnow         → ping a custom URL list, body { urls: [...] }
//
// Auth: admin token required (same as other admin endpoints). Public exposure
// would let anyone spam Bing on the site's behalf, which Bing will detect and
// penalize.

const { readPublicCatalog } = require('../lib/api/catalog/gateway');
const { requireAdmin } = require('../lib/api/admin-auth');
const { json, readJson } = require('../lib/api/stripe');

const HOST = 'www.pieseautomotoras.ro';
const KEY = '37f01d9dc964a6c855d04c1bbc47a107';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const BATCH_SIZE = 10000; // IndexNow limit per request

// Static high-priority URLs that should always be in the ping set.
const STATIC_URLS = [
 '/',
 '/piese-auto',
 '/detailing',
 '/baterii',
 '/filtre',
 '/accesorii',
 '/huse-prelate',
 '/contact.html',
 '/livrare.html',
 '/retururi.html',
 '/faq.html',
 '/despre.html',
 '/piese-auto-online',
 '/piese-auto-bucuresti',
 '/magazin-piese-auto-romania',
 '/piese-auto-livrare-nationala',
 '/piese-auto-ieftine',
 '/cumpara-piese-auto-online',
 '/piese-auto-dupa-marca-si-model',
 '/verificare-compatibilitate-piese-auto',
 '/harta-pagini-piese-auto',
].map(p => `https://${HOST}${p}`);

async function pingIndexNow(urls) {
 if (!Array.isArray(urls) || !urls.length) return { batches: 0, totalUrls: 0, results: [] };
 const results = [];
 for (let i = 0; i < urls.length; i += BATCH_SIZE) {
 const batch = urls.slice(i, i + BATCH_SIZE);
 try {
 const response = await fetch(ENDPOINT, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json; charset=utf-8' },
 body: JSON.stringify({
 host: HOST,
 key: KEY,
 keyLocation: KEY_LOCATION,
 urlList: batch,
 }),
 });
 results.push({ batch: i / BATCH_SIZE, status: response.status, count: batch.length });
 } catch (err) {
 results.push({ batch: i / BATCH_SIZE, status: 'error', error: err.message, count: batch.length });
 }
 }
 return { batches: results.length, totalUrls: urls.length, results };
}

module.exports = async function handler(req, res) {
 if (!requireAdmin(req)) return json(res, 401, { ok: false, error: 'Admin authentication required.' });

 try {
 let urls;
 if (req.method === 'POST') {
 const body = await readJson(req);
 if (!Array.isArray(body.urls) || !body.urls.length) {
 return json(res, 400, { ok: false, error: 'Body must contain a non-empty `urls` array.' });
 }
 urls = body.urls.filter(u => typeof u === 'string' && u.startsWith(`https://${HOST}/`));
 } else if (req.method === 'GET') {
 const full = String(req.query?.full || '').trim() === '1';
 if (full) {
 const catalog = await readPublicCatalog();
 const productUrls = catalog
 .filter(p => p && p.id)
 .map(p => `https://${HOST}/product.html?id=${encodeURIComponent(String(p.id))}`);
 urls = [...STATIC_URLS, ...productUrls];
 } else {
 urls = STATIC_URLS;
 }
 } else {
 res.setHeader('Allow', 'GET, POST');
 return json(res, 405, { ok: false, error: 'Method not allowed.' });
 }

 const result = await pingIndexNow(urls);
 return json(res, 200, { ok: true, ...result });
 } catch (error) {
 return json(res, 500, { ok: false, error: error.message || 'IndexNow ping failed.' });
 }
};
