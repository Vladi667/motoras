// Fails the build if catalog files contain known mojibake/quote artifacts.
// Wired into `npm test` so Task A's cleanup stays clean forever.
const fs = require('fs');

const PATTERNS = [
  ['smart apostrophe (’)',          /[‘’‚‛]/g],
  ['smart quote (“ ”)',             /[“”„‟]/g],
  ['prime / double prime',          /[′″]/g],
  ['en-dash / em-dash',             /[–—]/g],
  ['double-encoded â€... sequence', /â€[-￿]/g],
  ['Ã x mojibake',                  /Ã[-￿]/g],
  ['Ä x mojibake',                  /Ä[-￿]/g],
  ['È x mojibake',                  /È[-￿]/g],
  ['UTF-8 BOM at start',            /^﻿/],
  ['non-breaking space (U+00A0)',   / /g],
];

const FILES = ['catalog.json', 'catalog-lite.json', 'catalog-micro.json'];

let failed = false;
for (const file of FILES) {
  if (!fs.existsSync(file)) continue;
  const raw = fs.readFileSync(file, 'utf8');
  const hits = [];
  for (const [label, re] of PATTERNS) {
    const m = raw.match(re);
    if (m && m.length) hits.push(`${label}: ${m.length}`);
  }
  if (hits.length) {
    failed = true;
    console.error(`FAIL ${file}`);
    for (const h of hits) console.error(`  ${h}`);
  } else {
    console.log(`OK   ${file} (clean)`);
  }
}

if (failed) process.exit(1);
console.log('catalog text health: PASS');
