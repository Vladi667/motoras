const {
  buildSnapshot,
  findIntentByOrderId,
  json,
  mapIntentToOrder,
  packSnapshot,
  readJson,
  stripeRequest,
} = require('./_stripe');

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
  try {
    if (req.method === 'GET') {
      const { id = '', status = '', email = '' } = req.query || {};
      if (id) {
        const intent = await findIntentByOrderId(id);
        if (!intent) return json(res, 404, { ok: false, error: 'Order not found.' });
        return json(res, 200, { ok: true, order: mapIntentToOrder(intent) });
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
      const targetId = payload.id || payload.orderId;
      if (!targetId) return json(res, 400, { ok: false, error: 'Missing order id.' });

      const intent = await findIntentByOrderId(targetId);
      if (!intent) return json(res, 404, { ok: false, error: 'Order not found.' });

      if (payload.payment === 'refunded' && intent.latest_charge?.id) {
        await stripeRequest('/refunds', {
          method: 'POST',
          body: {
            charge: intent.latest_charge.id,
          },
        });
      }

      const nextStatus = payload.status || intent.metadata?.order_status || 'processing';
      await stripeRequest(`/payment_intents/${intent.id}`, {
        method: 'POST',
        body: {
          metadata: {
            ...intent.metadata,
            order_status: nextStatus,
          },
        },
      });

      const refreshed = await stripeRequest(`/payment_intents/${intent.id}`, {
        method: 'GET',
        query: { 'expand[0]': 'latest_charge' },
      });

      return json(res, 200, { ok: true, order: mapIntentToOrder(refreshed) });
    }

    res.setHeader('Allow', 'GET,POST,PATCH');
    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'Stripe order request failed.' });
  }
};
