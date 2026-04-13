(function () {
  const CP1252_TO_BYTE = new Map([
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

  const SUSPICIOUS_PATTERN = /(?:Ã.|Ä.|È.|Â.|â.|�|MotoraÈ|CautÄ|AdaugÄ|rÄƒ|gÄƒ|ÃŽ|Ã®)/;
  const ATTRIBUTES = ['placeholder', 'aria-label', 'title', 'alt', 'value', 'content', 'data-label'];
  const replacements = [
    ['Motora?', 'Motora?'],
    ['Bucure?ti', 'Bucure?ti'],
    ['Confiden?ialitate', 'Confiden?ialitate'],
    ['confiden?ialitate', 'confiden?ialitate'],
    ['Termeni ?i condi?ii', 'Termeni ?i condi?ii'],
    ['Adres? fizic?', 'Adres? fizic?'],
    ['S?mb?ta', 'S?mb?ta'],
    ['Acas?', 'Acas?'],
    ['Livrare ?i plat?', 'Livrare ?i plat?'],
    ['Retururi si garan?ii', 'Retururi ?i garan?ii'],
    ['Po?i', 'Po?i'],
    ['Folose?te', 'Folose?te'],
    ['?ntreb?ri', '?ntreb?ri'],
    ['post-v?nzare', 'post-v?nzare'],
    ['disp?rem dup? comand?.', 'disp?rem dup? comand?.'],
    ['Deschide ?n Google Maps', 'Deschide ?n Google Maps'],
    ['Ordin de plat?', 'Ordin de plat?'],
    ['garan?ii', 'garan?ii'],
    ['disponibil?', 'disponibil?'],
    ['dureaz?', 'dureaz?'],
    ['num?rul', 'num?rul'],
    ['Primesti', 'Prime?ti'],
    ['prime?ti', 'prime?ti'],
    ['verificat?', 'verificat?'],
    ['pus?', 'pus?'],
    ['fa?? de ieri', 'fa?? de ieri'],
    ['Sincronizeaz? API', 'Sincronizeaz? API'],
    ['complet?!', 'complet?!'],
    ['MotoraÈ™', 'Motoraș'],
    ['MotoraÈ›', 'Motoraț'],
    ['CautÄƒ', 'Caută'],
    ['cÄƒutare', 'căutare'],
    ['GÄƒseÈ™ti', 'Găsești'],
    ['dupÄƒ', 'după'],
    ['marcÄƒ', 'marcă'],
    ['AdaugÄƒ', 'Adaugă'],
    ['AdÄƒugat', 'Adăugat'],
    ['Ã®n coÈ™', 'în coș'],
    ['ÃŽn stoc', 'În stoc'],
    ['rÄƒmase', 'rămase'],
    ['gÄƒsite', 'găsite'],
    ['gÄƒsit', 'găsit'],
    ['FÄƒrÄƒ recenzii', 'Fără recenzii'],
    ['Vizualizare rapidÄƒ', 'Vizualizare rapidă'],
    ['FinalizeazÄƒ comanda', 'Finalizează comanda'],
    ['PLASEAZÄ‚ COMANDA', 'PLASEAZĂ COMANDA'],
    ['GratuitÄƒ', 'Gratuită'],
    ['GRATUITÄ‚', 'GRATUITĂ'],
    ['BucureÈ™ti', 'București'],
    ['È™i', 'și'],
    ['È›', 'ț'],
    ['plÄƒții', 'plății'],
    ['plÄƒtești', 'plătești'],
    ['rÄƒmâne', 'rămâne'],
    ['PregÄƒtit', 'Pregătit'],
    ['InformaÈ›ii', 'Informații'],
    ['NumÄƒr', 'Număr'],
    ['AfiÈ™Äƒm', 'afișăm'],
    ['ÃŽncearcÄƒ', 'Încearcă'],
    ['frÃ¢nÄƒ', 'frână'],
    ['Doar esenÈ›iale', 'Doar esențiale'],
    ['ConfidenÈ›ialitate', 'Confidențialitate'],
    ['Termeni È™i condiÈ›ii', 'Termeni și condiții'],
  ];

  function toCp1252Bytes(value) {
    const bytes = [];
    for (const char of String(value || '')) {
      const code = char.codePointAt(0);
      if (code <= 0xFF) {
        bytes.push(code);
        continue;
      }
      if (CP1252_TO_BYTE.has(code)) {
        bytes.push(CP1252_TO_BYTE.get(code));
        continue;
      }
      return null;
    }
    return new Uint8Array(bytes);
  }

  function scoreText(value) {
    const text = String(value || '');
    const suspicious = (text.match(/(?:Ã.|Ä.|È.|Â.|â.|�)/g) || []).length;
    const romanian = (text.match(/[ăâîșțĂÂÎȘȚ]/g) || []).length;
    const common = (text.match(/\b(?:și|în|că|după|fără|comandă|livrare|plată|București|Motoraș)\b/gi) || []).length;
    return (romanian * 5) + (common * 3) - (suspicious * 4);
  }

  function decodeUtf8Mojibake(value) {
    let current = String(value || '');
    if (!SUSPICIOUS_PATTERN.test(current)) return current;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const bytes = toCp1252Bytes(current);
      if (!bytes) break;

      let decoded = current;
      try {
        decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      } catch (error) {
        break;
      }

      if (!decoded || decoded === current) break;
      if (scoreText(decoded) <= scoreText(current)) break;
      current = decoded;
      if (!SUSPICIOUS_PATTERN.test(current)) break;
    }

    return current;
  }

  function applyPhraseFixes(value) {
    let text = String(value || '');
    for (const [from, to] of replacements) {
      if (text.includes(from)) text = text.split(from).join(to);
    }
    return text;
  }

  function normalizeText(value) {
    let text = String(value || '');
    let previous = '';

    while (text !== previous) {
      previous = text;
      text = decodeUtf8Mojibake(text);
      text = applyPhraseFixes(text);
    }

    return text;
  }

  function normalizeDocumentMeta() {
    document.title = normalizeText(document.title);

    document.querySelectorAll('meta[name="description"],meta[property="og:title"],meta[property="og:description"],meta[name="twitter:title"],meta[name="twitter:description"]').forEach((meta) => {
      const current = meta.getAttribute('content');
      const next = normalizeText(current);
      if (next !== current) meta.setAttribute('content', next);
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
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest('script,style,noscript')) return NodeFilter.FILTER_REJECT;
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
    normalizeDocumentMeta();
    normalizeTextNodes(root);
    normalizeAttributes(root);
  }

  window.MotorasNormalizeText = normalizeText;
  window.MotorasNormalizeSubtree = run;

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

  function schedulePasses() {
    run(document);
    window.requestAnimationFrame(() => run(document));
    window.setTimeout(() => run(document), 160);
    window.setTimeout(() => run(document), 700);
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

    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      schedulePasses();
      observeMutations();
    }, { once: true });
  } else {
    schedulePasses();
    observeMutations();
  }

  window.addEventListener('pageshow', () => run(document));
  window.addEventListener('load', () => run(document), { once: true });
})();
