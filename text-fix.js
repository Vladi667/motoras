(function () {
  const textReplacements = [
    [/Motora\\s\/g, 'Motoras -'],
    [/Motora\/g, 'Motoras'],
    [/MOTORA\/g, 'MOTORAS'],
    [/Bucure\ti/g, 'Bucuresti'],
    [/Acas\/g, 'Acasa'],
    [/Co\/g, 'Cos'],
    [/Caut\/g, 'Cauta'],
    [/dup\/g, 'dupa'],
    [/num\r/g, 'numar'],
    [/pies\/g, 'piesa'],
    [/marc\/g, 'marca'],
    [/ma\ina/g, 'masina'],
    [/G\se\te/g, 'Gaseste'],
    [/Reseteaz\/g, 'Reseteaza'],
    [/Afi\ezi/g, 'Afisezi'],
    [/Livrare gratuit\/g, 'Livrare gratuita'],
    [/Ridicare personal\/g, 'Ridicare personala'],
    [/Garan\ie/g, 'Garantie'],
    [/gratuit\/g, 'gratuita'],
    [/personal\/g, 'personala'],
    [/Confiden\ialitate/g, 'Confidentialitate'],
    [/Politic\/g, 'Politica'],
    [/Condi\ii/g, 'Conditii'],
    [/mici pre\uri/g, 'mici preturi'],
    [/pre\uri/g, 'preturi'],
    [/pre\/g, 'pret'],
    [/Toat\/g, 'Toata'],
    [/Rom\nia/g, 'Romania'],
    [/pia\\/g, 'piata'],
    [/Electric\/g, 'Electrica'],
    [/Fr\ne/g, 'Frane'],
    [/fr\n\/g, 'frana'],
    [/Ro\i/g, 'Roti'],
    [/Lubrifian\i/g, 'Lubrifianti'],
    [/Cosmetic\\s\/g, 'Cosmetica'],
    [/Detailing \/g, 'Detailing'],
    [/\i\b/g, 'si'],
    [/\incepe/g, 'incepe'],
    [/\ncarc\/g, 'incarca'],
    [/\n\b/g, 'in'],
    [/\mbun\t\\i/g, 'imbunatati'],
    [/\ntreb\ri/g, 'intrebari'],
    [/esen\iale/g, 'esentiale'],
    [/r\mase/g, 'ramase'],
    [/comand\/g, 'comanda'],
    [/g\sit/g, 'gasit'],
    [/c\utare/g, 'cautare'],
    [/C\utare/g, 'Cautare'],
    [/Specifica\ii/g, 'Specificatii'],
    [/Evalueaz\/g, 'Evalueaza'],
    [/Las\/g, 'Lasa'],
    [/urm\torii/g, 'urmatorii'],
    [/real\/g, 'reala'],
    [/va ap\rea/g, 'va aparea'],
    [/prime\te/g, 'primeste'],
    [/Citroen/g, 'Citroen'],
    [/Lun\Vin 08\18 \ S\m 09\14/g, 'Luni-Joi 10:00-17:00 | Vineri 09:00-16:30'],
    [/\ Marca \/g, 'Marca'],
    [/\ Model \/g, 'Model'],
    [/\ An \/g, 'An'],
    [/CUMP\R\ ACUM/g, 'CUMPARA ACUM'],
    [/Adaug\/g, 'Adauga'],
    [/Cump\r\/g, 'Cumpara'],
    [/F\r\/g, 'Fara'],
    [/Nicio evaluare real\ inc\/g, 'Nicio evaluare reala inca'],
    [/Scorul se actualizeaza/g, 'Scorul se actualizeaza'],
    [/Detalii \/g, 'Detalii'],
    [/Lichid fr\n\/g, 'Lichid frana'],
    [/Agricultori nr. 2/g, 'Agricultori nr. 2'],
    [/Ridicare personala \ /g, 'Ridicare personala · '],
    [/Detailing & Cosmetica \/g, 'Detailing & Cosmetica'],
    [/Lun\Vin 08\18 \ S\m 09\14/g, 'Luni-Joi 10:00-17:00 | Vineri 09:00-16:30'],
    [/ \ | Strada /g, ' · Strada '],
    [/ \ /g, ' · '],
    [/\$/g, ''],
    [/🍪/g, 'Cookie'],
    [/Search/g, 'Cauta'],
    [/Oops/g, 'Ups'],
    [/>/g, '>'],
    [/â†’/g, '->'],
    [/âœ¨/g, '*'],
    [/ | /g, '-'],
  ];

  function normalizeText(value) {
    let next = String(value  '');
    for (const [pattern, replacement] of textReplacements) {
      next = next.replace(pattern, replacement);
    }
    next = next.replace(/\s{2,}/g, ' ');
    return next;
  }

  function fixAttributes(root) {
    if (!root || root.nodeType !== 1) return;
    const attrNames = ['placeholder', 'title', 'aria-label', 'alt'];
    attrNames.forEach((name) => {
      const value = root.getAttribute(name);
      if (value && /[�����]/.test(value)) {
        root.setAttribute(name, normalizeText(value));
      }
    });
  }

  function fixTextNodes(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      if (!node.nodeValue || !/[�����]/.test(node.nodeValue)) return;
      node.nodeValue = normalizeText(node.nodeValue);
    });
  }

  function fixNode(root) {
    if (!root) return;
    if (root.nodeType === 1) {
      fixAttributes(root);
      root.querySelectorAll('*').forEach(fixAttributes);
    }
    fixTextNodes(root);
    document.title = normalizeText(document.title);
  }

  function start() {
    fixNode(document.documentElement);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1 || node.nodeType === 3) fixNode(node);
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
