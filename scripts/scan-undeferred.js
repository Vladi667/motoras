// Fails npm test if any HTML page has a render-blocking external script
// whose name is in DEFERRED_SET, or if any inline <script> body uses a
// global owned by a deferred file outside a DOM-ready context.
//
// This is the safety gate for Phase 4 (defer-non-critical-scripts).
// Once Task C lands, this scanner must always PASS or the build breaks.

const fs = require('fs');
const path = require('path');

// External scripts that must be deferred. Names without query strings.
const DEFERRED_SET = new Set([
  'api.js',
  'cart.js',
  'favorites.js',
  'nav-subcategories.js',
  'vehicle-selector-data.js',
]);

// Globals owned by the deferred files. Any inline script body referencing
// these outside a DOM-ready gate is unsafe after the defer change.
//
// For unique identifiers (MotApi, MotApiSearch, toggleProductHidden,
// MotorasVehicleData) we match the bare identifier — they don't collide
// with local variables. For "cart" and "favorites" we require the
// window-prefix form so we don't false-positive on local state.cart etc.
const DEFERRED_GLOBALS = [
  'MotApi',
  'MotApiSearch',
  'toggleProductHidden',
  'MotorasVehicleData',
];
const WINDOW_PREFIXED_GLOBALS = [
  'window\\.cart\\b',
  'window\\.favorites\\b',
];

function listHtmlFiles() {
  return fs.readdirSync(process.cwd())
    .filter(f => f.endsWith('.html'))
    .filter(f => !f.startsWith('_'))
    .sort();
}

// Locate inline <script> blocks with their start byte offsets. Returns
// { tag, attrs, body, start, end }.
function findInlineScripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    const body = m[2] || '';
    if (/\bsrc\s*=/.test(attrs)) continue; // external script, not inline
    if (/type\s*=\s*["'](?:application\/(?:ld\+json|json)|importmap)["']/i.test(attrs)) continue;
    out.push({ attrs, body, start: m.index, end: re.lastIndex });
  }
  return out;
}

// Locate external <script src="..."> tags. Returns { src, attrs }.
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

function lineForOffset(html, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < html.length; i++) {
    if (html.charCodeAt(i) === 10) line++;
  }
  return line;
}

// A body is considered "DOM-ready gated" if EVERY reference to a deferred
// global is reached only after one of these patterns runs:
//  - DOMContentLoaded listener
//  - readyState check for 'complete'/'interactive'
//  - window 'load' listener
//
// We approximate this by requiring at least one of those tokens to appear
// in the body BEFORE the first deferred-global reference. Conservative:
// false-positive (refuses safe code) is OK; false-negative (lets broken
// code through) is not.
function isBodyGated(body) {
  if (!body || !body.trim()) return true;

  // Phase 4 wrapper marker: if present, the block has been verifiably wrapped
  // in a readyState-aware gate by scripts/_phase4-wrap.js. The gate text
  // appears AFTER the wrapped body in source order so the linear scan below
  // would false-positive on it; this marker is the explicit opt-in.
  if (body.includes('/* phase4-defer-gate */')) return true;

  const gateRe = /\b(?:DOMContentLoaded|document\.readyState\s*===\s*["'](?:complete|interactive|loading)["']|window\.addEventListener\s*\(\s*["']load["']|window\.onload\s*=)/;
  const gateMatch = body.match(gateRe);

  // Find first reference to any deferred global
  let firstRefIdx = -1;
  const allPatterns = [
    ...DEFERRED_GLOBALS.map(g => `\\b${g}\\b`),
    ...WINDOW_PREFIXED_GLOBALS,
  ];
  for (const pat of allPatterns) {
    const re = new RegExp(pat, 'g');
    let m;
    while ((m = re.exec(body)) !== null) {
      if (firstRefIdx === -1 || m.index < firstRefIdx) firstRefIdx = m.index;
    }
  }

  if (firstRefIdx === -1) return true; // no reference -> no risk

  // If there's no gate at all but there are references, it's unsafe.
  if (!gateMatch) return false;

  const gateIdx = gateMatch.index;

  // If the gate appears AFTER the first reference at top level, it doesn't
  // protect that reference. Heuristic: gate must appear before first ref.
  if (gateIdx < firstRefIdx) return true;

  // Otherwise unsafe.
  return false;
}

function preview(body) {
  return body.replace(/\s+/g, ' ').trim().slice(0, 100);
}

const failures = [];

for (const file of listHtmlFiles()) {
  const html = fs.readFileSync(file, 'utf8');

  // (1) External-script defer check
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

  // (2) Inline-script DOM-ready gate check
  const refPatterns = [
    ...DEFERRED_GLOBALS.map(g => `\\b${g}\\b`),
    ...WINDOW_PREFIXED_GLOBALS,
  ];
  for (const inl of findInlineScripts(html)) {
    // (2a) Trapped-listener check: inside a phase4-defer-gate wrap, no inner
    // document.addEventListener('DOMContentLoaded', ...) is allowed — the
    // outer wrap fires AT DOMContentLoaded time, so the inner listener
    // attaches to an event that already fired and never runs.
    if (inl.body.includes('/* phase4-defer-gate */')) {
      const wrapStart = inl.body.indexOf('var __run = function () {');
      const wrapEnd = inl.body.indexOf('}; if (document.readyState');
      if (wrapStart !== -1 && wrapEnd !== -1) {
        const wrapInner = inl.body.slice(wrapStart, wrapEnd);
        const innerListeners = wrapInner.match(/document\.addEventListener\s*\(\s*['"]DOMContentLoaded['"]/g);
        if (innerListeners && innerListeners.length) {
          const line = lineForOffset(html, inl.start);
          failures.push({
            file,
            kind: 'phase4-defer-gate block has nested document.addEventListener("DOMContentLoaded", ...) that will never fire',
            line,
            preview: `${innerListeners.length} trapped listener(s) — replace with direct invocation`,
          });
        }
      }
    }

    if (!isBodyGated(inl.body)) {
      const hasRef = refPatterns.some(p => new RegExp(p).test(inl.body));
      if (!hasRef) continue;
      const line = lineForOffset(html, inl.start);
      failures.push({
        file,
        kind: 'inline script uses deferred global without DOM-ready gate',
        line,
        preview: preview(inl.body),
      });
    }
  }
}

if (failures.length) {
  console.error(`scan-undeferred: FAIL (${failures.length} issue${failures.length === 1 ? '' : 's'})`);
  for (const f of failures) {
    console.error(`  ${f.file}${f.line ? ':' + f.line : ''}  ${f.kind}`);
    if (f.detail) console.error(`    ${f.detail}`);
    if (f.preview) console.error(`    preview: ${f.preview}`);
  }
  process.exit(1);
}

console.log('script defer health: PASS');
