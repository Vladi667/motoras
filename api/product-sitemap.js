const { readPublicCatalog } = require('../lib/api/catalog/gateway');

const SITE = 'https://www.pieseautomotoras.ro';
const DEFAULT_IMG = SITE + '/assets/og-default.png';

function xmlEscape(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function productUrl(id) {
  return `${SITE}/product.html?id=${encodeURIComponent(String(id))}`;
}

function imageUrl(item) {
  const candidates = [].concat(Array.isArray(item.images) ? item.images : [], item.img || []);
  for (const c of candidates) {
    const s = String(c || '').trim();
    if (s && !/^data:/i.test(s) && !/product-placeholder/i.test(s)) {
      return /^https?:\/\//i.test(s) ? s : `${SITE}/${s.replace(/^\/+/, '')}`;
    }
  }
  return DEFAULT_IMG;
}

// Standard XML sitemap of product URLs.
// lastmod is intentionally omitted (the catalog carries no reliable per-item
// modification date — emitting today's date daily trains Google to ignore it).
function buildSitemap(items) {
  const body = items.map((item) => {
    const priority = Number(item.stock || 0) > 0 ? '0.80' : '0.60';
    return [
      '<url>',
      `<loc>${xmlEscape(productUrl(item.id))}</loc>`,
      '<changefreq>weekly</changefreq>',
      `<priority>${priority}</priority>`,
      '</url>',
    ].join('');
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

// Google Merchant Center RSS 2.0 product feed (free Shopping listings).
function buildMerchantFeed(items) {
  const entries = items.map((item) => {
    const price = `${Number(item.price || 0).toFixed(2)} RON`;
    const availability = Number(item.stock || 0) > 0 ? 'in_stock' : 'out_of_stock';
    const brand = String(item.brand || '').trim();
    const mpn = String(item.sku || item.id || '').trim();
    const desc = String(item.desc || item.compat || item.name || '').trim() || item.name;
    const fields = [
      `<g:id>${xmlEscape(item.id)}</g:id>`,
      `<g:title>${xmlEscape(item.name)}</g:title>`,
      `<g:description>${xmlEscape(desc)}</g:description>`,
      `<g:link>${xmlEscape(productUrl(item.id))}</g:link>`,
      `<g:image_link>${xmlEscape(imageUrl(item))}</g:image_link>`,
      `<g:availability>${availability}</g:availability>`,
      `<g:price>${xmlEscape(price)}</g:price>`,
      `<g:condition>new</g:condition>`,
      `<g:google_product_category>Vehicles &amp; Parts &gt; Vehicle Parts &amp; Accessories</g:google_product_category>`,
    ];
    if (brand) fields.push(`<g:brand>${xmlEscape(brand)}</g:brand>`);
    if (mpn) fields.push(`<g:mpn>${xmlEscape(mpn)}</g:mpn>`);
    // No GTIN; Google accepts brand+mpn. If brand missing, declare no identifiers.
    if (!brand) fields.push(`<g:identifier_exists>no</g:identifier_exists>`);
    return `<item>${fields.join('')}</item>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>`
    + `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>`
    + `<title>Motoraș - Piese Auto &amp; Detailing</title>`
    + `<link>${SITE}/</link>`
    + `<description>Catalog produse Motoraș - piese auto și detailing</description>`
    + entries
    + `</channel></rss>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.end('<?xml version="1.0" encoding="UTF-8"?><error>Method not allowed</error>');
    return;
  }

  const isMerchant = String((req.query && req.query.type) || '') === 'merchant';

  try {
    let items = (await readPublicCatalog()).filter(item => item && item.id && item.name);
    if (isMerchant) items = items.filter(item => Number(item.price) > 0);
    items = items.slice(0, 45000);

    const xml = isMerchant ? buildMerchantFeed(items) : buildSitemap(items);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.end(xml);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.end(`<?xml version="1.0" encoding="UTF-8"?><error>${xmlEscape(error.message || 'Feed generation failed')}</error>`);
  }
};
