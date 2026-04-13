const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const SNAPSHOT_CHUNK_SIZE = 450;
const SNAPSHOT_CHUNK_MAX = 20;

function getSecretKey() {
  return process.env.STRIPE_SECRET_KEY || '';
}

function getPublishableKey() {
  return process.env.STRIPE_PUBLISHABLE_KEY || '';
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') {
    if (typeof req.body.payload === 'string') {
      try {
        return JSON.parse(req.body.payload);
      } catch (_) {
        return {};
      }
    }
    return req.body;
  }
  if (req.body && Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString('utf8'));
    } catch (_) {
      return {};
    }
  }
  if (typeof req.body === 'string' && req.body) {
    try {
      return JSON.parse(req.body);
    } catch (_) {
      return {};
    }
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');

  try {
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

function toStripeForm(data, prefix = '') {
  const parts = [];
  const push = (key, value) => {
    if (value === undefined || value === null) return;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  };

  if (Array.isArray(data)) {
    data.forEach((value, index) => {
      const key = prefix ? `${prefix}[${index}]` : String(index);
      parts.push(toStripeForm(value, key));
    });
    return parts.filter(Boolean).join('&');
  }

  if (data && typeof data === 'object') {
    Object.entries(data).forEach(([key, value]) => {
      const nextKey = prefix ? `${prefix}[${key}]` : key;
      const encoded = toStripeForm(value, nextKey);
      if (encoded) parts.push(encoded);
    });
    return parts.filter(Boolean).join('&');
  }

  push(prefix, data);
  return parts.join('&');
}

async function stripeRequest(path, options = {}) {
  const secretKey = getSecretKey();
  if (!secretKey) {
    const error = new Error('Missing STRIPE_SECRET_KEY.');
    error.code = 'stripe_config_missing';
    throw error;
  }

  const method = options.method || 'GET';
  const headers = {
    Authorization: `Bearer ${secretKey}`,
  };

  let url = `${STRIPE_API_BASE}${path}`;
  let body;

  if (method === 'GET' && options.query) {
    const query = toStripeForm(options.query);
    if (query) url += `?${query}`;
  } else if (options.body) {
    body = toStripeForm(options.body);
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const response = await fetch(url, { method, headers, body });
  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message || 'Stripe request failed.';
    const error = new Error(message);
    error.code = payload?.error?.code || 'stripe_error';
    error.type = payload?.error?.type || 'stripe_error';
    error.status = response.status;
    throw error;
  }
  return payload;
}

function normalizeItems(items = []) {
  return (Array.isArray(items) ? items : []).map(item => ({
    id: item.id || item.sku || '',
    sku: item.sku || item.id || '',
    name: item.name || 'Produs',
    brand: item.brand || '',
    img: item.img || 'assets/product-placeholder.svg',
    qty: Math.max(1, Number(item.qty || 1)),
    price: Number(item.price || 0),
  }));
}

function buildSnapshot(payload = {}) {
  const items = normalizeItems(payload.items);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const shippingCost = Number(payload.shippingCost || 0);
  const paymentFee = Number(payload.paymentFee || 0);
  const total = Number(payload.total || subtotal + shippingCost + paymentFee);

  return {
    id: payload.id || '',
    createdAt: payload.createdAt || new Date().toISOString(),
    status: payload.status || 'pending_payment',
    email: payload.email || '',
    name: payload.name || `${payload.firstName || ''} ${payload.lastName || ''}`.trim(),
    firstName: payload.firstName || '',
    lastName: payload.lastName || '',
    phone: payload.phone || '',
    address: payload.address || '',
    county: payload.county || '',
    city: payload.city || '',
    zip: payload.zip || '',
    shipping: payload.shipping || 'standard',
    shippingCost,
    paymentFee,
    paymentMethod: payload.paymentMethod || 'card',
    paymentLabel: payload.paymentLabel || 'Carte online',
    paymentMode: payload.paymentMode || 'onsite',
    paymentReference: payload.paymentReference || '',
    paymentMessage: payload.paymentMessage || '',
    paymentStatus: payload.paymentStatus || 'unpaid',
    subtotal,
    total,
    items,
    notes: payload.notes || '',
  };
}

function packSnapshot(snapshot) {
  const jsonString = JSON.stringify(snapshot);
  const metadata = {};
  const chunks = [];

  for (let index = 0; index < jsonString.length; index += SNAPSHOT_CHUNK_SIZE) {
    chunks.push(jsonString.slice(index, index + SNAPSHOT_CHUNK_SIZE));
  }

  metadata.snapshot_chunks = String(Math.min(chunks.length, SNAPSHOT_CHUNK_MAX));
  for (let index = 0; index < SNAPSHOT_CHUNK_MAX; index += 1) {
    const key = `snapshot_${String(index).padStart(2, '0')}`;
    metadata[key] = chunks[index] || '';
  }
  return metadata;
}

function unpackSnapshot(metadata = {}) {
  const totalChunks = Math.min(Number(metadata.snapshot_chunks || 0), SNAPSHOT_CHUNK_MAX);
  if (!totalChunks) return null;

  let raw = '';
  for (let index = 0; index < totalChunks; index += 1) {
    raw += metadata[`snapshot_${String(index).padStart(2, '0')}`] || '';
  }

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function derivePaymentStatus(intent) {
  const latestCharge = intent.latest_charge;
  if (latestCharge?.refunded) return 'refunded';
  if (intent.status === 'succeeded' || intent.status === 'processing' || intent.amount_received > 0) return 'paid';
  return 'unpaid';
}

function deriveOrderStatus(intent, snapshot, paymentStatus) {
  return intent.metadata?.order_status
    || snapshot?.status
    || (paymentStatus === 'paid' ? 'processing' : 'pending_payment');
}

function derivePaymentLabel(snapshot) {
  return snapshot?.paymentLabel || 'Carte online';
}

function mapIntentToOrder(intent) {
  const snapshot = unpackSnapshot(intent.metadata || {}) || {};
  const items = normalizeItems(snapshot.items || []);
  const paymentStatus = derivePaymentStatus(intent);
  const total = Number(snapshot.total || (intent.amount || 0) / 100);
  const subtotal = Number(snapshot.subtotal || Math.max(0, total - Number(snapshot.shippingCost || 0) - Number(snapshot.paymentFee || 0)));

  return {
    id: intent.metadata?.order_id || intent.id,
    stripePaymentIntentId: intent.id,
    createdAt: snapshot.createdAt || new Date((intent.created || 0) * 1000).toISOString(),
    updatedAt: new Date((intent.created || 0) * 1000).toISOString(),
    status: deriveOrderStatus(intent, snapshot, paymentStatus),
    email: snapshot.email || intent.receipt_email || intent.metadata?.customer_email || '',
    name: snapshot.name || intent.metadata?.customer_name || '',
    firstName: snapshot.firstName || '',
    lastName: snapshot.lastName || '',
    phone: snapshot.phone || intent.metadata?.customer_phone || '',
    address: snapshot.address || '',
    county: snapshot.county || '',
    city: snapshot.city || '',
    zip: snapshot.zip || '',
    shipping: snapshot.shipping || intent.metadata?.shipping_method || 'standard',
    shippingCost: Number(snapshot.shippingCost || 0),
    paymentFee: Number(snapshot.paymentFee || 0),
    payment: paymentStatus,
    paymentStatus,
    paymentMethod: 'card',
    paymentLabel: derivePaymentLabel(snapshot),
    paymentMode: 'onsite',
    paymentReference: intent.latest_charge?.id || intent.id,
    paymentMessage: snapshot.paymentMessage
      || (paymentStatus === 'paid'
        ? 'Plata cu cardul a fost confirmată prin Stripe.'
        : 'Plata cu cardul este în așteptare în Stripe.'),
    paymentScenario: '',
    paymentCardLast4: intent.latest_charge?.payment_method_details?.card?.last4 || snapshot.paymentCardLast4 || '',
    items,
    subtotal,
    total,
    notes: snapshot.notes || '',
  };
}

async function findIntentByOrderId(orderId) {
  if (!orderId) return null;
  if (String(orderId).startsWith('pi_')) {
    return stripeRequest(`/payment_intents/${orderId}`, {
      method: 'GET',
      query: { 'expand[0]': 'latest_charge' },
    });
  }

  const result = await stripeRequest('/payment_intents', {
    method: 'GET',
    query: {
      limit: 100,
      'expand[0]': 'data.latest_charge',
    },
  });

  return result.data.find(intent => intent.metadata?.motoras_store === '1' && intent.metadata?.order_id === orderId) || null;
}

module.exports = {
  buildSnapshot,
  findIntentByOrderId,
  getPublishableKey,
  getSecretKey,
  json,
  mapIntentToOrder,
  packSnapshot,
  readJson,
  stripeRequest,
  unpackSnapshot,
};
