(function () {
  const STORAGE_KEY = 'motoras_favorites_v1';

  const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));

  function loadFavorites() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function saveFavorites(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return items;
  }

  function normalizeProduct(product) {
    return {
      id: String(product?.id || product?.sku || '').trim(),
      name: String(product?.name || '').trim(),
      brand: String(product?.brand || '').trim(),
      price: Number(product?.price || 0),
      img: String(product?.img || 'assets/product-placeholder.svg').trim() || 'assets/product-placeholder.svg',
      addedAt: new Date().toISOString(),
    };
  }

  function findFavoriteIndex(items, id) {
    const normalizedId = String(id || '').trim();
    return items.findIndex((item) => String(item?.id || '').trim() === normalizedId);
  }

  function isFavorite(id) {
    return findFavoriteIndex(loadFavorites(), id) !== -1;
  }

  function setButtonState(button, active) {
    if (!button) return;
    button.classList.toggle('wished', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    const icon = button.querySelector('svg');
    if (icon) {
      icon.style.fill = active ? 'var(--red)' : 'none';
      icon.style.color = active ? 'var(--red)' : '#ccc';
    }
  }

  function syncButtons(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('.prod-wish[data-product-id]').forEach((button) => {
      setButtonState(button, isFavorite(button.dataset.productId));
    });
    updateFavoritesUI();
  }

  function openFavorites() {
    const overlay = document.getElementById('favoritesOverlay');
    const drawer = document.getElementById('favoritesDrawer');
    if (!overlay || !drawer) return;
    if (typeof window.closeCart === 'function') window.closeCart();
    if (typeof window.closeMobNav === 'function') window.closeMobNav();
    overlay.classList.add('open');
    drawer.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeFavorites() {
    const overlay = document.getElementById('favoritesOverlay');
    const drawer = document.getElementById('favoritesDrawer');
    if (!overlay || !drawer) return;
    overlay.classList.remove('open');
    drawer.classList.remove('open');
    document.body.style.overflow = '';
  }

  function renderFavoritesItems(items) {
    const container = document.getElementById('favoritesItems');
    const empty = document.getElementById('favoritesEmpty');
    const footer = document.getElementById('favoritesFooter');
    const count = document.getElementById('favoritesItemCount');
    const badge = document.getElementById('favBadge');

    if (count) count.textContent = items.length ? `(${items.length})` : '';
    if (badge) badge.textContent = String(items.length);
    if (badge) badge.style.display = items.length ? 'flex' : 'none';
    if (!container) return;

    if (!items.length) {
      container.innerHTML = empty ? empty.outerHTML : '';
      if (footer) footer.style.display = 'none';
      return;
    }

    container.innerHTML = items.map((item) => `
      <div class="fav-item">
        <a class="fav-item-media" href="product.html?id=${encodeURIComponent(item.id)}">
          <img src="${escapeHtml(item.img)}" alt="${escapeHtml(item.name)}" onerror="this.src='assets/product-placeholder.svg'"/>
        </a>
        <div class="fav-item-body">
          <a class="fav-item-name" href="product.html?id=${encodeURIComponent(item.id)}">${escapeHtml(item.name)}</a>
          <div class="fav-item-brand">${escapeHtml(item.brand || 'Motoraș')}</div>
          <div class="fav-item-price">${Number(item.price || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON</div>
          <div class="fav-item-actions">
            <button type="button" class="fav-action-btn" data-favorite-action="add-to-cart" data-favorite-id="${escapeHtml(item.id)}">Adaugă în coș</button>
            <button type="button" class="fav-action-link" data-favorite-action="remove" data-favorite-id="${escapeHtml(item.id)}">Șterge</button>
          </div>
        </div>
      </div>
    `).join('');

    if (footer) footer.style.display = 'block';
  }

  function updateFavoritesUI() {
    renderFavoritesItems(loadFavorites());
  }

  function toggleFavorite(product) {
    const favorite = normalizeProduct(product);
    if (!favorite.id) return { ok: false, added: false, items: loadFavorites() };

    const items = loadFavorites();
    const index = findFavoriteIndex(items, favorite.id);
    let added = false;

    if (index === -1) {
      items.unshift(favorite);
      added = true;
    } else {
      items.splice(index, 1);
    }

    const next = saveFavorites(items.slice(0, 200));
    syncButtons(document);
    window.dispatchEvent(new CustomEvent('motoras:favorites-changed', {
      detail: { added, product: favorite, items: next },
    }));
    return { ok: true, added, items: next, product: favorite };
  }

  window.MotorasFavorites = {
    STORAGE_KEY,
    loadFavorites,
    saveFavorites,
    isFavorite,
    toggleFavorite,
    syncButtons,
    setButtonState,
    openFavorites,
    closeFavorites,
    updateFavoritesUI,
  };

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-favorites-open]');
    if (trigger) {
      event.preventDefault();
      openFavorites();
      return;
    }

    const action = event.target.closest('[data-favorite-action]');
    if (!action) return;
    event.preventDefault();
    const id = action.dataset.favoriteId;
    const items = loadFavorites();
    const favorite = items.find((item) => String(item.id) === String(id));
    if (!favorite) return;

    if (action.dataset.favoriteAction === 'remove') {
      toggleFavorite(favorite);
      return;
    }

    if (action.dataset.favoriteAction === 'add-to-cart' && typeof window.addToCart === 'function') {
      window.addToCart(favorite.name, favorite.brand, favorite.price, favorite.img, favorite.id);
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      syncButtons(document);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeFavorites();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => syncButtons(document), { once: true });
  } else {
    syncButtons(document);
  }
})();
