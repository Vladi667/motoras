// Product reviews backend — persisted in Upstash Redis (same store as users).
// Folded into the /api/products function to respect the Hobby plan's
// 12-serverless-function limit. Writes are gated by a valid user token
// (see auth-lib); reads are public. One review per user per product.
const KV_URL = process.env.UPSTASH_REDIS_REST_KV_REST_API_URL;
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;

async function kvExec(command) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  return res.json();
}

const KEY = (id) => `motoras:reviews:${id}`;
const MAX_PER_PRODUCT = 200;

function clean(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function summarize(list) {
  const n = list.length;
  const avg = n ? list.reduce((s, r) => s + Number(r.rating || 0), 0) / n : 0;
  return { rating: Number(avg.toFixed(1)), reviews: n, baseReviews: 0 };
}

function publicReview(r) {
  return { id: r.id, name: r.name, rating: r.rating, comment: r.comment, createdAt: r.createdAt };
}

async function listReviews(productId) {
  try {
    const { result } = await kvExec(['GET', KEY(productId)]);
    const arr = result ? JSON.parse(result) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

async function saveReviews(productId, list) {
  await kvExec(['SET', KEY(productId), JSON.stringify(list.slice(0, MAX_PER_PRODUCT))]);
}

// Public read.
async function getProductReviews(productId) {
  const id = clean(productId, 80);
  if (!id) return { ok: false, error: 'Produs invalid.' };
  const list = await listReviews(id);
  return { ok: true, summary: summarize(list), items: list.map(publicReview) };
}

// Authenticated write. `user` is the verified token payload {id, name, ...}.
// One review per user per product — re-submitting updates the existing one.
async function addReview(productId, user, payload = {}) {
  const id = clean(productId, 80);
  if (!id) return { ok: false, status: 400, error: 'Produs invalid.' };
  if (!user || !user.id) return { ok: false, status: 401, error: 'Autentificare necesară.' };

  const rating = parseInt(payload.rating, 10);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { ok: false, status: 400, error: 'Ratingul trebuie să fie între 1 și 5 stele.' };
  }
  const comment = clean(payload.comment, 600);
  const name = clean(user.name, 40) || 'Client Motoraș';

  const list = await listReviews(id);
  const now = new Date().toISOString();
  const idx = list.findIndex((r) => r.userId === user.id);
  const entry = {
    id: idx >= 0 ? list[idx].id : `REV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: user.id,
    name,
    rating,
    comment,
    createdAt: idx >= 0 ? list[idx].createdAt : now,
    updatedAt: now,
  };
  if (idx >= 0) list[idx] = entry;
  else list.unshift(entry);

  await saveReviews(id, list);
  return { ok: true, summary: summarize(list), items: list.map(publicReview) };
}

module.exports = { getProductReviews, addReview, listReviews };
