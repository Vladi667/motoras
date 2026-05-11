const https = require('https');
const priceCatalog = require('../../api/casabateriilor/prices.generated.json');

const CSV_URL = 'https://api.flasher.ro/csv.php';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

let cache = null;
let cacheAt = 0;

function normalizeProductCode(value) {
 return String(value || '')
 .replace(/\s+/g, '')
 .trim();
}

const priceMap = new Map(
 (Array.isArray(priceCatalog.items) ? priceCatalog.items : []).map((item) => [
 normalizeProductCode(item.code),
 item,
 ])
);

function json(res, status, payload) {
 res.statusCode = status;
 res.setHeader('Content-Type', 'application/json; charset=utf-8');
 res.end(JSON.stringify(payload));
}

function fetchUrl(url) {
 return new Promise((resolve, reject) => {
 https.get(url, (res) => {
 let data = '';
 res.on('data', (chunk) => {
 data += chunk;
 });
 res.on('end', () => resolve(data));
 }).on('error', reject);
 });
}

// Parse CSV by splitting on the first comma only. The remote file is sku,image.
function parseCsv(text) {
 const rows = [];
 const lines = text.trim().split(/\r?\n/);
 for (let i = 1; i < lines.length; i += 1) {
 const line = lines[i].trim();
 if (!line) continue;
 const commaIndex = line.indexOf(',');
 if (commaIndex === -1) continue;
 const sku = normalizeProductCode(line.slice(0, commaIndex).replace(/^"|"$/g, ''));
 const img = line.slice(commaIndex + 1).replace(/^"|"$/g, '').trim();
 if (sku && img) rows.push({ sku, img });
 }
 return rows;
}

function baseEan(sku) {
 return normalizeProductCode(sku).replace(/_\d+$/, '');
}

function slugify(value) {
 return String(value || '')
 .normalize('NFD')
 .replace(/[\u0300-\u036f]/g, '')
 .toLowerCase()
 .replace(/[^a-z0-9]+/g, '-')
 .replace(/^-+|-+$/g, '') || 'baterie';
}

function toNumber(value, fallback = 0) {
 const n = Number(value);
 return Number.isFinite(n) ? n : fallback;
}

function toPositiveInt(value, fallback, max) {
 const n = parseInt(value, 10);
 if (!Number.isFinite(n) || n < 1) return fallback;
 return max != null ? Math.min(n, max) : n;
}

function getPriceEntry(ean) {
 return priceMap.get(normalizeProductCode(ean)) || null;
}

async function fetchCatalog() {
 const now = Date.now();
 if (cache && now - cacheAt < CACHE_TTL_MS) return cache;

 const text = await fetchUrl(CSV_URL);
 const rows = parseCsv(text);

 // Group images by base EAN and enrich with PDF-derived pricing data.
 const map = new Map();
 for (const { sku, img } of rows) {
 const ean = baseEan(sku);
 const priceEntry = getPriceEntry(ean);
 const price = toNumber(priceEntry?.price, 0);

 // Do not expose supplier items with missing pricing to the storefront.
 if (!priceEntry || price <= 0) continue;

 if (!map.has(ean)) {
 map.set(ean, {
 id: ean,
 sku: ean,
 ean,
 name: String(priceEntry?.name || `Baterie Auto - ${ean}`).trim(),
 brand: 'Casa Bateriilor',
 brandKey: 'casa-bateriilor',
 cat: 'baterii',
 subcat: 'baterii-auto',
 catLabel: 'Baterii Auto',
 subcatLabel: 'Baterii Auto',
 price,
 stock: 99,
 inStock: true,
 img: '',
 images: [],
 priceCurrency: priceCatalog.currency || 'RON',
 priceVatIncluded: Boolean(priceCatalog.vatIncluded),
 priceSourceFile: priceCatalog.sourceFile || '',
 unit: String(priceEntry?.um || '').trim(),
 source: 'casabateriilor',
 });
 }

 const product = map.get(ean);
 if (!product.images.includes(img)) product.images.push(img);
 if (!product.img) product.img = img;
 }

 const items = Array.from(map.values()).sort((a, b) => a.ean.localeCompare(b.ean));

 cache = items;
 cacheAt = now;
 return items;
}

function filterItems(items, query = {}) {
 const q = String(query.q || '').toLowerCase().trim();
 const stockFilter = String(query.stock || 'all').toLowerCase();

 return items.filter((item) => {
 if (!item.price || item.price <= 0) return false;
 if (stockFilter === 'in' && !item.inStock) return false;
 if (stockFilter === 'out' && item.inStock) return false;
 if (q) {
 const haystack = [item.sku, item.ean, item.name].join(' ').toLowerCase();
 if (!haystack.includes(q)) return false;
 }
 return true;
 });
}

function paginate(items, query = {}) {
 const page = toPositiveInt(query.page, 1);
 const limit = toPositiveInt(query.limit, 50, 500);
 const total = items.length;
 const pages = Math.max(1, Math.ceil(total / limit));
 const safePage = Math.min(page, pages);
 return {
 total,
 page: safePage,
 limit,
 pages,
 items: items.slice((safePage - 1) * limit, safePage * limit),
 };
}

function buildBrandSummary(items) {
 return [{
 key: 'casa-bateriilor',
 label: 'Casa Bateriilor',
 count: items.length,
 inStock: items.filter((item) => item.inStock).length,
 outOfStock: 0,
 }];
}

function buildCategorySummary(items) {
 return [{
 cat: 'baterii',
 catLabel: 'Baterii Auto',
 subcat: 'baterii-auto',
 subcatLabel: 'Baterii Auto',
 count: items.length,
 }];
}

module.exports = { fetchCatalog, filterItems, paginate, buildBrandSummary, buildCategorySummary, json };
