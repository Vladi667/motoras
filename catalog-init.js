/**
 * catalog-init.js — Page hydration patch
 * ──────────────────────────────────────────────────────────────────
 * Include AFTER api.js on every page.
 * Waits for MotReady, then:
 *   1. Overwrites window.CATALOG & window._ALL_PRODS with live data
 *   2. Re-renders any product grids that were painted from the stale
 *      hardcoded catalog baked into the HTML.
 *   3. Handles product.html — reloads the current product if needed.
 * ──────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ── Detect current page ─────────────────────────────────────── */
  const path = location.pathname;
  const isIndex    = path === '/' || path.endsWith('index.html') || path === '';
  const isCategory = path.includes('category.html');
  const isProduct  = path.includes('product.html');
  const isSearch   = path.includes('search.html');

  /* ── Wait for catalog then hydrate ──────────────────────────── */
  window.MotReady.then(function (catalog) {
    // Always keep globals fresh
    window.CATALOG    = catalog;
    window._ALL_PRODS = catalog;

    /* ── index.html: re-render featured products grid ─────────── */
    if (isIndex) {
      const grid = document.getElementById('productsGrid');
      if (grid && typeof _buildCard === 'function') {
        // Re-run the active filter tab
        const activeBtn = document.querySelector('.filter-tab.active, [data-cat].active');
        if (activeBtn) {
          const cat = activeBtn.dataset?.cat || 'all';
          const prods = cat === 'all'
            ? catalog.filter(p => p.stock >= 0).slice(0, 8)
            : catalog.filter(p => p.cat === cat).slice(0, 8);
          grid.innerHTML = prods.map(_buildCard).join('');
        } else {
          const prods = catalog.slice(0, 8);
          grid.innerHTML = prods.map(_buildCard).join('');
        }
      }
    }

    /* ── product.html: reload product from live catalog ──────── */
    if (isProduct) {
      const params = new URLSearchParams(location.search);
      const id     = params.get('id');
      if (id) {
        const p = catalog.find(x => String(x.id) === String(id));
        if (p) {
          // Update title, price, stock badge, description if elements exist
          const priceEl = document.querySelector('.price-main, [data-live="price"]');
          const stockEl = document.querySelector('.stk-badge, [data-live="stock"]');
          const descEl  = document.querySelector('[data-live="desc"], .prod-desc-text');
          if (priceEl) priceEl.textContent = p.price.toLocaleString('ro-RO') + ' RON';
          if (stockEl) {
            if (p.stock > 10)     { stockEl.textContent = '✓ În stoc'; stockEl.className = stockEl.className.replace(/\bout\b|\blow\b/, 'ok'); }
            else if (p.stock > 0) { stockEl.textContent = `⚠ Doar ${p.stock} rămase`; }
            else                  { stockEl.textContent = '✗ Epuizat'; }
          }
          if (descEl) descEl.textContent = p.desc || '';
        }
      }
    }

    /* ── category.html: if page has a renderProducts function, call it ─ */
    if (isCategory && typeof window.renderProducts === 'function') {
      window.renderProducts();
    }

    /* ── search.html: if page has a runSearch function, call it ── */
    if (isSearch && typeof window.runSearch === 'function') {
      window.runSearch();
    }

    console.log('[catalog-init] Hydrated', catalog.length, 'products into page');
  });

})();
