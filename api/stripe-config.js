const { getPublishableKey, json } = require('./_stripe');

module.exports = async function handler(_req, res) {
  const publishableKey = getPublishableKey();
  if (!publishableKey) {
    return json(res, 500, { ok: false, error: 'Missing STRIPE_PUBLISHABLE_KEY.' });
  }

  return json(res, 200, {
    ok: true,
    publishableKey,
    currency: 'ron',
    country: 'RO',
  });
};
