const { buildSnapshot, json, packSnapshot, readJson, stripeRequest } = require('./_stripe');

function buildOrderId() {
  return `MTR-${Date.now().toString().slice(-8)}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  try {
    const payload = await readJson(req);
    const snapshot = buildSnapshot({
      ...payload,
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
