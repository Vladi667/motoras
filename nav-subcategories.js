(function () {
  const MAX_ITEMS = 7;
  const VIEWPORT_PADDING = 14;
  const COPY = {
    piese: {
      title: 'Piese Auto',
    },
    accesorii: {
      title: 'Accesorii Auto',
    },
    detailing: {
      title: 'Detailing',
    },
    baterii: {
      title: 'Baterii \u0219i Acumulatori',
    },
    uleiuri: {
      title: 'Uleiuri',
    },
    filtre: {
      title: 'Filtre',
    },
    prelate: {
      title: 'Prelate',
    },
    ambreiaje: {
      title: 'Ambreiaje',
    },
  };

  function parseCategoryFromHref(href) {
    try {
      const url = new URL(href, window.location.href);
      return url.searchParams.get('cat') || '';
    } catch (error) {
      return '';
    }
  }

  function formatCount(value) {
    const count = Number(value || 0);
    return count.toLocaleString('ro-RO');
  }

  function buildDesktopDropdownHtml(category, items) {
    const meta = COPY[category] || {
      title: 'Subcategorii',
    };
    const limited = items.slice(0, MAX_ITEMS);
    const hiddenCount = Math.max(0, items.length - limited.length);
    const totalCount = items.reduce((sum, item) => sum + Number(item.count || 0), 0);
    const cards = limited.map((item) => {
      const href = `category.html?cat=${encodeURIComponent(category)}&subcat=${encodeURIComponent(item.key)}`;
      return `
        <a class="nav-subcat-row" href="${href}">
          <span class="nav-subcat-name">${item.label}</span>
          <span class="nav-subcat-badge">${formatCount(item.count)}</span>
        </a>`;
    }).join('');

    return `
      <div class="nav-drop nav-mega" role="menu" aria-label="${meta.title}">
        <div class="nav-mega-head">
          <div class="nav-mega-title-group">
            <strong class="nav-mega-title">${meta.title}</strong>
            <span class="nav-mega-total">${formatCount(totalCount)} produse</span>
          </div>
        </div>
        <div class="nav-mega-list">
          ${cards}
        </div>
        <div class="nav-mega-foot">
          <a class="nav-mega-all" href="category.html?cat=${encodeURIComponent(category)}">
            <span>Vezi toată categoria</span>
            <span class="nav-mega-all-arrow">→</span>
          </a>
          ${hiddenCount ? `<div class="nav-mega-more">+ ${hiddenCount}</div>` : ''}
        </div>
      </div>`;
  }

  function ensureNavItemWrapper(link) {
    const existing = link.parentElement;
    if (existing && existing.classList.contains('nav-item')) return existing;

    const wrapper = document.createElement('div');
    wrapper.className = 'nav-item';
    link.parentNode.insertBefore(wrapper, link);
    wrapper.appendChild(link);
    return wrapper;
  }

  function positionDesktopDropdowns() {
    if (window.innerWidth <= 900) return;

    document.querySelectorAll('.nav-item.has-drop').forEach((wrapper) => {
      const drop = wrapper.querySelector('.nav-mega');
      if (!drop) return;

      const preferredWidth = Math.min(360, Math.max(290, window.innerWidth * 0.28));
      const width = Math.min(preferredWidth, window.innerWidth - (VIEWPORT_PADDING * 2));
      const wrapperRect = wrapper.getBoundingClientRect();
      const preferredLeft = wrapperRect.left + (wrapperRect.width / 2) - (width / 2);
      const boundedLeft = Math.min(
        Math.max(preferredLeft, VIEWPORT_PADDING),
        window.innerWidth - width - VIEWPORT_PADDING
      );
      const localLeft = boundedLeft - wrapperRect.left;
      const arrowLeft = Math.min(width - 26, Math.max(26, (wrapperRect.width / 2) - localLeft));

      drop.style.width = `${width}px`;
      drop.style.left = `${localLeft}px`;
      drop.style.setProperty('--nav-mega-arrow-left', `${arrowLeft}px`);
    });
  }

  async function attachDesktopSubcategories() {
    if (!window.MotApi || !document.querySelector('.navbar-in')) return;

    await window.MotApi.ready();
    const navLinks = Array.from(document.querySelectorAll('.navbar-in > .nav-link[href*="category.html?cat="]'));

    await Promise.all(navLinks.map(async (link) => {
      if (link.dataset.subcatsReady === '1') return;
      const category = parseCategoryFromHref(link.getAttribute('href') || '');
      if (!category) return;

      const response = await window.MotApi.getSubcategories(category);
      const items = (response?.ok ? response.items : []).filter((item) => Number(item.count || 0) > 0);
      if (!items.length) {
        link.dataset.subcatsReady = '1';
        return;
      }

      const wrapper = ensureNavItemWrapper(link);
      wrapper.classList.add('has-drop');
      wrapper.insertAdjacentHTML('beforeend', buildDesktopDropdownHtml(category, items));
      link.dataset.subcatsReady = '1';
    }));

    positionDesktopDropdowns();
  }

  async function attachMobileSubcategories() {
    if (!window.MotApi || !document.querySelector('.mob-nav-inner')) return;

    await window.MotApi.ready();
    const mobileLinks = Array.from(document.querySelectorAll('.mob-nav a[href*="category.html?cat="]'));

    await Promise.all(mobileLinks.map(async (link) => {
      if (link.dataset.subcatsReady === '1') return;
      const category = parseCategoryFromHref(link.getAttribute('href') || '');
      if (!category) return;

      const response = await window.MotApi.getSubcategories(category);
      const items = (response?.ok ? response.items : []).filter((item) => Number(item.count || 0) > 0).slice(0, 5);
      if (!items.length) {
        link.dataset.subcatsReady = '1';
        return;
      }

      const wrap = document.createElement('div');
      wrap.className = 'mob-subcat-row';
      wrap.innerHTML = items.map((item) => {
        const href = `category.html?cat=${encodeURIComponent(category)}&subcat=${encodeURIComponent(item.key)}`;
        return `<a href="${href}" class="mob-subcat-chip">${item.label}</a>`;
      }).join('');

      link.insertAdjacentElement('afterend', wrap);
      link.dataset.subcatsReady = '1';
    }));
  }

  async function init() {
    await attachDesktopSubcategories();
    await attachMobileSubcategories();
    positionDesktopDropdowns();
    window.addEventListener('resize', positionDesktopDropdowns, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
