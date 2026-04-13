#!/usr/bin/env node
/**
 * Comprehensive mojibake fixer for motoras.ro
 * Fixes UTF-8 bytes misread as Windows-1252 characters across all HTML files.
 */
const fs = require('fs');
const path = require('path');

// Ordered from most specific/longest to shortest to avoid partial replacements
const REPLACEMENTS = [
  // 3+ char sequences first
  ['RomÃ¢nia', 'România'],
  ['BucureÈ™ti', 'București'],
  ['MotoraÈ™', 'Motoraș'],
  ['GRATUITÄ‚', 'GRATUITĂ'],
  ['FINALIZEAZÄ‚', 'FINALIZEAZĂ'],
  ['AdaugÄƒ', 'Adaugă'],
  ['AdÄƒugat', 'Adăugat'],
  ['FinalizeazÄƒ', 'Finalizează'],
  ['FinalizatÄƒ', 'Finalizată'],
  ['CautÄƒ', 'Caută'],
  ['cÄƒutare', 'căutare'],
  ['CÄƒutare', 'Căutare'],
  ['FÄƒrÄƒ', 'Fără'],
  ['fÄƒrÄƒ', 'fără'],
  ['GÄƒseÈ™ti', 'Găsești'],
  ['gÄƒsit', 'găsit'],
  ['gÄƒsite', 'găsite'],
  ['GÄƒsit', 'Găsit'],
  ['dupÄƒ', 'după'],
  ['DupÄƒ', 'După'],
  ['marcÄƒ', 'marcă'],
  ['MarcÄƒ', 'Marcă'],
  ['rapidÄƒ', 'rapidă'],
  ['RapidÄƒ', 'Rapidă'],
  ['toatÄƒ', 'toată'],
  ['realÄƒ', 'reală'],
  ['completÄƒ', 'completă'],
  ['GratuitÄƒ', 'Gratuită'],
  ['gratuitÄƒ', 'gratuită'],
  ['comandÄƒ', 'comandă'],
  ['ComandÄƒ', 'Comandă'],
  ['PLASEAZÄ‚', 'PLASEAZĂ'],
  ['platÄƒ', 'plată'],
  ['PlatÄƒ', 'Plată'],
  ['livrare rapidÄƒ', 'livrare rapidă'],
  ['Livrare rapidÄƒ', 'Livrare rapidă'],
  ['metodÄƒ', 'metodă'],
  ['MetodÄƒ', 'Metodă'],
  ['adresÄƒ', 'adresă'],
  ['AdresÄƒ', 'Adresă'],
  ['paginÄƒ', 'pagină'],
  ['PaginÄƒ', 'Pagină'],
  ['lucrÄƒtoare', 'lucrătoare'],
  ['LucrÄƒtoare', 'Lucrătoare'],
  ['confirmatÄƒ', 'confirmată'],
  ['ConfirmatÄƒ', 'Confirmată'],
  ['statusul plÄƒÈ›ii', 'statusul plății'],
  ['plÄƒÈ›ii', 'plății'],
  ['PlÄƒÈ›ii', 'Plății'],
  ['plÄƒtit', 'plătit'],
  ['PlÄƒtit', 'Plătit'],
  ['neplatit', 'neplătit'],
  ['InformaÈ›ii', 'Informații'],
  ['informaÈ›ii', 'informații'],
  ['InformaÈ›ie', 'Informație'],
  ['informaÈ›ie', 'informație'],
  ['referinÈ›Äƒ', 'referință'],
  ['ReferinÈ›Äƒ', 'Referință'],
  ['livrÄƒtoare', 'livrătoare'],
  ['estimatÄƒ', 'estimată'],
  ['ExpediatÄƒ', 'Expediată'],
  ['expediatÄƒ', 'expediată'],
  ['ComandÄƒ confirmatÄƒ', 'Comandă confirmată'],
  ['Fluxul de comandÄƒ', 'Fluxul de comandă'],
  ['Ã®nregistrat', 'înregistrat'],
  ['Ã®ncepe', 'începe'],
  ['Ã®ncearcÄƒ', 'încearcă'],
  ['ÃŽncearcÄƒ', 'Încearcă'],
  ['ÃŽn stoc', 'În stoc'],
  ['Ã®n stoc', 'în stoc'],
  ['Ã®n coÈ™', 'în coș'],
  ['Ã®n cos', 'în coș'],
  ['ÃŽn coÈ™', 'În coș'],
  ['ÃŽnapoi', 'Înapoi'],
  ['Ã®napoi', 'înapoi'],
  ['CoÈ™ul meu', 'Coșul meu'],
  ['CoÈ™ul este gol', 'Coșul este gol'],
  ['coÈ™ul', 'coșul'],
  ['CoÈ™', 'Coș'],
  ['coÈ™', 'coș'],
  ['Le poÈ›i', 'Le poți'],
  ['poÈ›i', 'poți'],
  ['PoÈ›i', 'Poți'],
  ['VEZI FAVORITELE ÃŽN COÈ˜', 'VEZI FAVORITELE ÎN COȘ'],
  ['VIZUALIZARE RAPIDÄ‚', 'VIZUALIZARE RAPIDĂ'],
  ['Vizualizare rapidÄƒ', 'Vizualizare rapidă'],
  ['vizualizare rapidÄƒ', 'vizualizare rapidă'],
  ['SalveazÄƒ', 'Salvează'],
  ['salveazÄƒ', 'salvează'],
  ['regÄƒsi', 'regăsi'],
  ['regÄƒseÈ™ti', 'regăsești'],
  ['AdaugÄƒ rapid Ã®n coÈ™', 'Adaugă rapid în coș'],
  ['AdaugÄƒ Ã®n coÈ™', 'Adaugă în coș'],
  ['AdÄƒugat Ã®n coÈ™', 'Adăugat în coș'],
  ['AdÄƒugat la favorite', 'Adăugat la favorite'],
  ['Detalii rapide', 'Detalii rapide'],
  ['Pagina anterioarÄƒ', 'Pagina anterioară'],
  ['anterioarÄƒ', 'anterioară'],
  ['urmÄƒtoare', 'următoare'],
  ['UrmÄƒtoare', 'Următoare'],
  ['Niciun produs gÄƒsit', 'Niciun produs găsit'],
  ['filtrele selectate', 'filtrele selectate'],
  ['ReseteazÄƒ filtrele', 'Resetează filtrele'],
  ['ReseteazÄƒ', 'Resetează'],
  ['AplicÄƒ filtrul', 'Aplică filtrul'],
  ['AplicÄƒ', 'Aplică'],
  ['AcasÄƒ', 'Acasă'],
  ['acasÄƒ', 'acasă'],
  ['Continua', 'Continuă'],
  ['ContinuÄƒ cumpÄƒrÄƒturile', 'Continuă cumpărăturile'],
  ['ContinuÄƒ', 'Continuă'],
  ['cumpÄƒrÄƒturile', 'cumpărăturile'],
  ['CumpÄƒrÄƒturi', 'Cumpărături'],
  ['cumpÄƒrÄƒturi', 'cumpărături'],
  ['Strada Agricultori Nr. 2, BucureÈ™ti', 'Strada Agricultori Nr. 2, București'],
  ['Str. Agricultori nr. 2, BucureÈ™ti', 'Str. Agricultori nr. 2, București'],
  ['Piese originale È™i aftermarket', 'Piese originale și aftermarket'],
  ['piese auto originale È™i aftermarket', 'piese auto originale și aftermarket'],
  ['Piese auto originale È™i aftermarket', 'Piese auto originale și aftermarket'],
  ['originale È™i aftermarket', 'originale și aftermarket'],
  ['preÈ›uri', 'prețuri'],
  ['PreÈ›uri', 'Prețuri'],
  ['preÈ›', 'preț'],
  ['PreÈ›', 'Preț'],
  ['Termeni È™i condiÈ›ii', 'Termeni și condiții'],
  ['termeni È™i condiÈ›ii', 'termeni și condiții'],
  ['condiÈ›ii', 'condiții'],
  ['CondiÈ›ii', 'Condiții'],
  ['ConfidenÈ›ialitate', 'Confidențialitate'],
  ['confidenÈ›ialitate', 'confidențialitate'],
  ['livrare rapidÄƒ Ã®n toatÄƒ RomÃ¢nia', 'livrare rapidă în toată România'],
  ['Livrare rapidÄƒ Ã®n toatÄƒ RomÃ¢nia', 'Livrare rapidă în toată România'],
  ['Ã®ntreÈ›inere', 'întreținere'],
  ['soluÈ›ii', 'soluții'],
  ['SoluÈ›ii', 'Soluții'],
  ['Cosmetica auto', 'Cosmetică auto'],
  ['cosmeticÄƒ', 'cosmetică'],
  ['CosmeticÄƒ', 'Cosmetică'],
  ['impermeabile', 'impermeabile'],
  ['protecÈ›ie', 'protecție'],
  ['ProtecÈ›ie', 'Protecție'],
  ['FinalizeazÄƒ comanda', 'Finalizează comanda'],
  ['FINALIZEAZÄ‚ COMANDA', 'FINALIZEAZĂ COMANDA'],
  ['Doar ', 'Doar '],
  ['rÄƒmase', 'rămase'],
  ['RÄƒmase', 'Rămase'],
  ['La comandÄƒ', 'La comandă'],
  ['la comandÄƒ', 'la comandă'],
  ['recenzii', 'recenzii'],
  ['FÄƒrÄƒ recenzii', 'Fără recenzii'],
  ['fÄƒrÄƒ recenzii', 'fără recenzii'],
  ['EvalueazÄƒ', 'Evaluează'],
  ['evaluarea', 'evaluarea'],
  ['adÄƒugat', 'adăugat'],
  ['EconomiÈ™ti', 'Economisești'],
  ['EconomiÈ›i', 'Economisiți'],
  ['EconomiÈ™ezi', 'Economisezi'],
  ['EconomiÈ™e', 'Economise'],
  ['EconomiÈ˜ti', 'Economisești'],
  ['Economise', 'Economisești'],
  // 2-char basic Romanian
  ['È™i', 'și'],
  ['È™', 'ș'],
  ['È›', 'ț'],
  ['Äƒ', 'ă'],
  ['Ã¢', 'â'],
  ['Ã®', 'î'],
  ['ÃŽ', 'Î'],
  ['È˜', 'Ș'],
  ['Èš', 'Ț'],
  ['Ä‚', 'Ă'],
  // Punctuation
  ['â€™', '\u2019'],  // right single quote '
  ['â€¢', '\u2022'],  // bullet •
  ['â€º', '\u203A'],  // ›
  ['â€"', '\u2013'],  // en dash –
  ['â€"', '\u2014'],  // em dash —
  ['â€œ', '\u201C'],  // "
  // Emoji mojibake - identify and fix common ones
  ['ðŸ"\'', '🔒'],   // lock emoji in page-banner-kicker
  ['âš–ï¸', '⚖️'],   // scales emoji
  ['ðŸš—', '🚗'],
  ['ðŸ"§', '🔧'],
  ['ðŸ›\'', '🛒'],
  ['â­', '⭐'],
  ['ðŸ"', '📋'],
  // Common words that may have survived partial fixes
  ['Motora\u00c8\u2122', 'Motoraș'],  // just in case
];

const FILES = [
  'index.html',
  'category.html',
  'search.html',
  'product.html',
  'checkout.html',
  'confirmation.html',
  'contact.html',
  'despre.html',
  'faq.html',
  'livrare.html',
  'retururi.html',
  'termeni.html',
  'confidentialitate.html',
  'cookies.html',
  '404.html',
  'admin.html',
  'account.html',
];

const dir = __dirname;
let totalFixed = 0;

for (const file of FILES) {
  const filePath = path.join(dir, file);
  if (!fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  let fileFixed = 0;

  for (const [broken, correct] of REPLACEMENTS) {
    let count = 0;
    const next = content.split(broken).join(correct);
    if (next !== content) {
      // Count occurrences
      count = (content.match(new RegExp(broken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      content = next;
      fileFixed += count;
    }
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ ${file}: fixed ${fileFixed} instances`);
    totalFixed += fileFixed;
  } else {
    console.log(`  ${file}: no changes needed`);
  }
}

console.log(`\nTotal: ${totalFixed} mojibake instances fixed`);
