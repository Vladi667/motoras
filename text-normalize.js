(function () {
 const ATTRIBUTES = ['placeholder', 'aria-label', 'title', 'alt', 'value', 'content', 'data-label'];
 const MOJIBAKE_PATTERN = /(?:Ã.|Ä.|È.|Â.|â€|â€“|â€”|â„|â€¢|Â·|Â )/;
 const BYTE_MAP = new Map([
 [0x20AC, 0x80],
 [0x201A, 0x82],
 [0x0192, 0x83],
 [0x201E, 0x84],
 [0x2026, 0x85],
 [0x2020, 0x86],
 [0x2021, 0x87],
 [0x02C6, 0x88],
 [0x2030, 0x89],
 [0x0160, 0x8A],
 [0x2039, 0x8B],
 [0x0152, 0x8C],
 [0x017D, 0x8E],
 [0x2018, 0x91],
 [0x2019, 0x92],
 [0x201C, 0x93],
 [0x201D, 0x94],
 [0x2022, 0x95],
 [0x2013, 0x96],
 [0x2014, 0x97],
 [0x02DC, 0x98],
 [0x2122, 0x99],
 [0x0161, 0x9A],
 [0x203A, 0x9B],
 [0x0153, 0x9C],
 [0x017E, 0x9E],
 [0x0178, 0x9F],
 ]);

 const DIRECT_REPLACEMENTS = [
 ['Â·', '·'],
 [' Â· ', ' · '],
 ['Â ', ' '],
 ['Â', ''],
 ['â€“', '–'],
 ['â€”', '—'],
 ['â€ž', '„'],
 ['â€œ', '“'],
 ['â€', '”'],
 ['â€˜', '‘'],
 ['â€™', '’'],
 ['â€¢', '•'],
 ['â€¦', '…'],
 ['Ã—', '×'],
 ['Ã®', 'î'],
 ['ÃŽ', 'Î'],
 ['Ã¢', 'â'],
 ['Ã‚', 'Â'],
 ['Äƒ', 'ă'],
 ['Ä‚', 'Ă'],
 ['È™', 'ș'],
 ['È˜', 'Ș'],
 ['È›', 'ț'],
 ['Èš', 'Ț'],
 ['MotoraÈ™', 'Motoraș'],
 ['MotoraÈ›', 'Motoraț'],
 ['BucureÈ™ti', 'București'],
 ['AdaugÄƒ', 'Adaugă'],
 ['AdÄƒugat', 'Adăugat'],
 ['FÄƒrÄƒ', 'Fără'],
 ['GÄƒseÈ™ti', 'Găsești'],
 ['cÄƒutare', 'căutare'],
 ['dupÄƒ', 'după'],
 ['marcÄƒ', 'marcă'],
 ['rÄƒmase', 'rămase'],
 ['PregÄƒtit', 'Pregătit'],
 ['NumÄƒr', 'Număr'],
 ['InformaÈ›ii', 'Informații'],
 ['În coÈ™', 'În coș'],
 ['în coÈ™', 'în coș'],
 ['Ã®n coÈ™', 'în coș'],
 ['ÃŽn stoc', 'În stoc'],
 ['Doar esenÈ›iale', 'Doar esențiale'],
 ['ConfidenÈ›ialitate', 'Confidențialitate'],
 ['Termeni È™i condiÈ›ii', 'Termeni și condiții'],
 ['Ridicare personala Â· ', 'Ridicare personală · '],
 [' Â· Strada ', ' · Strada '],
 ['Livrare & plata', 'Livrare & plată'],
 ];

 function toBytes(text) {
 const bytes = [];
 for (const char of String(text || '')) {
 const code = char.codePointAt(0);
 if (code <= 0xFF) {
 bytes.push(code);
 continue;
 }
 if (BYTE_MAP.has(code)) {
 bytes.push(BYTE_MAP.get(code));
 continue;
 }
 return null;
 }
 return new Uint8Array(bytes);
 }

 function decodeMojibake(text) {
 let current = String(text || '');
 if (!MOJIBAKE_PATTERN.test(current)) return current;

 for (let i = 0; i < 2; i += 1) {
 const bytes = toBytes(current);
 if (!bytes) break;
 let decoded = current;
 try {
 decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
 } catch (_) {
 break;
 }
 if (!decoded || decoded === current) break;
 current = decoded;
 if (!MOJIBAKE_PATTERN.test(current)) break;
 }

 return current;
 }

 function normalizeText(value) {
 let text = String(value || '');
 let previous = '';

 while (text !== previous) {
 previous = text;
 text = text
 .replace(/\u00A0/g, ' ')
 .replace(/\u00AD/g, '')
 .replace(/\u200B/g, '');
 text = decodeMojibake(text);
 for (const [from, to] of DIRECT_REPLACEMENTS) {
 if (text.includes(from)) text = text.split(from).join(to);
 }
 }

 return text;
 }

 function normalizeMeta() {
 document.title = normalizeText(document.title);
 document.querySelectorAll('meta[name="description"],meta[property="og:title"],meta[property="og:description"],meta[name="twitter:title"],meta[name="twitter:description"]').forEach((node) => {
 const current = node.getAttribute('content');
 const next = normalizeText(current);
 if (next !== current) node.setAttribute('content', next);
 });
 }

 function normalizeAttributes(root) {
 const scope = root && root.querySelectorAll ? root : document;
 scope.querySelectorAll('[placeholder],[aria-label],[title],[alt],[value],[content],[data-label]').forEach((node) => {
 ATTRIBUTES.forEach((attr) => {
 if (!node.hasAttribute(attr)) return;
 const current = node.getAttribute(attr);
 const next = normalizeText(current);
 if (next !== current) node.setAttribute(attr, next);
 });
 });
 }

 function normalizeTextNodes(root) {
 const scope = root && root.nodeType === 1 ? root : document.body;
 if (!scope) return;

 const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
 acceptNode(node) {
 if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
 const parent = node.parentElement;
 if (!parent || parent.closest('script,style,noscript')) return NodeFilter.FILTER_REJECT;
 return NodeFilter.FILTER_ACCEPT;
 },
 });

 const nodes = [];
 while (walker.nextNode()) nodes.push(walker.currentNode);
 nodes.forEach((node) => {
 const next = normalizeText(node.nodeValue);
 if (next !== node.nodeValue) node.nodeValue = next;
 });
 }

 function run(root) {
 normalizeMeta();
 normalizeTextNodes(root);
 normalizeAttributes(root);
 }

 let queuedRoot = null;
 let queued = false;
 function queueRun(root) {
 queuedRoot = queuedRoot || root || document.body;
 if (queued) return;
 queued = true;
 window.requestAnimationFrame(() => {
 const target = queuedRoot || document.body;
 queuedRoot = null;
 queued = false;
 run(target);
 });
 }

 function observeMutations() {
 if (!document.body || typeof MutationObserver === 'undefined') return;
 const observer = new MutationObserver((mutations) => {
 for (const mutation of mutations) {
 if (mutation.type === 'characterData' && mutation.target?.parentElement) {
 queueRun(mutation.target.parentElement);
 return;
 }
 if (mutation.type === 'childList') {
 const added = Array.from(mutation.addedNodes || []).find((node) => node.nodeType === 1 || node.nodeType === 3);
 if (added) {
 queueRun(added.nodeType === 1 ? added : mutation.target);
 return;
 }
 }
 }
 });
 observer.observe(document.body, { childList: true, characterData: true, subtree: true });
 }

 function start() {
 run(document);
 window.requestAnimationFrame(() => run(document));
 window.setTimeout(() => run(document), 150);
 observeMutations();
 }

 window.MotorasNormalizeText = normalizeText;
 window.MotorasNormalizeSubtree = run;

 if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', start, { once: true });
 } else {
 start();
 }

 window.addEventListener('pageshow', () => run(document));
 window.addEventListener('load', () => run(document), { once: true });
})();
