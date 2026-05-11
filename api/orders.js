const {
 buildSnapshot,
 findIntentByOrderId,
 findIntentBySupplierToken,
 json,
 mapIntentToOrder,
 packSnapshot,
 readJson,
 stripeRequest,
} = require('../lib/api/stripe');
const { requireAdmin } = require('../lib/api/admin-auth');
const { readCatalog } = require('../lib/api/products');
const { sendTrackingEmail, sendConfirmationEmail, sendSupplierOrderEmail } = require('../lib/api/email');
const { generateInvoicePdf, buildInvoiceNumber } = require('../lib/api/invoice');
const crypto = require('crypto');

// ── Stripe webhook signature verification ─────────────────────────
function verifyWebhookSignature(rawBody, sigHeader, secret) {
 const parts = Object.fromEntries((sigHeader || '').split(',').map(p => p.split('=')));
 const timestamp = parts.t;
 const v1 = parts.v1;
 if (!timestamp || !v1) throw new Error('Invalid stripe-signature header.');
 const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
 if (expected !== v1) throw new Error('Webhook signature mismatch.');
 if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new Error('Webhook timestamp too old.');
}

async function handleWebhook(req, res) {
 const secret = process.env.STRIPE_WEBHOOK_SECRET;
 if (!secret) return json(res, 503, { ok: false, error: 'STRIPE_WEBHOOK_SECRET not configured.' });

 // Read raw body for signature check
 const chunks = [];
 for await (const chunk of req) chunks.push(Buffer.from(chunk));
 const rawBody = Buffer.concat(chunks).toString('utf8');

 try {
 verifyWebhookSignature(rawBody, req.headers['stripe-signature'], secret);
 } catch (err) {
 return json(res, 400, { ok: false, error: err.message });
 }

 let event;
 try { event = JSON.parse(rawBody); } catch { return json(res, 400, { ok: false, error: 'Invalid JSON.' }); }

 // Only handle payment confirmed
 if (event.type === 'payment_intent.succeeded') {
 const intent = event.data?.object;
 if (intent?.metadata?.motoras_store === '1' && intent?.metadata?.confirmation_sent !== '1') {
 try {
 const order = mapIntentToOrder(intent);
 // Fire confirmation email (non-blocking for webhook response time)
 sendConfirmationEmail(order).catch(e => console.error('Confirmation email failed:', e.message));
 // Mark as notified in Stripe
 stripeRequest(`/payment_intents/${intent.id}`, {
 method: 'POST',
 body: { metadata: { ...intent.metadata, order_status: 'processing', confirmation_sent: '1' } },
 }).catch(() => {});
 } catch (err) {
 console.error('Webhook order processing error:', err.message);
 }
 }
 }

 return json(res, 200, { received: true });
}

async function listOrders() {
 const result = await stripeRequest('/payment_intents', {
 method: 'GET',
 query: {
 limit: 100,
 'expand[0]': 'data.latest_charge',
 },
 });

 return result.data
 .filter(intent => intent.metadata?.motoras_store === '1')
 .filter(intent => intent.metadata?.order_finalized === '1' || ['succeeded', 'processing', 'requires_capture'].includes(intent.status))
 .map(mapIntentToOrder)
 .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = async function handler(req, res) {
 // Stripe webhook — identified by stripe-signature header
 if (req.headers['stripe-signature']) return handleWebhook(req, res);

 try {
 if (req.method === 'GET') {
 const { id = '', status = '', email = '', supplier_token = '', pdf = '' } = req.query || {};

 // ── Supplier portal: return order items + delivery address only ─
 if (supplier_token) {
 const intent = await findIntentBySupplierToken(supplier_token);
 if (!intent) return json(res, 404, { ok: false, error: 'Invalid or expired supplier token.' });
 const order = mapIntentToOrder(intent);
 return json(res, 200, {
 ok: true,
 order: {
 id: order.id,
 createdAt: order.createdAt,
 items: order.items,
 name: order.name,
 address: order.address,
 city: order.city,
 county: order.county,
 zip: order.zip,
 tracking_number: order.tracking_number,
 tracking_courier: order.tracking_courier,
 },
 });
 }

 if (id) {
 const intent = await findIntentByOrderId(id);
 if (!intent) return json(res, 404, { ok: false, error: 'Order not found.' });
 const order = mapIntentToOrder(intent);

 // ── PDF invoice download ─────────────────────────────────────
 if (pdf === '1') {
 // If email query provided, validate it matches the order
 if (email && order.email && order.email.toLowerCase() !== String(email).toLowerCase()) {
 return json(res, 403, { ok: false, error: 'Access denied.' });
 }
 const pdfBuffer = await generateInvoicePdf(order);
 const invNr = buildInvoiceNumber(order.id);
 res.statusCode = 200;
 res.setHeader('Content-Type', 'application/pdf');
 res.setHeader('Content-Disposition', `attachment; filename="Factura-${invNr}.pdf"`);
 res.setHeader('Cache-Control', 'private, no-store');
 res.end(pdfBuffer);
 return;
 }

 // Enrich each item with supplier source from catalog
 try {
 const catalog = readCatalog();
 const byKey = new Map();
 catalog.forEach(p => {
 if (p.id) byKey.set(String(p.id), p.source || '');
 if (p.sku) byKey.set(String(p.sku), p.source || '');
 });
 order.items = order.items.map(item => ({
 ...item,
 source: byKey.get(String(item.id || '')) || byKey.get(String(item.sku || '')) || '',
 }));
 } catch (_) {}
 // Also expose supplier workflow metadata
 order.supplier_notified_at = intent.metadata?.supplier_notified_at || '';
 order.supplier_token = intent.metadata?.supplier_token ? '✓' : ''; // only expose existence, not the token
 return json(res, 200, { ok: true, order });
 }

 let items = await listOrders();
 if (status) items = items.filter(item => item.status === status);
 if (email) items = items.filter(item => item.email === email);
 return json(res, 200, { ok: true, total: items.length, items });
 }

 if (req.method === 'POST') {
 const payload = await readJson(req);
 const paymentIntentId = payload.paymentIntentId || payload.stripePaymentIntentId;
 if (!paymentIntentId) return json(res, 400, { ok: false, error: 'Missing paymentIntentId.' });

 const intent = await stripeRequest(`/payment_intents/${paymentIntentId}`, {
 method: 'GET',
 query: { 'expand[0]': 'latest_charge' },
 });

 if (!['succeeded', 'processing', 'requires_capture'].includes(intent.status)) {
 return json(res, 400, { ok: false, error: `Payment not completed. Current status: ${intent.status}.` });
 }

 const snapshot = buildSnapshot({
 ...payload,
 id: payload.id || intent.metadata?.order_id || paymentIntentId,
 status: payload.status || 'processing',
 paymentMethod: 'card',
 paymentLabel: payload.paymentLabel || 'Carte online',
 paymentMode: 'onsite',
 paymentReference: intent.latest_charge?.id || intent.id,
 paymentMessage: payload.paymentMessage || 'Plata cu cardul a fost confirmată prin Stripe.',
 paymentStatus: 'paid',
 });

 const updatedIntent = await stripeRequest(`/payment_intents/${paymentIntentId}`, {
 method: 'POST',
 body: {
 metadata: {
 motoras_store: '1',
 order_id: snapshot.id,
 order_status: snapshot.status,
 order_finalized: '1',
 customer_name: snapshot.name,
 customer_email: snapshot.email,
 customer_phone: snapshot.phone,
 shipping_method: snapshot.shipping,
 payment_method: 'card',
 ...packSnapshot(snapshot),
 },
 },
 });

 const confirmedIntent = await stripeRequest(`/payment_intents/${updatedIntent.id}`, {
 method: 'GET',
 query: { 'expand[0]': 'latest_charge' },
 });

 return json(res, 200, { ok: true, order: mapIntentToOrder(confirmedIntent) });
 }

 if (req.method === 'PATCH') {
 const payload = await readJson(req);

 // ── Supplier submits tracking number (no admin auth, uses token) ─
 if (payload.supplier_token && payload.tracking_number) {
 const intent = await findIntentBySupplierToken(payload.supplier_token);
 if (!intent) return json(res, 404, { ok: false, error: 'Invalid or expired supplier token.' });
 const updatedMeta = {
 ...intent.metadata,
 tracking_number: String(payload.tracking_number).trim(),
 tracking_courier: String(payload.tracking_courier || '').trim(),
 order_status: 'shipped',
 };
 await stripeRequest(`/payment_intents/${intent.id}`, {
 method: 'POST',
 body: { metadata: updatedMeta },
 });
 return json(res, 200, { ok: true });
 }

 if (!requireAdmin(req)) {
 return json(res, 401, { ok: false, error: 'Admin authentication required.' });
 }

 const targetId = payload.id || payload.orderId;
 if (!targetId) return json(res, 400, { ok: false, error: 'Missing order id.' });

 const intent = await findIntentByOrderId(targetId);
 if (!intent) return json(res, 404, { ok: false, error: 'Order not found.' });

 // ── Send supplier order email ────────────────────────────────
 if (payload.send_supplier_order) {
 const supplierEmail = payload.supplier_email || process.env.SUPPLIER_EMAIL;
 if (!supplierEmail) return json(res, 400, { ok: false, error: 'Supplier email not provided. Set SUPPLIER_EMAIL env var or pass supplier_email in payload.' });

 const token = crypto.randomBytes(32).toString('hex');
 const notifiedAt = new Date().toISOString();
 const updatedSupplierMeta = {
 ...intent.metadata,
 supplier_token: token,
 supplier_notified_at: notifiedAt,
 };
 await stripeRequest(`/payment_intents/${intent.id}`, {
 method: 'POST',
 body: { metadata: updatedSupplierMeta },
 });

 const order = mapIntentToOrder(intent);
 const storeUrl = process.env.STORE_URL || 'https://www.pieseautomotoras.ro';
 const portalUrl = `${storeUrl}/supplier.html?token=${token}`;
 const fullAddr = [order.address, order.city, order.county, order.zip].filter(Boolean).join(', ');
 await sendSupplierOrderEmail({
 to: supplierEmail,
 orderId: order.id,
 items: order.items,
 deliveryName: order.name,
 deliveryAddress: fullAddr,
 portalUrl,
 });

 return json(res, 200, { ok: true, supplier_notified_at: notifiedAt });
 }

 if (payload.payment === 'refunded' && intent.latest_charge?.id) {
 await stripeRequest('/refunds', {
 method: 'POST',
 body: {
 charge: intent.latest_charge.id,
 },
 });
 }

 const nextStatus = payload.status || intent.metadata?.order_status || 'processing';
 const updatedMeta = { ...intent.metadata, order_status: nextStatus };
 if (payload.tracking_number) updatedMeta.tracking_number = String(payload.tracking_number);
 if (payload.tracking_courier) updatedMeta.tracking_courier = String(payload.tracking_courier);
 if (payload.send_email || payload.mark_tracking_sent) updatedMeta.tracking_sent_at = new Date().toISOString();
 await stripeRequest(`/payment_intents/${intent.id}`, {
 method: 'POST',
 body: { metadata: updatedMeta },
 });

 // Send tracking email if requested
 let emailResult = null;
 if (payload.send_email && payload.email_to && updatedMeta.tracking_number && updatedMeta.tracking_courier) {
 try {
 emailResult = await sendTrackingEmail({
 to: payload.email_to,
 orderid: targetId,
 customerName: payload.email_customer_name || intent.metadata?.customer_name || '',
 tracking: updatedMeta.tracking_number,
 courier: updatedMeta.tracking_courier,
 items: payload.email_items || [],
 total: payload.email_total || 0,
 address: payload.email_address || '',
 });
 } catch (emailErr) {
 emailResult = { error: emailErr.message };
 }
 }

 const refreshed = await stripeRequest(`/payment_intents/${intent.id}`, {
 method: 'GET',
 query: { 'expand[0]': 'latest_charge' },
 });

 return json(res, 200, { ok: true, order: mapIntentToOrder(refreshed), email: emailResult });
 }

 res.setHeader('Allow', 'GET,POST,PATCH');
 return json(res, 405, { ok: false, error: 'Method not allowed.' });
 } catch (error) {
 return json(res, 500, { ok: false, error: error.message || 'Stripe order request failed.' });
 }
};
