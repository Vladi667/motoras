
window.MotorasHome = (() => {
  const badgeMeta = {
    hot: { cls: 'badge-hot', label: '🔥 Popular' },
    new: { cls: 'badge-new', label: 'Nou' },
    sale: { cls: 'badge-sale', label: null }
  };

  const stars = rating => {
    const full = Math.max(0, Math.min(5, Number(rating || 0)));
    return '<div class="stars">' + Array.from({length:5}, (_,i)=>`<div class="star${i < full ? '' : ' e'}"></div>`).join('') + '</div>';
  };

  const formatPrice = value => `${Number(value || 0).toLocaleString('ro-RO')} RON`;

  function renderFeaturedProducts() {
    const grid = document.getElementById('productsGrid');
    if (!grid || !window.MotorasCatalog) return;
    const products = (window.MotorasCatalog.featured ? window.MotorasCatalog.featured(8) : window.MotorasCatalog.products.slice(0, 8));
    if (!products.length) { grid.innerHTML = '<div style="grid-column:1/-1;padding:24px;border:1px dashed #ddd;border-radius:16px;text-align:center;color:#666">Catalogul demo este gol.</div>'; return; }
    grid.innerHTML = products.map(product => {
      const badge = product.badge ? badgeMeta[product.badge] : null;
      const discount = product.old ? Math.round((1 - product.price / product.old) * 100) : null;
      return `
      <div class="prod-card">
        ${badge ? `<span class="prod-badge ${badge.cls}">${badge.label || `-${discount}%`}</span>` : ''}
        <button class="prod-wish" type="button" aria-label="Adaugă la favorite"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></button>
        <a class="prod-img" href="product.html?id=${product.id}"><img src="${product.img}" alt="${product.name}" loading="lazy"/></a>
        <div class="prod-body">
          <div class="prod-brand">${product.brand}</div>
          <div class="prod-name">${product.name}</div>
          <div class="prod-stars">${stars(product.rating)}<span class="prod-rating">(${product.reviews || 0})</span></div>
          <div class="prod-pricing"><span class="prod-price">${formatPrice(product.price)}</span>${product.old ? `<span class="prod-old">${formatPrice(product.old)}</span><span class="prod-save">-${discount}%</span>` : ''}</div>
          <button class="btn-add" type="button" onclick="addToCart(${JSON.stringify(product.name)},${JSON.stringify(product.brand)},${Number(product.price)},${JSON.stringify(product.img)},${JSON.stringify(product.id)})">
            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
            Adaugă în coș
          </button>
        </div>
      </div>`;
    }).join('');
  }

  function updateCategoryCounts() {
    if (!window.MotorasCatalog) return;
    document.querySelectorAll('.cat-card[href*="category.html?cat="]').forEach(link => {
      const match = link.getAttribute('href').match(/cat=([^&]+)/);
      if (!match) return;
      const cat = decodeURIComponent(match[1]);
      const count = window.MotorasCatalog.byCategory(cat).length;
      const countEl = link.querySelector('.cat-count');
      if (countEl) countEl.textContent = `${count}+ produse`; 
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderFeaturedProducts();
    updateCategoryCounts();
  });

  return { renderFeaturedProducts, updateCategoryCounts };
})();
