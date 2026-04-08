/**
 * MOTORAS catalog API backed by the supplier XML feed.
 * Orders remain stored in localStorage for the static storefront.
 */

const _delay = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));

const _ordersKey = 'motoras_orders';
const _cartKey = 'motoras_cart';
const _lastOrder = 'motoras_last_order';
const _feedCandidates = ['supplier-feed.xml', './supplier-feed.xml', '/supplier-feed.xml'];

const _readOrders = () => JSON.parse(localStorage.getItem(_ordersKey) || '[]');
const _writeOrders = orders => localStorage.setItem(_ordersKey, JSON.stringify(orders));

const _genId = () => 'ORD-' + Date.now().toString().slice(-7);
const _now = () => new Date().toISOString();

let _catalog = [];
let _catalogPromise = null;

function _decodeHtml(value) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value || '';
  return textarea.value.trim();
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
  const text = `${name} ${description}`.toLowerCase();
  if (/filtru|filtre/.test(text)) return 'filtre';
  if (/ambreiaj|volanta|volant|rulment presiune/.test(text)) return 'ambreiaje';
  if (/baterie|acumulator|agm|start stop/.test(text)) return 'baterii';
  if (/prelata|husa|hus[ăa]|cover|impermeabil/.test(text)) return 'prelate';
  if (/ulei|lubrifiant|lichid|spray|solutie|sampon|ceara|c[ea]r?u?ire|polish|pasta|dressing|degresant|aditiv|antigel/.test(text)) return 'uleiuri';
  return 'piese';
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
    Disponibilitate: product.stock > 0 ? 'In stoc' : 'La comanda',
  };
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
  const cat = _inferCategory(name, `${shortDescription} ${description}`);
  const badge = _inferBadge(stock, sku || name);
  const rating = 4 + (_hash(sku) % 2);
  const reviews = 12 + (_hash(name) % 190);
  const old = badge === 'sale' ? Math.round((price * 1.15) * 100) / 100 : null;

  return {
    id: sku,
    name,
    brand,
    cat,
    price,
    old,
    img: _decodeHtml(node.image?.textContent || node.image || ''),
    rating,
    reviews,
    badge,
    sku,
    stock,
    desc: description || shortDescription || name,
    eta: stock > 0 ? (stock > 5 ? 'Livrare 24-48h' : 'Stoc limitat, livrare rapida') : 'Disponibil la comanda',
    oem: sku,
    compat: shortDescription || 'Compatibilitate la cerere dupa cod produs.',
    specs: _buildSpecs({ sku, stock }, cat),
    vehicle: null,
  };
}

async function _fetchFeedText() {
  let lastError = null;
  for (const path of _feedCandidates) {
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Feed unavailable at ${path} (${response.status})`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Supplier feed could not be loaded.');
}

async function _ensureCatalog() {
  if (_catalog.length) return _catalog;
  if (_catalogPromise) return _catalogPromise;

  _catalogPromise = (async () => {
    const xmlText = await _fetchFeedText();
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    const parserError = xml.querySelector('parsererror');
    if (parserError) {
      throw new Error('Supplier feed XML is invalid.');
    }

    _catalog = Array.from(xml.querySelectorAll('products > product')).map(_mapProduct);
    return _catalog;
  })();

  try {
    return await _catalogPromise;
  } finally {
    _catalogPromise = null;
  }
}

window.MotApi = {
  async ready() {
    const items = await _ensureCatalog();
    return { ok: true, total: items.length };
  },

  async getCatalogSnapshot() {
    const items = await _ensureCatalog();
    return [...items];
  },

  async getProducts(params = {}) {
    await _delay();
    let items = [...await _ensureCatalog()];

    if (params.cat) items = items.filter(item => item.cat === params.cat);
    if (params.brand) items = items.filter(item => item.brand === params.brand);
    if (params.q) {
      const q = String(params.q).toLowerCase();
      items = items.filter(item =>
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q)
      );
    }

    if (params.sort === 'price_asc') items.sort((a, b) => a.price - b.price);
    if (params.sort === 'price_desc') items.sort((a, b) => b.price - a.price);

    const page = Math.max(1, parseInt(params.page || 1, 10));
    const limit = Math.max(1, parseInt(params.limit || 12, 10));
    const total = items.length;
    const start = (page - 1) * limit;

    return {
      ok: true,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      items: items.slice(start, start + limit),
    };
  },

  async getProduct(id) {
    await _delay(20);
    const product = (await _ensureCatalog()).find(item => item.id === id);
    if (!product) return { ok: false, error: 'Produsul nu a fost gasit.' };
    return { ok: true, product };
  },

  async getFeatured(limit = 8) {
    await _delay(20);
    const items = [...await _ensureCatalog()]
      .filter(item => item.stock > 0)
      .sort((a, b) => {
        const scoreA = (a.badge ? 10 : 0) + a.reviews;
        const scoreB = (b.badge ? 10 : 0) + b.reviews;
        return scoreB - scoreA;
      })
      .slice(0, limit);

    return { ok: true, items };
  },

  async createOrder(payload) {
    await _delay(120);
    const required = ['email', 'firstName', 'lastName', 'address', 'phone', 'items'];
    for (const field of required) {
      if (!payload[field] || (Array.isArray(payload[field]) && !payload[field].length)) {
        return { ok: false, error: `Campul '${field}' este obligatoriu.` };
      }
    }

    const order = {
      id: _genId(),
      createdAt: _now(),
      status: 'pending',
      email: payload.email,
      name: `${payload.firstName} ${payload.lastName}`,
      phone: payload.phone,
      address: payload.address,
      county: payload.county || '',
      city: payload.city || '',
      zip: payload.zip || '',
      shipping: payload.shipping || 'standard',
      payment: payload.payment || 'card',
      items: payload.items,
      subtotal: payload.items.reduce((sum, item) => sum + item.price * item.qty, 0),
      shippingCost: payload.shippingCost || 0,
      total: payload.items.reduce((sum, item) => sum + item.price * item.qty, 0) + (payload.shippingCost || 0),
      notes: payload.notes || '',
      vehicle: payload.vehicle || null,
    };

    const orders = _readOrders();
    orders.unshift(order);
    _writeOrders(orders);
    localStorage.setItem(_lastOrder, JSON.stringify(order));
    localStorage.setItem(_cartKey, '[]');

    return { ok: true, order };
  },

  async getOrders(params = {}) {
    await _delay(50);
    let items = _readOrders();
    if (params.status) items = items.filter(order => order.status === params.status);
    if (params.email) items = items.filter(order => order.email === params.email);
    const page = Math.max(1, parseInt(params.page || 1, 10));
    const limit = Math.max(1, parseInt(params.limit || 20, 10));
    return { ok: true, total: items.length, items: items.slice((page - 1) * limit, page * limit) };
  },

  async getOrder(id) {
    await _delay(30);
    const order = _readOrders().find(item => item.id === id);
    if (!order) return { ok: false, error: 'Comanda nu a fost gasita.' };
    return { ok: true, order };
  },

  async updateOrderStatus(id, status) {
    await _delay(60);
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) return { ok: false, error: 'Status invalid.' };

    const orders = _readOrders();
    const index = orders.findIndex(order => order.id === id);
    if (index < 0) return { ok: false, error: 'Comanda nu exista.' };

    orders[index].status = status;
    orders[index].updatedAt = _now();
    _writeOrders(orders);
    return { ok: true, order: orders[index] };
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
    const counties = ['Bucuresti', 'Cluj', 'Timis', 'Iasi', 'Brasov'];
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
        payment: i % 3 === 0 ? 'card' : i % 3 === 1 ? 'ramburs' : 'op',
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
