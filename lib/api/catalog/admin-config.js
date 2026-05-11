const { normalizeSourceKey } = require('./types');

const KV_URL = process.env.UPSTASH_REDIS_REST_KV_REST_API_URL;
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
const MARGINS_KEY = 'motoras:supplier_margins';
const OVERRIDES_KEY = 'motoras:product_overrides';

const SUPPLIERS = ['bravus', 'carhub', 'globiz', 'casabateriilor'];

const DEFAULT_MARGINS = {
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
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json',
      },
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
  try {
    return JSON.parse(raw);
  } catch (_) {
    return raw;
  }
}

async function kvSet(key, value) {
  const data = await kvExec(['SET', key, JSON.stringify(value)]);
  return data && data.result === 'OK';
}

function sanitizeMarginConfig(input = {}) {
  const merged = JSON.parse(JSON.stringify(DEFAULT_MARGINS));
  SUPPLIERS.forEach((key) => {
    const source = input[key];
    if (!source || typeof source !== 'object') return;
    merged[key] = {
      enabled: Boolean(source.enabled),
      margin: Math.max(0, Math.min(500, Number(source.margin) || 0)),
    };
  });
  return merged;
}

async function readMargins() {
  const stored = await kvGet(MARGINS_KEY);
  if (stored && typeof stored === 'object') return sanitizeMarginConfig(stored);
  return JSON.parse(JSON.stringify(DEFAULT_MARGINS));
}

async function writeMargins(input) {
  const merged = sanitizeMarginConfig({ ...(await readMargins()), ...(input || {}) });
  const persisted = await kvSet(MARGINS_KEY, merged);
  return { margins: merged, persisted };
}

function overrideKey(source, id) {
  return `${normalizeSourceKey(source)}:${String(id || '').trim()}`;
}

function sanitizeOverride(input = {}) {
  return {
    hidden: Boolean(input.hidden),
    priceOverride: input.priceOverride === null || input.priceOverride === '' || input.priceOverride === undefined
      ? null
      : Math.max(0, Number(input.priceOverride) || 0),
    stockOverride: input.stockOverride === null || input.stockOverride === '' || input.stockOverride === undefined
      ? null
      : Math.max(0, Number(input.stockOverride) || 0),
    nameOverride: String(input.nameOverride || '').trim(),
    updatedAt: new Date().toISOString(),
  };
}

async function readProductOverrides() {
  const stored = await kvGet(OVERRIDES_KEY);
  return stored && typeof stored === 'object' ? stored : {};
}

async function writeProductOverride(source, id, input) {
  const key = overrideKey(source, id);
  const all = await readProductOverrides();
  all[key] = sanitizeOverride(input);
  const persisted = await kvSet(OVERRIDES_KEY, all);
  return { key, override: all[key], overrides: all, persisted };
}

async function deleteProductOverride(source, id) {
  const key = overrideKey(source, id);
  const all = await readProductOverrides();
  delete all[key];
  const persisted = await kvSet(OVERRIDES_KEY, all);
  return { key, overrides: all, persisted };
}

function applyMarginToPrice(price, marginPct) {
  if (!price) return price;
  if (!marginPct) return Math.round(price * 100) / 100;
  return Math.round(price * (1 + marginPct / 100) * 100) / 100;
}

module.exports = {
  DEFAULT_MARGINS,
  DEFAULTS: DEFAULT_MARGINS,
  MARGINS_KEY,
  OVERRIDES_KEY,
  SUPPLIERS,
  applyMarginToPrice,
  deleteProductOverride,
  overrideKey,
  readMargins,
  readProductOverrides,
  sanitizeMarginConfig,
  sanitizeOverride,
  writeMargins,
  writeProductOverride,
};
