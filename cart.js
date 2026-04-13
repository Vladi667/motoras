(function () {
  if (window.MotorasCart) return;

  const STORAGE_KEY = 'motoras_cart';
  const PLACEHOLDER_IMAGE = 'assets/product-placeholder.svg';
  let cart = [];
  let isBound = false;
  let emptyStateNode = null;
  const hooks = {
    afterAdd: null,
    afterRender: null,
    afterChange: null,
  };

  function normalizeItem(item) {
    const qty = Math.max(1, Math.trunc(Number(item && item.qty ? item.qty : 1)) || 1);
    const price = Number(item && item.price ? item.price : 0);
    const rawId = item && item.id != null && String(item.id).trim() ? String(item.id) : String(Date.now() + Math.random());
    return {
      id: rawId,
      name: String((item && item.name) || ''),
      brand: String((item && item.brand) || ''),
      img: String((item && item.img) || PLACEHOLDER_IMAGE),
      qty,
      price: Number.isFinite(price) ? price : 0,
    };
  }

  function cloneCart() {
    return cart.map((item) => ({ ...item }));
  }

  function getCart() {
    return cloneCart();
  }

  function loadCart() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeItem);
    } catch (error) {
      return [];
    }
  }

  function saveCart(nextCart) {
    if (Array.isArray(nextCart)) {
      cart = nextCart.map(normalizeItem);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    return cloneCart();
  }

  function syncCart() {
    cart = loadCart();
    return cloneCart();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function createCartItemElement(item) {
    const encodedId = encodeURIComponent(String(item.id));
    const image = item.img || PLACEHOLDER_IMAGE;

    const cartItem = document.createElement('div');
    cartItem.className = 'cart-item';

    const imageWrap = document.createElement('div');
    imageWrap.className = 'ci-img';
    const imageEl = document.createElement('img');
    imageEl.src = image;
    imageEl.alt = item.name;
    imageEl.onerror = function () {
      this.onerror = null;
      this.src = PLACEHOLDER_IMAGE;
    };
    imageWrap.appendChild(imageEl);

    const info = document.createElement('div');
    info.className = 'ci-info';

    const brand = document.createElement('div');
    brand.className = 'ci-brand';
    brand.textContent = item.brand;

    const name = document.createElement('div');
    name.className = 'ci-name';
    name.textContent = item.name;

    const row = document.createElement('div');
    row.className = 'ci-row';

    const qty = document.createElement('div');
    qty.className = 'ci-qty';

    const decrement = document.createElement('button');
    decrement.type = 'button';
    decrement.textContent = '-';
    decrement.setAttribute('data-cart-action', 'decrement');
    decrement.setAttribute('data-cart-id', encodedId);

    const qtyValue = document.createElement('span');
    qtyValue.textContent = String(item.qty);

    const increment = document.createElement('button');
    increment.type = 'button';
    increment.textContent = '+';
    increment.setAttribute('data-cart-action', 'increment');
    increment.setAttribute('data-cart-id', encodedId);

    qty.appendChild(decrement);
    qty.appendChild(qtyValue);
    qty.appendChild(increment);

    const price = document.createElement('span');
    price.className = 'ci-price';
    price.textContent = (item.price * item.qty).toLocaleString('ro-RO') + ' RON';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ci-remove';
    remove.setAttribute('data-cart-action', 'remove');
    remove.setAttribute('data-cart-id', encodedId);
    remove.innerHTML = '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4h6v2"></path></svg>';

    row.appendChild(qty);
    row.appendChild(price);
    row.appendChild(remove);

    info.appendChild(brand);
    info.appendChild(name);
    info.appendChild(row);

    cartItem.appendChild(imageWrap);
    cartItem.appendChild(info);
    return cartItem;
  }

  function updateBadge(count) {
    const badge = document.getElementById('cartBadge');
    const itemCount = document.getElementById('cartItemCount');
    if (badge) badge.textContent = count;
    if (itemCount) itemCount.textContent = count > 0 ? '(' + count + ')' : '';
  }

  function updateCart() {
    saveCart(cart);

    const container = document.getElementById('cartItems');
    const empty = emptyStateNode || document.getElementById('cartEmpty');
    if (!emptyStateNode && empty) emptyStateNode = empty;
    const footer = document.getElementById('cartFooter');
    const subtotal = document.getElementById('cartSubtotal');
    const totalEl = document.getElementById('cartTotal');
    const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const count = cart.reduce((sum, item) => sum + item.qty, 0);

    updateBadge(count);

    if (container && footer && subtotal && totalEl) {
      if (cart.length === 0) {
        if (empty) empty.style.display = 'flex';
        footer.style.display = 'none';
        if (empty) {
          container.replaceChildren(empty);
        } else {
          container.replaceChildren();
        }
      } else {
        if (empty) empty.style.display = 'none';
        footer.style.display = 'block';
        container.replaceChildren(...cart.map(function (item) {
          return createCartItemElement(item);
        }));
        subtotal.textContent = total.toLocaleString('ro-RO') + ' RON';
        totalEl.textContent = total.toLocaleString('ro-RO') + ' RON';
      }
    }

    if (typeof hooks.afterRender === 'function') hooks.afterRender(cloneCart());
    return cloneCart();
  }

  function bumpBadge() {
    const badge = document.getElementById('cartBadge');
    if (!badge) return;
    badge.classList.remove('bump');
    void badge.offsetWidth;
    badge.classList.add('bump');
    setTimeout(() => badge.classList.remove('bump'), 300);
  }

  function commit(kind, payload) {
    updateCart();
    if (kind === 'add' && typeof hooks.afterAdd === 'function') hooks.afterAdd(payload, cloneCart());
    if (typeof hooks.afterChange === 'function') hooks.afterChange(kind, cloneCart());
    return cloneCart();
  }

  function openCart() {
    syncCart();
    updateCart();
    const drawer = document.getElementById('cartDrawer');
    const overlay = document.getElementById('cartOverlay');
    if (drawer) drawer.classList.add('open');
    if (overlay) overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeCart() {
    const drawer = document.getElementById('cartDrawer');
    const overlay = document.getElementById('cartOverlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  function addToCart(name, brand, price, img, id) {
    syncCart();
    const cartId = id != null && String(id).trim() ? String(id) : String(Date.now());
    const existing = cart.find((item) => String(item.id) === cartId);
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push(normalizeItem({ name, brand, price, img, qty: 1, id: cartId }));
    }
    const addedItem = cart.find((item) => String(item.id) === cartId) || null;
    commit('add', addedItem ? { ...addedItem } : null);
    bumpBadge();
    openCart();
    return addedItem ? { ...addedItem } : null;
  }

  function removeFromCart(id) {
    syncCart();
    const nextCart = cart.filter((item) => String(item.id) !== String(id));
    cart = nextCart;
    commit('remove', { id: String(id) });
    return cloneCart();
  }

  function changeQty(id, delta) {
    syncCart();
    const item = cart.find((entry) => String(entry.id) === String(id));
    if (!item) return cloneCart();
    item.qty += Number(delta || 0);
    if (item.qty <= 0) {
      cart = cart.filter((entry) => String(entry.id) !== String(id));
    }
    commit('qty', { id: String(id), delta: Number(delta || 0) });
    return cloneCart();
  }

  function clearCart() {
    cart = [];
    commit('clear', null);
    return cloneCart();
  }

  function goCheckout() {
    syncCart();
    if (!cart.length) {
      openCart();
      return;
    }
    if (window.MotorasPageLoader?.navigate) {
      window.MotorasPageLoader.navigate('checkout.html');
      return;
    }
    window.location.href = 'checkout.html';
  }

  function bindEvents() {
    if (isBound) return;
    isBound = true;

    document.addEventListener('click', function (event) {
      const button = event.target.closest('[data-cart-action]');
      if (!button) return;
      const action = button.getAttribute('data-cart-action');
      const rawId = button.getAttribute('data-cart-id');
      const itemId = rawId ? decodeURIComponent(rawId) : '';
      if (action === 'increment') changeQty(itemId, 1);
      if (action === 'decrement') changeQty(itemId, -1);
      if (action === 'remove') removeFromCart(itemId);
    });

    window.addEventListener('pageshow', function () {
      syncCart();
      updateCart();
    });

    window.addEventListener('storage', function (event) {
      if (event.key !== STORAGE_KEY) return;
      syncCart();
      updateCart();
    });
  }

  function install(options) {
    const nextOptions = options || {};
    hooks.afterAdd = typeof nextOptions.afterAdd === 'function' ? nextOptions.afterAdd : hooks.afterAdd;
    hooks.afterRender = typeof nextOptions.afterRender === 'function' ? nextOptions.afterRender : hooks.afterRender;
    hooks.afterChange = typeof nextOptions.afterChange === 'function' ? nextOptions.afterChange : hooks.afterChange;
    emptyStateNode = document.getElementById('cartEmpty') || emptyStateNode;
    bindEvents();
    syncCart();
    updateCart();
    return api;
  }

  const api = {
    STORAGE_KEY,
    install,
    getCart,
    loadCart,
    saveCart,
    syncCart,
    updateCart,
    openCart,
    closeCart,
    addToCart,
    removeFromCart,
    changeQty,
    clearCart,
    goCheckout,
  };

  window.MotorasCart = api;
  window.openCart = openCart;
  window.closeCart = closeCart;
  window.addToCart = addToCart;
  window.removeFromCart = removeFromCart;
  window.changeQty = changeQty;
  window.updateCart = updateCart;
  window.goCheckout = goCheckout;
})();
