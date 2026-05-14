// Tiny dev server that serves the motoras site root and proxies
// /api/products to the real gateway. Loads modules by absolute path so
// it works regardless of cwd.
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve('C:/Users/Admin/Desktop/site');
const productHandler = require(path.join(ROOT, 'api', 'products', 'index.js'));

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.xml': 'application/xml; charset=utf-8',
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.statusCode = 200;
  res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
}

function notFound(res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Not found');
}

const REWRITES = {
  '/piese-auto': '/category.html?cat=piese',
  '/detailing': '/category.html?cat=detailing',
  '/baterii': '/category.html?cat=baterii',
  '/filtre': '/category.html?cat=filtre',
  '/prelate': '/category.html?cat=prelate',
  '/huse-prelate': '/category.html?cat=huse-prelate',
  '/accesorii': '/category.html?cat=accesorii',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  let pathname = url.pathname;
  // SEO rewrites
  if (REWRITES[pathname]) {
    const rewrite = REWRITES[pathname];
    const [target, qs] = rewrite.split('?');
    pathname = target;
    if (qs) {
      for (const [k, v] of new URLSearchParams(qs)) url.searchParams.set(k, v);
    }
  }
  if (pathname === '/api/products') {
    const query = {};
    url.searchParams.forEach((v, k) => { query[k] = v; });
    return productHandler({ method: req.method, query }, res);
  }
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.resolve(ROOT, '.' + pathname);
  if (!filePath.startsWith(ROOT)) return notFound(res);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return notFound(res);
  return sendFile(res, filePath);
});

const port = 4173;
server.listen(port, '127.0.0.1', () => {
  console.log(`motoras dev server on http://127.0.0.1:${port}`);
});
