const { buildSnapshot, getPublishableKey, json, packSnapshot, readJson, stripeRequest } = require('../lib/api/stripe');
const { getProduct } = require('../lib/api/catalog/gateway');

function buildOrderId() {
 return `MTR-${Date.now().toString().slice(-8)}`;
}

// Refuse to launch in production with a Stripe test key.
if (process.env.NODE_ENV === 'production'
 && process.env.STRIPE_SECRET_KEY
 && !process.env.STRIPE_SECRET_KEY.startsWith('sk_live_')) {
 throw new Error('Refusing to start: STRIPE_SECRET_KEY is not a live key in production.');
}

// Replace client-supplied prices with authoritative catalog prices so a
// caller cannot pay 1 RON for a 500 RON product.
async function verifyItemsAgainstCatalog(items) {
 if (!Array.isArray(items) || !items.length) return { items: [], invalid: ['empty cart'] };
 const verified = [];
 const invalid = [];
 for (const item of items) {
 const id = item && (item.id || item.sku);
 if (!id) { invalid.push('missing id'); continue; }
 try {
 const response = await getProduct({ id });
 if (!response || !response.ok || !response.item) {
 invalid.push(String(id));
 continue;
 }
 const trusted = response.item;
 verified.push({
 id: trusted.id,
 sku: trusted.sku || trusted.id,
 name: trusted.name,
 brand: trusted.brand || '',
 img: trusted.img || item.img || 'assets/product-placeholder.svg',
 qty: Math.max(1, Number(item.qty || 1)),
 price: Number(trusted.price || 0),
 });
 } catch (_) {
 invalid.push(String(id));
 }
 }
 return { items: verified, invalid };
}

module.exports = async function handler(req, res) {
 // GET — return Stripe publishable key (replaces /api/stripe-config)
 if (req.method === 'GET') {
 const publishableKey = getPublishableKey();
 if (!publishableKey) return json(res, 500, { ok: false, error: 'Missing STRIPE_PUBLISHABLE_KEY.' });
 return json(res, 200, { ok: true, publishableKey, currency: 'ron', country: 'RO' });
 }

 if (req.method !== 'POST') {
 res.setHeader('Allow', 'GET, POST');
 return json(res, 405, { ok: false, error: 'Method not allowed.' });
 }

 try {
 const payload = await readJson(req);

 const { items: verifiedItems, invalid } = await verifyItemsAgainstCatalog(payload.items);
 if (!verifiedItems.length) {
 return json(res, 400, { ok: false, error: 'Coșul nu conține produse valide.', invalid });
 }

 // Recompute subtotal from verified prices; preserve client-supplied shipping
 // and payment fees but drop any client-supplied `total` so it is recalculated.
 const verifiedSubtotal = verifiedItems.reduce((sum, it) => sum + it.price * it.qty, 0);
 const shippingCost = Number(payload.shippingCost || 0);
 const paymentFee = Number(payload.paymentFee || 0);
 const verifiedTotal = verifiedSubtotal + shippingCost + paymentFee;

 const snapshot = buildSnapshot({
 ...payload,
 items: verifiedItems,
 total: verifiedTotal,
 id: payload.id || buildOrderId(),
 status: 'pending_payment',
 paymentMethod: 'card',
 paymentLabel: 'Carte online',
 paymentMode: 'onsite',
 paymentStatus: 'unpaid',
 });

 if (!snapshot.email || !snapshot.name || !snapshot.address || !snapshot.phone || !snapshot.items.length) {
 return json(res, 400, { ok: false, error: 'Missing required checkout data.' });
 }

 const amount = Math.max(100, Math.round(Number(snapshot.total || 0) * 100));
 const metadata = {
 motoras_store: '1',
 order_id: snapshot.id,
 order_status: 'pending_payment',
 order_finalized: '0',
 customer_name: snapshot.name,
 customer_email: snapshot.email,
 customer_phone: snapshot.phone,
 shipping_method: snapshot.shipping,
 payment_method: 'card',
 ...packSnapshot(snapshot),
 };

 const intent = await stripeRequest('/payment_intents', {
 method: 'POST',
 body: {
 amount,
 currency: 'ron',
 'payment_method_types[0]': 'card',
 description: `Comanda Motoraș ${snapshot.id}`,
 receipt_email: snapshot.email,
 metadata,
 },
 });

 return json(res, 200, {
 ok: true,
 orderId: snapshot.id,
 paymentIntentId: intent.id,
 clientSecret: intent.client_secret,
 });
 } catch (error) {
 return json(res, 500, { ok: false, error: error.message || 'Stripe intent creation failed.' });
 }
};
