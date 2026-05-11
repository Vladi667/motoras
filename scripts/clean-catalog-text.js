// Idempotent one-shot rewriter for catalog files.
// Normalizes smart quotes/apostrophes, en/em dashes, primes, double-encoded
// mojibake sequences, and the UTF-8 BOM at file start. Preserves Romanian
// diacritics (ă â î ș ț + uppercase) untouched.
//
// Run:   node scripts/clean-catalog-text.js
// Files: catalog.json, catalog-lite.json, catalog-micro.json

const fs = require('fs');
const path = require('path');

const REPLACEMENTS = [
  [/[‘’‚‛]/g, "'"],
  [/[“”„‟]/g, '"'],
  [/′/g, "'"],
  [/″/g, '"'],
  [/–/g, '-'],
  [/—/g, '-'],
  [/â€™/g, "'"],
  [/â€˜/g, "'"],
  [/â€“/g, '-'],
  [/â€”/g, '-'],
  [/â€³/g, '"'],   // â€³ → "  (UTF-8 of ″ misread as CP-1252)
  [/â€½/g, '"'],   // â€½ → "  variant
  [/ /g, ' '],
];

function cleanString(s) {
  if (typeof s !== 'string') return s;
  let out = s;
  for (const [re, rep] of REPLACEMENTS) out = out.replace(re, rep);
  return out;
}

function cleanValue(v) {
  if (typeof v === 'string') return cleanString(v);
  if (Array.isArray(v)) return v.map(cleanValue);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = cleanValue(v[k]);
    return o;
  }
  return v;
}

function readJson(file) {
  let raw = fs.readFileSync(file, 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  return JSON.parse(raw);
}

function atomicWrite(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, { encoding: 'utf8' });
  fs.renameSync(tmp, file);
}

function processFile(file) {
  const before = fs.readFileSync(file, 'utf8');
  const data = readJson(file);
  const cleaned = cleanValue(data);
  const after = JSON.stringify(cleaned) + '\n';
  atomicWrite(file, after);

  const beforeBytes = Buffer.byteLength(before, 'utf8');
  const afterBytes = Buffer.byteLength(after, 'utf8');
  const hadBom = before.charCodeAt(0) === 0xFEFF;
  console.log(
    `${file.padEnd(22)} entries=${Array.isArray(cleaned) ? cleaned.length : '?'}` +
    `  ${beforeBytes} → ${afterBytes} bytes` +
    `  ${hadBom ? '(BOM removed)' : ''}`
  );
}

const files = ['catalog.json', 'catalog-lite.json', 'catalog-micro.json'];
for (const f of files) {
  if (fs.existsSync(path.join(process.cwd(), f))) processFile(f);
  else console.warn(`skipping ${f}: not found`);
}
