const { readJson, json, mapIntentToOrder, stripeRequest } = require('../../lib/api/stripe');
const {
 createToken,
 getAdminPassword,
 getAdminUser,
 isAdminConfigured,
 isProductionRuntime,
 requireAdmin,
 timingSafeEquals,
} = require('../../lib/api/admin-auth');
const { readCatalog, buildSummary, summarizeBy, LOW_STOCK_THRESHOLD } = require('../../lib/api/products');

// Set TVA_ENABLED = true once the company is registered as TVA payer (platitor TVA)
const TVA_ENABLED = false;
const TVA_RATE = 0.19;

const {
 DEFAULT_MARGINS: DEFAULTS,
 SUPPLIERS,
 deleteProductOverride,
 readMargins,
 readProductOverrides,
 writeMargins,
 writeProductOverride,
} = require('../../lib/api/catalog/admin-config');

async function listOrdersSafe() {
 try {
 const result = await stripeRequest('/payment_intents', {
 method: 'GET',
 query: {
 limit: 100,
 'expand[0]': 'data.latest_charge',
 },
 });

 return {
 ok: true,
 items: result.data
 .filter(intent => intent.metadata?.motoras_store === '1')
 .filter(intent => intent.metadata?.order_finalized === '1' || ['succeeded', 'processing', 'requires_capture'].includes(intent.status))
 .map(mapIntentToOrder)
 .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)),
 };
 } catch (error) {
 return {
 ok: false,
 error: error.message || 'Orders unavailable.',
 items: [],
 };
 }
}

function formatDayKey(value) {
 const date = new Date(value);
 date.setHours(0, 0, 0, 0);
 return date.toISOString().slice(0, 10);
}

function buildLast7Days(orders) {
 const buckets = Array.from({ length: 7 }, (_, index) => {
 const date = new Date();
 date.setHours(0, 0, 0, 0);
 date.setDate(date.getDate() - (6 - index));
 return {
 key: date.toISOString().slice(0, 10),
 label: date.toLocaleDateString('ro-RO', { weekday: 'short' }),
 orders: 0,
 revenue: 0,
 averageOrderValue: 0,
 };
 });

 orders.forEach((order) => {
 const key = formatDayKey(order.createdAt || order.updatedAt || new Date().toISOString());
 const bucket = buckets.find(item => item.key === key);
 if (!bucket) return;
 bucket.orders += 1;
 bucket.revenue += Number(order.total || 0);
 });

 buckets.forEach((bucket) => {
 bucket.averageOrderValue = bucket.orders ? Number((bucket.revenue / bucket.orders).toFixed(2)) : 0;
 });

 return buckets;
}

function buildCustomers(orders) {
 const grouped = new Map();

 orders.forEach((order) => {
 const key = `${order.email || ''}|${order.name || ''}`;
 if (!grouped.has(key)) {
 grouped.set(key, {
 name: order.name || 'Client Motoras',
 email: order.email || '',
 phone: order.phone || '',
 orders: 0,
 total: 0,
 lastOrderAt: order.createdAt || order.updatedAt || new Date().toISOString(),
 });
 }

 const entry = grouped.get(key);
 entry.orders += 1;
 entry.total += Number(order.total || 0);
 if (new Date(order.createdAt || 0) > new Date(entry.lastOrderAt || 0)) {
 entry.lastOrderAt = order.createdAt;
 entry.phone = order.phone || entry.phone;
 }
 });

 return Array.from(grouped.values())
 .sort((left, right) => right.total - left.total || right.orders - left.orders)
 .map((entry) => ({
 ...entry,
 total: Number(entry.total.toFixed(2)),
 }));
}

function buildTopOrderedProducts(orders, catalog) {
 const byIdentity = new Map();
 catalog.forEach((item) => {
 if (item.id) byIdentity.set(String(item.id), item);
 if (item.sku) byIdentity.set(String(item.sku), item);
 });

 const grouped = new Map();
 orders.forEach((order) => {
 (Array.isArray(order.items) ? order.items : []).forEach((item) => {
 const key = String(item.id || item.sku || item.name || '');
 if (!key) return;
 if (!grouped.has(key)) {
 const catalogMatch = byIdentity.get(String(item.id || item.sku || '')) || null;
 grouped.set(key, {
 key,
 name: item.name || 'Produs',
 sku: item.sku || item.id || '',
 qty: 0,
 revenue: 0,
 stock: catalogMatch ? Number(catalogMatch.stock || 0) : 0,
 category: catalogMatch?.category || catalogMatch?.cat || '',
 source: catalogMatch?.source || '',
 });
 }

 const entry = grouped.get(key);
 entry.qty += Math.max(1, Number(item.qty || 1));
 entry.revenue += Math.max(0, Number(item.price || 0)) * Math.max(1, Number(item.qty || 1));
 });
 });

 return Array.from(grouped.values())
 .sort((left, right) => right.qty - left.qty || right.revenue - left.revenue)
 .slice(0, 8)
 .map((entry) => ({
 ...entry,
 revenue: Number(entry.revenue.toFixed(2)),
 }));
}

function buildSupplierQueue(orders, catalog) {
 const byIdentity = new Map();
 catalog.forEach((item) => {
 if (item.id) byIdentity.set(String(item.id), item);
 if (item.sku) byIdentity.set(String(item.sku), item);
 });

 return orders
 .filter(order => ['pending_payment', 'pending', 'processing'].includes(order.status))
 .slice(0, 12)
 .map((order) => {
 const firstItem = Array.isArray(order.items) && order.items.length ? order.items[0] : null;
 const catalogItem = firstItem
 ? (byIdentity.get(String(firstItem.id || '')) || byIdentity.get(String(firstItem.sku || '')) || null)
 : null;
 const response = !firstItem
 ? 'Fara produse in snapshot'
 : (!catalogItem
 ? 'Produs lipsa din catalog'
 : (Number(catalogItem.stock || 0) > LOW_STOCK_THRESHOLD
 ? 'In stoc in catalog'
 : (Number(catalogItem.stock || 0) > 0 ? 'Stoc scazut - verificare' : 'Fara stoc - escaladare')));

 return {
 id: order.id,
 product: firstItem?.name || 'Comanda fara produse',
 sent: order.createdAt,
 response,
 status: order.status,
 source: catalogItem?.source || '',
 };
 });
}

function buildInvoices(orders) {
 return orders
 .filter(order => String(order.paymentStatus || order.payment).toLowerCase() === 'paid')
 .slice(0, 20)
 .map((order) => ({
 nr: `FACT-${String(order.id).replace(/[^A-Za-z0-9-]/g, '')}`,
 client: order.name || 'Client Motoras',
 order: order.id,
 total: Number(order.total || 0),
 tva: TVA_ENABLED ? Number(((Number(order.total || 0) * TVA_RATE) / (1 + TVA_RATE)).toFixed(2)) : 0,
 status: 'paid',
 date: order.createdAt,
 }));
}

// KV plumbing and margin reads now live in lib/api/catalog/admin-config.js.

async function handleAuth(req, res) {
 if (req.method !== 'POST') {
 res.setHeader('Allow', 'POST');
 return json(res, 405, { ok: false, error: 'Method not allowed.' });
 }

 if (isProductionRuntime() && !isAdminConfigured()) {
 return json(res, 503, {
 ok: false,
 error: 'Admin credentials are not configured. Set ADMIN_USER, ADMIN_PASSWORD, and ADMIN_SESSION_SECRET in Vercel.',
 });
 }

 const payload = await readJson(req);
 const username = String(payload.username || payload.user || '').trim();
 const password = String(payload.password || '').trim();

 if (!username || !password) {
 return json(res, 400, { ok: false, error: 'Missing username or password.' });
 }

 if (!timingSafeEquals(username, getAdminUser()) || !timingSafeEquals(password, getAdminPassword())) {
 return json(res, 401, { ok: false, error: 'Invalid credentials.' });
 }

 const token = createToken({
 user: username,
 exp: Date.now() + (12 * 60 * 60 * 1000),
 });

 return json(res, 200, {
 ok: true,
 token,
 expiresIn: 12 * 60 * 60,
 });
}

async function handleDashboard(req, res) {
 if (req.method !== 'GET') {
 res.setHeader('Allow', 'GET');
 return json(res, 405, { ok: false, error: 'Method not allowed.' });
 }

 if (!requireAdmin(req)) {
 return json(res, 401, { ok: false, error: 'Admin authentication required.' });
 }

 const catalog = readCatalog();
 const catalogSummary = buildSummary(catalog);
 const ordersResult = await listOrdersSafe();
 const orders = ordersResult.items;
 const todayKey = formatDayKey(new Date().toISOString());
 const todayOrders = orders.filter(order => formatDayKey(order.createdAt || order.updatedAt || new Date().toISOString()) === todayKey);
 const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
 const todayRevenue = todayOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
 const processingCount = orders.filter(order => ['pending', 'pending_payment', 'processing'].includes(order.status)).length;
 const paidCount = orders.filter(order => String(order.paymentStatus || order.payment).toLowerCase() === 'paid').length;
 const customers = buildCustomers(orders);
 const topOrderedProducts = buildTopOrderedProducts(orders, catalog);
 const lowStockProducts = catalog
 .filter(item => item.lowStock || !item.inStock)
 .sort((left, right) => left.stock - right.stock || left.name.localeCompare(right.name, 'ro'))
 .slice(0, 20);
 const sourceGroups = summarizeBy(catalog, item => item.sourceKey, item => item.source);
 const categoryGroups = summarizeBy(catalog, item => item.categoryKey, item => item.category);

 return json(res, 200, {
 ok: true,
 generatedAt: new Date().toISOString(),
 notes: [
 ordersResult.ok
 ? 'Comenzile provin din Stripe Payment Intents confirmate; comenzile locale ale clientilor nu sunt persistate server-side in acest repo.'
 : `Comenzile Stripe nu au putut fi incarcate: ${ordersResult.error}`,
 'Costul de achizitie nu exista in snapshot-ul catalogului, deci marja reala nu poate fi calculata inca in admin.',
 ],
 metrics: {
 totalOrders: orders.length,
 ordersToday: todayOrders.length,
 totalRevenue: Number(totalRevenue.toFixed(2)),
 revenueToday: Number(todayRevenue.toFixed(2)),
 uniqueCustomers: customers.length,
 processingOrders: processingCount,
 paidOrders: paidCount,
 unpaidOrders: orders.length - paidCount,
 averageOrderValue: orders.length ? Number((totalRevenue / orders.length).toFixed(2)) : 0,
 totalProducts: catalogSummary.total,
 inStockProducts: catalogSummary.inStock,
 outOfStockProducts: catalogSummary.outOfStock,
 lowStockProducts: catalogSummary.lowStock,
 },
 charts: {
 last7Days: buildLast7Days(orders),
 },
 orders: {
 recent: orders.slice(0, 10),
 queue: buildSupplierQueue(orders, catalog),
 },
 customers: {
 top: customers.slice(0, 20),
 },
 products: {
 summary: catalogSummary,
 lowStock: lowStockProducts,
 topCategories: categoryGroups.slice(0, 8),
 topSources: sourceGroups,
 topOrdered: topOrderedProducts,
 },
 supplier: {
 healthy: sourceGroups.length > 0,
 sources: sourceGroups,
 },
 invoices: {
 recent: buildInvoices(orders),
 },
 agents: {
 items: [
 { name: 'Email Agent', status: 'planned', note: 'Automatizarile email nu sunt conectate la un backend dedicat in acest repo.' },
 { name: 'Order Agent', status: ordersResult.ok ? 'active' : 'blocked', note: ordersResult.ok ? 'Foloseste comenzile sincronizate din Stripe.' : ordersResult.error },
 { name: 'Invoice Agent', status: 'planned', note: 'Facturile sunt deduse din comenzile platite; generarea PDF nu are backend inca.' },
 { name: 'Status Agent', status: 'active', note: 'Poate actualiza statusul comenzilor Stripe existente.' },
 ],
 },
 apiStatus: [
 { name: '/api/products', status: 'active', detail: `${catalogSummary.total} produse disponibile in catalog.` },
 { name: '/api/bravus', status: 'active', detail: `${sourceGroups.find(item => item.label === 'bravus')?.count || 0} produse Bravus disponibile.` },
 { name: '/api/orders', status: ordersResult.ok ? 'active' : 'degraded', detail: ordersResult.ok ? `${orders.length} comenzi Stripe disponibile.` : ordersResult.error },
 { name: '/api/admin/dashboard', status: 'active', detail: 'Sinteza operationala pentru dashboard.' },
 ],
 });
}

async function handleMargins(req, res) {
 res.setHeader('Access-Control-Allow-Origin', '*');
 res.setHeader('Cache-Control', 'no-store');

 if (req.method === 'GET') {
 const margins = await readMargins();
 return json(res, 200, { ok: true, margins });
 }

 if (req.method === 'POST') {
 if (!requireAdmin(req)) {
 return json(res, 401, { ok: false, error: 'Admin authentication required.' });
 }

 const body = await readJson(req);
 const input = body.margins || body;
 const { margins, persisted } = await writeMargins(input);
 return json(res, 200, { ok: true, margins, persisted });
 }

 res.setHeader('Allow', 'GET, POST');
 return json(res, 405, { ok: false, error: 'Method not allowed.' });
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
 try {
 const action = String(req.query?.action || '').trim().toLowerCase();

 if (action === 'auth') return handleAuth(req, res);
 if (action === 'dashboard') return handleDashboard(req, res);
 if (action === 'margins') return handleMargins(req, res);
 if (action === 'product-overrides') return handleProductOverrides(req, res);

 res.setHeader('Allow', 'GET, POST');
 return json(res, 404, { ok: false, error: 'Admin endpoint not found.' });
 } catch (error) {
 return json(res, 500, { ok: false, error: error.message || 'Admin request failed.' });
 }
};
