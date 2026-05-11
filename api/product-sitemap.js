const { readCatalog } = require('../lib/api/products');

function xmlEscape(value = '') {
 return String(value)
 .replace(/&/g, '&amp;')
 .replace(/</g, '&lt;')
 .replace(/>/g, '&gt;')
 .replace(/"/g, '&quot;')
 .replace(/'/g, '&apos;');
}

module.exports = async function handler(req, res) {
 if (req.method !== 'GET') {
 res.statusCode = 405;
 res.setHeader('Allow', 'GET');
 res.setHeader('Content-Type', 'application/xml; charset=utf-8');
 res.end('<?xml version="1.0" encoding="UTF-8"?><error>Method not allowed</error>');
 return;
 }

 try {
 const today = new Date().toISOString().split('T')[0];
 const items = readCatalog()
 .filter(item => item && item.id && item.name)
 .slice(0, 45000);

 const body = items.map((item) => {
 const loc = `https://www.pieseautomotoras.ro/product.html?id=${encodeURIComponent(String(item.id))}`;
 const priority = Number(item.stock || 0) > 0 ? '0.80' : '0.60';
 return [
 '<url>',
 `<loc>${xmlEscape(loc)}</loc>`,
 `<lastmod>${today}</lastmod>`,
 '<changefreq>daily</changefreq>',
 `<priority>${priority}</priority>`,
 '</url>',
 ].join('');
 }).join('');

 res.statusCode = 200;
 res.setHeader('Content-Type', 'application/xml; charset=utf-8');
 res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
 res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`);
 } catch (error) {
 res.statusCode = 500;
 res.setHeader('Content-Type', 'application/xml; charset=utf-8');
 res.end(`<?xml version="1.0" encoding="UTF-8"?><error>${xmlEscape(error.message || 'Sitemap generation failed')}</error>`);
 }
};
