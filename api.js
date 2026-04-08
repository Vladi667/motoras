/**
 * MOTORAȘ API v2 — CarHub XML-Powered
 * ─────────────────────────────────────────────────────────────────
 * Priority:  Live XML feed → sessionStorage cache → seed fallback
 * XML feed:  https://www.carhub.ro/exports/feedprodusecarhub.xml
 *            (fetched client-side; requires feed to allow CORS,
 *             OR deploy a /api/feed proxy on Vercel — see vercel.json)
 *
 * Global:    window.MotApi      — product & order methods
 *            window.CATALOG     — live array (set after init)
 *            window._ALL_PRODS  — alias (legacy compat)
 *            window.MotReady    — Promise that resolves when catalog ready
 *
 * Next step: replace fetch() with Vercel Edge Function proxy to
 *            avoid CORS and add daily caching.
 * ─────────────────────────────────────────────────────────────────
 */

/* ── Config ─────────────────────────────────────────────────────── */
const _XML_URL     = 'https://www.carhub.ro/exports/feedprodusecarhub.xml';
const _PROXY_URL   = '/api/feed';           // Vercel proxy (future)
const _CACHE_KEY   = 'motoras_catalog_v2';
const _CACHE_TTL   = 6 * 60 * 60 * 1000;  // 6h in ms
const _ORDERS_KEY  = 'motoras_orders';
const _CART_KEY    = 'motoras_cart';
const _LAST_ORDER  = 'motoras_last_order';

/* ── Category mapping: CarHub category → internal slug ─────────── */
const _CAT_MAP = {
  'uleiuri'    : 'uleiuri',
  'ulei'       : 'uleiuri',
  'lubrifiant' : 'uleiuri',
  'aditivi'    : 'uleiuri',
  'antigel'    : 'uleiuri',
  'filtre'     : 'filtre',
  'filtru'     : 'filtre',
  'filter'     : 'filtre',
  'baterii'    : 'baterii',
  'baterie'    : 'baterii',
  'acumulator' : 'baterii',
  'ambreiaj'   : 'ambreiaje',
  'ambreiaje'  : 'ambreiaje',
  'ambreaj'    : 'ambreiaje',
  'prelata'    : 'prelate',
  'prelate'    : 'prelate',
  'huse'       : 'prelate',
  'piese'      : 'piese',
  'suspensie'  : 'piese',
  'franare'    : 'piese',
  'frana'      : 'piese',
  'electrical' : 'piese',
  'electrice'  : 'piese',
  'aprindere'  : 'piese',
  'racire'     : 'piese',
  'distributie': 'piese',
  'transmisie' : 'piese',
};

function _mapCat(raw) {
  if (!raw) return 'piese';
  const lower = raw.toLowerCase().trim();
  for (const [key, val] of Object.entries(_CAT_MAP)) {
    if (lower.includes(key)) return val;
  }
  return 'piese';
}

/* ── Fallback image pool per category ──────────────────────────── */
const _IMG_POOL = {
  uleiuri  : ['https://images.unsplash.com/photo-1635273051805-e7d69a8e6c4f?w=600&q=85&fit=crop',
              'https://images.unsplash.com/photo-1609630875171-b1321377ee65?w=600&q=85&fit=crop',
              'https://images.unsplash.com/photo-1611544132851-5eb11ae14390?w=600&q=85&fit=crop'],
  filtre   : ['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=85&fit=crop',
              'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=600&q=85&fit=crop',
              'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=600&q=85&fit=crop'],
  baterii  : ['https://images.unsplash.com/photo-1620714223084-8fcacc2d47e9?w=600&q=85&fit=crop'],
  ambreiaje: ['https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=600&q=85&fit=crop'],
  prelate  : ['https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=600&q=85&fit=crop',
              'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&q=85&fit=crop'],
  piese    : ['https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=600&q=85&fit=crop',
              'https://images.unsplash.com/photo-1567818735868-e71b99932e29?w=600&q=85&fit=crop',
              'https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=600&q=85&fit=crop',
              'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=600&q=85&fit=crop'],
};
function _fallbackImg(cat, idx) {
  const pool = _IMG_POOL[cat] || _IMG_POOL.piese;
  return pool[idx % pool.length];
}

/* ── XML parser: handles both <products><product> and <items><item> ─
   Tries every known Romanian auto feed schema.                    */
function _parseXML(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const parseErr = doc.querySelector('parsererror');
  if (parseErr) {
    console.warn('[MotApi] XML parse error:', parseErr.textContent);
    return null;
  }

  /* Detect item tag — try common names */
  const TAG_NAMES = ['product', 'item', 'produs', 'Product', 'Item'];
  let items = [];
  for (const tag of TAG_NAMES) {
    items = Array.from(doc.getElementsByTagName(tag));
    if (items.length) break;
  }
  if (!items.length) {
    console.warn('[MotApi] No product elements found in XML');
    return null;
  }

  console.log(`[MotApi] Parsing ${items.length} products from XML`);

  /* Helper: get text of a child element, trying multiple tag names */
  const get = (el, ...tags) => {
    for (const t of tags) {
      const node = el.querySelector(t) || el.getElementsByTagName(t)[0];
      if (node) return (node.textContent || '').trim();
    }
    return '';
  };

  const products = [];
  let idx = 0;

  for (const el of items) {
    /* ── Core fields ─────────────────────────────────────────────── */
    const id    = get(el, 'id', 'ID', 'product_id', 'productId', 'sku', 'SKU', 'cod', 'Cod') || `xml_${idx}`;
    const name  = get(el, 'name', 'Name', 'denumire', 'Denumire', 'title', 'Title', 'nume', 'Nume');
    if (!name) { idx++; continue; } // skip malformed rows

    const brand = get(el, 'brand', 'Brand', 'marca', 'Marca', 'manufacturer', 'Manufacturer', 'producator');
    const sku   = get(el, 'sku', 'SKU', 'cod', 'Cod', 'reference', 'mpn', 'MPN', 'partNumber');
    const ean   = get(el, 'ean', 'EAN', 'barcode', 'gtin');

    /* ── Category ────────────────────────────────────────────────── */
    const rawCat = get(el, 'category', 'Category', 'categorie', 'Categorie', 'cat', 'Cat',
                       'category_name', 'categoryName', 'grupa', 'Grupa', 'subcategory');
    const cat = _mapCat(rawCat);

    /* ── Price ───────────────────────────────────────────────────── */
    const priceRaw    = get(el, 'price', 'Price', 'pret', 'Pret', 'pret_vanzare', 'sale_price',
                            'price_sale', 'pret_final', 'retail_price');
    const oldPriceRaw = get(el, 'old_price', 'oldPrice', 'pret_vechi', 'regular_price',
                            'compare_price', 'price_compare', 'pret_comparatie', 'price_old',
                            'original_price', 'lista_price', 'msrp');
    const price    = parseFloat(priceRaw?.replace(',', '.')) || 0;
    const oldPrice = parseFloat(oldPriceRaw?.replace(',', '.')) || null;

    /* ── Stock ───────────────────────────────────────────────────── */
    const stockRaw = get(el, 'stock', 'Stock', 'stoc', 'Stoc', 'qty', 'quantity',
                         'cantitate', 'availability', 'in_stock');
    let stock = 0;
    if (/^\d+$/.test(stockRaw)) {
      stock = parseInt(stockRaw);
    } else if (/in.?stock|da|yes|true|disponibil/i.test(stockRaw)) {
      stock = 99;
    } else if (/out|nu|no|false|indisponibil|epuizat/i.test(stockRaw)) {
      stock = 0;
    } else {
      stock = 10; // unknown → assume available
    }

    /* ── Image ───────────────────────────────────────────────────── */
    const imgRaw = get(el, 'image', 'Image', 'imagine', 'Imagine', 'img', 'Img',
                       'image_url', 'imageUrl', 'picture', 'photo', 'thumbnail',
                       'image_link', 'imagini');
    // Some feeds put multiple images comma/pipe separated
    const img = (imgRaw ? imgRaw.split(/[,|;]/)[0].trim() : '') || _fallbackImg(cat, idx);

    /* ── Description ─────────────────────────────────────────────── */
    const desc = get(el, 'description', 'Description', 'descriere', 'Descriere',
                     'short_description', 'desc', 'Desc', 'detalii');

    /* ── OEM / Compatibility ─────────────────────────────────────── */
    const oem   = get(el, 'oem', 'OEM', 'oe', 'OE', 'oem_code', 'cross_ref', 'referinta_oe');
    const compat = get(el, 'compatibility', 'compatibilitate', 'Compatibilitate',
                       'fitment', 'vehicle', 'vehicule', 'aplicatii', 'applies_to');

    /* ── Specs: try to parse key-value pairs from XML attributes/children */
    const specs = {};
    if (sku)   specs['SKU']   = sku;
    if (brand) specs['Brand'] = brand;
    if (ean)   specs['EAN']   = ean;
    specs['Garanție'] = get(el, 'warranty', 'garantie', 'Garantie') || '24 luni';
    // Additional spec children: <specs><spec name="X">Y</spec></specs>
    const specEl = el.querySelector('specs, specifications, atribute');
    if (specEl) {
      specEl.querySelectorAll('spec, attribute, atribut').forEach(s => {
        const k = s.getAttribute('name') || s.getAttribute('key') || s.getAttribute('denumire');
        const v = s.textContent?.trim();
        if (k && v) specs[k] = v;
      });
    }

    /* ── Badge heuristic ─────────────────────────────────────────── */
    let badge = null;
    const isNew     = /nou|new/i.test(get(el, 'badge', 'status', 'tag', 'label'));
    const isSale    = oldPrice && oldPrice > price && (1 - price/oldPrice) > 0.05;
    const isPopular = parseInt(get(el,'views','vanzari','sales','sold_count') || '0') > 50;
    if (isSale && (1-price/oldPrice) > 0.15) badge = 'sale';
    else if (isNew) badge = 'new';
    else if (isPopular) badge = 'hot';

    /* ── ETA ─────────────────────────────────────────────────────── */
    const eta = get(el, 'delivery', 'livrare', 'Livrare', 'lead_time', 'disponibilitate') ||
                (stock > 0 ? 'Livrare 24-48h' : 'Comandă specială');

    /* ── Assemble ────────────────────────────────────────────────── */
    products.push({
      id      : String(id),
      name,
      brand   : brand || 'Generic',
      cat,
      price,
      old     : (oldPrice && oldPrice > price) ? oldPrice : null,
      img,
      rating  : 4 + (idx % 2 === 0 ? 1 : 0),  // neutral until reviews integrated
      reviews : 10 + (idx * 7 % 200),
      badge,
      sku     : sku || String(id),
      stock,
      desc    : desc || `${name} — produs calitate premium.`,
      eta,
      oem     : oem || '',
      compat  : compat || '',
      specs,
      // vehicle: can be enriched later via compat parsing
      vehicle : null,
      // Keep source reference for agent sync
      _source : 'xml',
      _rawCat : rawCat,
    });

    idx++;
  }

  return products.length ? products : null;
}

/* ── Fetch XML with CORS fallback chain ─────────────────────────── */
async function _fetchCatalog() {
  /* 1. Try Vercel proxy (avoids CORS, will be set up later) */
  try {
    const r = await fetch(_PROXY_URL, { headers: { 'Accept': 'application/xml, text/xml' } });
    if (r.ok) {
      const txt = await r.text();
      const parsed = _parseXML(txt);
      if (parsed) { console.log('[MotApi] Loaded from proxy:', parsed.length); return parsed; }
    }
  } catch (_) { /* proxy not available yet */ }

  /* 2. Try direct XML (works if CarHub has CORS or same-origin) */
  try {
    const r = await fetch(_XML_URL, { mode: 'cors', cache: 'no-store' });
    if (r.ok) {
      const txt = await r.text();
      const parsed = _parseXML(txt);
      if (parsed) { console.log('[MotApi] Loaded directly from XML:', parsed.length); return parsed; }
    }
  } catch (e) { console.warn('[MotApi] Direct XML fetch failed (CORS?):', e.message); }

  /* 3. Try no-cors mode via allorigins.win CORS proxy (public) */
  try {
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(_XML_URL)}`;
    const r = await fetch(proxy);
    if (r.ok) {
      const json = await r.json();
      const txt  = json.contents;
      if (txt) {
        const parsed = _parseXML(txt);
        if (parsed) { console.log('[MotApi] Loaded via allorigins:', parsed.length); return parsed; }
      }
    }
  } catch (e) { console.warn('[MotApi] allorigins proxy failed:', e.message); }

  return null;
}

/* ── sessionStorage cache ───────────────────────────────────────── */
function _loadCache() {
  try {
    const raw = sessionStorage.getItem(_CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts < _CACHE_TTL) {
      console.log('[MotApi] Cache hit:', data.length, 'products');
      return data;
    }
    sessionStorage.removeItem(_CACHE_KEY);
  } catch (_) {}
  return null;
}
function _saveCache(data) {
  try { sessionStorage.setItem(_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); }
  catch (_) {}
}

/* ── Seed catalog (original 72 products — fallback only) ─────────── */
const _SEED = [{"id":"p1","name":"Ulei Motor EDGE 5W-30 LL 5L Full Synthetic","brand":"Castrol","cat":"uleiuri","price":189,"old":230,"img":"https://images.unsplash.com/photo-1635273051805-e7d69a8e6c4f?w=600&q=85&fit=crop","rating":5,"reviews":128,"badge":"hot","sku":"CAST-5W30-5L","stock":48,"desc":"Ulei motor full sintetic de ultima generatie, formula avansata pentru protectie maxima. Recomandat pentru motoare Euro 5/6.","eta":"Livrare 24-48h","oem":"LL-04","compat":"Audi A4 B8 2.0 TDI; VW Passat B7 2.0 TDI; Skoda Octavia III 2.0 TDI","specs":{"Tip":"Ulei motor","Vâscozitate":"5W-30","Cantitate":"5L","Normă":"VW 504.00 / 507.00"},"vehicle":{"brand":"Volkswagen","model":"Golf","year":"2015","engine":"1.2 TSI"}},{"id":"p2","name":"Filtru Ulei P7161 Universal VW Audi Skoda","brand":"Bosch","cat":"filtre","price":38,"old":49,"img":"https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=85&fit=crop","rating":4,"reviews":64,"badge":"new","sku":"BSH-P7161","stock":92,"desc":"Filtru ulei premium cu eficienta de filtrare 99.9%, compatibil cu uleiuri sintetice si minerale.","eta":"În stoc depozit București","oem":"06J115403Q","compat":"VW Golf 6 1.4 TSI; Audi A3 1.8 TFSI; Skoda Octavia 1.4 TSI","specs":{"Tip":"Filtru ulei","Material":"Celuloză multi-strat","Montaj":"Înșurubare","Garanție":"24 luni"},"vehicle":{"brand":"Audi","model":"A4","year":"2016","engine":"1.4 TSI"}},{"id":"p3","name":"Disc Frână Față Ventilat DF4083 288mm 5x112","brand":"TRW","cat":"piese","price":142,"old":189,"img":"https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=600&q=85&fit=crop","rating":5,"reviews":97,"badge":"sale","sku":"TRW-DF4083","stock":23,"desc":"Disc frână ventilat high-performance pentru VW Golf, Audi A3, Skoda Octavia.","eta":"Livrare rapidă 1-2 zile","oem":"1K0615301AA","compat":"VW Golf 5/6; Audi A3 8P; Seat Leon 1P","specs":{"Diametru":"288 mm","Tip":"Ventilat","Prindere":"5x112","Poziție":"Față"},"vehicle":{"brand":"BMW","model":"X3","year":"2018","engine":"1.5 dCi"}},{"id":"p4","name":"Baterie Auto Blue Dynamic 12V 60Ah 540A","brand":"Varta","cat":"baterii","price":395,"old":450,"img":"https://images.unsplash.com/photo-1620714223084-8fcacc2d47e9?w=600&q=85&fit=crop","rating":4,"reviews":203,"badge":"hot","sku":"VARTA-E38","stock":11,"desc":"Baterie auto fara intretinere, rezistenta la vibratii, ideala pentru vehicule cu sistem Start/Stop.","eta":"Disponibil azi în showroom","oem":"E38","compat":"Dacia Logan; VW Golf; Ford Focus","specs":{"Capacitate":"60Ah","Curent pornire":"540A","Tehnologie":"Ca/Ca","Polaritate":"Dreapta"},"vehicle":{"brand":"Dacia","model":"Logan","year":"2020","engine":"1.6 TDI"}},{"id":"p5","name":"Set 4 Bujii Iridium Laser BKR6EIX Motor TSI","brand":"NGK","cat":"piese","price":168,"old":195,"img":"https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=600&q=85&fit=crop","rating":5,"reviews":311,"badge":"new","sku":"NGK-BKR6EIX","stock":35,"desc":"Bujii cu electrod central din iridiu pentru aprindere perfecta si durata lunga de viata.","eta":"Livrare 24h","oem":"BKR6EIX","compat":"VW 1.4 TSI; Skoda 1.8 TSI; Audi 2.0 TFSI","specs":{"Material":"Iridiu","Cantitate":"Set 4 buc","Gap":"0.8 mm","Durată":"Până la 60.000 km"},"vehicle":{"brand":"Ford","model":"Mondeo","year":"2015","engine":"1.8 TFSI"}},{"id":"p6","name":"Set Scule Auto 94 Piese Chei Tubulare","brand":"Stanley","cat":"piese","price":489,"old":620,"img":"https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=600&q=85&fit=crop","rating":4,"reviews":76,"badge":"hot","sku":"STAN-94PC","stock":7,"desc":"Set complet de scule auto din crom-vanadiu, in valiza rigida.","eta":"Livrare 1-3 zile","oem":"94PC","compat":"Universal","specs":{"Conținut":"94 piese","Material":"Cr-V","Ambalare":"Valiză rigidă","Utilizare":"Service & DIY"},"vehicle":{"brand":"Mercedes-Benz","model":"A-Class","year":"2019","engine":"2.0 TDI"}},{"id":"p7","name":"Prelată Auto Impermeabilă L Sedan Hatchback","brand":"CarPro","cat":"prelate","price":229,"old":279,"img":"https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=600&q=85&fit=crop","rating":5,"reviews":54,"badge":null,"sku":"CPRO-COV-L","stock":19,"desc":"Prelată auto premium din material Oxford 600D, impermeabilă și rezistentă UV.","eta":"Expediere în aceeași zi","oem":"COV-L","compat":"Sedan / Hatchback până la 4.6m","specs":{"Material":"Oxford 600D","Sezon":"All Season","Protecție":"UV + ploaie","Mărime":"L"},"vehicle":{"brand":"Skoda","model":"Octavia","year":"2016","engine":"2.0 TDCi"}},{"id":"p8","name":"Set Ștergătoare Silicone Aquablade 600/400mm","brand":"Valeo","cat":"piese","price":89,"old":127,"img":"https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&q=85&fit=crop","rating":4,"reviews":149,"badge":"sale","sku":"VAL-AQB-6040","stock":44,"desc":"Ștergătoare cu lamă din silicon natural, funcționare silențioasă și performanță în toate sezoanele.","eta":"Ridicare din magazin disponibilă","oem":"AQUA-6040","compat":"Universal 600/400mm","specs":{"Tip":"Flat blade","Lungime":"600/400 mm","Material":"Silicon","Set":"2 buc"},"vehicle":{"brand":"Renault","model":"Clio","year":"2018","engine":"2.0"}}];

/* ── Init: orchestrate load with cache + fallback ───────────────── */
let _catalog = null;
let _ready   = null;

function _init() {
  if (_ready) return _ready;
  _ready = (async () => {
    /* 1. Check session cache first (avoid re-fetching on navigation) */
    const cached = _loadCache();
    if (cached) { _catalog = cached; return cached; }

    /* 2. Fetch live XML */
    const live = await _fetchCatalog();
    if (live && live.length > 0) {
      _catalog = live;
      _saveCache(live);
      console.log('[MotApi] ✓ Live catalog loaded:', live.length, 'products');
      return live;
    }

    /* 3. Fallback to seed */
    console.warn('[MotApi] ⚠ Using seed catalog (XML unavailable)');
    _catalog = _SEED;
    return _SEED;
  })();
  return _ready;
}

/* ── Expose catalog to window ASAP ─────────────────────────────── */
window.MotReady = _init().then(cat => {
  window.CATALOG    = cat;
  window._ALL_PRODS = cat;
  // Dispatch event so pages that rendered before init can refresh
  document.dispatchEvent(new CustomEvent('motoras:ready', { detail: { catalog: cat } }));
  return cat;
});

/* ── Helpers ─────────────────────────────────────────────────────── */
const _delay       = (ms = 30) => new Promise(r => setTimeout(r, ms));
const _readOrders  = () => { try { return JSON.parse(localStorage.getItem(_ORDERS_KEY) || '[]'); } catch { return []; } };
const _writeOrders = o  => localStorage.setItem(_ORDERS_KEY, JSON.stringify(o));
const _genId       = () => 'ORD-' + Date.now().toString().slice(-7);
const _now         = () => new Date().toISOString();

/* ── Public API ─────────────────────────────────────────────────── */
window.MotApi = {

  /* ── Products ─────────────────────────────────────────────────── */
  async getProducts(params = {}) {
    await _init();
    let prods = [..._catalog];
    if (params.cat)   prods = prods.filter(p => p.cat === params.cat);
    if (params.brand) prods = prods.filter(p => (p.brand||'').toLowerCase() === params.brand.toLowerCase());
    if (params.q) {
      const q = params.q.toLowerCase();
      prods = prods.filter(p =>
        (p.name  || '').toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q) ||
        (p.sku   || '').toLowerCase().includes(q) ||
        (p.oem   || '').toLowerCase().includes(q) ||
        (p.compat|| '').toLowerCase().includes(q)
      );
    }
    // Sort
    if (params.sort === 'price_asc')  prods.sort((a,b) => a.price - b.price);
    if (params.sort === 'price_desc') prods.sort((a,b) => b.price - a.price);
    if (params.sort === 'name_asc')   prods.sort((a,b) => a.name.localeCompare(b.name));
    if (params.sort === 'discount')   prods.sort((a,b) => {
      const dA = a.old ? (1-a.price/a.old) : 0;
      const dB = b.old ? (1-b.price/b.old) : 0;
      return dB - dA;
    });
    // In-stock first option
    if (params.inStockFirst) prods.sort((a,b) => (b.stock > 0 ? 1 : 0) - (a.stock > 0 ? 1 : 0));

    const page  = parseInt(params.page  || 1);
    const limit = parseInt(params.limit || 12);
    const total = prods.length;
    const items = prods.slice((page-1)*limit, page*limit);
    return { ok: true, total, page, pages: Math.ceil(total/limit), items };
  },

  async getProduct(id) {
    await _init();
    const p = _catalog.find(x => String(x.id) === String(id));
    if (!p) return { ok: false, error: 'Produsul nu a fost găsit.' };
    return { ok: true, product: p };
  },

  async getFeatured(limit = 8) {
    await _init();
    const hot  = _catalog.filter(p => p.badge === 'hot' && p.stock > 0).slice(0, 3);
    const sale = _catalog.filter(p => p.badge === 'sale' && p.stock > 0).slice(0, 3);
    const rest = _catalog.filter(p => !p.badge && p.stock > 0).slice(0, limit - hot.length - sale.length);
    return { ok: true, items: [...hot, ...sale, ...rest].slice(0, limit) };
  },

  async getCategories() {
    await _init();
    const counts = {};
    for (const p of _catalog) {
      if (p.stock > 0) counts[p.cat] = (counts[p.cat] || 0) + 1;
    }
    return { ok: true, categories: counts };
  },

  async getBrands(cat) {
    await _init();
    let prods = cat ? _catalog.filter(p => p.cat === cat) : _catalog;
    const brands = [...new Set(prods.map(p => p.brand).filter(Boolean))].sort();
    return { ok: true, brands };
  },

  // Force refresh from XML (ignore cache)
  async refresh() {
    sessionStorage.removeItem(_CACHE_KEY);
    _catalog = null;
    _ready   = null;
    return window.MotReady = _init().then(cat => {
      window.CATALOG = window._ALL_PRODS = cat;
      document.dispatchEvent(new CustomEvent('motoras:ready', { detail: { catalog: cat } }));
      return cat;
    });
  },

  /* ── Orders ───────────────────────────────────────────────────── */
  async createOrder(payload) {
    await _delay(80);
    const required = ['email','firstName','lastName','address','phone','items'];
    for (const f of required) {
      if (!payload[f] || (Array.isArray(payload[f]) && !payload[f].length))
        return { ok: false, error: `Câmpul '${f}' este obligatoriu.` };
    }
    const subtotal    = payload.items.reduce((s,i) => s + i.price * (i.qty||1), 0);
    const shippingCost= payload.shippingCost || 0;
    const order = {
      id          : _genId(),
      createdAt   : _now(),
      status      : 'pending',
      email       : payload.email,
      name        : `${payload.firstName} ${payload.lastName}`,
      phone       : payload.phone,
      address     : payload.address,
      county      : payload.county || '',
      city        : payload.city   || '',
      zip         : payload.zip    || '',
      shipping    : payload.shipping  || 'standard',
      payment     : payload.payment   || 'card',
      items       : payload.items,
      subtotal,
      shippingCost,
      total       : subtotal + shippingCost,
      notes       : payload.notes    || '',
      vehicle     : payload.vehicle  || null,
    };
    const orders = _readOrders();
    orders.unshift(order);
    _writeOrders(orders);
    localStorage.setItem(_LAST_ORDER, JSON.stringify(order));
    localStorage.setItem(_CART_KEY, '[]');
    return { ok: true, order };
  },

  async getOrders(params = {}) {
    let orders = _readOrders();
    if (params.status) orders = orders.filter(o => o.status === params.status);
    if (params.email)  orders = orders.filter(o => o.email  === params.email);
    const page  = parseInt(params.page  || 1);
    const limit = parseInt(params.limit || 20);
    return { ok: true, total: orders.length, items: orders.slice((page-1)*limit, page*limit) };
  },

  async getOrder(id) {
    const order = _readOrders().find(o => o.id === id);
    if (!order) return { ok: false, error: 'Comanda nu a fost găsită.' };
    return { ok: true, order };
  },

  async updateOrderStatus(id, status) {
    const valid = ['pending','processing','shipped','delivered','cancelled'];
    if (!valid.includes(status)) return { ok: false, error: 'Status invalid.' };
    const orders = _readOrders();
    const idx    = orders.findIndex(o => o.id === id);
    if (idx < 0) return { ok: false, error: 'Comanda nu există.' };
    orders[idx].status    = status;
    orders[idx].updatedAt = _now();
    _writeOrders(orders);
    return { ok: true, order: orders[idx] };
  },

  async ping() {
    await _delay(10);
    const src = _catalog ? (_catalog[0]?._source === 'xml' ? 'xml-live' : 'seed') : 'loading';
    return { ok: true, version: '2.0.0', env: 'browser-xml', source: src, time: _now() };
  },

  async seedOrders(n = 5) {
    await _init();
    const names    = ['Ion Popescu','Maria Ionescu','Andrei Constantin','Elena Dumitrescu','Radu Popa'];
    const statuses = ['pending','processing','shipped','delivered','delivered'];
    const counties = ['Bucuresti','Cluj','Timis','Iasi','Brasov'];
    const orders   = _readOrders();
    for (let i = 0; i < n; i++) {
      const items = _catalog.slice(i*2, i*2+2).map(p => ({ ...p, qty: 1 }));
      const order = {
        id         : 'ORD-' + (100001 + i),
        createdAt  : new Date(Date.now() - i * 86400000 * 2).toISOString(),
        status     : statuses[i % statuses.length],
        email      : 'client' + i + '@test.ro',
        name       : names[i % names.length],
        phone      : '07' + String(i).padStart(8,'2'),
        address    : 'Str. Test nr. ' + (i+1),
        county     : counties[i % counties.length],
        city       : counties[i % counties.length],
        zip        : '10000' + i,
        shipping   : i % 2 === 0 ? 'standard' : 'express',
        payment    : i % 3 === 0 ? 'card' : i % 3 === 1 ? 'ramburs' : 'op',
        items,
        subtotal   : items.reduce((s,x) => s + x.price, 0),
        shippingCost: i % 2 === 0 ? 0 : 25,
        total      : items.reduce((s,x) => s + x.price, 0) + (i % 2 === 0 ? 0 : 25),
        notes      : '',
        vehicle    : null,
      };
      if (!orders.find(o => o.id === order.id)) orders.unshift(order);
    }
    _writeOrders(orders);
    return { ok: true, seeded: n };
  },
};

/* ── Boot ────────────────────────────────────────────────────────── */
window.MotApi.ping().then(r => console.log('[MotApi]', r));
