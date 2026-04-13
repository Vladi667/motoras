/**
 * MOTORAS catalog API backed by a generated catalog snapshot,
 * with the supplier XML feed kept as a fallback source.
 * Orders remain stored in localStorage for the static storefront.
 */

const _delay = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));

const _ordersKey = 'motoras_orders';
const _cartKey = 'motoras_cart';
const _lastOrder = 'motoras_last_order';
const _ratingsKey = 'motoras_product_ratings_v1';
const _liteCatalogCandidates = ['catalog-lite.json?v=20260409-lite-1', 'catalog-lite.json', './catalog-lite.json', '/catalog-lite.json'];
const _fullCatalogCandidates = ['catalog.json?v=20260409-texts-3', 'catalog.json', './catalog.json', '/catalog.json'];
const _feedSources = [
  { path: 'supplier-feed.xml', type: 'carhub' },
  { path: 'supplier-feed-globiz.xml', type: 'globiz' },
  { path: './supplier-feed.xml', type: 'carhub' },
  { path: './supplier-feed-globiz.xml', type: 'globiz' },
  { path: '/supplier-feed.xml', type: 'carhub' },
  { path: '/supplier-feed-globiz.xml', type: 'globiz' },
];
const _fallbackImage = 'assets/product-placeholder.svg';
const _serverOrdersEndpoint = '/api/orders';

const _readOrders = () => JSON.parse(localStorage.getItem(_ordersKey) || '[]');
const _writeOrders = orders => localStorage.setItem(_ordersKey, JSON.stringify(orders));
const _readRatings = () => JSON.parse(localStorage.getItem(_ratingsKey) || '{}');
const _writeRatings = ratings => localStorage.setItem(_ratingsKey, JSON.stringify(ratings));

const _genId = () => 'ORD-' + Date.now().toString().slice(-7);
const _now = () => new Date().toISOString();
const _paymentStatusValues = ['paid', 'unpaid', 'refunded'];
const _orderStatusValues = ['pending', 'pending_payment', 'processing', 'shipped', 'delivered', 'cancelled'];

let _catalog = [];
let _catalogPromise = null;

async function _requestServer(path, options = {}) {
  try {
    const response = await fetch(path, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        ...(options.headers || {}),
      },
      body: options.body ? new URLSearchParams({ payload: JSON.stringify(options.body) }).toString() : undefined,
    });
    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  } catch (_) {
    return { ok: false, status: 0, data: null };
  }
}

function _storeLastOrder(order) {
  localStorage.setItem(_lastOrder, JSON.stringify(order));
  localStorage.setItem(_cartKey, '[]');
}

function _sortOrders(items = []) {
  return [...items].sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0));
}

function _mergeOrders(remote = [], local = []) {
  const merged = new Map();
  [...remote, ...local].forEach(order => {
    if (!order?.id) return;
    merged.set(order.id, order);
  });
  return _sortOrders(Array.from(merged.values()));
}

function _needsFullCatalog() {
  const path = String(location?.pathname || '').toLowerCase();
  return path.endsWith('/product.html') || path.endsWith('product.html');
}

function _getCatalogCandidates() {
  return _needsFullCatalog() ? _fullCatalogCandidates : _liteCatalogCandidates;
}

function _paymentMethodLabel(method) {
  return {
    card: 'Carte online',
    op: 'Transfer bancar',
    ramburs: 'Ramburs la livrare',
  }[method] || 'Plata';
}

function _categoryLabel(value) {
  return {
    piese: 'Piese Auto',
    accesorii: 'Accesorii Auto',
    detailing: 'Detailing',
    baterii: 'Baterii & Acumulatori',
    uleiuri: 'Uleiuri & Lubrifianti',
    filtre: 'Filtre Auto',
    prelate: 'Prelate Auto',
    ambreiaje: 'Ambreiaje',
  }[value] || 'Accesorii Auto';
}

const _subcategoryConfig = {
  piese: [
    { key: 'franare', label: 'Frânare', pattern: /\b(fran[ae]|disc(?:uri)? frana|placut(?:a|e) frana|placute frana|saboti|tambur|etrier|pompa frana|furtun frana)\b/ },
    { key: 'suspensie-directie', label: 'Suspensie & Direcție', pattern: /\b(amortizor|arc suspensie|bieleta|bara stabilizatoare|bucsa|pivot|cap de bara|caseta directie|planetara|rulment|butuc)\b/ },
    { key: 'distributie-transmisie', label: 'Distribuție & Transmisie', pattern: /\b(kit distributie|curea distributie|curea accesorii|rola intinzatoare|ambreiaj|kit ambreiaj|disc ambreiaj|volanta|flywheel)\b/ },
    { key: 'motor-admisie', label: 'Motor & Admisie', pattern: /\b(pompa apa|termostat|injector|bobina inductie|bujie|sonda lambda|debitmetru|supapa egr|turbo|turbina|pompa combustibil|garnitura|chiulasa|piston|segmenti|arbore cotit|arbore cu came)\b/ },
    { key: 'racire-climatizare', label: 'Răcire & Climatizare', pattern: /\b(radiator|intercooler|condensator ac|compresor ac|vas expansiune|climatizare|aer conditionat)\b/ },
    { key: 'electrica-senzori', label: 'Electrică & Senzori', pattern: /\b(alternator|electromotor|demaror|senzor abs|senzor|modul)\b/ },
    { key: 'evacuare', label: 'Evacuare', pattern: /\b(catalizator|filtru particule|toba esapament|esapament)\b/ },
  ],
  accesorii: [
    { key: 'iluminare-auto', label: 'Iluminare Auto', pattern: /\b(bec(?:uri)?|xenon|led\b|halogen|angel eyes|canbus|drl\b|adaptor xenon|proiector led|bara led)\b/ },
    { key: 'multimedia-gsm', label: 'Multimedia & GSM', pattern: /\b(suport auto magnetic|suport magnetic pentru telefon|telefon|phone holder|modulator fm|fm transmitter|radio auto|navigatie|2din|1din|difuzor|woofer|subwoofer|camera marsarier|camera auto)\b/ },
    { key: 'siguranta-electrica', label: 'Siguranță & Electric', pattern: /\b(senzori parcare|parking sensor|alarma auto|incarcator auto|usb pt\.? bricheta|bricheta|invertor|cablu pornire|claxon)\b/ },
    { key: 'chei-exterior', label: 'Chei & Exterior', pattern: /\b(carcasa cheie|cheie auto|telecomanda auto|oglinda|ornament)\b/ },
    { key: 'organizare-confort', label: 'Organizare & Confort', pattern: /\b(parasolar|organizator|husa scaun|suport pahare|confort|portbagaj)\b/ },
  ],
  detailing: [
    { key: 'spalare-exterior', label: 'Spălare Exterior', pattern: /\b(sampon|snow foam|foam|spuma activa|prewash|wash and wax|waterless wash|car wash|wash mitt)\b/ },
    { key: 'jante-anvelope', label: 'Jante & Anvelope', pattern: /\b(jante|anvelope|cauciucuri|tire|wheel cleaner|wheel|iron remover|deironizer)\b/ },
    { key: 'decontaminare-polish', label: 'Decontaminare & Polish', pattern: /\b(clay|decontaminare|polish|compound|cutting pad|finishing pad|abraziv|slefuire|masina de polisat|masina polish|polisher|orbitala|rotativa)\b/ },
    { key: 'protectie-exterior', label: 'Protecție Exterior', pattern: /\b(wax|ceara|sealant|coating|ceramic|graphene|protectie vopsea|hidrofob|glass sealant|trim dressing|plastice exterioare|ppf\b|folie auto)\b/ },
    { key: 'interior-piele-textil', label: 'Interior, Piele & Textil', pattern: /\b(interior|tapiterie|piele|leather|textil|glass cleaner|curatare geamuri|odorizant|air freshener|vinyl|vinil|cheder)\b/ },
    { key: 'accesorii-detailing', label: 'Accesorii Detailing', pattern: /\b(microfibra|microfiber|laveta|prosop|perie|pensula|burete|aplicator|pad\b|pulverizator|atomizor|manusa spalare)\b/ },
    { key: 'echipamente-detailing', label: 'Echipamente Detailing', pattern: /\b(lampa|lanterna|worklight|scangrip|extractor|aspirator|injector-extractor|suflanta|air mover|compresor|pistol de vopsit|pistol pneumatic)\b/ },
  ],
  baterii: [
    { key: 'acumulatori-auto', label: 'Acumulatori Auto', pattern: /\b(acumulator auto|baterie auto|baterii auto|start stop|agm|efb)\b/ },
    { key: 'acumulatori-moto', label: 'Acumulatori Moto', pattern: /\b(acumulator moto|baterie moto|yuasa)\b/ },
    { key: 'redresoare-boostere', label: 'Redresoare & Boostere', pattern: /\b(redresor|incarcator acumulator|booster pornire|jump starter|starter pack)\b/ },
    { key: 'accesorii-baterii', label: 'Accesorii Baterii', pattern: /\b(borne baterie|tester(?: pentru)? baterie|tester baterie|cleme baterie)\b/ },
  ],
  uleiuri: [
    { key: 'ulei-motor', label: 'Ulei Motor', pattern: /\b(ulei motor|engine oil|motor oil|5w[- ]?30|5w[- ]?40|0w[- ]?20|0w[- ]?30|0w[- ]?40|10w[- ]?40|10w[- ]?60|15w[- ]?40|20w[- ]?50)\b/ },
    { key: 'ulei-transmisie', label: 'Ulei Transmisie', pattern: /\b(gear oil|transmission oil|ulei transmisie|ulei cutie|atf|dexron|dexos|75w[- ]?80|75w[- ]?90|80w[- ]?90|85w[- ]?140)\b/ },
    { key: 'lichide-tehnice', label: 'Lichide Tehnice', pattern: /\b(antigel|coolant|lichid frana|brake fluid|dot ?3|dot ?4|dot ?5|adblue|lichid parbriz)\b/ },
    { key: 'aditivi-tratamente', label: 'Aditivi & Tratamente', pattern: /\b(aditiv combustibil|aditiv ulei|aditiv|tratament motor|tratament)\b/ },
    { key: 'lubrifianti-spray', label: 'Lubrifianți & Spray-uri', pattern: /\b(vaselina|grease|lubrifiant|spray tehnic|spray-uri tehnice)\b/ },
  ],
  filtre: [
    { key: 'filtre-aer', label: 'Filtre Aer', pattern: /\b(filtru de aer|filtru aer|air filter)\b/ },
    { key: 'filtre-ulei', label: 'Filtre Ulei', pattern: /\b(filtru ulei|oil filter)\b/ },
    { key: 'filtre-combustibil', label: 'Filtre Combustibil', pattern: /\b(filtru combustibil|filtru benzina|filtru motorina|fuel filter)\b/ },
    { key: 'filtre-habitaclu', label: 'Filtre Habitaclu', pattern: /\b(filtru polen|filtru habitaclu|filtru cabina|cabin filter)\b/ },
    { key: 'alte-filtre', label: 'Alte Filtre', pattern: /\b(cartus filtrant|microfiltru|filtru de rezerva)\b/ },
  ],
  prelate: [
    { key: 'prelate-auto', label: 'Prelate Auto', pattern: /\b(prelata|prelate|car cover|outdoor cover|indoor cover|cover auto|husa auto|husa protectie)\b/ },
    { key: 'huse-interior', label: 'Huse Interior', pattern: /\b(husa scaun|seat cover|husa volan)\b/ },
    { key: 'protectii-roti', label: 'Protecții Roți', pattern: /\b(husa roata|protectie roata|wheel cover)\b/ },
  ],
  ambreiaje: [
    { key: 'kit-ambreiaj', label: 'Kit Ambreiaj', pattern: /\b(kit ambreiaj|ambreiaj|ambreiaje|disc ambreiaj|placa presiune)\b/ },
    { key: 'volanta', label: 'Volantă', pattern: /\b(volanta|flywheel|dual mass flywheel)\b/ },
    { key: 'hidraulica-ambreiaj', label: 'Hidraulică Ambreiaj', pattern: /\b(rulment de presiune|rulment presiune|cilindru ambreiaj|pompa ambreiaj)\b/ },
  ],
};

function _subcategoryLabel(category, value) {
  const items = _subcategoryConfig[category] || [];
  return items.find(item => item.key === value)?.label || 'Selecție';
}

function _resolveSubcategory(item = {}) {
  const category = item.cat || _resolveCategory(item);
  const rules = _subcategoryConfig[category] || [];
  const text = _stripDiacritics([
    item.name,
    item.desc,
    item.description,
    item.compat,
    item.brand,
    item.oem,
    item.sku,
    item.feedCategory,
    item.categoryPath,
    _flattenSpecText(item.specs),
  ].join(' ').toLowerCase());

  for (const rule of rules) {
    if (rule.pattern.test(text)) return rule.key;
  }

  return rules[0]?.key || 'general';
}

function _normalizePaymentStatus(value, fallback = 'unpaid') {
  return _paymentStatusValues.includes(value) ? value : fallback;
}

function _normalizeOrderStatus(value, fallback = 'pending') {
  return _orderStatusValues.includes(value) ? value : fallback;
}

function _cardLast4(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.slice(-4);
}

function _decodeHtml(value) {
  let result = String(value ?? '');
  if (!result) return '';

  const textarea = document.createElement('textarea');
  for (let i = 0; i < 4; i += 1) {
    const normalized = result
      .replace(/&#13;?/gi, '\n')
      .replace(/&#10;?/gi, '\n')
      .replace(/&nbsp;/gi, ' ');
    textarea.innerHTML = normalized;
    const decoded = textarea.value;
    if (decoded === result) {
      result = decoded;
      break;
    }
    result = decoded;
  }

  return result
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function _normalizeText(value, fallback = '') {
  const decoded = _decodeHtml(value);
  return decoded || fallback;
}

function _safeFloat(value) {
  const parsed = parseFloat(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function _hash(value) {
  let acc = 0;
  const source = String(value || '');
  for (let i = 0; i < source.length; i += 1) {
    acc = ((acc << 5) - acc) + source.charCodeAt(i);
    acc |= 0;
  }
  return Math.abs(acc);
}

function _inferCategory(name, description) {
  return _resolveCategory({ name, desc: description });
}

function _stripDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function _flattenSpecText(specs = {}) {
  return Object.values(specs || {}).flatMap((value) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.values(value);
    return [value];
  }).join(' ');
}

function _normalizeSearchText(value) {
  return _stripDiacritics(_normalizeText(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function _compactSearchText(value) {
  return _normalizeSearchText(value).replace(/\s+/g, '');
}

function _tokenizeSearch(value) {
  return _normalizeSearchText(value)
    .split(' ')
    .filter(Boolean);
}

function _uniqueTokens(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function _levenshteinDistance(a, b, maxDistance = 2) {
  const left = String(a || '');
  const right = String(b || '');
  if (!left || !right) return Math.max(left.length, right.length);
  if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let current = [i];
    let rowMin = current[0];

    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
      rowMin = Math.min(rowMin, current[j]);
    }

    if (rowMin > maxDistance) return maxDistance + 1;
    previous = current;
  }

  return previous[right.length];
}

function _buildSearchIndex(item = {}) {
  if (item && item.__searchIndex) return item.__searchIndex;

  const index = {
    name: _normalizeSearchText(item.name),
    brand: _normalizeSearchText(item.brand),
    sku: _normalizeSearchText(item.sku),
    oem: _normalizeSearchText(item.oem),
    desc: _normalizeSearchText([
      item.desc,
      item.description,
      item.feedCategory,
      item.categoryPath,
      _flattenSpecText(item.specs),
    ].join(' ')),
    category: _normalizeSearchText([_categoryLabel(item.cat), item.cat, item.subcatLabel, item.subcat].join(' ')),
  };

  index.nameCompact = index.name.replace(/\s+/g, '');
  index.brandCompact = index.brand.replace(/\s+/g, '');
  index.skuCompact = index.sku.replace(/\s+/g, '');
  index.oemCompact = index.oem.replace(/\s+/g, '');
  index.all = [index.name, index.brand, index.sku, index.oem, index.desc, index.category].filter(Boolean).join(' ');
  index.nameWords = _uniqueTokens(index.name.split(' '));
  index.brandWords = _uniqueTokens(index.brand.split(' '));
  index.skuWords = _uniqueTokens(index.sku.split(' '));
  index.oemWords = _uniqueTokens(index.oem.split(' '));
  index.categoryWords = _uniqueTokens(index.category.split(' '));
  index.descWords = _uniqueTokens(index.desc.split(' ').filter(word => word.length >= 3).slice(0, 48));
  index.focusWords = _uniqueTokens([
    ...index.nameWords,
    ...index.brandWords,
    ...index.skuWords,
    ...index.oemWords,
    ...index.categoryWords,
  ]).slice(0, 40);

  if (item) {
    Object.defineProperty(item, '__searchIndex', {
      value: index,
      configurable: true,
      enumerable: false,
      writable: true,
    });
  }

  return index;
}

function _scoreTokenAgainstWords(token, words = [], exactWeight, prefixWeight, includeWeight, fuzzyWeight) {
  if (!token || !words.length) return 0;

  let best = 0;
  const fuzzyThreshold = token.length >= 7 ? 2 : token.length >= 4 ? 1 : 0;

  for (const word of words) {
    if (!word) continue;
    if (word === token) return exactWeight;
    if (word.startsWith(token)) best = Math.max(best, prefixWeight);
    else if (token.length >= 3 && word.includes(token)) best = Math.max(best, includeWeight);
    else if (fuzzyThreshold && Math.abs(word.length - token.length) <= fuzzyThreshold) {
      const distance = _levenshteinDistance(token, word, fuzzyThreshold);
      if (distance <= fuzzyThreshold) best = Math.max(best, fuzzyWeight);
    }
  }

  return best;
}

function _scoreProductSearch(item = {}, query) {
  const rawQuery = String(query || '');
  const normalizedQuery = _normalizeSearchText(rawQuery);
  if (!normalizedQuery) return 0;

  const compactQuery = normalizedQuery.replace(/\s+/g, '');
  const tokens = _uniqueTokens(_tokenizeSearch(rawQuery));
  const index = _buildSearchIndex(item);
  let score = 0;

  if (compactQuery && compactQuery === index.skuCompact) score += 1400;
  if (compactQuery && compactQuery === index.oemCompact) score += 1320;
  if (compactQuery && compactQuery === index.nameCompact) score += 1260;
  if (normalizedQuery === index.name) score += 1180;
  if (normalizedQuery === index.brand) score += 640;

  if (index.name.startsWith(normalizedQuery)) score += 420;
  if (compactQuery && index.skuCompact.startsWith(compactQuery)) score += 540;
  if (compactQuery && index.oemCompact.startsWith(compactQuery)) score += 500;
  if (index.brand.startsWith(normalizedQuery)) score += 220;

  if (index.name.includes(normalizedQuery)) score += 320;
  if (compactQuery && index.skuCompact.includes(compactQuery)) score += 300;
  if (compactQuery && index.oemCompact.includes(compactQuery)) score += 280;
  if (index.brand.includes(normalizedQuery)) score += 150;
  if (index.category.includes(normalizedQuery)) score += 110;
  if (normalizedQuery.length >= 3 && index.desc.includes(normalizedQuery)) score += 60;

  let matchedTokens = 0;
  let strongTokenMatches = 0;

  for (const token of tokens) {
    let tokenScore = 0;
    tokenScore = Math.max(tokenScore, _scoreTokenAgainstWords(token, index.skuWords, 260, 190, 130, 72));
    tokenScore = Math.max(tokenScore, _scoreTokenAgainstWords(token, index.oemWords, 240, 175, 120, 68));
    tokenScore = Math.max(tokenScore, _scoreTokenAgainstWords(token, index.nameWords, 210, 145, 92, 52));
    tokenScore = Math.max(tokenScore, _scoreTokenAgainstWords(token, index.brandWords, 120, 88, 56, 28));
    tokenScore = Math.max(tokenScore, _scoreTokenAgainstWords(token, index.categoryWords, 90, 65, 38, 18));
    tokenScore = Math.max(tokenScore, _scoreTokenAgainstWords(token, index.descWords, 34, 22, 12, 0));

    if (!tokenScore && token.length >= 4 && compactQuery) {
      const focusCompact = index.focusWords.map(word => word.replace(/\s+/g, ''));
      tokenScore = _scoreTokenAgainstWords(token, focusCompact, 0, 0, 0, token.length >= 7 ? 48 : 32);
    }

    if (tokenScore > 0) {
      matchedTokens += 1;
      if (tokenScore >= 90) strongTokenMatches += 1;
      score += tokenScore;
    }
  }

  if (tokens.length) {
    if (matchedTokens === tokens.length) score += 180 + (strongTokenMatches * 24);
    else if (matchedTokens >= Math.max(1, tokens.length - 1)) score += 72;
  }

  if (!score) return 0;

  if (Number(item.stock || 0) > 0) score += 18;
  if (Number(item.stock || 0) > 10) score += 8;
  if (Number(item.price || 0) > 0) score += 2;

  return score;
}

function _goToSearch(value) {
  const query = String(value || '').trim();
  if (!query) return false;
  const target = `search.html?q=${encodeURIComponent(query)}`;
  if (window.MotorasPageLoader?.navigate) return window.MotorasPageLoader.navigate(target);
  window.location.href = target;
  return true;
}

function _bindSearchUi(root = document) {
  if (!root) return;

  const desktopInput = root.querySelector('#desktopSearchInput') || root.querySelector('.search-form input[type="text"]');
  const desktopButton = root.querySelector('.search-form .search-btn');
  const mobileInput = root.querySelector('#mobileSearchInput') || root.querySelector('#mobSearchBar .mob-search-inner input[type="text"]');
  const mobileButton = root.querySelector('#mobSearchBar .mob-search-inner button');

  if (desktopInput) {
    desktopInput.onkeydown = (event) => {
      if (event.key === 'Enter') _goToSearch(desktopInput.value);
    };
  }

  if (desktopButton && desktopInput) {
    desktopButton.onclick = (event) => {
      event.preventDefault();
      _goToSearch(desktopInput.value);
    };
  }

  if (mobileInput) {
    mobileInput.onkeydown = (event) => {
      if (event.key === 'Enter') _goToSearch(mobileInput.value);
    };
  }

  if (mobileButton && mobileInput) {
    mobileButton.onclick = (event) => {
      event.preventDefault();
      _goToSearch(mobileInput.value);
    };
  }
}

function _scoreMatches(text, rules = []) {
  return rules.reduce((score, rule) => score + (rule.pattern.test(text) ? rule.weight : 0), 0);
}

function _resolveCategory(item = {}) {
  const feedCategoryText = _stripDiacritics([
    item.feedCategory,
    item.categoryPath,
    item.specs?.CategorieFeed,
    item.specs?.CaleCategorie,
  ].join(' ').toLowerCase());
  const text = _stripDiacritics([
    item.name,
    item.desc,
    item.description,
    item.compat,
    item.brand,
    item.oem,
    item.sku,
    feedCategoryText,
  ].join(' ').toLowerCase());
  const compact = text.replace(/\s+/g, ' ').trim();
  const hasDetailingBrandContext = /\b(meguiar'?s|koch chemie|gtechniq|adbl|sonax|rupes|flexipads|bigboi|colad|scangrip|zvizzer|menzerna|work stuff|colourlock|kenotek|3d\b|4cr\b|benbow)\b/.test(compact);
  const hasToolContext = /\b(masina de polisat|masina polish|polisher|orbitala|rotativa|slefuit|slefuire|lampa|lanterna|worklight|scangrip|rupes|flex\b|bigfoot|nano ibrid|ibrid|sunmatch)\b/.test(compact);
  const hasDetailingLiquidContext = /\b(sampon|snow foam|foam|detailer|qd\b|ceara|wax|polish|compound|dressing|degresant|cleaner|curatitor|curatăre|glass|interior|jante|anvelope|tapiterie|decontaminare|clay|sealant|coating|ceramic|spray wax|wash and wax|waterless wash|bug ?& ?tar|apc\b)\b/.test(compact);
  const hasMechanicalContext = /\b(disc(?:uri)? frana|placut(?:a|e) frana|placute frana|saboti|tambur|etrier|pompa frana|furtun frana|amortizor|arc suspensie|bieleta|bara stabilizatoare|bucsa|pivot|cap de bara|caseta directie|planetara|rulment|butuc|kit distributie|curea distributie|curea accesorii|rola intinzatoare|pompa apa|termostat|radiator|intercooler|condensator ac|compresor ac|alternator|electromotor|demaror|injector|bobina inductie|bujie|sonda lambda|debitmetru|supapa egr|turbo|turbina|pompa combustibil|rezervor|vas expansiune|garnitura|chiulasa|piston|segmenti|arbore cotit|arbore cu came|catalizator|filtru particule|toba esapament|senzor abs)\b/.test(compact);
  const hasAccessoryContext = /\b(bec(?:uri)?|xenon|led\b|halogen|angel eyes|canbus|drl\b|adaptoare pentru becuri|adaptor xenon|proiector led|bara led|off road|suport auto magnetic|suport magnetic pentru telefon|telefon|phone holder|carcasa cheie|cheie auto|telecomanda auto|modulator fm|fm transmitter|radio auto|navigatie|2din|1din|difuzor|woofer|subwoofer|camera marsarier|camera auto|parking sensor|senzori parcare|alarma auto|incarcator auto|usb pt\.? bricheta|bricheta|invertor|cablu pornire|claxon)\b/.test(compact);

  const scores = {
    detailing: _scoreMatches(compact, [
      { pattern: /\b(detailing|detailer|quick detailer|qd\b|sampon|snow foam|foam|ceara|wax|polish|compound|cutting pad|finishing pad|sealant|coating|ceramic|graphene|degresant|decontaminare|clay|microfibra|microfiber|laveta|prosop|manusa spalare|wash mitt|car wash|wash\b|waterless|perie|pensula|burete|aplicator|pad\b|dressing|interior|tapiterie|jante|anvelope|glass cleaner|wheel cleaner|bug ?& ?tar|all purpose cleaner|apc\b|wash and wax|protectie piele|leather|vinil|vinyl|conditioner|odor|air freshener|soft top|fabric cleaner|ppf\b|folie auto|halo\b|masina de polisat|masina polish|polisher|orbitala|rotativa|slefuire|abraziv|lance de spumare|spuma activa|pahar vopsea|banda mascare|cana gradata|atomizor|pulverizator|kit bag|geanta detailing|laveta aplicare|husa polish|bonet[aă] polish|pistol pneumatic|pistol de curatăre|pistol de vopsit|injector-extractor|extractor|aspirator|suflanta|air mover|doctor\b|professor\b|work stuff|meguiar|koch chemie|gtechniq|adbl|sonax|rupes|flexipads|bigboi|colad|scangrip|zvizzer|menzerna|ik foam|kenotek|vacmaster|paul'?s)\b/, weight: 8 },
      { pattern: /\b(solutie|spray|cleaner|curatitor|curatăre|hidratare|protectie|coat|clear coat|filler|piele|uscare)\b/, weight: 1 },
    ]),
    baterii: _scoreMatches(compact, [
      { pattern: /\b(acumulator auto|acumulator moto|baterie auto|baterie moto|baterii auto|redresor|incarcator acumulator|booster pornire|jump starter|starter pack|borne baterie|tester(?: pentru)? baterie|tester baterie|alternator|start stop|varta|yuasa|exide)\b/, weight: 10 },
      { pattern: /\b(agm|efb)\b/, weight: 6 },
      { pattern: /\bacumulator\b/, weight: hasToolContext ? -6 : 4 },
      { pattern: /\bbaterie\b/, weight: hasToolContext ? -6 : 4 },
      { pattern: /\b(invertor|inverter)\b/, weight: -6 },
    ]),
    uleiuri: _scoreMatches(compact, [
      { pattern: /\b(ulei motor|engine oil|motor oil|gear oil|transmission oil|ulei transmisie|ulei cutie|ulei servo|ulei hidraulic|ulei compresor|antigel|coolant|lichid frana|brake fluid|vaselina|grease|adblue|aditiv combustibil|aditiv ulei|atf|dexron|dexos|dot ?3|dot ?4|dot ?5|5w[- ]?30|5w[- ]?40|0w[- ]?20|0w[- ]?30|0w[- ]?40|10w[- ]?40|10w[- ]?60|15w[- ]?40|20w[- ]?50|75w[- ]?80|75w[- ]?90|80w[- ]?90|85w[- ]?140)\b/, weight: 11 },
      { pattern: /\b(lubrifiant|lubrifianti)\b/, weight: hasDetailingLiquidContext ? -3 : 5 },
      { pattern: /\b(aditiv)\b/, weight: hasDetailingLiquidContext ? -4 : 5 },
      { pattern: /\b(solutie|spray)\b/, weight: hasDetailingLiquidContext ? -2 : 0 },
    ]),
    filtre: _scoreMatches(compact, [
      { pattern: /\b(filtru de aer|filtru aer|filtru ulei|filtru polen|filtru habitaclu|filtru combustibil|filtru benzina|filtru motorina|filtru cabina|air filter|oil filter|fuel filter|cabin filter|filtru de rezerva|cartus filtrant|post activated carbon filter|sediment filter|membrana osmoza|microfiltru)\b/, weight: 12 },
      { pattern: /\b(filtru|filtre)\b/, weight: 4 },
      { pattern: /\b(sita|masca|vopsea|paint strainer)\b/, weight: -8 },
    ]),
    prelate: _scoreMatches(compact, [
      { pattern: /\b(prelata|prelate|husa auto|husa protectie|car cover|outdoor cover|indoor cover|cover auto|husa roata|protectie roata|wheel cover|husa volan|hus[ea] universale pentru scaune|seat cover)\b/, weight: 12 },
      { pattern: /\b(soft top|impermeabilizare|husa polish|boneta polish|geanta|bag\b|ppf\b|folie auto|halo\b|banda mascare|hartie pentru mascare|suport magnetic|adaptor)\b/, weight: -10 },
    ]),
    ambreiaje: _scoreMatches(compact, [
      { pattern: /\b(ambreiaj|ambreiaje|kit ambreiaj|disc ambreiaj|placa presiune|rulment de presiune|rulment presiune|volanta|volant[aă]|flywheel|dual mass flywheel)\b/, weight: 14 },
      { pattern: /\b(brake cleaner|curatitor frane)\b/, weight: -8 },
    ]),
    accesorii: _scoreMatches(compact, [
      { pattern: /\b(bec(?:uri)?|xenon|led\b|halogen|angel eyes|canbus|drl\b|adaptoare pentru becuri|adaptor xenon|proiector led|bara led|off road|suport auto magnetic|suport magnetic pentru telefon|telefon|phone holder|carcasa cheie|cheie auto|telecomanda auto|modulator fm|fm transmitter|radio auto|navigatie|2din|1din|difuzor|woofer|subwoofer|camera marsarier|camera auto|parking sensor|senzori parcare|alarma auto|incarcator auto|usb pt\.? bricheta|bricheta|invertor|cablu pornire|claxon)\b/, weight: 12 },
      { pattern: /\b(adaptor|adapter)\b/, weight: (hasToolContext || hasDetailingBrandContext) ? -4 : 3 },
      { pattern: /\b(lampa led|spot led)\b/, weight: hasDetailingBrandContext ? -3 : 5 },
      { pattern: /\b(accesorii auto|electronica auto|electrice auto)\b/, weight: 6 },
      { pattern: /\b(microfibra|microfiber|laveta|prosop|perie|pensula|burete|pad\b|sampon|wax|polish|compound|ceara|detailing|spuma activa|lance de spumare)\b/, weight: -8 },
    ]),
    piese: _scoreMatches(compact, [
      { pattern: /\b(disc(?:uri)? frana|placut(?:a|e) frana|placute frana|saboti|tambur|etrier|pompa frana|furtun frana|amortizor|arc suspensie|bieleta|bara stabilizatoare|bucsa|pivot|cap de bara|caseta directie|planetara|rulment|butuc|kit distributie|curea distributie|curea accesorii|rola intinzatoare|pompa apa|termostat|radiator|intercooler|condensator ac|compresor ac|alternator|electromotor|demaror|injector|bobina inductie|bujie|sonda lambda|debitmetru|supapa egr|turbo|turbina|pompa combustibil|rezervor|vas expansiune|garnitura|chiulasa|piston|segmenti|arbore cotit|arbore cu came|catalizator|filtru particule|toba esapament|senzor abs)\b/, weight: 12 },
      { pattern: /\b(piese auto|aftermarket|kit reparatie|ansamblu|oe\b|oem\b)\b/, weight: 3 },
      { pattern: /\b(bec(?:uri)?|xenon|led\b|adaptor xenon|suport magnetic|telefon|navigatie|radio auto|camera auto|carcasa cheie|telecomanda auto|microfibra|microfiber|laveta|prosop|perie|pensula|burete|detailing|sampon|wax|polish|compound|ceara|prelata|husa auto)\b/, weight: -10 },
    ]),
  };

  if (scores.ambreiaje >= 14) return 'ambreiaje';
  if (scores.filtre >= 10) return 'filtre';
  if (scores.prelate >= 10) return 'prelate';
  if (scores.baterii >= 8) return 'baterii';
  if (scores.accesorii >= 12 && !hasMechanicalContext && scores.detailing < 12) return 'accesorii';
  if (scores.uleiuri >= 10 && scores.detailing < 8) return 'uleiuri';
  if (hasDetailingBrandContext && !hasAccessoryContext && !hasMechanicalContext) return 'detailing';
  if (scores.detailing >= 8) return 'detailing';
  if (scores.piese >= 8 || hasMechanicalContext) return 'piese';
  if (scores.accesorii >= 8 || hasAccessoryContext) return 'accesorii';
  if (scores.uleiuri >= 8) return 'uleiuri';
  if (scores.detailing >= 5 || hasDetailingLiquidContext || (hasToolContext && hasDetailingBrandContext)) return 'detailing';
  return 'accesorii';
}

function _inferBrand(name) {
  const cleaned = name.replace(/\s+/g, ' ').trim();
  const commaParts = cleaned.split(',');
  const head = (commaParts[0] || cleaned).trim();
  const tailMatch = head.match(/([A-Z0-9][A-Za-z0-9'&.\-]*(?:\s+[A-Z0-9][A-Za-z0-9'&.\-]*){0,2})$/);
  if (tailMatch) return tailMatch[1].trim();
  return head.split(' ').slice(0, 2).join(' ');
}

function _inferBadge(stock, seed) {
  if (stock <= 0) return null;
  const value = _hash(seed) % 8;
  if (value === 0) return 'hot';
  if (value === 1) return 'new';
  if (value === 2) return 'sale';
  return null;
}

function _buildSpecs(product, category) {
  return {
    Categorie: category,
    SKU: product.sku || '-',
    Stoc: String(product.stock),
    Disponibilitate: product.stock > 0 ? 'În stoc' : 'La comandă',
  };
}

function _normalizeImage(value) {
  const image = _decodeHtml(value || '');
  return image || _fallbackImage;
}

function _normalizeImageList(values = []) {
  const unique = [];
  const seen = new Set();
  values.forEach((value) => {
    const image = _normalizeImage(value);
    if (!image || seen.has(image)) return;
    seen.add(image);
    unique.push(image);
  });
  return unique.length ? unique : [_fallbackImage];
}

function _normalizeSpecs(specs = {}) {
  return Object.entries(specs || {}).reduce((acc, [key, value]) => {
    const nextKey = _normalizeText(key);
    if (!nextKey) return acc;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      acc[nextKey] = _normalizeSpecs(value);
      return acc;
    }

    if (Array.isArray(value)) {
      acc[nextKey] = value.map(entry => _normalizeText(entry)).filter(Boolean);
      return acc;
    }

    acc[nextKey] = typeof value === 'string' ? _normalizeText(value) : value;
    return acc;
  }, {});
}

function _normalizeCatalogItem(item) {
  if (!item) return null;

  const normalized = { ...item };
  const fallbackId = item.id || item.sku || item.code || '';

  normalized.id = _normalizeText(item.id || fallbackId);
  normalized.sku = _normalizeText(item.sku || normalized.id || fallbackId);
  normalized.name = _normalizeText(item.name || normalized.sku || 'Produs');
  normalized.brand = _normalizeText(item.brand || _inferBrand(normalized.name));
  normalized.desc = _normalizeText(item.desc || item.description || normalized.name);
  normalized.eta = _normalizeText(item.eta || '');
  normalized.oem = _normalizeText(item.oem || normalized.sku);
  normalized.compat = _normalizeText(item.compat || '');
  normalized.cat = _normalizeText(_resolveCategory({
    ...item,
    name: normalized.name,
    desc: normalized.desc,
    brand: normalized.brand,
    sku: normalized.sku,
    oem: normalized.oem,
    compat: normalized.compat,
  }));
  normalized.subcat = _normalizeText(_resolveSubcategory({
    ...item,
    cat: normalized.cat,
    name: normalized.name,
    desc: normalized.desc,
    brand: normalized.brand,
    sku: normalized.sku,
    oem: normalized.oem,
    compat: normalized.compat,
  }));
  normalized.subcatLabel = _subcategoryLabel(normalized.cat, normalized.subcat);
  normalized.badge = item.badge || null;
  normalized.price = Math.round(_safeFloat(item.price) * 100) / 100;
  normalized.old = item.old ? Math.round(_safeFloat(item.old) * 100) / 100 : null;
  normalized.stock = Math.max(0, _safeInt(item.stock, 0));
  normalized.rating = Number(item.rating || 0);
  normalized.reviews = Math.max(0, _safeInt(item.reviews, 0));
  normalized.baseRating = Number(item.baseRating || normalized.rating || 0);
  normalized.baseReviews = Math.max(0, _safeInt(item.baseReviews ?? normalized.reviews, 0));
  normalized.source = _normalizeText(item.source || 'catalog');
  normalized.vehicle = item.vehicle || null;
  normalized.specs = _normalizeSpecs(item.specs || _buildSpecs({ sku: normalized.sku, stock: normalized.stock }, normalized.cat));
  normalized.specs.Categorie = _categoryLabel(normalized.cat);
  normalized.specs.Subcategorie = normalized.subcatLabel;
  normalized.specs.SKU = normalized.sku;
  normalized.specs.Stoc = String(normalized.stock);
  normalized.specs.Disponibilitate = normalized.stock > 0 ? 'În stoc' : 'La comandă';
  normalized.images = _normalizeImageList([
    ...(Array.isArray(item.images) ? item.images : []),
    item.img || '',
  ]);
  normalized.img = normalized.images[0];

  if (!normalized.eta) {
    normalized.eta = normalized.stock > 0
      ? (normalized.stock > 5 ? 'Livrare 24-48h' : 'Stoc limitat, livrare rapidă')
      : 'Disponibil la comandă';
  }

  if (!normalized.compat) {
    normalized.compat = 'Compatibilitate la cerere după cod produs.';
  }

  return normalized.id ? normalized : null;
}

function _normalizeStockLabel(value) {
  return String(value || '').trim().toLowerCase();
}

function _stockFromLabel(value) {
  const normalized = _normalizeStockLabel(value);
  if (!normalized) return 0;
  if (/in stoc|disponibil|livrare imediata|pe stoc/.test(normalized)) return 12;
  if (/stoc limitat|ultim|putine bucati/.test(normalized)) return 3;
  if (/precomanda|la comanda/.test(normalized)) return 1;
  if (/fara stoc|indisponibil|epuizat/.test(normalized)) return 0;
  return 2;
}

function _safeInt(value, fallback = 0) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function _clampRating(value, allowZero = false) {
  const min = allowZero ? 0 : 1;
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(5, Math.max(min, num));
}

function _normalizeReview(review, index = 0) {
  const rating = _clampRating(_safeInt(review?.rating, 5));
  const name = String(review?.name || 'Client Motoraș').trim().slice(0, 40) || 'Client Motoraș';
  const comment = String(review?.comment || '').trim().slice(0, 600);
  const createdAt = review?.createdAt || new Date(Date.now() - (index * 86400000)).toISOString();

  return {
    id: String(review?.id || `${createdAt}-${index}`),
    rating,
    name,
    comment,
    createdAt,
  };
}

function _getStoredReviews(productId) {
  const store = _readRatings();
  const key = String(productId || '');
  const reviews = Array.isArray(store[key]) ? store[key] : [];
  return reviews
    .map((review, index) => _normalizeReview(review, index))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function _getRatingSummary(product) {
  const reviews = _getStoredReviews(product.id);
  const baseRating = _clampRating(product.baseRating ?? product.rating ?? (reviews.length ? 4.7 : 0), true);
  const baseReviews = Math.max(0, _safeInt(product.baseReviews ?? product.reviews, 0));
  const userTotal = reviews.reduce((sum, review) => sum + review.rating, 0);
  const totalReviews = baseReviews + reviews.length;
  const average = totalReviews
    ? (((baseRating * baseReviews) + userTotal) / totalReviews)
    : 0;

  return {
    rating: Math.round(average * 10) / 10,
    reviews: totalReviews,
    reviewEntries: reviews,
    reviewCount: reviews.length,
  };
}

function _applyRatingSummary(product) {
  const baseRating = _clampRating(product.baseRating ?? product.rating ?? (product.baseReviews || product.reviews ? 4.7 : 0), true);
  const baseReviews = Math.max(0, _safeInt(product.baseReviews ?? product.reviews, 0));
  const summary = _getRatingSummary({ ...product, baseRating, baseReviews });

  return {
    ...product,
    baseRating,
    baseReviews,
    rating: summary.rating,
    reviews: summary.reviews,
    reviewEntries: summary.reviewEntries,
    reviewCount: summary.reviewCount,
  };
}

function _refreshCatalogRatings(productId = null) {
  if (!_catalog.length) return;
  _catalog = _catalog.map(item => {
    if (productId && String(item.id) !== String(productId)) return item;
    return _applyRatingSummary(item);
  });
}

function _mapProduct(node, index) {
  const name = _decodeHtml(node.name?.textContent || node.name || `Produs ${index + 1}`);
  const sku = _decodeHtml(node.sku?.textContent || node.sku || `SKU-${index + 1}`);
  const shortDescription = _decodeHtml(node.short_description?.textContent || node.short_description || '');
  const description = _decodeHtml(node.description?.textContent || node.description || shortDescription);
  const price = Math.round(_safeFloat(node.price?.textContent || node.price) * 100) / 100;
  const qty = Math.max(0, Math.floor(_safeFloat(node.qty?.textContent || node.qty)));
  const inStock = String(node.is_in_stock?.textContent || node.is_in_stock || '').trim() === '1';
  const stock = inStock ? Math.max(qty, 1) : qty;
  const brand = _inferBrand(name);
  const cat = _resolveCategory({
    name,
    desc: description || shortDescription,
    compat: shortDescription,
    brand,
    sku,
  });
  const badge = _inferBadge(stock, sku || name);
  const old = badge === 'sale' ? Math.round((price * 1.15) * 100) / 100 : null;
  const images = _normalizeImageList([
    node.image?.textContent || node.image || '',
  ]);

  return {
    id: sku,
    name,
    brand,
    cat,
    price,
    old,
    img: images[0],
    images,
    rating: 0,
    reviews: 0,
    baseRating: 0,
    baseReviews: 0,
    badge,
    sku,
    stock,
    desc: description || shortDescription || name,
    eta: stock > 0 ? (stock > 5 ? 'Livrare 24-48h' : 'Stoc limitat, livrare rapidă') : 'Disponibil la comandă',
    oem: sku,
    compat: shortDescription || 'Compatibilitate la cerere dupa cod produs.',
    specs: _buildSpecs({ sku, stock }, cat),
    vehicle: null,
    source: 'carhub',
  };
}

function _mapGlobizProduct(node, index) {
  const code = _decodeHtml(node.cod?.textContent || node.cod || `GBZ-${index + 1}`);
  const name = _decodeHtml(node.denumire?.textContent || node.denumire || `Produs Globiz ${index + 1}`);
  const description = _decodeHtml(node.descriere?.textContent || node.descriere || '');
  const category = _decodeHtml(node.categorie?.textContent || node.categorie || '');
  const categoryPath = _decodeHtml(node.calecategorie?.textContent || node.calecategorie || category);
  const brand = _decodeHtml(node.marca?.textContent || node.marca || _inferBrand(name));
  const price = Math.round(_safeFloat(node.pret?.textContent || node.pret) * 100) / 100;
  const wholePrice = Math.round(_safeFloat(node.pret_intreg?.textContent || node.pret_intreg) * 100) / 100;
  const stockLabel = _decodeHtml(node.stoc?.textContent || node.stoc || '');
  const stock = _stockFromLabel(stockLabel);
  const badge = _inferBadge(stock, code || name);
  const old = wholePrice > price ? wholePrice : (badge === 'sale' && price ? Math.round(price * 1.12 * 100) / 100 : null);
  const imageNodes = Array.from(node.querySelectorAll ? node.querySelectorAll('imagini > imagine') : []);
  const images = _normalizeImageList([
    node.imagine?.textContent || node.imagine || '',
    ...imageNodes.map((entry) => entry.textContent || ''),
  ]);

  return {
    id: code,
    name,
    brand,
    cat: _resolveCategory({
      name,
      desc: description,
      compat: `${category} ${categoryPath}`.trim(),
      brand,
      sku: code,
      specs: {
        CategorieFeed: category,
        CaleCategorie: categoryPath,
        StareStoc: stockLabel,
      },
    }),
    price,
    old,
    img: images[0],
    images,
    rating: 0,
    reviews: 0,
    baseRating: 0,
    baseReviews: 0,
    badge,
    sku: code,
    stock,
    desc: description || `${name} ${category}`.trim(),
    eta: stock > 2 ? 'Livrare 24-48h' : (stock > 0 ? 'Stoc limitat, livrare rapidă' : 'Disponibil la comandă'),
    oem: _decodeHtml(node.cod_bare?.textContent || node.cod_bare || code),
    compat: categoryPath || category || 'Compatibilitate la cerere dupa cod produs.',
    specs: {
      ..._buildSpecs({ sku: code, stock }, _resolveCategory({ name, desc: description, compat: `${category} ${categoryPath}`.trim(), brand, sku: code })),
      Brand: brand || '-',
      CategorieFeed: category || '-',
      CaleCategorie: categoryPath || '-',
      StareStoc: stockLabel || '-',
    },
    vehicle: null,
    source: 'globiz',
  };
}

function _scoreCatalogItem(item) {
  return [
    item.stock > 0 ? 50 : 0,
    item.img && item.img !== _fallbackImage ? 20 : 0,
    item.desc ? Math.min(String(item.desc).length, 200) / 10 : 0,
    item.old ? 4 : 0,
    item.brand ? 2 : 0,
    item.source === 'globiz' ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0);
}

function _mergeCatalogItems(lists) {
  const map = new Map();

  lists.flat().forEach((item) => {
    if (!item || !item.id) return;
    const key = String(item.id).trim();
    const candidate = _normalizeCatalogItem(item);
    if (!candidate?.id) return;
    const current = map.get(key);

    if (!current) {
      map.set(key, candidate);
      return;
    }

    const currentScore = _scoreCatalogItem(current);
    const candidateScore = _scoreCatalogItem(candidate);
    const next = candidateScore >= currentScore ? { ...current, ...candidate } : { ...candidate, ...current };

    next.stock = Math.max(Number(current.stock || 0), Number(candidate.stock || 0));
    next.old = current.old || candidate.old || null;
    next.images = _normalizeImageList([
      ...(Array.isArray(current.images) ? current.images : [current.img]),
      ...(Array.isArray(candidate.images) ? candidate.images : [candidate.img]),
    ]);
    next.img = next.images[0];
    next.desc = _normalizeText(next.desc || current.desc || candidate.desc || next.name || '');
    next.baseRating = Math.max(Number(current.baseRating || current.rating || 0), Number(candidate.baseRating || candidate.rating || 0));
    next.baseReviews = Math.max(Number(current.baseReviews || current.reviews || 0), Number(candidate.baseReviews || candidate.reviews || 0));
    next.source = _normalizeText(current.source || candidate.source || 'catalog');
    next.brand = _normalizeText(next.brand || current.brand || candidate.brand || '');
    next.cat = _normalizeText(next.cat || current.cat || candidate.cat || 'piese');
    next.eta = _normalizeText(next.eta || current.eta || candidate.eta || '');
    next.oem = _normalizeText(next.oem || current.oem || candidate.oem || next.sku || '');
    next.compat = _normalizeText(next.compat || current.compat || candidate.compat || '');
    next.sku = _normalizeText(next.sku || current.sku || candidate.sku || next.id);
    next.specs = _normalizeSpecs(next.specs || current.specs || candidate.specs || {});

    map.set(key, next);
  });

  return Array.from(map.values()).map(_applyRatingSummary);
}

async function _fetchFeedCatalogs() {
  const catalogs = [];
  let lastError = null;

  for (const source of _feedSources) {
    try {
      const response = await fetch(source.path, { cache: 'default' });
      if (!response.ok) {
        throw new Error(`Feed unavailable at ${source.path} (${response.status})`);
      }

      const xmlText = await response.text();
      const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
      const parserError = xml.querySelector('parsererror');
      if (parserError) {
        throw new Error(`Feed XML is invalid at ${source.path}`);
      }

      const items = source.type === 'globiz'
        ? Array.from(xml.querySelectorAll('articole > articol')).map(_mapGlobizProduct)
        : Array.from(xml.querySelectorAll('products > product')).map(_mapProduct);

      if (items.length) catalogs.push(items);
    } catch (error) {
      lastError = error;
    }
  }

  if (!catalogs.length && lastError) throw lastError;
  return catalogs;
}

async function _fetchCatalogJson() {
  let lastError = null;
  for (const path of _getCatalogCandidates()) {
    try {
      const response = await fetch(path, { cache: 'default' });
      if (!response.ok) {
        throw new Error(`Catalog unavailable at ${path} (${response.status})`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Catalog snapshot could not be loaded.');
}

async function _ensureCatalog() {
  if (_catalog.length) return _catalog;
  if (_catalogPromise) return _catalogPromise;

  _catalogPromise = (async () => {
    let jsonCatalog = [];
    try {
      jsonCatalog = await _fetchCatalogJson();
      if (Array.isArray(jsonCatalog) && jsonCatalog.length) {
        _catalog = jsonCatalog
          .map(_normalizeCatalogItem)
          .filter(Boolean)
          .map(_applyRatingSummary);
        return _catalog;
      }
    } catch (jsonError) {
      console.warn('[MotApi] catalog snapshot fallback', jsonError);
    }

    const feedCatalogs = await _fetchFeedCatalogs();

    if (!jsonCatalog.length && !feedCatalogs.length) {
      throw new Error('Supplier feeds could not be loaded.');
    }

    _catalog = _mergeCatalogItems([jsonCatalog, ...feedCatalogs]);
    return _catalog;
  })();

  try {
    return await _catalogPromise;
  } finally {
    _catalogPromise = null;
  }
}

window.MotApiSearch = {
  go: _goToSearch,
  bind: () => _bindSearchUi(document),
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => _bindSearchUi(document), { once: true });
} else {
  _bindSearchUi(document);
}

window.addEventListener('pageshow', () => _bindSearchUi(document));

window.MotApi = {
  async ready() {
    const items = await _ensureCatalog();
    return { ok: true, total: items.length };
  },

  async getCatalogSnapshot() {
    const items = await _ensureCatalog();
    return items.map(item => ({ ..._applyRatingSummary(item) }));
  },

  async getProducts(params = {}) {
    await _delay();
    let sourceItems = await _ensureCatalog();

    if (params.cat) sourceItems = sourceItems.filter(item => item.cat === params.cat);
    if (params.subcat) sourceItems = sourceItems.filter(item => item.subcat === params.subcat);
    if (params.brand) sourceItems = sourceItems.filter(item => item.brand === params.brand);

    let rankedEntries = sourceItems.map(item => ({ item, score: 0 }));
    if (params.q) {
      rankedEntries = sourceItems
        .map(item => ({ item, score: _scoreProductSearch(item, params.q) }))
        .filter(entry => entry.score > 0)
        .sort((left, right) =>
          right.score - left.score ||
          Number(right.item.stock || 0) - Number(left.item.stock || 0) ||
          Number(right.item.reviews || 0) - Number(left.item.reviews || 0) ||
          String(left.item.name || '').localeCompare(String(right.item.name || ''), 'ro')
        );

      const topScore = rankedEntries[0]?.score || 0;
      if (topScore >= 1200) {
        rankedEntries = rankedEntries.filter(entry => entry.score >= Math.max(380, Math.round(topScore * 0.42)));
      } else if (topScore >= 700) {
        rankedEntries = rankedEntries.filter(entry => entry.score >= Math.max(220, Math.round(topScore * 0.32)));
      }
    }

    let items = rankedEntries.map(entry => ({
      ..._applyRatingSummary(entry.item),
      _searchScore: entry.score,
    }));

    if (params.sort === 'price_asc') items.sort((a, b) => a.price - b.price || b._searchScore - a._searchScore);
    if (params.sort === 'price_desc') items.sort((a, b) => b.price - a.price || b._searchScore - a._searchScore);
    if (params.sort === 'rating') items.sort((a, b) => (b.rating || 0) - (a.rating || 0) || b._searchScore - a._searchScore);

    const page = Math.max(1, parseInt(params.page || 1, 10));
    const limit = Math.max(1, parseInt(params.limit || 12, 10));
    const total = items.length;
    const start = (page - 1) * limit;

    return {
      ok: true,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      items: items.slice(start, start + limit).map(({ _searchScore, ...item }) => item),
    };
  },

  async getSubcategories(cat) {
    await _delay(10);
    const items = (await _ensureCatalog()).filter(item => !cat || item.cat === cat);
    const counts = new Map();
    items.forEach((item) => {
      const key = item.subcat || _resolveSubcategory(item);
      const label = item.subcatLabel || _subcategoryLabel(item.cat, key);
      if (!counts.has(key)) counts.set(key, { key, label, count: 0 });
      counts.get(key).count += 1;
    });
    return {
      ok: true,
      items: Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ro')),
    };
  },

  async getProduct(id) {
    await _delay(20);
    const product = (await _ensureCatalog()).find(item => item.id === id);
    if (!product) return { ok: false, error: 'Produsul nu a fost găsit.' };
    return { ok: true, product: { ..._applyRatingSummary(product) } };
  },

  async getFeatured(limit = 8) {
    await _delay(20);
    const items = (await _ensureCatalog())
      .map(item => ({ ..._applyRatingSummary(item) }))
      .filter(item => item.stock > 0)
      .sort((a, b) => {
        const scoreA = (a.badge ? 10 : 0) + a.reviews;
        const scoreB = (b.badge ? 10 : 0) + b.reviews;
        return scoreB - scoreA;
      })
      .slice(0, limit);

    return { ok: true, items };
  },

  async getProductReviews(id) {
    await _delay(20);
    const product = (await _ensureCatalog()).find(item => item.id === id);
    if (!product) return { ok: false, error: 'Produsul nu a fost găsit.' };
    const hydrated = _applyRatingSummary(product);
    return {
      ok: true,
      summary: {
        rating: hydrated.rating,
        reviews: hydrated.reviews,
        baseReviews: hydrated.baseReviews,
      },
      items: hydrated.reviewEntries.map(review => ({ ...review })),
    };
  },

  async addProductReview(id, payload = {}) {
    await _delay(80);
    const product = (await _ensureCatalog()).find(item => item.id === id);
    if (!product) return { ok: false, error: 'Produsul nu a fost găsit.' };

    const rating = Math.min(5, Math.max(1, _safeInt(payload.rating, 0)));
    if (!rating) return { ok: false, error: 'Ratingul este obligatoriu.' };

  const name = String(payload.name || 'Client Motoraș').trim().slice(0, 40) || 'Client Motoraș';
    const comment = String(payload.comment || '').trim().slice(0, 600);
    const store = _readRatings();
    const key = String(id);
    const list = Array.isArray(store[key]) ? store[key] : [];
    list.unshift(_normalizeReview({
      id: `REV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      rating,
      name,
      comment,
      createdAt: new Date().toISOString(),
    }));
    store[key] = list.slice(0, 40);
    _writeRatings(store);
    _refreshCatalogRatings(id);

    const hydrated = _applyRatingSummary(product);
    return {
      ok: true,
      product: { ...hydrated },
      summary: {
        rating: hydrated.rating,
        reviews: hydrated.reviews,
        baseReviews: hydrated.baseReviews,
      },
      items: hydrated.reviewEntries.map(review => ({ ...review })),
    };
  },

  async createOrder(payload) {
    await _delay(120);
    const required = ['email', 'firstName', 'lastName', 'address', 'phone', 'items'];
    for (const field of required) {
      if (!payload[field] || (Array.isArray(payload[field]) && !payload[field].length)) {
        return { ok: false, error: `Campul '${field}' este obligatoriu.` };
      }
    }

    const paymentMethod = payload.paymentMethod || payload.payment || 'card';
    if (paymentMethod === 'card' && payload.stripePaymentIntentId) {
      const remote = await _requestServer(_serverOrdersEndpoint, {
        method: 'POST',
        body: payload,
      });
      if (remote.ok && remote.data?.order) {
        _storeLastOrder(remote.data.order);
        return { ok: true, order: remote.data.order };
      }
      return { ok: false, error: remote.data?.error || 'Plata Stripe nu a putut fi finalizată.' };
    }

    const paymentStatusDefault = paymentMethod === 'card' ? 'paid' : 'unpaid';
    const paymentStatus = _normalizePaymentStatus(payload.paymentStatus, paymentStatusDefault);
    const orderStatusDefault = paymentMethod === 'op'
      ? 'pending_payment'
      : paymentMethod === 'card'
        ? (paymentStatus === 'paid' ? 'processing' : 'pending_payment')
        : 'pending';
    const items = payload.items.map(item => ({
      id: item.id || item.sku || '',
      name: item.name,
      brand: item.brand || '',
      price: Number(item.price || 0),
      qty: Math.max(1, Number(item.qty || 1)),
      img: item.img || _fallbackImage,
      sku: item.sku || item.id || '',
    }));
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const shippingCost = Number(payload.shippingCost || 0);
    const paymentFee = Number(payload.paymentFee || 0);

    const order = {
      id: _genId(),
      createdAt: _now(),
      updatedAt: _now(),
      status: _normalizeOrderStatus(payload.status, orderStatusDefault),
      email: payload.email,
      name: `${payload.firstName} ${payload.lastName}`,
      firstName: payload.firstName,
      lastName: payload.lastName,
      phone: payload.phone,
      address: payload.address,
      county: payload.county || '',
      city: payload.city || '',
      zip: payload.zip || '',
      shipping: payload.shipping || 'standard',
      payment: paymentStatus,
      paymentStatus,
      paymentMethod,
      paymentLabel: payload.paymentLabel || _paymentMethodLabel(paymentMethod),
      paymentMode: payload.paymentMode || 'onsite',
      paymentReference: payload.paymentReference || '',
      paymentMessage: payload.paymentMessage || '',
      paymentScenario: payload.paymentScenario || '',
      paymentCardLast4: payload.paymentCardLast4 || _cardLast4(payload.cardNumber),
      items,
      subtotal,
      shippingCost,
      paymentFee,
      total: subtotal + shippingCost + paymentFee,
      notes: payload.notes || '',
      vehicle: payload.vehicle || null,
    };

    const orders = _readOrders();
    orders.unshift(order);
    _writeOrders(orders);
    _storeLastOrder(order);

    return { ok: true, order };
  },

  async getOrders(params = {}) {
    await _delay(50);
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.email) query.set('email', params.email);
    const remote = await _requestServer(`${_serverOrdersEndpoint}${query.toString() ? `?${query}` : ''}`);
    let items = _mergeOrders(remote.ok ? (remote.data?.items || []) : [], _readOrders());
    if (params.status) items = items.filter(order => order.status === params.status);
    if (params.email) items = items.filter(order => order.email === params.email);
    const page = Math.max(1, parseInt(params.page || 1, 10));
    const limit = Math.max(1, parseInt(params.limit || 20, 10));
    return { ok: true, total: items.length, items: items.slice((page - 1) * limit, page * limit) };
  },

  async getOrder(id) {
    await _delay(30);
    const localOrder = _readOrders().find(item => item.id === id);
    if (localOrder) return { ok: true, order: localOrder };
    const remote = await _requestServer(`${_serverOrdersEndpoint}?id=${encodeURIComponent(id)}`);
    if (remote.ok && remote.data?.order) return { ok: true, order: remote.data.order };
    const order = JSON.parse(localStorage.getItem(_lastOrder) || 'null');
    if (order?.id === id) return { ok: true, order };
    if (!order) return { ok: false, error: 'Comanda nu a fost găsită.' };
    return { ok: true, order };
  },

  async updateOrderStatus(id, status) {
    await _delay(60);
    if (!_orderStatusValues.includes(status)) return { ok: false, error: 'Status invalid.' };

    const remote = await _requestServer(_serverOrdersEndpoint, {
      method: 'PATCH',
      body: { id, status },
    });
    if (remote.ok && remote.data?.order) {
      return { ok: true, order: remote.data.order };
    }

    const orders = _readOrders();
    const index = orders.findIndex(order => order.id === id);
    if (index < 0) return { ok: false, error: 'Comanda nu există.' };

    orders[index].status = status;
    orders[index].updatedAt = _now();
    _writeOrders(orders);
    return { ok: true, order: orders[index] };
  },

  async updateOrder(id, patch = {}) {
    await _delay(60);

    const remote = await _requestServer(_serverOrdersEndpoint, {
      method: 'PATCH',
      body: { id, ...patch },
    });
    if (remote.ok && remote.data?.order) {
      if (JSON.parse(localStorage.getItem(_lastOrder) || 'null')?.id === id) {
        localStorage.setItem(_lastOrder, JSON.stringify(remote.data.order));
      }
      return { ok: true, order: remote.data.order };
    }

    const orders = _readOrders();
    const index = orders.findIndex(order => order.id === id);
    if (index < 0) return { ok: false, error: 'Comanda nu există.' };

    if (patch.status && !_orderStatusValues.includes(patch.status)) {
      return { ok: false, error: 'Status invalid.' };
    }
    if (patch.payment && !_paymentStatusValues.includes(patch.payment)) {
      return { ok: false, error: 'Status plată invalid.' };
    }

    const current = orders[index];
    const next = {
      ...current,
      ...patch,
      paymentMethod: patch.paymentMethod || current.paymentMethod || 'card',
      paymentLabel: patch.paymentLabel || current.paymentLabel || _paymentMethodLabel(patch.paymentMethod || current.paymentMethod || 'card'),
      updatedAt: _now(),
    };

    orders[index] = next;
    _writeOrders(orders);
    if (JSON.parse(localStorage.getItem(_lastOrder) || 'null')?.id === id) {
      localStorage.setItem(_lastOrder, JSON.stringify(next));
    }
    return { ok: true, order: next };
  },

  async ping() {
    await _delay(10);
    const total = _catalog.length || null;
    return { ok: true, version: '2.0.0-xml', env: 'browser-static', time: _now(), total };
  },

  async seedOrders(n = 5) {
    const catalog = await _ensureCatalog();
    const names = ['Ion Popescu', 'Maria Ionescu', 'Andrei Constantin', 'Elena Dumitrescu', 'Radu Popa'];
    const statuses = ['pending', 'processing', 'shipped', 'delivered', 'delivered'];
    const counties = ['București', 'Cluj', 'Timiș', 'Iași', 'Brașov'];
    const orders = _readOrders();

    for (let i = 0; i < n; i += 1) {
      const items = catalog.slice(i * 2, i * 2 + 2).map(product => ({ ...product, qty: 1 }));
      const subtotal = items.reduce((sum, item) => sum + item.price, 0);
      const order = {
        id: `ORD-${100001 + i}`,
        createdAt: new Date(Date.now() - i * 86400000 * 2).toISOString(),
        status: statuses[i % statuses.length],
        email: `client${i}@test.ro`,
        name: names[i % names.length],
        phone: `07${String(i).padStart(8, '2')}`,
        address: `Str. Test nr. ${i + 1}`,
        county: counties[i % counties.length],
        city: counties[i % counties.length],
        zip: `10000${i}`,
        shipping: i % 2 === 0 ? 'standard' : 'express',
        payment: i % 3 === 0 ? 'paid' : 'unpaid',
        paymentStatus: i % 3 === 0 ? 'paid' : 'unpaid',
        paymentMethod: i % 3 === 0 ? 'card' : i % 3 === 1 ? 'ramburs' : 'op',
        paymentLabel: i % 3 === 0 ? 'Carte online' : i % 3 === 1 ? 'Ramburs la livrare' : 'Transfer bancar',
        items,
        subtotal,
        shippingCost: i % 2 === 0 ? 0 : 25,
        total: subtotal + (i % 2 === 0 ? 0 : 25),
        notes: '',
        vehicle: null,
      };
      if (!orders.find(existing => existing.id === order.id)) orders.unshift(order);
    }

    _writeOrders(orders);
    return { ok: true, seeded: n };
  },
};

window.MotApi.ready()
  .then(result => console.log('[MotApi]', result))
  .catch(error => console.error('[MotApi] feed error', error));

