const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = process.cwd();
const files = ['index.html', 'category.html', 'product.html', 'search.html', 'api.js'];
const forbiddenHtml = /catalog-micro|catalog-lite|catalog\.json|supplier-feed\.xml|supplier-feed-globiz/;

let failed = false;

for (const file of files) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) continue;
  const text = fs.readFileSync(full, 'utf8');
  if (file.endsWith('.html') && forbiddenHtml.test(text)) {
    console.error(`FAIL ${file}: forbidden catalog/feed reference`);
    failed = true;
  }
  const raw = Buffer.from(text);
  const gzip = zlib.gzipSync(raw);
  console.log(`${file}: ${(raw.length / 1024).toFixed(1)} KB raw, ${(gzip.length / 1024).toFixed(1)} KB gzip`);
}

if (failed) process.exit(1);
