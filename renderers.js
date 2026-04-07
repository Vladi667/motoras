
window.MotorasPhasePlus = (() => {
  function fitmentMarkup() {
    const vehicle = window.MotorasStore?.getVehicle?.() || {};
    const brands = Object.keys(window.MotorasCatalog?.vehicles || {});
    const models = vehicle.brand ? (window.MotorasCatalog.modelsForBrand(vehicle.brand) || []) : [];
    const years = vehicle.brand && vehicle.model ? (window.MotorasCatalog.yearsForModel(vehicle.brand, vehicle.model) || []) : [];
    return `
      <section class="fitment-bar" id="fitmentBar">
        <div class="fitment-bar__title"><strong>Selectează mașina</strong><span>Salvează mașina ta și vezi rapid produsele potrivite pentru ea.</span></div>
        <select id="fitBrand"><option value="">Marcă</option>${brands.map(b=>`<option ${vehicle.brand===b?'selected':''}>${b}</option>`).join('')}</select>
        <select id="fitModel"><option value="">Model</option>${models.map(m=>`<option ${vehicle.model===m?'selected':''}>${m}</option>`).join('')}</select>
        <select id="fitYear"><option value="">An</option>${years.map(y=>`<option ${vehicle.year===y?'selected':''}>${y}</option>`).join('')}</select>
        <input id="fitEngine" placeholder="Motorizare" value="${vehicle.engine || ''}" />
        <button type="button" id="fitApply">Aplică</button>
        <button type="button" class="secondary" id="fitClear">Resetează</button>
        <div class="fitment-pills">${vehicle.brand ? `<span class="fitment-pill">Vehicul salvat: ${vehicle.brand} ${vehicle.model || ''} ${vehicle.year || ''} ${vehicle.engine || ''}</span>` : '<span class="fitment-pill">Niciun vehicul salvat</span>'}</div>
      </section>`;
  }
  function injectFitmentBar() {
    if (!window.MotorasCatalog || !window.MotorasStore) return;
    const body = document.body;
    const isStorePage = ['index.html','category.html','search.html','product.html','account.html'].some(n => location.pathname.endsWith('/'+n) || location.pathname.endsWith(n) || (location.pathname==='/'&&n==='index.html'));
    if (!isStorePage) return;
    if (document.getElementById('fitmentBar')) return;
    const header = document.querySelector('.navbar, .breadcrumb, .steps, .content');
    if (!header || !header.parentElement) return;
    header.insertAdjacentHTML('afterend', fitmentMarkup());
    bindFitmentControls();
  }
  function bindFitmentControls() {
    const brand = document.getElementById('fitBrand');
    const model = document.getElementById('fitModel');
    const year = document.getElementById('fitYear');
    const engine = document.getElementById('fitEngine');
    if (!brand) return;
    brand.onchange = () => {
      const models = window.MotorasCatalog.modelsForBrand(brand.value) || [];
      model.innerHTML = '<option value="">Model</option>' + models.map(m=>`<option>${m}</option>`).join('');
      year.innerHTML = '<option value="">An</option>';
    };
    model.onchange = () => {
      const years = window.MotorasCatalog.yearsForModel(brand.value, model.value) || [];
      year.innerHTML = '<option value="">An</option>' + years.map(y=>`<option>${y}</option>`).join('');
    };
    document.getElementById('fitApply').onclick = () => {
      const vehicle = { brand: brand.value, model: model.value, year: year.value, engine: engine.value.trim() };
      if (!vehicle.brand) return alert('Selectează cel puțin marca mașinii.');
      window.MotorasStore.saveVehicle(vehicle);
      alert(`Vehicul salvat: ${vehicle.brand} ${vehicle.model || ''} ${vehicle.year || ''} ${vehicle.engine || ''}`.trim());
      location.reload();
    };
    document.getElementById('fitClear').onclick = () => { window.MotorasStore.clearVehicle(); location.reload(); };
  }
  function injectHomeMerch() {
    if (!location.pathname.endsWith('index.html') && location.pathname !== '/' && !location.pathname.endsWith('/')) return;
    const grid = document.getElementById('productsGrid');
    if (!grid || document.getElementById('brandStrip')) return;
    const brands = window.MotorasCatalog.brands().slice(0,8);
    grid.insertAdjacentHTML('beforebegin', `<section class="premium-strip"><div class="premium-item"><strong>Livrare rapidă</strong><span>Expediere rapidă pentru produsele aflate în stoc.</span></div><div class="premium-item"><strong>Verificare OEM</strong><span>Poți verifica rapid compatibilitatea după marcă, model și motorizare.</span></div><div class="premium-item"><strong>Suport tehnic</strong><span>Consultanță pentru identificarea corectă a pieselor înainte de comandă.</span></div><div class="premium-item"><strong>Retur simplu</strong><span>Proces simplu de comandă, confirmare și retur.</span></div></section><section class="brand-strip" id="brandStrip"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><strong style="font-family:'Barlow Condensed',sans-serif;font-size:24px;text-transform:uppercase">Branduri populare</strong><div style="color:#666;font-size:13px">Selecție variată de branduri și produse populare</div></div><a href="search.html?q=bosch" class="motoras-chip">Vezi tot catalogul</a></div><div class="brand-strip__grid">${brands.map(b=>`<a class="brand-pill" href="search.html?q=${encodeURIComponent(b)}">${b}</a>`).join('')}</div></section>`);
    const vehicle = window.MotorasStore.getVehicle();
    const recs = vehicle ? window.MotorasCatalog.productsForVehicle(vehicle).slice(0,4) : window.MotorasCatalog.featured(4);
    grid.insertAdjacentHTML('afterend', `<section class="reco-section" id="recoSection"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><strong style="font-family:'Barlow Condensed',sans-serif;font-size:24px;text-transform:uppercase">${vehicle ? 'Recomandate pentru ' + vehicle.brand + ' ' + (vehicle.model || '') : 'Produse recomandate'}</strong><div style="color:#666;font-size:13px">Recomandări rapide pe baza mașinii salvate sau a produselor populare.</div></div>${vehicle ? '<span class="motoras-chip">Vehicul salvat</span>' : ''}</div><div class="reco-grid">${recs.map(window.MotorasRender.productCard).join('')}</div></section>`);
  }
  function enhanceProductPage() {
    const prodTitle = document.getElementById('prodTitle');
    if (!prodTitle || !window.MotorasCatalog) return;
    const pid = new URLSearchParams(location.search).get('id') || 'p1';
    const prod = window.MotorasCatalog.getProductById(pid);
    if (!prod || document.getElementById('phasePlusProduct')) return;
    const target = document.getElementById('tp-spec');
    if (target) {
      target.insertAdjacentHTML('beforeend', `<div id="phasePlusProduct"><div class="spec-table">${Object.entries({SKU:prod.sku,'Cod OEM':prod.oem || 'La cerere','ETA':prod.eta || '24-48h','Brand':prod.brand,'Stoc':prod.stock + ' buc.','Vehicul recomandat':`${prod.vehicle?.brand || '-'} ${prod.vehicle?.model || ''}`.trim()}).map(([k,v])=>`<div class="spec-row"><span>${k}</span><span>${v}</span></div>`).join('')}</div><div class="product-faq"><div class="faq-itemx"><strong>Se potrivește după VIN?</strong><span>Compatibilitatea se verifică orientativ după marca, modelul și motorizarea selectate. Pentru confirmare finală, verifică și codul OEM sau VIN-ul.</span></div><div class="faq-itemx"><strong>Cât durează livrarea?</strong><span>${prod.eta || '24-48h'} pentru produsele aflate în stoc.</span></div><div class="faq-itemx"><strong>Pot returna produsul?</strong><span>Da, produsele pot fi returnate conform politicii de retur afișate pe site.</span></div></div></div>`);
    }
    const vehicle = window.MotorasStore.getVehicle();
    const compatBox = document.getElementById('tp-compat');
    if (vehicle && compatBox) {
      const ok = (prod.compat || '').toLowerCase().includes((vehicle.brand || '').toLowerCase()) || (prod.vehicle?.brand || '').toLowerCase() === (vehicle.brand || '').toLowerCase();
      compatBox.insertAdjacentHTML('afterbegin', `<div class="vehicle-warning" style="background:${ok?'#edf9f0':'#fff8e8'};border-color:${ok?'#b8e0c0':'#f3d28c'};color:${ok?'#176234':'#7a4a00'}">${ok ? '✔ Compatibilitate estimată pozitiv cu vehiculul salvat: ' : '⚠ Compatibilitatea trebuie verificată suplimentar pentru vehiculul salvat: '}${vehicle.brand} ${vehicle.model || ''} ${vehicle.year || ''} ${vehicle.engine || ''}</div>`);
    }
  }
  function enhanceAccountPage() {
    const dash = document.getElementById('accountDash');
    if (!dash || document.getElementById('garageCardX')) return;
    const vehicle = window.MotorasStore?.getVehicle?.();
    const orders = JSON.parse(localStorage.getItem('motoras_orders') || '[]');
    const panel = document.getElementById('panel-profile');
    if (panel) {
      panel.insertAdjacentHTML('afterbegin', `<div class="garage-card" id="garageCardX"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><strong style="font-family:'Barlow Condensed',sans-serif;font-size:22px;text-transform:uppercase">Garage-ul meu</strong><div style="font-size:13px;color:#666">Păstrează mașina salvată pentru recomandări și căutări mai rapide.</div></div><a href="search.html?q=${encodeURIComponent(vehicle?.brand || 'bosch')}" class="motoras-chip">Vezi produse compatibile</a></div><div class="garage-vehicle">${vehicle ? `<div><strong>${vehicle.brand} ${vehicle.model || ''}</strong><div style="font-size:13px;color:#666">${vehicle.year || ''} · ${vehicle.engine || 'motorizare necompletată'}</div></div><button class="motoras-card__cta" style="max-width:180px" onclick="window.MotorasStore.clearVehicle();location.reload()">Șterge vehiculul</button>` : `<div><strong>Niciun vehicul salvat</strong><div style="font-size:13px;color:#666">Folosește selectorul de sus pentru a salva mașina ta.</div></div>`}</div><div style="margin-top:14px"><strong style="font-family:'Barlow Condensed',sans-serif;font-size:20px;text-transform:uppercase">Comenzi recente locale</strong><div class="order-card-list" style="margin-top:10px">${orders.slice(0,3).map(o=>`<div class="order-card"><div><strong>${o.id}</strong><div style="font-size:13px;color:#666">${o.products}</div></div><div><div style="font-weight:800">${window.MotorasStore.formatPrice(o.total)}</div><a href="confirmation.html" class="motoras-chip">Vezi status</a></div></div>`).join('') || '<div class="order-card"><div><strong>Nu ai încă nicio comandă înregistrată.</strong><div style="font-size:13px;color:#666">După ce finalizezi o comandă, o vei vedea aici.</div></div></div>'}</div></div></div>`);
    }
  }
  function enhanceAdminPage() {
    if (!location.pathname.endsWith('admin.html')) return;
    const dash = document.getElementById('panel-dashboard');
    if (!dash || document.getElementById('inventoryHealth')) return;
    const products = window.MotorasCatalog?.products || [];
    const low = products.filter(p => Number(p.stock) <= 10).slice(0,6);
    const top = products.slice().sort((a,b)=>(b.reviews||0)-(a.reviews||0)).slice(0,6);
    const anchor = dash.querySelector('.two-col') || dash.lastElementChild;
    anchor.insertAdjacentHTML('beforebegin', `<div class="admin-mini-grid" id="inventoryHealth"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><strong style="font-family:'Barlow Condensed',sans-serif;font-size:24px;text-transform:uppercase">Stare catalog</strong><div style="color:#666;font-size:13px">Rezumat rapid pentru stoc, produse populare și comenzi salvate local.</div></div><div class="admin-toolbar"><button class="btn-sm btn-outline" onclick="seedDemoOrders()">Generează comenzi de probă</button><button class="btn-sm btn-outline" onclick="clearLocalOrders()">Șterge comenzile locale</button></div></div><div class="items"><div>${low.map(p=>`<div class="admin-mini-item"><strong>${p.name}</strong><div style="font-size:13px;color:#666">${p.brand} · stoc ${p.stock} · ${p.sku}</div></div>`).join('')}</div><div>${top.map(p=>`<div class="admin-mini-item"><strong>${p.name}</strong><div style="font-size:13px;color:#666">${p.brand} · ${p.reviews || 0} recenzii · ${p.price} RON</div></div>`).join('')}</div></div></div>`);
  }
  function patchAccountOrders() {
    const tbody = document.querySelector('#panel-orders tbody');
    if (!tbody) return;
    const orders = JSON.parse(localStorage.getItem('motoras_orders') || '[]');
    if (!orders.length) return;
    tbody.innerHTML = orders.slice(0,6).map(o=>`<tr><td style="font-weight:700;color:var(--red)">${o.id}</td><td style="color:var(--mid);font-size:12.5px">${new Date(o.date || o.createdAt || Date.now()).toLocaleDateString('ro-RO')}</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.products}</td><td style="font-weight:700">${window.MotorasStore.formatPrice(o.total)}</td><td><span class="status-badge ${o.status==='delivered'?'sb-delivered':o.status==='shipped'?'sb-shipped':'sb-processing'}">${o.status}</span></td><td><a href="confirmation.html" class="inv-pdf">Detalii</a></td></tr>`).join('');
  }
  document.addEventListener('DOMContentLoaded', () => {
    injectFitmentBar();
    injectHomeMerch();
    enhanceProductPage();
    enhanceAccountPage();
    patchAccountOrders();
    enhanceAdminPage();
  });
  return { injectFitmentBar, injectHomeMerch, enhanceProductPage, enhanceAccountPage, enhanceAdminPage };
})();
