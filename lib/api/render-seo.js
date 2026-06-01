// Server-side SEO rendering for product pages (shared helper).
// Folded into the existing /api/products function to stay within the
// Hobby plan's 12-function limit. A crawler hitting /product.html?id=<SKU>
// gets the real title, meta, canonical, OG/Twitter tags and a complete
// Product JSON-LD injected into the raw HTML — no JS execution required.
// The client JS still hydrates the page and refreshes the same
// <script id="jsonld-product"> node, so there is no duplication.
const fs = require('fs');
const path = require('path');
const { getProduct, queryProducts } = require('./catalog/gateway');
const { normalizeText } = require('./catalog/types');

const SITE = 'https://www.pieseautomotoras.ro';
const DEFAULT_OG = SITE + '/assets/og-default.png';

const _templates = {};
function loadTemplate(name) {
  if (name in _templates) return _templates[name];
  const candidates = [
    path.join(process.cwd(), name),
    path.join(__dirname, '..', '..', name),
    path.join(__dirname, '..', name),
  ];
  for (const p of candidates) {
    try { _templates[name] = fs.readFileSync(p, 'utf8'); return _templates[name]; } catch (_) { /* try next */ }
  }
  _templates[name] = null;
  return null;
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clip(value, max) {
  const s = normalizeText(value).replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, '').trim() + '…';
}

function absUrl(u) {
  const s = normalizeText(u);
  if (!s || /^data:/i.test(s)) return DEFAULT_OG;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^assets\/product-placeholder/i.test(s)) return DEFAULT_OG;
  return SITE + '/' + s.replace(/^\/+/, '');
}

function productImages(p) {
  const raw = Array.isArray(p.images) && p.images.length ? p.images : [p.img];
  const urls = raw.map(absUrl).filter((u, i, a) => u && u !== DEFAULT_OG && a.indexOf(u) === i);
  return urls.length ? urls : [DEFAULT_OG];
}

function buildTitle(p) {
  return clip(p.name, 60) + ' - Motoraș';
}

function buildDescription(p) {
  const brand = p.brand && p.brand !== 'General' ? ' ' + p.brand : '';
  const body = normalizeText(p.desc || p.compat || 'Piese auto originale și aftermarket.');
  return clip(`${p.name}${brand}. ${body} Livrare rapidă în România, garanție 2 ani, retur 14 zile.`, 158);
}

function buildProductSchema(p, url) {
  const images = productImages(p);
  const description = normalizeText([p.desc, p.compat, p.eta].filter(Boolean).join(' | ')) || normalizeText(p.name);
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': url + '#product',
    url,
    name: normalizeText(p.name),
    description,
    sku: normalizeText(p.sku || p.id),
    mpn: normalizeText(p.sku || p.id),
    category: normalizeText(p.subcatLabel || p.cat || 'Piese Auto'),
    image: images,
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'RON',
      price: Number(p.price || 0).toFixed(2),
      availability: Number(p.stock || 0) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: 'Motoraș', url: SITE + '/' },
    },
  };
  if (p.brand) schema.brand = { '@type': 'Brand', name: normalizeText(p.brand) };
  if (p.oem) {
    schema.additionalProperty = [{ '@type': 'PropertyValue', name: 'Cod OEM', value: normalizeText(p.oem) }];
  }
  const rating = Number(p.rating || 0);
  const reviews = Number(p.reviews || 0);
  if (rating > 0 && reviews > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: rating.toFixed(1),
      reviewCount: reviews,
    };
  }
  return schema;
}

function replaceTag(html, regex, replacement) {
  return regex.test(html) ? html.replace(regex, replacement) : html;
}

function injectSeo(html, p) {
  const url = SITE + '/product.html?id=' + encodeURIComponent(p.id || p.sku);
  const title = buildTitle(p);
  const desc = buildDescription(p);
  const image = productImages(p)[0];

  let out = html;
  out = replaceTag(out, /<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  out = replaceTag(out, /<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${esc(desc)}"/>`);
  out = replaceTag(out, /<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${esc(url)}"/>`);
  out = replaceTag(out, /<meta\s+property="og:type"[^>]*>/i, `<meta property="og:type" content="product"/>`);
  out = replaceTag(out, /<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${esc(title)}"/>`);
  out = replaceTag(out, /<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${esc(desc)}"/>`);
  out = replaceTag(out, /<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${esc(url)}"/>`);
  out = replaceTag(out, /<meta\s+property="og:image"[^>]*>/i, `<meta property="og:image" content="${esc(image)}"/>`);
  out = replaceTag(out, /<meta\s+name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${esc(title)}"/>`);
  out = replaceTag(out, /<meta\s+name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${esc(desc)}"/>`);
  out = replaceTag(out, /<meta\s+name="twitter:image"[^>]*>/i, `<meta name="twitter:image" content="${esc(image)}"/>`);

  const schema = buildProductSchema(p, url);
  const ld = `<script type="application/ld+json" id="jsonld-product">${JSON.stringify(schema)}</script>\n</head>`;
  out = out.replace('</head>', ld);
  return out;
}

// Returns { html, cacheControl } for a product page request.
async function renderProductPage(query = {}) {
  const id = (query.id || query.sku || '').toString();
  const template = loadTemplate('product.html');

  if (!template) {
    return {
      cacheControl: 'no-store',
      html: '<!doctype html><html lang="ro"><head><meta charset="utf-8"/>'
        + '<title>Produs | Motoraș</title>'
        + '<link rel="canonical" href="' + SITE + '/product.html?id=' + esc(encodeURIComponent(id)) + '"/>'
        + '<meta name="robots" content="noindex"/></head>'
        + '<body><p>Se încarcă produsul… <a href="/piese-auto">Vezi catalogul</a></p></body></html>',
    };
  }

  if (!id) return { html: template, cacheControl: 'no-store' };

  try {
    const result = await getProduct({ id });
    if (result && result.ok && result.item) {
      return { html: injectSeo(template, result.item), cacheControl: 'public, s-maxage=3600, stale-while-revalidate=86400' };
    }
    return { html: template, cacheControl: 'public, s-maxage=60' };
  } catch (_) {
    return { html: template, cacheControl: 'no-store' };
  }
}

// ---------------------------------------------------------------------------
// Category pages (mirrors CAT_META + JSON-LD ids used by category.html client JS)
// ---------------------------------------------------------------------------
const CAT_META = {
  piese: { title: 'Piese Auto', slug: 'piese-auto', metaDesc: 'Cumpără piese auto originale și aftermarket online cu livrare rapidă în România. Garanție 2 ani, retur 14 zile.', desc: 'Componente originale și aftermarket pentru întreținere și reparații auto' },
  accesorii: { title: 'Accesorii Auto', slug: 'accesorii', metaDesc: 'Accesorii auto: becuri, adaptoare, gadgeturi și produse utile pentru mașina ta. Livrare rapidă în toată România.', desc: 'Becuri, adaptoare, gadgeturi și accesorii utile pentru mașina ta' },
  detailing: { title: 'Detailing Auto', slug: 'detailing', metaDesc: 'Produse detailing auto: polish, ceară, șampoane și accesorii de curățare profesionale. Cosmetică auto premium online.', desc: 'Cosmetică auto profesională — polish, ceară, șampoane și accesorii de curățare' },
  baterii: { title: 'Baterii & Acumulatori Auto', slug: 'baterii', metaDesc: 'Baterii auto și acumulatori de calitate pentru orice marcă și model. Prețuri competitive, livrare rapidă în România.', desc: 'Baterii auto și moto pentru orice marcă și model — preț corect, livrare rapidă' },
  filtre: { title: 'Filtre Auto', slug: 'filtre', metaDesc: 'Filtre auto: ulei, aer, combustibil și habitaclu pentru orice marcă și model. Calitate garantată, livrare rapidă.', desc: 'Filtre ulei, aer, combustibil și habitaclu compatibile cu orice model de mașină' },
  prelate: { title: 'Prelate Auto', slug: 'prelate', metaDesc: 'Prelate auto impermeabile pentru protecție completă împotriva intemperiilor. Universale și pe model specific.', desc: 'Prelate impermeabile de exterior pentru protecție completă împotriva intemperiilor' },
  'huse-prelate': { title: 'Huse Exterior Auto', slug: 'huse-prelate', metaDesc: 'Huse și prelate auto dedicate pe marcă și model. Protecție precisă pentru mașina ta, livrare în România.', desc: 'Prelate și huse dedicate pe marcă și model pentru protecție precisă' },
};

function injectCategorySeo(html, catKey, items) {
  const meta = CAT_META[catKey] || CAT_META.piese;
  const cleanTitle = meta.title;
  const canonical = SITE + '/' + meta.slug;
  const pageTitle = `${cleanTitle} | Motoraș — Piese Auto București`;
  const ogTitle = `${cleanTitle} | Motoraș`;
  const desc = meta.metaDesc || `${cleanTitle} — Motoraș. Livrare rapidă în România.`;

  let out = html;
  out = replaceTag(out, /<title>[\s\S]*?<\/title>/, `<title>${esc(pageTitle)}</title>`);
  out = replaceTag(out, /<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${esc(desc)}"/>`);
  out = replaceTag(out, /<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${esc(canonical)}"/>`);
  out = replaceTag(out, /<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${esc(ogTitle)}"/>`);
  out = replaceTag(out, /<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${esc(desc)}"/>`);
  out = replaceTag(out, /<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${esc(canonical)}"/>`);
  out = replaceTag(out, /<meta\s+name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${esc(ogTitle)}"/>`);
  out = replaceTag(out, /<meta\s+name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${esc(desc)}"/>`);

  const collection = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': canonical + '#collection',
    url: canonical, name: ogTitle, description: desc, inLanguage: 'ro-RO',
    isPartOf: { '@type': 'WebSite', name: 'Motoraș', url: SITE + '/' },
    about: { '@type': 'Thing', name: cleanTitle },
    mainEntity: { '@id': canonical + '#itemlist' },
  };
  const itemlist = {
    '@context': 'https://schema.org', '@type': 'ItemList', '@id': canonical + '#itemlist',
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    numberOfItems: items.length,
    itemListElement: items.map((p, i) => ({
      '@type': 'ListItem', position: i + 1,
      url: SITE + '/product.html?id=' + encodeURIComponent(String(p.id || '')),
      name: normalizeText(p.name),
    })),
  };
  const breadcrumb = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Acasă', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: cleanTitle, item: canonical },
    ],
  };

  const ld = `<script type="application/ld+json" id="jsonld-category-collection">${JSON.stringify(collection)}</script>`
    + `<script type="application/ld+json" id="jsonld-category-itemlist">${JSON.stringify(itemlist)}</script>`
    + `<script type="application/ld+json" id="jsonld-breadcrumb">${JSON.stringify(breadcrumb)}</script>\n</head>`;
  return out.replace('</head>', ld);
}

// Returns { html, cacheControl } for a category page request.
async function renderCategoryPage(query = {}) {
  const catKey = (query.cat || 'piese').toString();
  const template = loadTemplate('category.html');
  if (!template) return { html: '<!doctype html><html lang="ro"><head><meta charset="utf-8"/><title>Catalog | Motoraș</title><meta name="robots" content="noindex"/></head><body><a href="/piese-auto">Catalog</a></body></html>', cacheControl: 'no-store' };

  let items = [];
  try {
    const result = await queryProducts({ cat: catKey, limit: 24 });
    if (result && Array.isArray(result.items)) items = result.items;
  } catch (_) { /* schema itemlist will just be empty */ }

  return {
    html: injectCategorySeo(template, catKey, items),
    cacheControl: 'public, s-maxage=900, stale-while-revalidate=86400',
  };
}

module.exports = {
  renderProductPage,
  renderCategoryPage,
  injectSeo,
  injectCategorySeo,
  buildProductSchema,
  buildTitle,
  buildDescription,
  productImages,
  CAT_META,
};
