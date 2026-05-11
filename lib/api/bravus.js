const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(process.cwd(), 'catalog.json');

let cachedMtimeMs = 0;
let cachedItems = null;

function json(res, status, payload) {
 res.statusCode = status;
 res.setHeader('Content-Type', 'application/json; charset=utf-8');
 res.end(JSON.stringify(payload));
}

function normalizeText(value) {
 return String(value || '').trim();
}

function slugify(value) {
 return normalizeText(value)
 .normalize('NFD')
 .replace(/[\u0300-\u036f]/g, '')
 .toLowerCase()
 .replace(/&/g, ' and ')
 .replace(/[^a-z0-9]+/g, '-')
 .replace(/^-+|-+$/g, '') || 'general';
}

function toNumber(value, fallback = 0) {
 const parsed = Number(value);
 return Number.isFinite(parsed) ? parsed : fallback;
}

function toPositiveInt(value, fallback, max) {
 const parsed = parseInt(value, 10);
 if (!Number.isFinite(parsed) || parsed < 1) return fallback;
 return typeof max === 'number' ? Math.min(parsed, max) : parsed;
}

function normalizeStockFilter(value) {
 const normalized = normalizeText(value).toLowerCase();
 if (['1', 'true', 'yes', 'in', 'instock', 'in-stock'].includes(normalized)) return 'in';
 if (['0', 'false', 'no', 'out', 'outofstock', 'out-of-stock'].includes(normalized)) return 'out';
 return 'all';
}

function hydrateItem(item) {
 const brand = normalizeText(item.brand || item.subcatLabel || 'General');
 const stock = toNumber(item.stock, 0);
 return {
 ...item,
 brand,
 brandKey: slugify(brand),
 stock,
 inStock: stock > 0,
 };
}

function readBravusCatalog() {
 const stats = fs.statSync(DATA_FILE);
 if (cachedItems && cachedMtimeMs === stats.mtimeMs) return cachedItems;

 const raw = fs.readFileSync(DATA_FILE, 'utf8');
 const text = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
 const parsed = JSON.parse(text);
 const items = Array.isArray(parsed)
 ? parsed
 .filter(item => normalizeText(item?.source).toLowerCase() === 'bravus')
 .map(hydrateItem)
 .sort((left, right) =>
 left.brand.localeCompare(right.brand, 'ro') ||
 normalizeText(left.name).localeCompare(normalizeText(right.name), 'ro') ||
 normalizeText(left.id).localeCompare(normalizeText(right.id), 'ro')
 )
 : [];

 cachedMtimeMs = stats.mtimeMs;
 cachedItems = items;
 return items;
}

function buildBrandSummary(items) {
 const grouped = new Map();

 items.forEach((item) => {
 const key = item.brandKey || slugify(item.brand);
 if (!grouped.has(key)) {
 grouped.set(key, {
 key,
 label: item.brand || 'General',
 count: 0,
 inStock: 0,
 outOfStock: 0,
 sampleIds: [],
 });
 }

 const entry = grouped.get(key);
 entry.count += 1;
 if (item.inStock) entry.inStock += 1;
 else entry.outOfStock += 1;
 if (entry.sampleIds.length < 5) entry.sampleIds.push(item.id);
 });

 return Array.from(grouped.values()).sort((left, right) =>
 right.count - left.count ||
 left.label.localeCompare(right.label, 'ro')
 );
}

function filterItems(items, query = {}) {
 const brandQuery = normalizeText(query.brand || query.brandKey).toLowerCase();
 const searchQuery = normalizeText(query.q).toLowerCase();
 const stockFilter = normalizeStockFilter(query.stock || query.inStock);

 return items.filter((item) => {
 if (!item.price || item.price <= 0) return false;

 if (brandQuery) {
 const matchesBrand = item.brand.toLowerCase() === brandQuery || item.brandKey === slugify(brandQuery);
 if (!matchesBrand) return false;
 }

 if (stockFilter === 'in' && !item.inStock) return false;
 if (stockFilter === 'out' && item.inStock) return false;

 if (searchQuery) {
 const haystack = [
 item.id,
 item.sku,
 item.oem,
 item.brand,
 item.brandKey,
 item.name,
 item.subcat,
 item.subcatLabel,
 ].map(value => normalizeText(value).toLowerCase()).join(' ');

 if (!haystack.includes(searchQuery)) return false;
 }

 return true;
 });
}

function paginate(items, query = {}) {
 const page = toPositiveInt(query.page, 1);
 const limit = toPositiveInt(query.limit, 100, 500);
 const total = items.length;
 const pages = Math.max(1, Math.ceil(total / limit));
 const safePage = Math.min(page, pages);
 const start = (safePage - 1) * limit;

 return {
 total,
 page: safePage,
 limit,
 pages,
 items: items.slice(start, start + limit),
 };
}

function findByIdentity(items, query = {}) {
 const id = normalizeText(query.id);
 const sku = normalizeText(query.sku);
 if (!id && !sku) return null;

 return items.find(item =>
 (id && normalizeText(item.id) === id) ||
 (sku && normalizeText(item.sku) === sku)
 ) || null;
}

module.exports = {
 buildBrandSummary,
 DATA_FILE,
 filterItems,
 findByIdentity,
 json,
 paginate,
 readBravusCatalog,
};
