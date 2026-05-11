const KV_URL = process.env.UPSTASH_REDIS_REST_KV_REST_API_URL;
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
const MARGINS_KEY = 'motoras:supplier_margins';

const SUPPLIERS = ['bravus', 'carhub', 'globiz', 'casabateriilor'];

const DEFAULTS = {
 bravus: { enabled: true, margin: 30 },
 carhub: { enabled: true, margin: 25 },
 globiz: { enabled: true, margin: 22 },
 casabateriilor: { enabled: true, margin: 28 },
};

async function kvExec(command) {
 if (!KV_URL || !KV_TOKEN) return null;
 try {
 const res = await fetch(KV_URL, {
 method: 'POST',
 headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
 body: JSON.stringify(command),
 });
 return res.json();
 } catch (_) {
 return null;
 }
}

async function kvGet(key) {
 const data = await kvExec(['GET', key]);
 const raw = data && data.result;
 if (!raw) return null;
 try { return JSON.parse(raw); } catch (_) { return raw; }
}

async function readMargins() {
 const stored = await kvGet(MARGINS_KEY);
 if (stored && typeof stored === 'object') {
 const merged = Object.assign({}, DEFAULTS);
 SUPPLIERS.forEach((key) => {
 if (stored[key]) {
 merged[key] = {
 enabled: Boolean(stored[key].enabled),
 margin: Math.max(0, Math.min(500, Number(stored[key].margin) || DEFAULTS[key].margin)),
 };
 }
 });
 return merged;
 }
 return Object.assign({}, DEFAULTS);
}

function applyMargin(price, marginPct) {
 if (!price) return price;
 if (!marginPct) return Math.round(price * 100) / 100;
 return Math.round(price * (1 + marginPct / 100) * 100) / 100;
}

module.exports = { readMargins, applyMargin, DEFAULTS, SUPPLIERS };
