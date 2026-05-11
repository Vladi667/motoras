const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(process.cwd(), 'catalog.json');
const LOW_STOCK_THRESHOLD = 3;

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

function normalizeKey(value, fallback = 'general') {
 return normalizeText(value)
 .normalize('NFD')
 .replace(/[\u0300-\u036f]/g, '')
 .toLowerCase()
 .replace(/&/g, ' and ')
 .replace(/[^a-z0-9]+/g, '-')
 .replace(/^-+|-+$/g, '') || fallback;
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
 if (['low', 'critical', 'low-stock'].includes(normalized)) return 'low';
 return 'all';
}

function hydrateItem(item) {
 const price = toNumber(item.price, 0);
 const stock = toNumber(item.stock, 0);
 const brand = normalizeText(item.brand || item.subcatLabel || 'General');
 const category = normalizeText(item.cat || 'general');
 const subcategory = normalizeText(item.subcat || 'general');
 const source = normalizeText(item.source || 'catalog');

 return {
 ...item,
 price,
 stock,
 brand,
 brandKey: normalizeKey(brand),
 category,
 categoryKey: normalizeKey(category),
 subcategory,
 subcategoryKey: normalizeKey(subcategory),
 source,
 sourceKey: normalizeKey(source),
 inStock: stock > 0,
 lowStock: stock > 0 && stock <= LOW_STOCK_THRESHOLD,
 };
}

function readCatalog() {
 const stats = fs.statSync(DATA_FILE);
 if (cachedItems && cachedMtimeMs === stats.mtimeMs) return cachedItems;

 const raw = fs.readFileSync(DATA_FILE, 'utf8');
 const parsed = JSON.parse(raw);
 const items = Array.isArray(parsed)
 ? parsed
 .map(hydrateItem)
 .sort((left, right) =>
 Number(right.inStock) - Number(left.inStock) ||
 left.category.localeCompare(right.category, 'ro') ||
 left.brand.localeCompare(right.brand, 'ro') ||
 normalizeText(left.name).localeCompare(normalizeText(right.name), 'ro')
 )
 : [];

 cachedMtimeMs = stats.mtimeMs;
 cachedItems = items;
 return items;
}

function summarizeBy(items, getKey, getLabel) {
 const grouped = new Map();

 items.forEach((item) => {
 const key = getKey(item);
 if (!grouped.has(key)) {
 grouped.set(key, {
 key,
 label: getLabel(item),
 count: 0,
 inStock: 0,
 outOfStock: 0,
 lowStock: 0,
 });
 }

 const entry = grouped.get(key);
 entry.count += 1;
 if (item.inStock) entry.inStock += 1;
 else entry.outOfStock += 1;
 if (item.lowStock) entry.lowStock += 1;
 });

 return Array.from(grouped.values()).sort((left, right) =>
 right.count - left.count ||
 left.label.localeCompare(right.label, 'ro')
 );
}

function buildSummary(items) {
 const total = items.length;
 const inStock = items.filter(item => item.inStock).length;
 const outOfStock = total - inStock;
 const lowStock = items.filter(item => item.lowStock).length;
 const totalValue = items.reduce((sum, item) => sum + item.price, 0);

 return {
 total,
 inStock,
 outOfStock,
 lowStock,
 averagePrice: total ? Number((totalValue / total).toFixed(2)) : 0,
 categories: summarizeBy(items, item => item.categoryKey, item => item.category),
 brands: summarizeBy(items, item => item.brandKey, item => item.brand),
 sources: summarizeBy(items, item => item.sourceKey, item => item.source),
 };
}

function filterItems(items, query = {}) {
 const textQuery = normalizeText(query.q).toLowerCase();
 const categoryQuery = normalizeText(query.cat || query.category).toLowerCase();
 const subcategoryQuery = normalizeText(query.subcat || query.subcategory).toLowerCase();
 const brandQuery = normalizeText(query.brand || query.brandKey).toLowerCase();
 const sourceQuery = normalizeText(query.source).toLowerCase();
 const stockFilter = normalizeStockFilter(query.stock || query.inStock);

 return items.filter((item) => {
 if (categoryQuery) {
 const matches = item.category.toLowerCase() === categoryQuery || item.categoryKey === normalizeKey(categoryQuery);
 if (!matches) return false;
 }

 if (subcategoryQuery) {
 const matches = item.subcategory.toLowerCase() === subcategoryQuery || item.subcategoryKey === normalizeKey(subcategoryQuery);
 if (!matches) return false;
 }

 if (brandQuery) {
 const matches = item.brand.toLowerCase() === brandQuery || item.brandKey === normalizeKey(brandQuery);
 if (!matches) return false;
 }

 if (sourceQuery) {
 const matches = item.source.toLowerCase() === sourceQuery || item.sourceKey === normalizeKey(sourceQuery);
 if (!matches) return false;
 }

 if (stockFilter === 'in' && !item.inStock) return false;
 if (stockFilter === 'out' && item.inStock) return false;
 if (stockFilter === 'low' && !item.lowStock) return false;

 if (textQuery) {
 const haystack = [
 item.id,
 item.sku,
 item.oem,
 item.name,
 item.brand,
 item.category,
 item.subcategory,
 item.source,
 ].map(value => normalizeText(value).toLowerCase()).join(' ');

 if (!haystack.includes(textQuery)) return false;
 }

 return true;
 });
}

function buildSearchHaystack(item) {
 return [
 item.id,
 item.sku,
 item.oem,
 item.name,
 item.brand,
 item.category,
 item.subcategory,
 item.source,
 ].map(value => normalizeText(value).toLowerCase()).join(' ');
}

function escapeRegex(value) {
 return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scoreSearchItem(item, query) {
 const q = normalizeText(query).toLowerCase();
 if (!q) return 0;

 const name = normalizeText(item.name).toLowerCase();
 const brand = normalizeText(item.brand).toLowerCase();
 const sku = normalizeText(item.sku || item.id).toLowerCase();
 const oem = normalizeText(item.oem).toLowerCase();
 const haystack = buildSearchHaystack(item);
 if (!haystack.includes(q)) return 0;

 let score = 0;
 if (name === q) score += 1400;
 if (sku === q || oem === q) score += 1500;
 if (name.startsWith(q)) score += 900;
 if (brand === q) score += 800;
 if (brand.startsWith(q)) score += 420;
 if (name.includes(q)) score += 280;
 if (sku.includes(q) || oem.includes(q)) score += 520;

 const tokens = q.split(/\s+/).filter(Boolean);
 tokens.forEach((token) => {
 const tokenRegex = new RegExp(`\\b${escapeRegex(token)}`, 'i');
 if (tokenRegex.test(name)) score += 120;
 else if (name.includes(token)) score += 70;

 if (brand.includes(token)) score += 45;
 if (sku.includes(token) || oem.includes(token)) score += 95;
 });

 if (item.inStock) score += 30;
 score += Math.min(Number(item.stock || 0), 20);
 return score;
}

function rankSearchItems(items, query) {
 const ranked = items
 .map(item => ({ item, score: scoreSearchItem(item, query) }))
 .filter(entry => entry.score > 0)
 .sort((left, right) =>
 right.score - left.score ||
 Number(right.item.stock || 0) - Number(left.item.stock || 0) ||
 String(left.item.name || '').localeCompare(String(right.item.name || ''), 'ro')
 );

 const topScore = ranked[0]?.score || 0;
 if (topScore >= 1200) {
 return ranked.filter(entry => entry.score >= Math.max(380, Math.round(topScore * 0.42)));
 }
 if (topScore >= 700) {
 return ranked.filter(entry => entry.score >= Math.max(220, Math.round(topScore * 0.32)));
 }
 return ranked;
}

function sortItems(items, sort) {
 const normalized = normalizeText(sort).toLowerCase();
 const sorted = [...items];

 switch (normalized) {
 case 'price_asc':
 sorted.sort((left, right) => left.price - right.price || left.name.localeCompare(right.name, 'ro'));
 break;
 case 'price_desc':
 sorted.sort((left, right) => right.price - left.price || left.name.localeCompare(right.name, 'ro'));
 break;
 case 'stock_asc':
 sorted.sort((left, right) => left.stock - right.stock || left.name.localeCompare(right.name, 'ro'));
 break;
 case 'stock_desc':
 sorted.sort((left, right) => right.stock - left.stock || left.name.localeCompare(right.name, 'ro'));
 break;
 case 'brand':
 sorted.sort((left, right) => left.brand.localeCompare(right.brand, 'ro') || left.name.localeCompare(right.name, 'ro'));
 break;
 case 'category':
 sorted.sort((left, right) => left.category.localeCompare(right.category, 'ro') || left.name.localeCompare(right.name, 'ro'));
 break;
 case 'name':
 sorted.sort((left, right) => left.name.localeCompare(right.name, 'ro'));
 break;
 default:
 sorted.sort((left, right) =>
 Number(right.inStock) - Number(left.inStock) ||
 Number(right.stock) - Number(left.stock) ||
 left.name.localeCompare(right.name, 'ro')
 );
 break;
 }

 return sorted;
}

function paginate(items, query = {}) {
 const page = toPositiveInt(query.page, 1);
 const limit = toPositiveInt(query.limit, 50, 500);
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
 DATA_FILE,
 LOW_STOCK_THRESHOLD,
 buildSearchHaystack,
 buildSummary,
 filterItems,
 findByIdentity,
 json,
 paginate,
 readCatalog,
 rankSearchItems,
 scoreSearchItem,
 sortItems,
 summarizeBy,
};
