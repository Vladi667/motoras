window.MotorasRender = (() => {
  const formatPrice = value => `${Number(value || 0).toLocaleString('ro-RO')} RON`;
  const stars = rating => '<div class="stars">' + Array.from({length:5}, (_,i)=>`<div class="star${i < Number(rating || 0) ? '' : ' e'}"></div>`).join('') + '</div>';
  const stockLabel = stock => {
    if (Number(stock || 0) > 10) return '<span class="stock ok">&#10003; În stoc</span>';
    if (Number(stock || 0) > 0) return `<span class="stock low">&#9888; Doar ${Number(stock)} rămase</span>`;
    return '<span class="stock out">&#10007; Epuizat</span>';
  };
  const badge = product => {
    if (!product.badge) return '';
    if (product.badge === 'hot') return '<span class="prod-badge badge-hot">🔥 Popular</span>';
    if (product.badge === 'new') return '<span class="prod-badge badge-new">Nou</span>';
    if (product.badge === 'sale') {
      const discount = product.old ? Math.round((1 - product.price / product.old) * 100) : 0;
      return `<span class="prod-badge badge-sale">-${discount}%</span>`;
    }
    return '';
  };
  const productCard = product => {
    const discount = product.old ? Math.round((1 - product.price / product.old) * 100) : null;
    return `
      <article class="motoras-card">
        ${badge(product)}
        <a class="motoras-card__img" href="product.html?id=${product.id}">
          <img src="${product.img}" alt="${product.name}" loading="lazy"/>
        </a>
        <div class="motoras-card__body">
          <div class="motoras-card__brand">${product.brand}</div>
          <a class="motoras-card__name" href="product.html?id=${product.id}">${product.name}</a>
          <div class="motoras-card__rating">${stars(product.rating)}<span>(${product.reviews || 0})</span></div>
          <div class="motoras-card__pricing">
            <span class="motoras-card__price">${formatPrice(product.price)}</span>
            ${product.old ? `<span class="motoras-card__old">${formatPrice(product.old)}</span><span class="motoras-card__save">-${discount}%</span>` : ''}
          </div>
          ${stockLabel(product.stock)}
          <button class="motoras-card__cta" type="button" onclick="window.MotorasShop.addCatalogProduct('${product.id}')">Adaugă în coș</button>
        </div>
      </article>`;
  };
  return { formatPrice, stars, stockLabel, productCard };
})();
