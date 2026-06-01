/**
 * MOTORAS catalog API backed by a generated catalog snapshot,
 * with the supplier XML feed kept as a fallback source.
 * Orders remain stored in localStorage for the static storefront.
 */

const _delay = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));

const _ordersKey = 'motoras_orders';
const _cartKey = 'motoras_cart';
const _lastOrder = 'motoras_last_order';
const _ratingsKey = 'motoras_product_ratings_v1';
// Phase 3 (Task 2): the 3-tier catalog candidate lists and supplier-feed
// fallback paths were removed. All product data now comes from /api/products.
const _fallbackImage = 'assets/product-placeholder.svg';
const _serverOrdersEndpoint = '/api/orders';
const _serverBravusEndpoint = '/api/bravus';
const _serverCasaBateriilorEndpoint = '/api/casabateriilor';
const _serverMarginsEndpoint = '/api/admin/margins';
const _serverProductsEndpoint = '/api/products';

// Margins cache "” refresh every 5 minutes
let _marginsCache = null;
let _marginsCacheAt = 0;
const _MARGINS_TTL = 5 * 60 * 1000;

async function _fetchMargins() {
 const now = Date.now();
 if (_marginsCache && now - _marginsCacheAt < _MARGINS_TTL) return _marginsCache;
 try {
 const res = await fetch(_serverMarginsEndpoint);
 if (!res.ok) throw new Error('margins fetch failed');
 const data = await res.json();
 if (data?.ok && data.margins) {
 _marginsCache = data.margins;
 _marginsCacheAt = now;
 return _marginsCache;
 }
 } catch (_) {}
 // Fallback defaults "” all enabled, 0 markup
 return { bravus: { enabled: true, margin: 0 }, carhub: { enabled: true, margin: 0 }, globiz: { enabled: true, margin: 0 }, casabateriilor: { enabled: true, margin: 0 } };
}

function _applyMargin(item, margins) {
 const src = String(item.source || '').toLowerCase();
 const cfg = margins[src];
 if (!cfg) return item;
 const margin = Number(cfg.margin) || 0;
 if (margin === 0) return item;
 const factor = 1 + margin / 100;
 const price = Math.round((Number(item.price) || 0) * factor * 100) / 100;
 const rawOld = Number(item.old) || 0;
 const old = rawOld > 0 ? Math.round(rawOld * factor * 100) / 100 : null;
 return { ...item, price, old: (old && old > price) ? old : null };
}

const _readOrders = () => JSON.parse(localStorage.getItem(_ordersKey) || '[]');
const _writeOrders = orders => localStorage.setItem(_ordersKey, JSON.stringify(orders));
const _readRatings = () => JSON.parse(localStorage.getItem(_ratingsKey) || '{}');
const _writeRatings = ratings => localStorage.setItem(_ratingsKey, JSON.stringify(ratings));

const _genId = () => 'ORD-' + Date.now().toString().slice(-7);
const _now = () => new Date().toISOString();
const _paymentStatusValues = ['paid', 'unpaid', 'refunded'];
const _orderStatusValues = ['pending', 'pending_payment', 'processing', 'shipped', 'delivered', 'cancelled'];

let _catalog = [];
let _catalogPromise = null;

async function _requestServer(path, options = {}) {
 try {
 const response = await fetch(path, {
 method: options.method || 'GET',
 headers: {
 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
 ...(options.headers || {}),
 },
 body: options.body ? new URLSearchParams({ payload: JSON.stringify(options.body) }).toString() : undefined,
 });
 const data = await response.json();
 return { ok: response.ok, status: response.status, data };
 } catch (_) {
 return { ok: false, status: 0, data: null };
 }
}

async function _requestJson(path, options = {}) {
 try {
 const response = await fetch(path, {
 method: options.method || 'GET',
 headers: {
 ...(options.headers || {}),
 },
 body: options.body,
 });
 const data = await response.json();
 return { ok: response.ok, status: response.status, data };
 } catch (_) {
 return { ok: false, status: 0, data: null };
 }
}

function _buildQueryString(params = {}) {
 const query = new URLSearchParams();
 Object.entries(params || {}).forEach(([key, value]) => {
 if (value === undefined || value === null || value === '') return;
 query.set(key, String(value));
 });
 return query.toString();
}

function _normalizeBravusBrandKey(value) {
 return _normalizeSearchText(value).replace(/\s+/g, '-');
}

function _filterLocalBravusItems(items = [], params = {}) {
 const brandQuery = _normalizeSearchText(params.brand || params.brandKey);
 const searchQuery = _normalizeSearchText(params.q);
 const stockQuery = String(params.stock ?? params.inStock ?? '').trim().toLowerCase();

 return items
 .filter(item => String(item.source || '').toLowerCase() === 'bravus')
 .filter((item) => {
 if (brandQuery) {
 const brand = _normalizeSearchText(item.brand || item.subcatLabel || '');
 const brandKey = _normalizeBravusBrandKey(item.brand || item.subcatLabel || '');
 const expectedKey = _normalizeBravusBrandKey(brandQuery);
 if (brand !== brandQuery && brandKey !== expectedKey) return false;
 }

 const inStock = Number(item.stock || 0) > 0;
 if (['1', 'true', 'yes', 'in', 'instock', 'in-stock'].includes(stockQuery) && !inStock) return false;
 if (['0', 'false', 'no', 'out', 'outofstock', 'out-of-stock'].includes(stockQuery) && inStock) return false;

 if (searchQuery) {
 const haystack = _normalizeSearchText([
 item.id,
 item.sku,
 item.oem,
 item.brand,
 item.name,
 item.subcat,
 item.subcatLabel,
 ].join(' '));
 if (!haystack.includes(searchQuery)) return false;
 }

 return true;
 })
 .map(item => ({
 ..._applyRatingSummary(item),
 brandKey: _normalizeBravusBrandKey(item.brand || item.subcatLabel || ''),
 inStock: Number(item.stock || 0) > 0,
 }))
 .sort((left, right) =>
 String(left.brand || '').localeCompare(String(right.brand || ''), 'ro') ||
 String(left.name || '').localeCompare(String(right.name || ''), 'ro')
 );
}

function _summarizeLocalBravusBrands(items = []) {
 const grouped = new Map();
 items.forEach((item) => {
 const key = item.brandKey || _normalizeBravusBrandKey(item.brand || item.subcatLabel || '');
 if (!grouped.has(key)) {
 grouped.set(key, {
 key,
 label: item.brand || item.subcatLabel || 'General',
 count: 0,
 inStock: 0,
 outOfStock: 0,
 });
 }
 const entry = grouped.get(key);
 entry.count += 1;
 if (item.inStock) entry.inStock += 1;
 else entry.outOfStock += 1;
 });

 return Array.from(grouped.values()).sort((left, right) =>
 right.count - left.count ||
 left.label.localeCompare(right.label, 'ro')
 );
}

function _storeLastOrder(order) {
 localStorage.setItem(_lastOrder, JSON.stringify(order));
 localStorage.setItem(_cartKey, '[]');
}

function _sortOrders(items = []) {
 return [...items].sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0));
}

function _mergeOrders(remote = [], local = []) {
 const merged = new Map();
 [...remote, ...local].forEach(order => {
 if (!order?.id) return;
 merged.set(order.id, order);
 });
 return _sortOrders(Array.from(merged.values()));
}

// Phase 3 (Task 2): removed _needsFullCatalog, _getCatalogCandidates,
// _readCatalogCache, _writeCatalogCache. All product data now comes from
// /api/products (server-side cached at the edge for view=categories/summary/
// brands/sources; uncached for price-bearing responses).

function _paymentMethodLabel(method) {
 return {
 card: 'Carte online',
 op: 'Transfer bancar',
 ramburs: 'Ramburs la livrare',
 }[method] || 'Plata';
}

// Phase 3 (Task 2): _categoryLabel kept as a tiny lookup for the few display
// paths that still hydrate items locally (admin panel, _applyRatingSummary).
// The server-side classifier in lib/api/catalog/classify.js holds the same
// table; this is purely a display-fallback safety surface.
function _categoryLabel(value) {
 return {
 piese: 'Piese Auto',
 accesorii: 'Accesorii Auto',
 detailing: 'Detailing',
 baterii: 'Baterii & Acumulatori',
 uleiuri: 'Uleiuri & Lubrifianti',
 filtre: 'Filtre Auto',
 prelate: 'Prelate Auto',
 'huse-prelate': 'Huse Exterior',
 ambreiaje: 'Ambreiaje',
 }[value] || 'Accesorii Auto';
}

// Phase 3 (Task 2): _subcategoryConfig (66 lines of regex), _resolveCategory
// (90 lines of scoring), _scoreMatches, _resolveSubcategory, _subcategoryLabel
// were removed. Classification happens server-side in
// lib/api/catalog/classify.js; the gateway returns each item with cat,
// subcat, and subcatLabel populated. These stubs keep the safety surface so
// any internal caller gets a benign default instead of ReferenceError.
function _subcategoryLabel() { return 'Selecție'; }
function _resolveSubcategory(item = {}) {
 if (item && typeof item.subcat === 'string' && item.subcat) return item.subcat;
 return 'general';
}
function _resolveCategory(item = {}) {
 if (item && typeof item.cat === 'string' && item.cat) return item.cat;
 return 'accesorii';
}
function _normalizeCatalogItem(item) { return item || null; }
// Phase 3 (Task 2): regex classifier table and resolver functions removed.

function _normalizePaymentStatus(value, fallback = 'unpaid') {
 return _paymentStatusValues.includes(value) ? value : fallback;
}

function _normalizeOrderStatus(value, fallback = 'pending') {
 return _orderStatusValues.includes(value) ? value : fallback;
}

function _cardLast4(value) {
 const digits = String(value || '').replace(/\D/g, '');
 return digits.slice(-4);
}

function _decodeHtml(value) {
 let result = String(value ?? '');
 if (!result) return '';

 const textarea = document.createElement('textarea');
 for (let i = 0; i < 4; i += 1) {
 const normalized = result
 .replace(/<br\s*\/?>/gi, '\n')
 .replace(/&#10;|&#x0a;/gi, '\n')
 .replace(/&nbsp;/gi, ' ');
 textarea.innerHTML = normalized;
 const decoded = textarea.value;
 if (decoded === result) {
 result = decoded;
 break;
 }
 result = decoded;
 }

 return result
 .replace(/\r/g, '')
 .replace(/\u00a0/g, ' ')
 .replace(/[ \t]+\n/g, '\n')
 .replace(/\n{3,}/g, '\n\n')
 .trim();
}

function _normalizeText(value, fallback = '') {
 const decoded = _decodeHtml(value);
 return decoded || fallback;
}

function _safeFloat(value) {
 const parsed = parseFloat(String(value || '').replace(',', '.'));
 return Number.isFinite(parsed) ? parsed : 0;
}

function _hash(value) {
 let acc = 0;
 const source = String(value || '');
 for (let i = 0; i < source.length; i += 1) {
 acc = ((acc << 5) - acc) + source.charCodeAt(i);
 acc |= 0;
 }
 return Math.abs(acc);
}


function _stripDiacritics(value) {
 return String(value || '')
 .normalize('NFD')
 .replace(/[\u0300-\u036f]/g, '');
}

function _flattenSpecText(specs = {}) {
 return Object.values(specs || {}).flatMap((value) => {
 if (Array.isArray(value)) return value;
 if (value && typeof value === 'object') return Object.values(value);
 return [value];
 }).join(' ');
}

function _normalizeSearchText(value) {
 return _stripDiacritics(_normalizeText(value))
 .toLowerCase()
 .replace(/[^a-z0-9]+/g, ' ')
 .replace(/\s+/g, ' ')
 .trim();
}

function _compactSearchText(value) {
 return _normalizeSearchText(value).replace(/\s+/g, '');
}

function _tokenizeSearch(value) {
 return _normalizeSearchText(value)
 .split(' ')
 .filter(Boolean);
}

function _uniqueTokens(values = []) {
 return Array.from(new Set(values.filter(Boolean)));
}

function _levenshteinDistance(a, b, maxDistance = 2) {
 const left = String(a || '');
 const right = String(b || '');
 if (!left || !right) return Math.max(left.length, right.length);
 if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;

 let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
 for (let i = 1; i <= left.length; i += 1) {
 let current = [i];
 let rowMin = current[0];

 for (let j = 1; j <= right.length; j += 1) {
 const cost = left[i - 1] === right[j - 1] ? 0 : 1;
 current[j] = Math.min(
 current[j - 1] + 1,
 previous[j] + 1,
 previous[j - 1] + cost,
 );
 rowMin = Math.min(rowMin, current[j]);
 }

 if (rowMin > maxDistance) return maxDistance + 1;
 previous = current;
 }

 return previous[right.length];
}

function _buildSearchIndex(item = {}) {
 if (item && item.__searchIndex) return item.__searchIndex;

 const index = {
 name: _normalizeSearchText(item.name),
 brand: _normalizeSearchText(item.brand),
 sku: _normalizeSearchText(item.sku),
 oem: _normalizeSearchText(item.oem),
 desc: _normalizeSearchText([
 item.desc,
 item.description,
 item.feedCategory,
 item.categoryPath,
 _flattenSpecText(item.specs),
 ].join(' ')),
 category: _normalizeSearchText([_categoryLabel(item.cat), item.cat, item.subcatLabel, item.subcat].join(' ')),
 };

 index.nameCompact = index.name.replace(/\s+/g, '');
 index.brandCompact = index.brand.replace(/\s+/g, '');
 index.skuCompact = index.sku.replace(/\s+/g, '');
 index.oemCompact = index.oem.replace(/\s+/g, '');
 index.all = [index.name, index.brand, index.sku, index.oem, index.desc, index.category].filter(Boolean).join(' ');
 index.nameWords = _uniqueTokens(index.name.split(' '));
 index.brandWords = _uniqueTokens(index.brand.split(' '));
 index.skuWords = _uniqueTokens(index.sku.split(' '));
 index.oemWords = _uniqueTokens(index.oem.split(' '));
 index.categoryWords = _uniqueTokens(index.category.split(' '));
 index.descWords = _uniqueTokens(index.desc.split(' ').filter(word => word.length >= 3).slice(0, 48));
 index.focusWords = _uniqueTokens([
 ...index.nameWords,
 ...index.brandWords,
 ...index.skuWords,
 ...index.oemWords,
 ...index.categoryWords,
 ]).slice(0, 40);

 if (item) {
 Object.defineProperty(item, '__searchIndex', {
 value: index,
 configurable: true,
 enumerable: false,
 writable: true,
 });
 }

 return index;
}

function _scoreTokenAgainstWords(token, words = [], exactWeight, prefixWeight, includeWeight, fuzzyWeight) {
 if (!token || !words.length) return 0;

 let best = 0;
 const fuzzyThreshold = token.length >= 7 ? 2 : token.length >= 4 ? 1 : 0;

 for (const word of words) {
 if (!word) continue;
 if (word === token) return exactWeight;
 if (word.startsWith(token)) best = Math.max(best, prefixWeight);
 else if (token.length >= 3 && word.includes(token)) best = Math.max(best, includeWeight);
 else if (fuzzyThreshold && Math.abs(word.length - token.length) <= fuzzyThreshold) {
 const distance = _levenshteinDistance(token, word, fuzzyThreshold);
 if (distance <= fuzzyThreshold) best = Math.max(best, fuzzyWeight);
 }
 }

 return best;
}

function _scoreProductSearch(item = {}, query) {
 const rawQuery = String(query || '');
 const normalizedQuery = _normalizeSearchText(rawQuery);
 if (!normalizedQuery) return 0;

 const compactQuery = normalizedQuery.replace(/\s+/g, '');
 const tokens = _uniqueTokens(_tokenizeSearch(rawQuery));
 const index = _buildSearchIndex(item);
 let score = 0;

 if (compactQuery && compactQuery === index.skuCompact) score += 1400;
 if (compactQuery && compactQuery === index.oemCompact) score += 1320;
 if (compactQuery && compactQuery === index.nameCompact) score += 1260;
 if (normalizedQuery === index.name) score += 1180;
 if (normalizedQuery === index.brand) score += 640;

 if (index.name.startsWith(normalizedQuery)) score += 420;
 if (compactQuery && index.skuCompact.startsWith(compactQuery)) score += 540;
 if (compactQuery && index.oemCompact.startsWith(compactQuery)) score += 500;
 if (index.brand.startsWith(normalizedQuery)) score += 220;

 if (index.name.includes(normalizedQuery)) score += 320;
 if (compactQuery && index.skuCompact.includes(compactQuery)) score += 300;
 if (compactQuery && index.oemCompact.includes(compactQuery)) score += 280;
 if (index.brand.includes(normalizedQuery)) score += 150;
 if (index.category.includes(normalizedQuery)) score += 110;
 if (normalizedQuery.length >= 3 && index.desc.includes(normalizedQuery)) score += 60;

 let matchedTokens = 0;
 let strongTokenMatches = 0;

 for (const token of tokens) {
 let tokenScore = 0;
 tokenScore = Math.max(tokenScore, _scoreTokenAgainstWords(token, index.skuWords, 260, 190, 130, 72));
 tokenScore = Math.max(tokenScore, _scoreTokenAgainstWords(token, index.oemWords, 240, 175, 120, 68));
 tokenScore = Math.max(tokenScore, _scoreTokenAgainstWords(token, index.nameWords, 210, 145, 92, 52));
 tokenScore = Math.max(tokenScore, _scoreTokenAgainstWords(token, index.brandWords, 120, 88, 56, 28));
 tokenScore = Math.max(tokenScore, _scoreTokenAgainstWords(token, index.categoryWords, 90, 65, 38, 18));
 tokenScore = Math.max(tokenScore, _scoreTokenAgainstWords(token, index.descWords, 34, 22, 12, 0));

 if (!tokenScore && token.length >= 4 && compactQuery) {
 const focusCompact = index.focusWords.map(word => word.replace(/\s+/g, ''));
 tokenScore = _scoreTokenAgainstWords(token, focusCompact, 0, 0, 0, token.length >= 7 ? 48 : 32);
 }

 if (tokenScore > 0) {
 matchedTokens += 1;
 if (tokenScore >= 90) strongTokenMatches += 1;
 score += tokenScore;
 }
 }

 if (tokens.length) {
 if (matchedTokens === tokens.length) score += 180 + (strongTokenMatches * 24);
 else if (matchedTokens >= Math.max(1, tokens.length - 1)) score += 72;
 }

 if (!score) return 0;

 if (Number(item.stock || 0) > 0) score += 18;
 if (Number(item.stock || 0) > 10) score += 8;
 if (Number(item.price || 0) > 0) score += 2;

 return score;
}

function _goToSearch(value) {
 const query = String(value || '').trim();
 if (!query) return false;
 const target = `search.html?q=${encodeURIComponent(query)}`;
 if (window.MotorasPageLoader?.navigate) return window.MotorasPageLoader.navigate(target);
 window.location.href = target;
 return true;
}

function _bindSearchUi(root = document) {
 if (!root) return;

 const desktopInput = root.querySelector('#desktopSearchInput') || root.querySelector('.search-form input[type="text"]');
 const desktopButton = root.querySelector('.search-form .search-btn');
 const mobileInput = root.querySelector('#mobileSearchInput') || root.querySelector('#mobSearchBar .mob-search-inner input[type="text"]');
 const mobileButton = root.querySelector('#mobSearchBar .mob-search-inner button');

 if (desktopInput) {
 desktopInput.onkeydown = (event) => {
 if (event.key === 'Enter') _goToSearch(desktopInput.value);
 };
 }

 if (desktopButton && desktopInput) {
 desktopButton.onclick = (event) => {
 event.preventDefault();
 _goToSearch(desktopInput.value);
 };
 }

 if (mobileInput) {
 mobileInput.onkeydown = (event) => {
 if (event.key === 'Enter') _goToSearch(mobileInput.value);
 };
 }

 if (mobileButton && mobileInput) {
 mobileButton.onclick = (event) => {
 event.preventDefault();
 _goToSearch(mobileInput.value);
 };
 }
}



function _inferBrand(name) {
 const cleaned = name.replace(/\s+/g, ' ').trim();
 const commaParts = cleaned.split(',');
 const head = (commaParts[0] || cleaned).trim();
 const tailMatch = head.match(/([A-Z0-9][A-Za-z0-9'&.\-]*(?:\s+[A-Z0-9][A-Za-z0-9'&.\-]*){0,2})$/);
 if (tailMatch) return tailMatch[1].trim();
 return head.split(' ').slice(0, 2).join(' ');
}

function _inferBadge(stock, seed) {
 if (stock <= 0) return null;
 const value = _hash(seed) % 8;
 if (value === 0) return 'hot';
 if (value === 1) return 'new';
 if (value === 2) return 'sale';
 return null;
}

function _buildSpecs(product, category) {
 return {
 Categorie: category,
 SKU: product.sku || '-',
 Stoc: String(product.stock),
 Disponibilitate: product.stock > 0 ? 'În stoc' : 'La comandă',
 };
}

function _normalizeImage(value) {
 const image = _decodeHtml(value || '');
 return image || _fallbackImage;
}

function _normalizeImageList(values = []) {
 const unique = [];
 const seen = new Set();
 values.forEach((value) => {
 const image = _normalizeImage(value);
 if (!image || seen.has(image)) return;
 seen.add(image);
 unique.push(image);
 });
 return unique.length ? unique : [_fallbackImage];
}

function _normalizeSpecs(specs = {}) {
 return Object.entries(specs || {}).reduce((acc, [key, value]) => {
 const nextKey = _normalizeText(key);
 if (!nextKey) return acc;

 if (value && typeof value === 'object' && !Array.isArray(value)) {
 acc[nextKey] = _normalizeSpecs(value);
 return acc;
 }

 if (Array.isArray(value)) {
 acc[nextKey] = value.map(entry => _normalizeText(entry)).filter(Boolean);
 return acc;
 }

 acc[nextKey] = typeof value === 'string' ? _normalizeText(value) : value;
 return acc;
 }, {});
}


function _normalizeStockLabel(value) {
 return String(value || '').trim().toLowerCase();
}

function _stockFromLabel(value) {
 const normalized = _normalizeStockLabel(value);
 if (!normalized) return 0;
 if (/in stoc|disponibil|livrare imediata|pe stoc/.test(normalized)) return 12;
 if (/stoc limitat|ultim|putine bucati/.test(normalized)) return 3;
 if (/precomanda|la comanda/.test(normalized)) return 1;
 if (/fara stoc|indisponibil|epuizat/.test(normalized)) return 0;
 return 2;
}

function _safeInt(value, fallback = 0) {
 const parsed = parseInt(value, 10);
 return Number.isFinite(parsed) ? parsed : fallback;
}

function _clampRating(value, allowZero = false) {
 const min = allowZero ? 0 : 1;
 const num = Number(value);
 if (!Number.isFinite(num)) return min;
 return Math.min(5, Math.max(min, num));
}

function _normalizeReview(review, index = 0) {
 const rating = _clampRating(_safeInt(review?.rating, 5));
 const name = String(review?.name || 'Client Motoraș').trim().slice(0, 40) || 'Client Motoraș';
 const comment = String(review?.comment || '').trim().slice(0, 600);
 const createdAt = review?.createdAt || new Date(Date.now() - (index * 86400000)).toISOString();

 return {
 id: String(review?.id || `${createdAt}-${index}`),
 rating,
 name,
 comment,
 createdAt,
 };
}

function _getStoredReviews(productId) {
 const store = _readRatings();
 const key = String(productId || '');
 const reviews = Array.isArray(store[key]) ? store[key] : [];
 return reviews
 .map((review, index) => _normalizeReview(review, index))
 .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function _getRatingSummary(product) {
 const reviews = _getStoredReviews(product.id);
 const baseRating = _clampRating(product.baseRating ?? product.rating ?? (reviews.length ? 4.7 : 0), true);
 const baseReviews = Math.max(0, _safeInt(product.baseReviews ?? product.reviews, 0));
 const userTotal = reviews.reduce((sum, review) => sum + review.rating, 0);
 const totalReviews = baseReviews + reviews.length;
 const average = totalReviews
 ? (((baseRating * baseReviews) + userTotal) / totalReviews)
 : 0;

 return {
 rating: Math.round(average * 10) / 10,
 reviews: totalReviews,
 reviewEntries: reviews,
 reviewCount: reviews.length,
 };
}

function _applyRatingSummary(product) {
 const baseRating = _clampRating(product.baseRating ?? product.rating ?? (product.baseReviews || product.reviews ? 4.7 : 0), true);
 const baseReviews = Math.max(0, _safeInt(product.baseReviews ?? product.reviews, 0));
 const summary = _getRatingSummary({ ...product, baseRating, baseReviews });

 return {
 ...product,
 baseRating,
 baseReviews,
 rating: summary.rating,
 reviews: summary.reviews,
 reviewEntries: summary.reviewEntries,
 reviewCount: summary.reviewCount,
 };
}

function _refreshCatalogRatings(productId = null) {
 if (!_catalog.length) return;
 _catalog = _catalog.map(item => {
 if (productId && String(item.id) !== String(productId)) return item;
 return _applyRatingSummary(item);
 });
}

function _mapProduct(node, index) {
 const name = _decodeHtml(node.name?.textContent || node.name || `Produs ${index + 1}`);
 const sku = _decodeHtml(node.sku?.textContent || node.sku || `SKU-${index + 1}`);
 const shortDescription = _decodeHtml(node.short_description?.textContent || node.short_description || '');
 const description = _decodeHtml(node.description?.textContent || node.description || shortDescription);
 const price = Math.round(_safeFloat(node.price?.textContent || node.price) * 100) / 100;
 const qty = Math.max(0, Math.floor(_safeFloat(node.qty?.textContent || node.qty)));
 const inStock = String(node.is_in_stock?.textContent || node.is_in_stock || '').trim() === '1';
 const stock = inStock ? Math.max(qty, 1) : qty;
 const brand = _inferBrand(name);
 const cat = _resolveCategory({
 name,
 desc: description || shortDescription,
 compat: shortDescription,
 brand,
 sku,
 });
 const badge = _inferBadge(stock, sku || name);
 const old = badge === 'sale' ? Math.round((price * 1.15) * 100) / 100 : null;
 const images = _normalizeImageList([
 node.image?.textContent || node.image || '',
 ]);

 return {
 id: sku,
 name,
 brand,
 cat,
 price,
 old,
 img: images[0],
 images,
 rating: 0,
 reviews: 0,
 baseRating: 0,
 baseReviews: 0,
 badge,
 sku,
 stock,
 desc: description || shortDescription || name,
 eta: stock > 0 ? (stock > 5 ? 'Livrare 24-48h' : 'Stoc limitat, livrare rapidă') : 'Disponibil la comandă',
 oem: sku,
 compat: shortDescription || 'Compatibilitate la cerere dupa cod produs.',
 specs: _buildSpecs({ sku, stock }, cat),
 vehicle: null,
 source: 'carhub',
 };
}

function _mapGlobizProduct(node, index) {
 const code = _decodeHtml(node.cod?.textContent || node.cod || `GBZ-${index + 1}`);
 const name = _decodeHtml(node.denumire?.textContent || node.denumire || `Produs Globiz ${index + 1}`);
 const description = _decodeHtml(node.descriere?.textContent || node.descriere || '');
 const category = _decodeHtml(node.categorie?.textContent || node.categorie || '');
 const categoryPath = _decodeHtml(node.calecategorie?.textContent || node.calecategorie || category);
 const brand = _decodeHtml(node.marca?.textContent || node.marca || _inferBrand(name));
 const price = Math.round(_safeFloat(node.pret?.textContent || node.pret) * 100) / 100;
 const wholePrice = Math.round(_safeFloat(node.pret_intreg?.textContent || node.pret_intreg) * 100) / 100;
 const stockLabel = _decodeHtml(node.stoc?.textContent || node.stoc || '');
 const stock = _stockFromLabel(stockLabel);
 const badge = _inferBadge(stock, code || name);
 const old = wholePrice > price ? wholePrice : (badge === 'sale' && price ? Math.round(price * 1.12 * 100) / 100 : null);
 const imageNodes = Array.from(node.querySelectorAll ? node.querySelectorAll('imagini > imagine') : []);
 const images = _normalizeImageList([
 node.imagine?.textContent || node.imagine || '',
 ...imageNodes.map((entry) => entry.textContent || ''),
 ]);

 return {
 id: code,
 name,
 brand,
 cat: _resolveCategory({
 name,
 desc: description,
 compat: `${category} ${categoryPath}`.trim(),
 brand,
 sku: code,
 specs: {
 CategorieFeed: category,
 CaleCategorie: categoryPath,
 StareStoc: stockLabel,
 },
 }),
 price,
 old,
 img: images[0],
 images,
 rating: 0,
 reviews: 0,
 baseRating: 0,
 baseReviews: 0,
 badge,
 sku: code,
 stock,
 desc: description || `${name} ${category}`.trim(),
 eta: stock > 2 ? 'Livrare 24-48h' : (stock > 0 ? 'Stoc limitat, livrare rapidă' : 'Disponibil la comandă'),
 oem: _decodeHtml(node.cod_bare?.textContent || node.cod_bare || code),
 compat: categoryPath || category || 'Compatibilitate la cerere dupa cod produs.',
 specs: {
 ..._buildSpecs({ sku: code, stock }, _resolveCategory({ name, desc: description, compat: `${category} ${categoryPath}`.trim(), brand, sku: code })),
 Brand: brand || '-',
 CategorieFeed: category || '-',
 CaleCategorie: categoryPath || '-',
 StareStoc: stockLabel || '-',
 },
 vehicle: null,
 source: 'globiz',
 };
}

function _scoreCatalogItem(item) {
 return [
 item.stock > 0 ? 50 : 0,
 item.img && item.img !== _fallbackImage ? 20 : 0,
 item.desc ? Math.min(String(item.desc).length, 200) / 10 : 0,
 item.old ? 4 : 0,
 item.brand ? 2 : 0,
 item.source === 'globiz' ? 1 : 0,
 ].reduce((sum, value) => sum + value, 0);
}




function _normalizeCasaBateriilorItems(items = []) {
 const seen = new Set();
 return items
 .filter(item => item && item.id && Number(item.price || 0) > 0)
 .filter((item) => {
 const key = String(item.id).trim();
 if (!key || seen.has(key)) return false;
 seen.add(key);
 return true;
 })
 .map(item => ({
 ...item,
 cat: 'baterii',
 subcat: 'baterii-auto',
 catLabel: 'Baterii Auto',
 subcatLabel: 'Baterii Auto',
 inStock: true,
 stock: item.stock || 99,
 }));
}

async function _fetchCasaBateriilorItems() {
 try {
 const limit = 500;
 const firstRes = await fetch(`${_serverCasaBateriilorEndpoint}?limit=${limit}&page=1`);
 if (!firstRes.ok) return [];
 const firstData = await firstRes.json();
 if (!firstData?.ok || !Array.isArray(firstData.items)) return [];

 const totalPages = Math.max(1, parseInt(firstData.pages || 1, 10));
 if (totalPages === 1) return _normalizeCasaBateriilorItems(firstData.items);

 const restPages = await Promise.all(
 Array.from({ length: totalPages - 1 }, (_, index) => index + 2).map(async (page) => {
 try {
 const res = await fetch(`${_serverCasaBateriilorEndpoint}?limit=${limit}&page=${page}`);
 if (!res.ok) return [];
 const data = await res.json();
 return Array.isArray(data?.items) ? data.items : [];
 } catch (_) {
 return [];
 }
 })
 );

 return _normalizeCasaBateriilorItems([firstData.items, ...restPages].flat());
 } catch (_) {
 return [];
 }
}

// Phase 3 (Task 2): _ensureCatalog kept as safety stub. Any forgotten caller
// gets [] rather than ReferenceError. Site behaves like empty-state, which is
// the same UX a 404 on catalog files would have produced.
async function _ensureCatalog() { return []; }

window.MotApiSearch = {
 go: _goToSearch,
 bind: () => _bindSearchUi(document),
};

if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', () => _bindSearchUi(document), { once: true });
} else {
 _bindSearchUi(document);
}

window.addEventListener('pageshow', () => _bindSearchUi(document));

window.MotApi = {
 // Bust the catalog cache "” call this after saving margin/toggle changes
 invalidateCatalog() {
 _catalog = [];
 _catalogPromise = null;
 _marginsCache = null;
 _marginsCacheAt = 0;
 },

 async ready() {
 const remote = await _requestJson(`${_serverProductsEndpoint}?view=summary`);
 if (remote.ok && remote.data?.summary) return { ok: true, total: Number(remote.data.summary.total || 0) };
 const items = await _ensureCatalog();
 return { ok: true, total: items.length };
 },

 // Legacy/admin path. Pages and pages of /api/products until exhausted.
 // The storefront does not call this anymore.
 async getCatalogSnapshot() {
 const all = [];
 let page = 1;
 const limit = 500;
 const maxPages = 60;
 while (page <= maxPages) {
 const remote = await _requestJson(`${_serverProductsEndpoint}?${_buildQueryString({ page, limit })}`);
 if (!remote.ok || !Array.isArray(remote.data?.items)) break;
 all.push(...remote.data.items);
 const pages = Number(remote.data.pages || 1);
 if (page >= pages || !remote.data.items.length) break;
 page += 1;
 }
 if (all.length) return all.map(item => ({ ..._applyRatingSummary(item) }));
 const items = await _ensureCatalog();
 return items.map(item => ({ ..._applyRatingSummary(item) }));
 },

 async getProducts(params = {}) {
 const remote = await _requestJson(`${_serverProductsEndpoint}?${_buildQueryString(params)}`);
 if (remote.ok && remote.data?.ok) {
 return {
 ok: true,
 total: Number(remote.data.total || 0),
 page: Number(remote.data.page || 1),
 pages: Number(remote.data.pages || 1),
 items: (remote.data.items || []).map(item => _applyRatingSummary(item)),
 };
 }
 return { ok: false, error: remote.data?.error || 'Catalogul nu este disponibil momentan.', total: 0, page: 1, pages: 1, items: [] };
 },

 async getSubcategories(cat) {
 const remote = await _requestJson(`${_serverProductsEndpoint}?${_buildQueryString({ cat, view: 'summary' })}`);
 if (remote.ok && remote.data?.summary?.categories) {
 // The summary returns categories at the cat granularity; subcategory
 // grouping is computed from the items page-by-page when needed.
 }
 // Fall through: ask gateway for a wide product page and group by subcat client-side.
 const page = await _requestJson(`${_serverProductsEndpoint}?${_buildQueryString({ cat, limit: 500 })}`);
 if (!page.ok || !Array.isArray(page.data?.items)) {
 return { ok: false, items: [] };
 }
 const counts = new Map();
 page.data.items.forEach((item) => {
 const key = item.subcat || _resolveSubcategory(item);
 const label = item.subcatLabel || _subcategoryLabel(item.cat, key);
 if (!counts.has(key)) counts.set(key, { key, label, count: 0 });
 counts.get(key).count += 1;
 });
 return {
 ok: true,
 items: Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ro')),
 };
 },

 async getBravusCatalog(params = {}) {
 await _delay(20);

 const queryString = _buildQueryString(params);
 const remote = await _requestServer(`${_serverBravusEndpoint}${queryString ? `?${queryString}` : ''}`);
 if (remote.ok && remote.data) return remote.data;

 const items = _filterLocalBravusItems(await _ensureCatalog(), params);
 const brands = _summarizeLocalBravusBrands(items);

 if (params.id || params.sku) {
 const item = items.find(entry => entry.id === params.id || entry.sku === params.sku);
 if (!item) return { ok: false, error: 'Produsul Bravus nu a fost gasit.' };
 return { ok: true, source: 'bravus', sourceFile: 'catalog.json', item };
 }

 if (String(params.view || '').toLowerCase() === 'brands' || String(params.view || '').toLowerCase() === 'summary') {
 return {
 ok: true,
 source: 'bravus',
 sourceFile: 'catalog.json',
 totalItems: items.length,
 totalBrands: brands.length,
 brands,
 };
 }

 const page = Math.max(1, parseInt(params.page || 1, 10));
 const limit = Math.max(1, parseInt(params.limit || 100, 10));
 const pages = Math.max(1, Math.ceil(items.length / limit));
 const safePage = Math.min(page, pages);
 const start = (safePage - 1) * limit;

 return {
 ok: true,
 source: 'bravus',
 sourceFile: 'catalog.json',
 totalBrands: brands.length,
 brands,
 total: items.length,
 page: safePage,
 limit,
 pages,
 items: items.slice(start, start + limit),
 };
 },

 async getBravusBrands(params = {}) {
 return window.MotApi.getBravusCatalog({ ...params, view: 'brands' });
 },

 async getProduct(id) {
 const productId = String(id || '').trim();
 if (!productId) return { ok: false, error: 'Identificator produs lipsă.' };
 const remote = await _requestJson(`${_serverProductsEndpoint}?${_buildQueryString({ id: productId })}`);
 if (remote.ok && remote.data?.ok && remote.data.item) {
 return { ok: true, product: _applyRatingSummary(remote.data.item) };
 }
 if (remote.data?.error) return { ok: false, error: remote.data.error };
 return { ok: false, error: 'Produsul nu a fost găsit.' };
 },

 async getFeatured(limit = 8) {
 const safeLimit = Math.max(4, Math.min(48, Number(limit) || 8));
 const remote = await _requestJson(`${_serverProductsEndpoint}?${_buildQueryString({ view: 'featured', limit: safeLimit })}`);
 if (remote.ok && remote.data?.ok && Array.isArray(remote.data.items)) {
 return { ok: true, items: remote.data.items.map(item => _applyRatingSummary(item)) };
 }
 return { ok: false, items: [] };
 },

 async getProductReviews(id) {
 const detail = await window.MotApi.getProduct(id);
 if (!detail.ok || !detail.product) return { ok: false, error: detail.error || 'Produsul nu a fost găsit.' };
 const hydrated = detail.product;
 return {
 ok: true,
 summary: {
 rating: hydrated.rating,
 reviews: hydrated.reviews,
 baseReviews: hydrated.baseReviews,
 },
 items: (hydrated.reviewEntries || []).map(review => ({ ...review })),
 };
 },

 async addProductReview(id, payload = {}) {
 const detail = await window.MotApi.getProduct(id);
 if (!detail.ok || !detail.product) return { ok: false, error: detail.error || 'Produsul nu a fost găsit.' };
 const product = detail.product;

 const rating = Math.min(5, Math.max(1, _safeInt(payload.rating, 0)));
 if (!rating) return { ok: false, error: 'Ratingul este obligatoriu.' };

 const name = String(payload.name || 'Client Motoraș').trim().slice(0, 40) || 'Client Motoraș';
 const comment = String(payload.comment || '').trim().slice(0, 600);
 const store = _readRatings();
 const key = String(id);
 const list = Array.isArray(store[key]) ? store[key] : [];
 list.unshift(_normalizeReview({
 id: `REV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
 rating,
 name,
 comment,
 createdAt: new Date().toISOString(),
 }));
 store[key] = list.slice(0, 40);
 _writeRatings(store);
 _refreshCatalogRatings(id);

 const hydrated = _applyRatingSummary(product);
 return {
 ok: true,
 product: { ...hydrated },
 summary: {
 rating: hydrated.rating,
 reviews: hydrated.reviews,
 baseReviews: hydrated.baseReviews,
 },
 items: hydrated.reviewEntries.map(review => ({ ...review })),
 };
 },

 async createOrder(payload) {
 await _delay(120);
 const required = ['email', 'firstName', 'lastName', 'address', 'phone', 'items'];
 for (const field of required) {
 if (!payload[field] || (Array.isArray(payload[field]) && !payload[field].length)) {
 return { ok: false, error: `Campul '${field}' este obligatoriu.` };
 }
 }

 const paymentMethod = payload.paymentMethod || payload.payment || 'card';
 if (paymentMethod === 'card' && payload.stripePaymentIntentId) {
 const remote = await _requestServer(_serverOrdersEndpoint, {
 method: 'POST',
 body: payload,
 });
 if (remote.ok && remote.data?.order) {
 _storeLastOrder(remote.data.order);
 return { ok: true, order: remote.data.order };
 }
 return { ok: false, error: remote.data?.error || 'Plata Stripe nu a putut fi finalizată.' };
 }

 const paymentStatusDefault = paymentMethod === 'card' ? 'paid' : 'unpaid';
 const paymentStatus = _normalizePaymentStatus(payload.paymentStatus, paymentStatusDefault);
 const orderStatusDefault = paymentMethod === 'op'
 ? 'pending_payment'
 : paymentMethod === 'card'
 ? (paymentStatus === 'paid' ? 'processing' : 'pending_payment')
 : 'pending';
 const items = payload.items.map(item => ({
 id: item.id || item.sku || '',
 name: item.name,
 brand: item.brand || '',
 price: Number(item.price || 0),
 qty: Math.max(1, Number(item.qty || 1)),
 img: item.img || _fallbackImage,
 sku: item.sku || item.id || '',
 }));
 const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
 const shippingCost = Number(payload.shippingCost || 0);
 const paymentFee = Number(payload.paymentFee || 0);

 const order = {
 id: _genId(),
 createdAt: _now(),
 updatedAt: _now(),
 status: _normalizeOrderStatus(payload.status, orderStatusDefault),
 email: payload.email,
 name: `${payload.firstName} ${payload.lastName}`,
 firstName: payload.firstName,
 lastName: payload.lastName,
 phone: payload.phone,
 address: payload.address,
 county: payload.county || '',
 city: payload.city || '',
 zip: payload.zip || '',
 shipping: payload.shipping || 'standard',
 payment: paymentStatus,
 paymentStatus,
 paymentMethod,
 paymentLabel: payload.paymentLabel || _paymentMethodLabel(paymentMethod),
 paymentMode: payload.paymentMode || 'onsite',
 paymentReference: payload.paymentReference || '',
 paymentMessage: payload.paymentMessage || '',
 paymentScenario: payload.paymentScenario || '',
 paymentCardLast4: payload.paymentCardLast4 || _cardLast4(payload.cardNumber),
 items,
 subtotal,
 shippingCost,
 paymentFee,
 total: subtotal + shippingCost + paymentFee,
 notes: payload.notes || '',
 vehicle: payload.vehicle || null,
 };

 const orders = _readOrders();
 orders.unshift(order);
 _writeOrders(orders);
 _storeLastOrder(order);

 return { ok: true, order };
 },

 async getOrders(params = {}) {
 await _delay(50);
 const query = new URLSearchParams();
 if (params.status) query.set('status', params.status);
 if (params.email) query.set('email', params.email);
 const remote = await _requestServer(`${_serverOrdersEndpoint}${query.toString() ? `?${query}` : ''}`);
 let items = _mergeOrders(remote.ok ? (remote.data?.items || []) : [], _readOrders());
 if (params.status) items = items.filter(order => order.status === params.status);
 if (params.email) items = items.filter(order => order.email === params.email);
 const page = Math.max(1, parseInt(params.page || 1, 10));
 const limit = Math.max(1, parseInt(params.limit || 20, 10));
 return { ok: true, total: items.length, items: items.slice((page - 1) * limit, page * limit) };
 },

 async getOrder(id) {
 await _delay(30);
 const localOrder = _readOrders().find(item => item.id === id);
 if (localOrder) return { ok: true, order: localOrder };
 const remote = await _requestServer(`${_serverOrdersEndpoint}?id=${encodeURIComponent(id)}`);
 if (remote.ok && remote.data?.order) return { ok: true, order: remote.data.order };
 const order = JSON.parse(localStorage.getItem(_lastOrder) || 'null');
 if (order?.id === id) return { ok: true, order };
 if (!order) return { ok: false, error: 'Comanda nu a fost găsită.' };
 return { ok: true, order };
 },

 async updateOrderStatus(id, status) {
 await _delay(60);
 if (!_orderStatusValues.includes(status)) return { ok: false, error: 'Status invalid.' };

 const remote = await _requestServer(_serverOrdersEndpoint, {
 method: 'PATCH',
 body: { id, status },
 });
 if (remote.ok && remote.data?.order) {
 return { ok: true, order: remote.data.order };
 }

 const orders = _readOrders();
 const index = orders.findIndex(order => order.id === id);
 if (index < 0) return { ok: false, error: 'Comanda nu există.' };

 orders[index].status = status;
 orders[index].updatedAt = _now();
 _writeOrders(orders);
 return { ok: true, order: orders[index] };
 },

 async updateOrder(id, patch = {}) {
 await _delay(60);

 const remote = await _requestServer(_serverOrdersEndpoint, {
 method: 'PATCH',
 body: { id, ...patch },
 });
 if (remote.ok && remote.data?.order) {
 if (JSON.parse(localStorage.getItem(_lastOrder) || 'null')?.id === id) {
 localStorage.setItem(_lastOrder, JSON.stringify(remote.data.order));
 }
 return { ok: true, order: remote.data.order };
 }

 const orders = _readOrders();
 const index = orders.findIndex(order => order.id === id);
 if (index < 0) return { ok: false, error: 'Comanda nu există.' };

 if (patch.status && !_orderStatusValues.includes(patch.status)) {
 return { ok: false, error: 'Status invalid.' };
 }
 if (patch.payment && !_paymentStatusValues.includes(patch.payment)) {
 return { ok: false, error: 'Status plată invalid.' };
 }

 const current = orders[index];
 const next = {
 ...current,
 ...patch,
 paymentMethod: patch.paymentMethod || current.paymentMethod || 'card',
 paymentLabel: patch.paymentLabel || current.paymentLabel || _paymentMethodLabel(patch.paymentMethod || current.paymentMethod || 'card'),
 updatedAt: _now(),
 };

 orders[index] = next;
 _writeOrders(orders);
 if (JSON.parse(localStorage.getItem(_lastOrder) || 'null')?.id === id) {
 localStorage.setItem(_lastOrder, JSON.stringify(next));
 }
 return { ok: true, order: next };
 },

 async ping() {
 await _delay(10);
 const total = _catalog.length || null;
 return { ok: true, version: '2.0.0-xml', env: 'browser-static', time: _now(), total };
 },

 async seedOrders(n = 5) {
 const catalog = await _ensureCatalog();
 const names = ['Ion Popescu', 'Maria Ionescu', 'Andrei Constantin', 'Elena Dumitrescu', 'Radu Popa'];
 const statuses = ['pending', 'processing', 'shipped', 'delivered', 'delivered'];
 const counties = ['București', 'Cluj', 'Timiș', 'Iași', 'Brașov'];
 const orders = _readOrders();

 for (let i = 0; i < n; i += 1) {
 const items = catalog.slice(i * 2, i * 2 + 2).map(product => ({ ...product, qty: 1 }));
 const subtotal = items.reduce((sum, item) => sum + item.price, 0);
 const order = {
 id: `ORD-${100001 + i}`,
 createdAt: new Date(Date.now() - i * 86400000 * 2).toISOString(),
 status: statuses[i % statuses.length],
 email: `client${i}@test.ro`,
 name: names[i % names.length],
 phone: `07${String(i).padStart(8, '2')}`,
 address: `Str. Test nr. ${i + 1}`,
 county: counties[i % counties.length],
 city: counties[i % counties.length],
 zip: `10000${i}`,
 shipping: i % 2 === 0 ? 'standard' : 'express',
 payment: i % 3 === 0 ? 'paid' : 'unpaid',
 paymentStatus: i % 3 === 0 ? 'paid' : 'unpaid',
 paymentMethod: i % 3 === 0 ? 'card' : i % 3 === 1 ? 'ramburs' : 'op',
 paymentLabel: i % 3 === 0 ? 'Carte online' : i % 3 === 1 ? 'Ramburs la livrare' : 'Transfer bancar',
 items,
 subtotal,
 shippingCost: i % 2 === 0 ? 0 : 25,
 total: subtotal + (i % 2 === 0 ? 0 : 25),
 notes: '',
 vehicle: null,
 };
 if (!orders.find(existing => existing.id === order.id)) orders.unshift(order);
 }

 _writeOrders(orders);
 return { ok: true, seeded: n };
 },
};

window.MotApi.getProduct = async function getProductRemoteFirst(id) {
 await _delay(20);
 const productId = String(id || '').trim();
 if (!productId) return { ok: false, error: 'Produsul nu a fost găsit.' };

 const remote = await _requestJson(`${_serverProductsEndpoint}?${_buildQueryString({ id: productId })}`);
 if (remote.ok && remote.data?.item) {
 const normalized = _normalizeCatalogItem(remote.data.item);
 if (normalized) return { ok: true, product: { ..._applyRatingSummary(normalized) } };
 }

 const product = (await _ensureCatalog()).find(item => item.id === productId || item.sku === productId);
 if (!product) return { ok: false, error: 'Produsul nu a fost găsit.' };
 return { ok: true, product: { ..._applyRatingSummary(product) } };
};

window.MotApi.getRelatedProducts = async function getRelatedProductsRemoteFirst(product, limit = 4) {
 await _delay(20);
 const sourceProduct = product && typeof product === 'object' ? product : null;
 const productId = String(sourceProduct?.id || '').trim();
 const category = String(sourceProduct?.cat || '').trim();
 const safeLimit = Math.max(1, Math.min(12, _safeInt(limit, 4)));

 if (category) {
 const remote = await _requestJson(
 `${_serverProductsEndpoint}?${_buildQueryString({ cat: category, limit: safeLimit + 1 })}`
 );
 if (remote.ok && Array.isArray(remote.data?.items)) {
 const items = remote.data.items
 .map(_normalizeCatalogItem)
 .filter(Boolean)
 .filter(item => !productId || String(item.id) !== productId)
 .slice(0, safeLimit)
 .map(item => ({ ..._applyRatingSummary(item) }));
 if (items.length) return items;
 }
 }

 if (!sourceProduct) return [];
 return (await _ensureCatalog())
 .filter(item => item.cat === sourceProduct.cat && item.id !== sourceProduct.id)
 .slice(0, safeLimit)
 .map(item => ({ ..._applyRatingSummary(item) }));
};

function _getUserToken() {
 try { return (JSON.parse(localStorage.getItem('motoras_user_v2') || 'null') || {}).token || ''; }
 catch (_) { return ''; }
}

// Server-backed reviews (Upstash via /api/products?reviews=). Falls back to
// the legacy localStorage-derived summary only if the server is unreachable.
window.MotApi.getProductReviews = async function getProductReviewsRemoteFirst(id) {
 try {
 const res = await fetch(`${_serverProductsEndpoint}?reviews=${encodeURIComponent(id)}`, { headers: { Accept: 'application/json' } });
 if (res.ok) {
 const data = await res.json();
 if (data && data.ok) {
 return {
 ok: true,
 summary: data.summary || { rating: 0, reviews: 0, baseReviews: 0 },
 items: Array.isArray(data.items) ? data.items.map(r => ({ ...r })) : [],
 };
 }
 }
 } catch (_) { /* fall through to local */ }

 const response = await window.MotApi.getProduct(id);
 if (!response?.ok || !response.product) return { ok: false, error: 'Produsul nu a fost găsit.' };
 const hydrated = response.product;
 return {
 ok: true,
 summary: { rating: hydrated.rating, reviews: hydrated.reviews, baseReviews: hydrated.baseReviews },
 items: (hydrated.reviewEntries || []).map(review => ({ ...review })),
 };
};

// Submitting a review requires a logged-in account. The author name comes
// from the account server-side, so it cannot be spoofed.
window.MotApi.addProductReview = async function addProductReviewRemoteFirst(id, payload = {}) {
 const token = _getUserToken();
 if (!token) return { ok: false, requiresAuth: true, error: 'Trebuie să fii autentificat pentru a lăsa o recenzie.' };

 const rating = Math.min(5, Math.max(1, _safeInt(payload.rating, 0)));
 if (!rating) return { ok: false, error: 'Ratingul este obligatoriu.' };
 const comment = String(payload.comment || '').trim().slice(0, 600);

 try {
 const res = await fetch(`${_serverProductsEndpoint}?reviews=1`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
 body: JSON.stringify({ id, rating, comment }),
 });
 const data = await res.json().catch(() => ({}));
 if (res.status === 401) return { ok: false, requiresAuth: true, error: data.error || 'Sesiune expirată. Autentifică-te din nou.' };
 if (res.ok && data.ok) return { ok: true, summary: data.summary, items: data.items };
 return { ok: false, error: data.error || 'Recenzia nu a putut fi salvată.' };
 } catch (_) {
 return { ok: false, error: 'Eroare de rețea. Încearcă din nou.' };
 }
};

window.MotApi.getProducts = async function getProductsRemoteFirst(params = {}) {
 await _delay();
 const queryString = _buildQueryString(params);
 const remote = await _requestJson(`${_serverProductsEndpoint}${queryString ? `?${queryString}` : ''}`);

 if (remote.ok && remote.data) {
 const remoteItems = Array.isArray(remote.data.items)
 ? remote.data.items
 .map(_normalizeCatalogItem)
 .filter(Boolean)
 .map(item => ({ ..._applyRatingSummary(item) }))
 : [];

 if (remoteItems.length || remote.data.total === 0) {
 let items = remoteItems;
 if (params.sort === 'price_asc') items = [...items].sort((a, b) => a.price - b.price || String(a.name || '').localeCompare(String(b.name || ''), 'ro'));
 if (params.sort === 'price_desc') items = [...items].sort((a, b) => b.price - a.price || String(a.name || '').localeCompare(String(b.name || ''), 'ro'));
 if (params.sort === 'rating') items = [...items].sort((a, b) => (b.rating || 0) - (a.rating || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'ro'));

 return {
 ok: true,
 total: Number(remote.data.total || items.length),
 page: Number(remote.data.page || params.page || 1),
 pages: Number(remote.data.pages || 1),
 items,
 };
 }
 }

 let sourceItems = await _ensureCatalog();

 if (params.cat) sourceItems = sourceItems.filter(item => item.cat === params.cat);
 if (params.subcat) sourceItems = sourceItems.filter(item => item.subcat === params.subcat);
 if (params.brand) sourceItems = sourceItems.filter(item => item.brand === params.brand);

 let rankedEntries = sourceItems.map(item => ({ item, score: 0 }));
 if (params.q) {
 rankedEntries = sourceItems
 .map(item => ({ item, score: _scoreProductSearch(item, params.q) }))
 .filter(entry => entry.score > 0)
 .sort((left, right) =>
 right.score - left.score ||
 Number(right.item.stock || 0) - Number(left.item.stock || 0) ||
 Number(right.item.reviews || 0) - Number(left.item.reviews || 0) ||
 String(left.item.name || '').localeCompare(String(right.item.name || ''), 'ro')
 );

 const topScore = rankedEntries[0]?.score || 0;
 if (topScore >= 1200) {
 rankedEntries = rankedEntries.filter(entry => entry.score >= Math.max(380, Math.round(topScore * 0.42)));
 } else if (topScore >= 700) {
 rankedEntries = rankedEntries.filter(entry => entry.score >= Math.max(220, Math.round(topScore * 0.32)));
 }
 }

 let items = rankedEntries.map(entry => ({
 ..._applyRatingSummary(entry.item),
 _searchScore: entry.score,
 }));

 if (params.sort === 'price_asc') items.sort((a, b) => a.price - b.price || b._searchScore - a._searchScore);
 if (params.sort === 'price_desc') items.sort((a, b) => b.price - a.price || b._searchScore - a._searchScore);
 if (params.sort === 'rating') items.sort((a, b) => (b.rating || 0) - (a.rating || 0) || b._searchScore - a._searchScore);

 const page = Math.max(1, parseInt(params.page || 1, 10));
 const limit = Math.max(1, parseInt(params.limit || 12, 10));
 const total = items.length;
 const start = (page - 1) * limit;

 return {
 ok: true,
 total,
 page,
 pages: Math.max(1, Math.ceil(total / limit)),
 items: items.slice(start, start + limit).map(({ _searchScore, ...item }) => item),
 };
};

window.MotApi.getCategoryCatalog = async function getCategoryCatalogRemoteFirst(cat, options = {}) {
 await _delay(20);
 const categoryKey = String(cat || '').trim();
 const perPage = Math.max(50, Math.min(500, _safeInt(options.limit, 250)));

 if (categoryKey) {
 const allItems = [];
 let page = 1;
 let pages = 1;

 do {
 const queryString = _buildQueryString({ cat: categoryKey, page, limit: perPage });
 const remote = await _requestJson(`${_serverProductsEndpoint}?${queryString}`);
 if (!remote.ok || !remote.data || !Array.isArray(remote.data.items)) {
 allItems.length = 0;
 break;
 }

 const batch = remote.data.items
 .map(_normalizeCatalogItem)
 .filter(Boolean)
 .map(item => ({ ..._applyRatingSummary(item) }));

 allItems.push(...batch);
 pages = Math.max(1, Number(remote.data.pages || 1));
 page += 1;
 } while (page <= pages);

 if (allItems.length) return allItems;
 }

 const items = await _ensureCatalog();
 return items
 .filter(item => !categoryKey || item.cat === categoryKey)
 .map(item => ({ ..._applyRatingSummary(item) }));
};

window.MotApi.getHomepageData = async function getHomepageDataRemoteFirst(options = {}) {
 await _delay(20);
 const featuredLimit = Math.max(8, Math.min(24, _safeInt(options.featuredLimit, 12)));
 const featuredResponse = await window.MotApi.getFeatured(featuredLimit);
 const categoriesRemote = await _requestJson(`${_serverProductsEndpoint}?view=categories`);

 if (featuredResponse?.ok && categoriesRemote.ok && Array.isArray(categoriesRemote.data?.items)) {
 const counts = {};
 categoriesRemote.data.items.forEach((item) => {
 const key = String(item.key || '').trim();
 if (!key) return;
 counts[key] = Number(item.count || 0);
 });
 return {
 ok: true,
 counts,
 featured: Array.isArray(featuredResponse.items) ? featuredResponse.items : [],
 };
 }

 const catalog = await window.MotApi.getCatalogSnapshot();
 const counts = {};
 catalog.forEach((item) => {
 if (!item?.cat) return;
 counts[item.cat] = (counts[item.cat] || 0) + 1;
 });
 return {
 ok: true,
 counts,
 featured: catalog.filter(item => item.stock > 0).slice(0, featuredLimit),
 };
};

// Premium detailing brands that should headline the "Produse populare" grid
// when the active category is `detailing`. Order matters — first matches win.
const HOMEPAGE_DETAILING_BRANDS = ['Meguiar’s', "Meguiar's", 'Meguiars', 'Koch Chemie', 'Koch-Chemie', 'Sonax', 'Rupes', 'Flex', 'Carguard'];

// Reject items that are technically classified as `detailing` but read like
// auto-accessories to a customer browsing detailing (e.g. windshield wipers
// in the `spalare-exterior` subcat).
function _isDetailingShowcaseItem(item) {
 if (!item) return false;
 const name = String(item.name || '').toLowerCase();
 if (name.includes('ștergător') || name.includes('stergator') || name.includes('lama de stergere')) return false;
 if (item.subcat === 'spalare-exterior') return false;
 return true;
}

function _rankDetailingItems(items, limit) {
 const showcase = items.filter(_isDetailingShowcaseItem);
 const brandRank = (brand) => {
 const idx = HOMEPAGE_DETAILING_BRANDS.findIndex(b => b.toLowerCase() === String(brand || '').toLowerCase());
 return idx === -1 ? HOMEPAGE_DETAILING_BRANDS.length : idx;
 };
 const sorted = showcase.sort((a, b) =>
 brandRank(a.brand) - brandRank(b.brand) ||
 ((b.badge ? 1 : 0) - (a.badge ? 1 : 0)) ||
 Number(b.reviews || 0) - Number(a.reviews || 0) ||
 Number(b.price || 0) - Number(a.price || 0)
 );
 // If filtering left too few, top up with the rest of the original list.
 if (sorted.length >= limit) return sorted.slice(0, limit);
 const seen = new Set(sorted.map(i => i.id));
 const fallback = items.filter(i => !seen.has(i.id));
 return sorted.concat(fallback).slice(0, limit);
}

window.MotApi.getHomepageCategoryItems = async function getHomepageCategoryItemsRemoteFirst(category, options = {}) {
 await _delay(20);
 const categoryKey = String(category || 'all').trim();
 const limit = Math.max(4, Math.min(24, _safeInt(options.limit, 8)));

 if (!categoryKey || categoryKey === 'all') {
 const featured = await window.MotApi.getFeatured(limit);
 if (featured?.ok && Array.isArray(featured.items)) return featured.items;
 } else {
 // Pull a larger pool than `limit` so we have room to filter+rank, then
 // return the top `limit`. For `detailing` specifically, prefer premium
 // brands and skip wiper-style items that read like accessories.
 const remote = await window.MotApi.getProducts({ cat: categoryKey, page: 1, limit: Math.max(limit * 8, 64) });
 if (remote?.ok && Array.isArray(remote.items)) {
 const inStock = remote.items.filter(item => Number(item.stock || 0) > 0);
 if (categoryKey === 'detailing') return _rankDetailingItems(inStock, limit);
 return inStock
 .sort((a, b) => ((b.badge ? 1 : 0) - (a.badge ? 1 : 0)) || Number(b.reviews || 0) - Number(a.reviews || 0))
 .slice(0, limit);
 }
 }

 const catalog = await window.MotApi.getCatalogSnapshot();
 const available = catalog.filter(item => item.stock > 0);
 if (!categoryKey || categoryKey === 'all') {
 return [...available]
 .sort((a, b) => ((b.badge ? 1 : 0) - (a.badge ? 1 : 0)) || Number(b.reviews || 0) - Number(a.reviews || 0))
 .slice(0, limit);
 }
 return available
 .filter(item => item.cat === categoryKey)
 .sort((a, b) => Number(b.reviews || 0) - Number(a.reviews || 0))
 .slice(0, limit);
};

const _productPrefetchCache = new Map();
const _prefetchedProductIds = new Set();

async function _fetchProductRemoteFirstCached(id, options = {}) {
 const productId = String(id || '').trim();
 if (!productId) return { ok: false, error: 'Produsul nu a fost găsit.' };

 if (_productPrefetchCache.has(productId)) {
 return _productPrefetchCache.get(productId);
 }

 const request = (async () => {
 if (!options.skipDelay) await _delay(20);

 const remote = await _requestJson(`${_serverProductsEndpoint}?${_buildQueryString({ id: productId })}`);
 if (remote.ok && remote.data?.item) {
 const normalized = _normalizeCatalogItem(remote.data.item);
 if (normalized) return { ok: true, product: { ..._applyRatingSummary(normalized) } };
 }

 const product = (await _ensureCatalog()).find(item => item.id === productId || item.sku === productId);
 if (!product) return { ok: false, error: 'Produsul nu a fost găsit.' };
 return { ok: true, product: { ..._applyRatingSummary(product) } };
 })();

 _productPrefetchCache.set(productId, request);
 try {
 const result = await request;
 _productPrefetchCache.set(productId, Promise.resolve(result));
 return result;
 } catch (error) {
 _productPrefetchCache.delete(productId);
 throw error;
 }
}

function _extractProductIdFromHref(href) {
 try {
 const url = new URL(href, location.href);
 const path = String(url.pathname || '').toLowerCase();
 if (!path.endsWith('/product.html') && !path.endsWith('product.html')) return '';
 return String(url.searchParams.get('id') || '').trim();
 } catch (error) {
 return '';
 }
}

function _setupProductDataPrefetching() {
 if (window.__motorasProductPrefetchBound) return;
 window.__motorasProductPrefetchBound = true;

 const warmProduct = (event) => {
 const anchor = event.target.closest('a[href*="product.html?id="]');
 if (!anchor) return;
 const productId = _extractProductIdFromHref(anchor.href);
 if (!productId || _prefetchedProductIds.has(productId)) return;
 _prefetchedProductIds.add(productId);
 window.MotApi.prefetchProduct(productId).catch(() => {
 _prefetchedProductIds.delete(productId);
 });
 };

 document.addEventListener('mouseover', warmProduct, { passive: true });
 document.addEventListener('focusin', warmProduct, { passive: true });
 document.addEventListener('touchstart', warmProduct, { passive: true });
}

window.MotApi.getProduct = async function getProductRemoteFirstCached(id) {
 return _fetchProductRemoteFirstCached(id);
};

window.MotApi.prefetchProduct = async function prefetchProduct(id) {
 return _fetchProductRemoteFirstCached(id, { skipDelay: true });
};

_setupProductDataPrefetching();

window.MotApi.ready()
 .then(result => console.log('[MotApi]', result))
 .catch(error => console.error('[MotApi] feed error', error));
