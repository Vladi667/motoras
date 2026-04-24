const { readPublicCatalog } = require('../lib/api/catalog/gateway');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end('Method Not Allowed');
    return;
  }

  try {
    const catalog = await readPublicCatalog();
    const base = process.env.SITE_URL || 'https://www.pieseautomotoras.ro';
    const entries = catalog.map(item => `  <url>
    <loc>${base}/product.html?id=${encodeURIComponent(item.id)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(xml);
  } catch (error) {
    res.statusCode = 500;
    res.end('Sitemap generation failed.');
  }
};
