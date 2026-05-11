// Smart-quote / BOM normalization. The catalog source occasionally contains
// curly apostrophes and Unicode quotation marks that look correct in some
// fonts but break consistency in product copy and SKU comparisons. Strip
// at read time so server output is always ASCII-quoted regardless of how
// the supplier serialized its feed. Romanian diacritics (ă â î ș ț and
// their uppercase forms) are explicitly preserved — they are NOT in the
// replacement table.
const _TEXT_REPLACEMENTS = [
  [/[‘’‚‛]/g, "'"],  // ‘ ’ ‚ ‛
  [/[“”„‟]/g, '"'],  // “ ” „ ‟
  [/′/g, "'"],                       // ′ prime
  [/″/g, '"'],                       // ″ double prime
  [/–/g, '-'],                       // – en-dash
  [/—/g, '-'],                       // — em-dash
  [/â€™/g, "'"],           // â€™  → '   (UTF-8 of ’ misread as CP-1252)
  [/â€˜/g, "'"],           // â€˜  → '   (UTF-8 of ‘ misread)
  [/â€“/g, '-'],           // â€“  → -   (UTF-8 of – misread)
  [/â€”/g, '-'],           // â€”  → -   (UTF-8 of — misread)
  [/â€³/g, '"'],           // â€³  → "   (UTF-8 of ″ misread)
  [/ /g, ' '],                       // NBSP → space
];

function normalizeText(value) {
  let s = String(value == null ? '' : value);
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  for (const [re, rep] of _TEXT_REPLACEMENTS) s = s.replace(re, rep);
  return s.trim();
}

function normalizeSourceKey(value) {
  const normalized = normalizeText(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (normalized === 'casa-bateriilor') return 'casabateriilor';
  return normalized || 'catalog';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toPositiveInt(value, fallback, max) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return typeof max === 'number' ? Math.min(parsed, max) : parsed;
}

function normalizeImageList(value) {
  const list = Array.isArray(value) ? value : [value];
  return Array.from(new Set(
    list.map(item => normalizeText(item)).filter(Boolean)
  ));
}

function normalizeProduct(item = {}) {
  const id = normalizeText(item.id || item.sku);
  const sku = normalizeText(item.sku || item.id);
  const source = normalizeSourceKey(item.source);
  const price = toNumber(item.price, 0);
  const stock = toNumber(item.stock, 0);
  const images = normalizeImageList(item.images && item.images.length ? item.images : item.img);

  return {
    ...item,
    id,
    sku,
    source,
    name: normalizeText(item.name || item.title || sku || id),
    brand: normalizeText(item.brand || item.subcatLabel || 'General'),
    cat: normalizeText(item.cat || item.category || 'piese'),
    subcat: normalizeText(item.subcat || item.subcategory || 'general'),
    price,
    stock,
    inStock: stock > 0,
    img: normalizeText(item.img || images[0] || 'assets/product-placeholder.svg'),
    images,
    desc: normalizeText(item.desc || item.description || ''),
    oem: normalizeText(item.oem || sku || id),
    compat: normalizeText(item.compat || ''),
    specs: item.specs && typeof item.specs === 'object' ? item.specs : {},
    eta: normalizeText(item.eta || ''),
  };
}

function paginateItems(items, params = {}) {
  const page = toPositiveInt(params.page, 1, 100000);
  const limit = toPositiveInt(params.limit, 24, 500);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * limit;

  return {
    total,
    page: safePage,
    pages,
    limit,
    items: items.slice(start, start + limit),
  };
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

module.exports = {
  json,
  normalizeImageList,
  normalizeProduct,
  normalizeSourceKey,
  normalizeText,
  paginateItems,
  toNumber,
  toPositiveInt,
};
