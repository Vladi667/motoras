// Fails npm test if any HTML page has a render-blocking external script
// whose name is in DEFERRED_SET. Inline-script analysis was removed in
// Phase 6 — the prior wrap-based detection became obsolete once the
// phase4-defer-gate wraps were removed entirely. References to deferred
// globals inside function bodies (the common case: click handlers) are
// always safe because the handler runs at user-click time, well after
// defer scripts have loaded.
//
// The single remaining invariant: external scripts that the rest of the
// codebase assumes are deferred MUST carry defer (or async).

const fs = require('fs');
const path = require('path');

const DEFERRED_SET = new Set([
  'api.js',
  'cart.js',
  'favorites.js',
  'nav-subcategories.js',
  'vehicle-selector-data.js',
]);

function listHtmlFiles() {
  return fs.readdirSync(process.cwd())
    .filter(f => f.endsWith('.html'))
    .filter(f => !f.startsWith('_'))
    .sort();
}

function findExternalScripts(html) {
  const out = [];
  const re = /<script\b([^>]*?)>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    const srcMatch = attrs.match(/src\s*=\s*["']([^"']+)["']/);
    if (!srcMatch) continue;
    out.push({ src: srcMatch[1], attrs });
  }
  return out;
}

function basenameOf(src) {
  const noQuery = String(src || '').split('?')[0];
  return noQuery.split('/').filter(Boolean).pop() || '';
}

const failures = [];

for (const file of listHtmlFiles()) {
  const html = fs.readFileSync(file, 'utf8');
  for (const ext of findExternalScripts(html)) {
    const name = basenameOf(ext.src);
    if (!DEFERRED_SET.has(name)) continue;
    if (/\b(defer|async)\b/.test(ext.attrs)) continue;
    failures.push({
      file,
      kind: 'render-blocking external script',
      detail: `<script src="${ext.src}"> needs defer`,
    });
  }
}

if (failures.length) {
  console.error(`scan-undeferred: FAIL (${failures.length} issue${failures.length === 1 ? '' : 's'})`);
  for (const f of failures) {
    console.error(`  ${f.file}  ${f.kind}`);
    if (f.detail) console.error(`    ${f.detail}`);
  }
  process.exit(1);
}

console.log('script defer health: PASS');
