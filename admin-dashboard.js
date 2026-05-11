(() => {
 const SESSION_KEY = 'motoras_admin_token';
 const USER_KEY = 'motoras_admin_user';
 const PANEL_TITLES = {
 dashboard: 'Dashboard',
 orders: 'Comenzi',
 customers: 'Clienti',
 supplier: 'Furnizor / API',
 agents: 'Agenti AI',
 invoices: 'Facturi',
 settings: 'Setari',
 };
 const PANEL_NAV_INDEX = {
 dashboard: 0,
 orders: 1,
 customers: 2,
 supplier: 3,
 agents: 4,
 invoices: 5,
 settings: 6,
 };
 const AVATAR_COLORS = ['#cc1111', '#2563eb', '#1a9e4a', '#e8a020', '#7c3aed', '#ea6c00'];
 const ICONS = {
 order: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>',
 check: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
 user: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
 alert: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
 invoice: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
 api: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
 };

 const MARGIN_KEY = 'motoras_supplier_margins';

 const API_CONFIGS = {
 bravus: {
 label: 'Bravus Auto', abbrev: 'BR', color: '#cc1111',
 desc: 'Furnizor principal piese auto — catalog complet cu stocuri live',
 endpoint: '/api/bravus',
 categories: 'Uleiuri motor, Filtre, Transmisii, Franare, Suspensii, Electricitate',
 defaultMargin: 30,
 },
 carhub: {
 label: 'CarHub', abbrev: 'CH', color: '#2563eb',
 desc: 'Feed XML piese auto — sincronizare periodica din XML',
 endpoint: 'supplier-feed.xml',
 categories: 'Piese caroserie, Accesorii, Detailing, Consumabile',
 defaultMargin: 25,
 },
 globiz: {
 label: 'Globiz', abbrev: 'GL', color: '#1a9e4a',
 desc: 'Feed XML accesorii si consumabile auto',
 endpoint: 'supplier-feed-globiz.xml',
 categories: 'Accesorii, Consumabile, Detailing, Produse chimice, Vopsele',
 defaultMargin: 22,
 },
 casabateriilor: {
 label: 'Casa Bateriilor', abbrev: 'CB', color: '#0ea5e9',
 desc: 'Baterii auto Casa Bateriilor SRL — catalog live via api.flasher.ro',
 endpoint: '/api/casabateriilor',
 categories: 'Baterii Auto',
 defaultMargin: 28,
 },
 };

 function loadMarginConfig() {
 try {
 const stored = localStorage.getItem(MARGIN_KEY);
 if (stored) return JSON.parse(stored);
 } catch (_) {}
 const defaults = {};
 Object.entries(API_CONFIGS).forEach(([key, cfg]) => {
 defaults[key] = { enabled: !cfg.comingSoon, margin: cfg.defaultMargin };
 });
 return defaults;
 }

 const state = {
 token: sessionStorage.getItem(SESSION_KEY) || '',
 user: sessionStorage.getItem(USER_KEY) || 'admin',
 dashboard: null,
 orders: [],
 filteredOrders: [],
 customers: [],
 filteredCustomers: [],
 products: [],
 productsMeta: null,
 orderSearch: '',
 orderStatus: '',
 customerSearch: '',
 productQuery: { q: '', category: '', stock: '' },
 marginConfig: loadMarginConfig(),
 supplierStats: {},
 browse: { key: null, page: 1, data: null, loading: false, q: '', brand: '', stock: '' },
 };

 const qs = (selector, root = document) => root.querySelector(selector);
 const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

 function escapeHtml(value) {
 return String(value ?? '')
 .replace(/&/g, '&amp;')
 .replace(/</g, '&lt;')
 .replace(/>/g, '&gt;')
 .replace(/"/g, '&quot;')
 .replace(/'/g, '&#039;');
 }

 function initials(name) {
 return String(name || 'M')
 .split(/\s+/)
 .filter(Boolean)
 .slice(0, 2)
 .map((part) => part[0])
 .join('')
 .toUpperCase() || 'M';
 }

 function avatarColor(name) {
 const seed = String(name || 'M').charCodeAt(0) || 0;
 return AVATAR_COLORS[seed % AVATAR_COLORS.length];
 }

 function toNumber(value) {
 const parsed = Number(value);
 return Number.isFinite(parsed) ? parsed : 0;
 }

 function formatRON(value) {
 return `${toNumber(value).toLocaleString('ro-RO', { maximumFractionDigits: 2 })} RON`;
 }

 function formatDate(value) {
 if (!value) return '-';
 const parsed = new Date(value);
 if (Number.isNaN(parsed.getTime())) return String(value);
 return parsed.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });
 }

 function formatDateTime(value) {
 if (!value) return '-';
 const parsed = new Date(value);
 if (Number.isNaN(parsed.getTime())) return String(value);
 return parsed.toLocaleString('ro-RO', {
 day: '2-digit',
 month: 'short',
 year: 'numeric',
 hour: '2-digit',
 minute: '2-digit',
 });
 }

 function formatTime(value) {
 if (!value) return '--:--';
 const parsed = new Date(value);
 if (Number.isNaN(parsed.getTime())) return String(value);
 return parsed.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
 }

 function emptyRow(message, columns) {
 return `<tr><td colspan="${columns}" style="padding:28px 16px;text-align:center;color:var(--muted);font-weight:600">${escapeHtml(message)}</td></tr>`;
 }

 function badgeForStatus(status, label) {
 const normalized = String(status || '').toLowerCase();
 const map = {
 pending: 'badge-pending',
 pending_payment: 'badge-pending',
 processing: 'badge-processing',
 ordered_supplier: 'badge-info',
 shipped: 'badge-shipped',
 delivered: 'badge-delivered',
 cancelled: 'badge-cancelled',
 paid: 'badge-paid',
 unpaid: 'badge-unpaid',
 refunded: 'badge-info',
 active: 'badge-shipped',
 planned: 'badge-pending',
 blocked: 'badge-cancelled',
 degraded: 'badge-pending',
 low: 'badge-pending',
 out: 'badge-cancelled',
 };
 const pretty = label || {
 pending: 'In asteptare',
 pending_payment: 'Plata in asteptare',
 processing: 'In procesare',
 ordered_supplier: 'Comandat furnizor',
 shipped: 'Expediat',
 delivered: 'Livrat',
 cancelled: 'Anulat',
 paid: 'Platit',
 unpaid: 'Neplatit',
 refunded: 'Rambursat',
 active: 'Activ',
 planned: 'Planificat',
 blocked: 'Blocat',
 degraded: 'Degradat',
 low: 'Stoc scazut',
 out: 'Fara stoc',
 }[normalized] || String(label || status || '-');
 const css = map[normalized] || 'badge-info';
 return `<span class="badge ${css}">${escapeHtml(pretty)}</span>`;
 }

 function productStatusBadge(item) {
 if (!item) return badgeForStatus('out', 'Necunoscut');
 if (!toNumber(item.stock)) return badgeForStatus('out', 'Fara stoc');
 if (toNumber(item.stock) <= 3) return badgeForStatus('low', 'Stoc scazut');
 return badgeForStatus('active', 'In stoc');
 }

 async function requestJson(path, options = {}) {
 const method = options.method || 'GET';
 const headers = { ...(options.headers || {}) };
 if (options.auth !== false && state.token) {
 headers.Authorization = `Bearer ${state.token}`;
 }

 const fetchOptions = { method, headers };
 if (options.body) {
 headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=utf-8';
 fetchOptions.body = new URLSearchParams({
 payload: JSON.stringify(options.body),
 }).toString();
 }

 const response = await fetch(path, fetchOptions);
 let data = null;
 try {
 data = await response.json();
 } catch (_) {
 data = null;
 }

 if (response.status === 401 && options.auth !== false) {
 clearSession();
 throw new Error('Sesiunea admin a expirat. Autentifica-te din nou.');
 }

 if (!response.ok) {
 throw new Error(data?.error || `Request failed (${response.status})`);
 }

 return data;
 }

 function setUserLabel() {
 const label = state.user || 'Administrator';
 const avatar = initials(label);
 const sidebarUser = qs('.sidebar-user-name');
 const sidebarRole = qs('.sidebar-user-role');
 const sidebarAvatar = qs('.sidebar-user-avatar');
 const topbarAvatar = qs('.topbar-right > div:last-child');
 if (sidebarUser) sidebarUser.textContent = label;
 if (sidebarRole) sidebarRole.textContent = 'Admin session';
 if (sidebarAvatar) sidebarAvatar.textContent = avatar;
 if (topbarAvatar) topbarAvatar.textContent = avatar;
 }

 function clearSession() {
 state.token = '';
 sessionStorage.removeItem(SESSION_KEY);
 sessionStorage.removeItem(USER_KEY);
 showLoginScreen();
 }

 function showLoginScreen() {
 const login = qs('#loginScreen');
 const app = qs('#app');
 if (login) {
 login.style.display = 'flex';
 login.style.opacity = '1';
 }
 if (app) app.classList.remove('visible');
 const passwordField = qs('#loginPass');
 if (passwordField) passwordField.value = '';
 }

 function showAppScreen() {
 const login = qs('#loginScreen');
 const app = qs('#app');
 if (login) login.style.display = 'none';
 if (app) app.classList.add('visible');
 }

 function showAdminToast(message, tone = 'dark') {
 let toast = qs('#adminToast');
 if (!toast) {
 toast = document.createElement('div');
 toast.id = 'adminToast';
 toast.style.position = 'fixed';
 toast.style.right = '20px';
 toast.style.bottom = '20px';
 toast.style.padding = '12px 16px';
 toast.style.color = '#fff';
 toast.style.borderRadius = '12px';
 toast.style.boxShadow = '0 12px 32px rgba(0,0,0,.22)';
 toast.style.fontWeight = '700';
 toast.style.zIndex = '1200';
 toast.style.opacity = '0';
 toast.style.transform = 'translateY(12px)';
 toast.style.transition = 'all .25s ease';
 document.body.appendChild(toast);
 }
 toast.style.background = tone === 'error'
 ? 'rgba(165,13,13,.96)'
 : tone === 'success'
 ? 'rgba(26,158,74,.96)'
 : 'rgba(15,17,22,.96)';
 toast.textContent = message;
 requestAnimationFrame(() => {
 toast.style.opacity = '1';
 toast.style.transform = 'translateY(0)';
 });
 clearTimeout(showAdminToast._timer);
 showAdminToast._timer = setTimeout(() => {
 toast.style.opacity = '0';
 toast.style.transform = 'translateY(12px)';
 }, 2600);
 }

 function updateClock() {
 const now = new Date();
 const node = qs('#topbarClock');
 if (!node) return;
 node.textContent = now.toLocaleString('ro-RO', {
 weekday: 'short',
 day: 'numeric',
 month: 'short',
 hour: '2-digit',
 minute: '2-digit',
 });
 }

 function openModal(type) {
 if (type === 'addCustomer') {
 qs('#modalTitle').textContent = 'Client nou';
 qs('#modalBody').innerHTML = `
 <div style="padding:22px">
 <div class="alert alert-info">
 ${ICONS.user}
 Fluxul de creare manuala a clientilor nu are inca un API de scriere. In aceasta versiune, dashboard-ul foloseste doar clienti reali dedusi din comenzile Stripe sincronizate.
 </div>
 <div style="display:flex;justify-content:flex-end">
 <button class="btn-sm btn-outline" onclick="closeModal()">Inchide</button>
 </div>
 </div>`;
 qs('#modalOverlay').classList.add('open');
 return;
 }

 qs('#modalOverlay').classList.add('open');
 }

 function closeSidebar() {
 qs('#sidebar')?.classList.remove('mob-open');
 qs('#sidebarOverlay')?.classList.remove('show');
 }

 function showPanel(id, el) {
 qsa('.panel').forEach(panel => panel.classList.remove('active'));
 qsa('.nav-item').forEach(item => item.classList.remove('active'));
 qs(`#panel-${id}`)?.classList.add('active');

 if (el) {
 el.classList.add('active');
 } else {
 const navItems = qsa('.nav-item');
 const target = navItems[PANEL_NAV_INDEX[id]];
 if (target) target.classList.add('active');
 }

 const title = qs('#topbarTitle');
 if (title) title.textContent = PANEL_TITLES[id] || id;
 closeSidebar();

 if (id === 'supplier') {
 loadSupplierStats().then(() => renderApiPanel());
 }
 }

 async function doLogin() {
 const userField = qs('#loginUser');
 const passField = qs('#loginPass');
 const errorBox = qs('#loginError');
 const username = String(userField?.value || '').trim();
 const password = String(passField?.value || '').trim();

 if (errorBox) errorBox.classList.remove('show');
 if (!username || !password) {
 if (errorBox) {
 errorBox.textContent = 'Introdu utilizatorul si parola.';
 errorBox.classList.add('show');
 }
 return;
 }

 try {
 const result = await requestJson('/api/admin/auth', {
 method: 'POST',
 body: { username, password },
 auth: false,
 });

 state.token = result.token || '';
 state.user = username;
 sessionStorage.setItem(SESSION_KEY, state.token);
 sessionStorage.setItem(USER_KEY, username);
 setUserLabel();
 showAppScreen();
 await reloadAdminData();
 showAdminToast('Autentificare reusita', 'success');
 } catch (error) {
 if (errorBox) {
 errorBox.textContent = error.message || 'Autentificare esuata.';
 errorBox.classList.add('show');
 }
 if (passField) {
 passField.value = '';
 passField.focus();
 }
 }
 }

 function doLogout() {
 clearSession();
 showAdminToast('Sesiunea admin a fost inchisa');
 }

 function normalizeOrder(order) {
 const items = Array.isArray(order?.items) ? order.items : [];
 return {
 id: order?.id || '-',
 client: order?.name || 'Client Motoras',
 email: order?.email || '-',
 phone: order?.phone || '-',
 products: items.length
 ? items.map(item => `${item.name}${toNumber(item.qty) > 1 ? ` x${toNumber(item.qty)}` : ''}`).join(', ')
 : 'Fara produse in snapshot',
 total: toNumber(order?.total),
 payment: String(order?.paymentStatus || order?.payment || 'unpaid').toLowerCase(),
 paymentLabel: order?.paymentLabel || 'Carte online',
 paymentMethod: order?.paymentMethod || 'card',
 paymentReference: order?.paymentReference || '',
 paymentMessage: order?.paymentMessage || '',
 status: String(order?.status || 'pending').toLowerCase(),
 createdAt: order?.createdAt || order?.updatedAt || new Date().toISOString(),
 address: order?.address || '',
 city: order?.city || '',
 county: order?.county || '',
 zip: order?.zip || '',
 tracking_number: order?.tracking_number || '',
 tracking_courier: order?.tracking_courier || '',
 tracking_sent_at: order?.tracking_sent_at || '',
 raw: order,
 };
 }

 function applyOrderFilters() {
 const query = state.orderSearch.trim().toLowerCase();
 state.filteredOrders = state.orders.filter((order) => {
 const matchesQuery = !query || [
 order.id,
 order.client,
 order.email,
 order.products,
 ].join(' ').toLowerCase().includes(query);

 const matchesStatus = !state.orderStatus || (
 state.orderStatus === 'pending'
 ? ['pending', 'pending_payment'].includes(order.status)
 : order.status === state.orderStatus
 );

 return matchesQuery && matchesStatus;
 });
 }

 function applyCustomerFilters() {
 const query = state.customerSearch.trim().toLowerCase();
 state.filteredCustomers = state.customers.filter((customer) => !query || [
 customer.name,
 customer.email,
 customer.phone,
 ].join(' ').toLowerCase().includes(query));
 }

 async function fetchDashboard() {
 state.dashboard = await requestJson('/api/admin/dashboard');
 }

 async function fetchOrders() {
 try {
 const result = await requestJson('/api/orders', { auth: false });
 state.orders = (result.items || []).map(normalizeOrder);
 } catch (_) {
 state.orders = ((state.dashboard?.orders?.recent) || []).map(normalizeOrder);
 }
 applyOrderFilters();
 }

 async function refreshProducts() {
 state.productQuery.q = String(qs('#productsSearchInput')?.value || '').trim();
 state.productQuery.category = String(qs('#productsCategoryFilter')?.value || '').trim();
 state.productQuery.stock = String(qs('#productsStockFilter')?.value || '').trim();

 const params = new URLSearchParams({
 limit: '50',
 sort: state.productQuery.stock === 'low' || state.productQuery.stock === 'out' ? 'stock_asc' : 'name',
 });
 if (state.productQuery.q) params.set('q', state.productQuery.q);
 if (state.productQuery.category) params.set('category', state.productQuery.category);
 if (state.productQuery.stock) params.set('stock', state.productQuery.stock);

 const result = await requestJson(`/api/products?${params.toString()}`, { auth: false });
 state.products = result.items || [];
 state.productsMeta = result;
 renderProductsFilters();
 renderProductsTable();
 }

 async function reloadAdminData() {
 await fetchDashboard();
 state.customers = state.dashboard?.customers?.top || [];
 applyCustomerFilters();
 await Promise.all([fetchOrders(), loadSupplierStats()]);
 renderDashboard();
 }

 function renderDashboard() {
 setUserLabel();
 renderNotes();
 renderStats();
 renderCharts();
 renderRecentOrders();
 renderActivityFeed();
 renderOrdersTable();
 renderCustomersTable();
 renderApiPanel();
 renderSupplierOrders();
 renderAgentSummary();
 renderAgentsPanel();
 renderTopProducts();
 renderInvoices();
 updateBadges();
 }

 function renderNotes() {
 const node = qs('#adminNotes');
 if (!node) return;
 const notes = Array.isArray(state.dashboard?.notes) ? state.dashboard.notes : [];
 if (!notes.length) {
 node.innerHTML = '';
 return;
 }
 node.innerHTML = notes.map((note, index) => `
 <div class="alert ${index === 0 ? 'alert-info' : 'alert-warn'}">
 ${index === 0 ? ICONS.api : ICONS.alert}
 ${escapeHtml(note)}
 </div>`).join('');
 }

 function renderStats() {
 const metrics = state.dashboard?.metrics || {};
 const cards = qsa('#panel-dashboard .stats-grid .stat-card');
 const config = [
 {
 label: 'Comenzi azi',
 value: String(metrics.ordersToday || 0),
 sub: `${metrics.totalOrders || 0} comenzi sincronizate`,
 className: 'stat-sub stat-up',
 },
 {
 label: 'Venituri azi',
 value: formatRON(metrics.revenueToday || 0),
 sub: `Total: ${formatRON(metrics.totalRevenue || 0)}`,
 className: 'stat-sub stat-up',
 },
 {
 label: 'Clienti unici',
 value: String(metrics.uniqueCustomers || 0),
 sub: `${metrics.paidOrders || 0} clienti cu plata confirmata`,
 className: 'stat-sub stat-up',
 },
 {
 label: 'In procesare',
 value: String(metrics.processingOrders || 0),
 sub: `${metrics.lowStockProducts || 0} produse cu stoc scazut`,
 className: 'stat-sub stat-down',
 },
 ];

 cards.forEach((card, index) => {
 const entry = config[index];
 if (!entry) return;
 const label = qs('.stat-label', card);
 const value = qs('.stat-value', card);
 const sub = qs('.stat-sub', card);
 if (label) label.textContent = entry.label;
 if (value) value.textContent = entry.value;
 if (sub) {
 sub.textContent = entry.sub;
 sub.className = entry.className;
 }
 });
 }

 function renderBarChart(id, values, color, formatter = (value) => value) {
 const node = qs(`#${id}`);
 if (!node) return;
 const clean = Array.isArray(values) ? values.map(toNumber) : [];
 const max = Math.max(1, ...clean, 1);
 const labels = (state.dashboard?.charts?.last7Days || []).map(item => item.label || '');
 node.innerHTML = clean.map((value, index) => {
 const height = Math.max(12, Math.round((value / max) * 100));
 const title = `${labels[index] || ''}: ${formatter(value)}`;
 return `<div class="kpi-bar" style="height:${height}%;background:${color};opacity:${index === clean.length - 1 ? '1' : '0.55'}" title="${escapeHtml(title)}"></div>`;
 }).join('');
 }

 function renderCharts() {
 const days = state.dashboard?.charts?.last7Days || [];
 const titles = qsa('#panel-dashboard .kpi-title');
 if (titles[0]) titles[0].innerHTML = `Comenzi / 7 zile <span style="font-weight:500;color:var(--muted);font-size:11px">${state.dashboard?.metrics?.totalOrders || 0} total</span>`;
 if (titles[1]) titles[1].innerHTML = `Venituri / 7 zile <span style="font-weight:500;color:var(--muted);font-size:11px">${formatRON(state.dashboard?.metrics?.totalRevenue || 0)}</span>`;
 if (titles[2]) titles[2].innerHTML = `Valoare medie / comanda <span style="font-weight:500;color:var(--muted);font-size:11px">${formatRON(state.dashboard?.metrics?.averageOrderValue || 0)}</span>`;
 renderBarChart('chartOrders', days.map(item => item.orders), 'var(--red)');
 renderBarChart('chartRevenue', days.map(item => item.revenue), 'var(--green)', formatRON);
 renderBarChart('chartConv', days.map(item => item.averageOrderValue), 'var(--blue)', formatRON);
 }

 function renderRecentOrders() {
 const tbody = qs('#recentOrdersTable');
 if (!tbody) return;
 const orders = (state.dashboard?.orders?.recent || []).slice(0, 5).map(normalizeOrder);
 tbody.innerHTML = orders.length ? orders.map(order => `
 <tr>
 <td class="td-mono">${escapeHtml(order.id)}</td>
 <td class="td-bold">${escapeHtml(order.client)}</td>
 <td class="td-bold" style="color:var(--red)">${formatRON(order.total)}</td>
 <td>${badgeForStatus(order.status)}</td>
 </tr>`).join('') : emptyRow('Nu exista comenzi sincronizate inca.', 4);
 }

 function renderActivityFeed() {
 const feed = qs('#activityFeed');
 if (!feed) return;

 const activities = [];
 (state.dashboard?.orders?.recent || []).slice(0, 3).forEach((entry) => {
 const order = normalizeOrder(entry);
 activities.push({
 icon: order.status === 'cancelled' ? ICONS.alert : order.status === 'delivered' ? ICONS.check : ICONS.order,
 className: order.status === 'cancelled' ? 'ico-orange' : order.status === 'delivered' ? 'ico-green' : 'ico-red',
 color: order.status === 'cancelled' ? 'var(--orange)' : order.status === 'delivered' ? 'var(--green)' : 'var(--red)',
 text: `<strong>${escapeHtml(order.id)}</strong> · ${escapeHtml(order.client)} · ${formatRON(order.total)}`,
 time: formatDateTime(order.createdAt),
 });
 });

 (state.dashboard?.apiStatus || []).slice(0, 2).forEach((item) => {
 activities.push({
 icon: item.status === 'active' ? ICONS.api : ICONS.alert,
 className: item.status === 'active' ? 'ico-blue' : 'ico-orange',
 color: item.status === 'active' ? 'var(--blue)' : 'var(--orange)',
 text: `<strong>${escapeHtml(item.name)}</strong> · ${escapeHtml(item.detail || '-')}`,
 time: formatDateTime(state.dashboard?.generatedAt),
 });
 });

 feed.innerHTML = activities.length ? activities.slice(0, 5).map((item) => `
 <div class="activity-item">
 <div class="act-ico ${item.className}" style="color:${item.color}">${item.icon}</div>
 <div class="act-text"><p>${item.text}</p></div>
 <div class="act-time">${escapeHtml(item.time)}</div>
 </div>`).join('') : `<div class="empty-state"><h3>Fara activitate</h3><p>Dashboard-ul va afisa evenimente dupa prima sincronizare reusita.</p></div>`;
 }

 function renderOrdersTable() {
 const tbody = qs('#ordersTable');
 if (!tbody) return;
 tbody.innerHTML = state.filteredOrders.length ? state.filteredOrders.map((order) => `
 <tr>
 <td class="td-mono">${escapeHtml(order.id)}</td>
 <td>
 <div style="display:flex;align-items:center;gap:9px">
 <div class="avatar" style="background:${avatarColor(order.client)};width:28px;height:28px;font-size:11px">${escapeHtml(initials(order.client))}</div>
 <div>
 <div class="td-bold" style="font-size:13px">${escapeHtml(order.client)}</div>
 <div style="font-size:11px;color:var(--muted)">${escapeHtml(order.email)}</div>
 </div>
 </div>
 </td>
 <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px">${escapeHtml(order.products)}</td>
 <td class="td-bold" style="color:var(--red)">${formatRON(order.total)}</td>
 <td>${badgeForStatus(order.payment)}</td>
 <td>${badgeForStatus(order.status)}</td>
 <td style="font-size:12.5px;color:var(--muted)">${escapeHtml(formatDateTime(order.createdAt))}</td>
 <td>
 <button class="btn-sm btn-outline" style="padding:5px 10px;font-size:12px" onclick="viewOrder('${escapeHtml(order.id)}')">
 <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
 Detalii
 </button>
 </td>
 </tr>`).join('') : emptyRow('Nu exista comenzi care sa se potriveasca filtrului.', 8);
 }

 function renderCustomersTable() {
 const tbody = qs('#customersTable');
 if (!tbody) return;
 tbody.innerHTML = state.filteredCustomers.length ? state.filteredCustomers.map((customer) => `
 <tr>
 <td>
 <div style="display:flex;align-items:center;gap:9px">
 <div class="avatar" style="background:${avatarColor(customer.name)}">${escapeHtml(initials(customer.name))}</div>
 <span class="td-bold">${escapeHtml(customer.name || 'Client Motoras')}</span>
 </div>
 </td>
 <td style="font-size:13px;color:var(--mid)">${escapeHtml(customer.email || '-')}</td>
 <td style="font-size:13px">${escapeHtml(customer.phone || '-')}</td>
 <td class="td-bold" style="text-align:center">${toNumber(customer.orders)}</td>
 <td class="td-bold" style="color:var(--red)">${formatRON(customer.total)}</td>
 <td style="font-size:12px;color:var(--muted)">${escapeHtml(formatDate(customer.lastOrderAt))}</td>
 <td>
 <button class="btn-sm btn-outline" style="padding:5px 10px;font-size:12px" onclick="openModal('addCustomer')">
 <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
 Profil
 </button>
 </td>
 </tr>`).join('') : emptyRow('Nu exista clienti server-side disponibili.', 7);
 }

 function renderProductsFilters() {
 const select = qs('#productsCategoryFilter');
 const summary = state.productsMeta?.summary;
 if (!select || !summary?.categories) return;
 const current = state.productQuery.category;
 const options = ['<option value="">Toate categoriile</option>']
 .concat(summary.categories.map((item) => `<option value="${escapeHtml(item.label)}"${item.label === current ? ' selected' : ''}>${escapeHtml(item.label)} (${item.count})</option>`));
 select.innerHTML = options.join('');
 }

 function renderProductsTable() {
 const tbody = qs('#productsTable');
 const meta = qs('#productsSummaryMeta');
 if (!tbody) return;

 if (meta && state.productsMeta?.summary) {
 meta.textContent = `Afisam ${state.products.length} din ${state.productsMeta.total} produse · ${state.productsMeta.summary.lowStock} cu stoc scazut · ${state.productsMeta.summary.outOfStock} fara stoc`;
 }

 tbody.innerHTML = state.products.length ? state.products.map((item) => `
 <tr>
 <td class="td-bold">${escapeHtml(item.name || 'Produs')}</td>
 <td class="td-mono">${escapeHtml(item.sku || item.id || '-')}</td>
 <td>${escapeHtml(item.category || item.cat || '-')}</td>
 <td>${escapeHtml(item.brand || '-')}</td>
 <td>${escapeHtml(item.source || '-')}</td>
 <td class="td-bold" style="color:var(--red)">${formatRON(item.price)}</td>
 <td>${toNumber(item.stock)}</td>
 <td>${productStatusBadge(item)}</td>
 </tr>`).join('') : emptyRow('Nu exista produse pentru filtrul selectat.', 8);
 }

 function renderApiPanel() {
 const container = qs('#apiCardsContainer');
 const statsRow = qs('#apiOverviewStats');
 if (!container) return;

 const sources = state.dashboard?.products?.topSources || [];
 const sourceCounts = {};
 sources.forEach(item => { sourceCounts[item.label] = item.count || 0; });
 const metrics = state.dashboard?.metrics || {};
 // Prefer live supplier stats over dashboard snapshot
 const ss = state.supplierStats || {};

 if (statsRow) {
 const activeApis = Object.values(state.marginConfig).filter(c => c.enabled).length;
 const allMargins = Object.entries(state.marginConfig)
 .filter(([k]) => !API_CONFIGS[k]?.comingSoon)
 .map(([, c]) => toNumber(c.margin));
 const avgMargin = allMargins.length ? (allMargins.reduce((a, b) => a + b, 0) / allMargins.length) : 0;
 // Aggregate live totals from supplierStats, fall back to dashboard metrics
 const liveTotalProducts = Object.entries(ss).filter(([k]) => !API_CONFIGS[k]?.comingSoon)
 .reduce((sum, [, s]) => sum + toNumber(s.total), 0);
 const liveInStock = Object.entries(ss).filter(([k]) => !API_CONFIGS[k]?.comingSoon)
 .reduce((sum, [, s]) => sum + toNumber(s.inStock), 0);
 const totalProd = liveTotalProducts || toNumber(metrics.totalProducts);
 const inStockProd = liveInStock || toNumber(metrics.inStockProducts);
 statsRow.innerHTML = `
 <div class="stat-card">
 <div><div class="stat-label">Produse totale</div><div class="stat-value">${totalProd.toLocaleString('ro-RO')}</div><div class="stat-sub stat-up">din toate sursele active</div></div>
 <div class="stat-ico ico-blue"><svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div>
 </div>
 <div class="stat-card">
 <div><div class="stat-label">API-uri active</div><div class="stat-value">${activeApis}/${Object.keys(API_CONFIGS).length}</div><div class="stat-sub stat-up">furnizori conectati</div></div>
 <div class="stat-ico ico-green"><svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
 </div>
 <div class="stat-card">
 <div><div class="stat-label">Marja medie</div><div class="stat-value">${avgMargin.toFixed(1)}%</div><div class="stat-sub stat-up">markup mediu configurat</div></div>
 <div class="stat-ico ico-gold"><svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg></div>
 </div>
 <div class="stat-card">
 <div><div class="stat-label">In stoc</div><div class="stat-value">${inStockProd.toLocaleString('ro-RO')}</div><div class="stat-sub ${toNumber(metrics.lowStockProducts) > 0 ? 'stat-down' : 'stat-up'}">${toNumber(metrics.lowStockProducts)} cu stoc scazut</div></div>
 <div class="stat-ico ico-red"><svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg></div>
 </div>`;
 }

 container.innerHTML = Object.entries(API_CONFIGS).map(([key, cfg]) => {
 const mc = state.marginConfig[key] || { enabled: !cfg.comingSoon, margin: cfg.defaultMargin };
 const liveStats = ss[key];
 const count = liveStats ? toNumber(liveStats.total) : (sourceCounts[key] || (key === 'bravus' ? toNumber(metrics.totalProducts) : 0));
 const inStock = liveStats ? toNumber(liveStats.inStock) : (key === 'bravus' ? toNumber(metrics.inStockProducts) : count);
 const totalBrands = liveStats ? toNumber(liveStats.totalBrands) : 0;
 const margin = toNumber(mc.margin ?? cfg.defaultMargin);
 const active = mc.enabled && !cfg.comingSoon;
 const sliderVal = Math.min(100, margin);
 const finalPrice = (100 * (1 + margin / 100)).toFixed(2);

 return `
 <div class="api-card" id="apiCard_${key}">
 <div class="api-card-hdr">
 <div class="api-logo" style="background:${cfg.color}">${escapeHtml(cfg.abbrev)}</div>
 <div style="flex:1;min-width:0">
 <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
 <span style="font-size:16px;font-weight:800;color:var(--dark)">${escapeHtml(cfg.label)}</span>
 ${cfg.comingSoon ? '<span class="badge badge-info" style="font-size:10px;padding:3px 8px">In curand</span>' : ''}
 </div>
 <div style="font-size:12.5px;color:var(--muted);font-weight:500;margin-top:2px">${escapeHtml(cfg.desc)}</div>
 </div>
 <div style="display:flex;align-items:center;gap:12px;flex-shrink:0">
 <div class="api-status-dot${active ? ' active' : ''}"></div>
 <label class="toggle-sw">
 <input type="checkbox"${active ? ' checked' : ''}${cfg.comingSoon ? ' disabled' : ''} onchange="updateApiToggle('${key}', this.checked)"/>
 <span class="toggle-track"></span>
 </label>
 </div>
 </div>
 <div class="api-card-body">
 <div class="api-body-left">
 <div class="api-stats-row">
 <div class="api-stat-box">
 <div class="api-stat-num">${count > 0 ? count.toLocaleString('ro-RO') : '—'}</div>
 <div class="api-stat-lab">Produse</div>
 </div>
 <div class="api-stat-box">
 <div class="api-stat-num">${inStock > 0 ? inStock.toLocaleString('ro-RO') : '—'}</div>
 <div class="api-stat-lab">In stoc</div>
 </div>
 <div class="api-stat-box">
 <div class="api-stat-num">${totalBrands > 0 ? totalBrands.toLocaleString('ro-RO') : '—'}</div>
 <div class="api-stat-lab">Marci</div>
 </div>
 <div class="api-stat-box">
 <div class="api-stat-num api-status-val" style="color:${active ? 'var(--green)' : '#bbb'};font-size:16px">${active ? 'Activ' : 'Inactiv'}</div>
 <div class="api-stat-lab">Status</div>
 </div>
 </div>
 <div class="margin-section">
 <div class="margin-hdr">
 <span>Marja globala de pret</span>
 <span class="margin-pct-val" id="marginPctLabel_${key}">${margin}%</span>
 </div>
 <div class="margin-row">
 <input type="range" class="margin-slider" id="marginSlider_${key}"
 min="0" max="100" value="${sliderVal}" style="--val:${sliderVal}%"
 oninput="updateApiMargin('${key}', this.value)"/>
 <input type="number" class="margin-number" id="marginNumber_${key}"
 min="0" max="200" value="${margin}"
 oninput="updateApiMargin('${key}', this.value, true)"/>
 <span style="font-size:13px;font-weight:700;color:var(--mid)">%</span>
 </div>
 <div class="margin-preview-box">
 <span style="color:var(--muted)">100 RON furnizor</span>
 <span style="color:var(--muted);margin:0 4px">→</span>
 <span style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:800;color:var(--green)" id="marginPreview_${key}">${finalPrice} RON</span>
 <span style="margin-left:6px;font-size:11.5px;color:var(--muted);font-weight:600">pret client</span>
 </div>
 </div>
 <div style="display:flex;gap:10px;flex-wrap:wrap">
 <button class="btn-sm btn-primary" style="flex:1;min-width:100px" onclick="saveMarginConfig('${key}')"${cfg.comingSoon ? ' disabled style="opacity:.5;cursor:not-allowed;flex:1;min-width:100px"' : ''}>
 <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
 Salveaza
 </button>
 <button class="btn-sm btn-outline" onclick="openSupplierBrowse('${key}')"${cfg.comingSoon ? ' disabled style="opacity:.5;cursor:not-allowed"' : ''}>
 <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
 Produse
 </button>
 <button class="btn-sm btn-outline" onclick="syncSupplierApi('${key}')"${cfg.comingSoon ? ' disabled style="opacity:.5;cursor:not-allowed"' : ''}>
 <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
 Sync
 </button>
 </div>
 </div>
 <div class="api-body-right">
 <div style="margin-bottom:16px">
 <div class="form-label" style="margin-bottom:8px">Sursa date / Endpoint</div>
 <div style="display:flex;align-items:center;gap:8px;background:var(--bg);border-radius:9px;padding:10px 14px">
 <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="color:var(--muted);flex-shrink:0"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
 <span style="font-family:monospace;font-size:12px;color:var(--mid);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(cfg.endpoint)}</span>
 </div>
 </div>
 <div style="margin-bottom:16px">
 <div class="form-label" style="margin-bottom:8px">Categorii principale</div>
 <div style="font-size:13px;color:var(--mid);line-height:1.7">${escapeHtml(cfg.categories)}</div>
 </div>
 <div class="api-status-box" style="background:${active ? '#f0fdf4' : '#f5f6fa'};border:1.5px solid ${active ? '#bbf7d0' : 'var(--border)'};border-radius:10px;padding:12px 14px;font-size:12.5px;font-weight:600;color:${active ? '#166534' : 'var(--muted)'}">
 ${active ? '● Conexiunea este activa si functiona la ultima verificare' : cfg.comingSoon ? '○ Furnizor programat — va fi adaugat in curand' : '○ Furnizor dezactivat manual'}
 </div>
 </div>
 </div>
 </div>`;
 }).join('');

 updateCalc();
 }

 function renderAgentSummary() {
 const node = qs('#agentsSummaryContent');
 if (!node) return;
 const agents = state.dashboard?.agents?.items || [];
 node.innerHTML = agents.length ? agents.slice(0, 4).map((agent) => `
 <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
 <div style="min-width:0">
 <div style="font-size:13px;font-weight:700;color:var(--dark)">${escapeHtml(agent.name)}</div>
 <div style="font-size:11px;color:var(--muted);margin-top:2px">${escapeHtml(agent.note || '-')}</div>
 </div>
 ${badgeForStatus(agent.status)}
 </div>`).join('') : `<div class="empty-state"><h3>Fara agenti</h3><p>Nu exista inca automatizari raportate de backend.</p></div>`;
 }

 function renderTopProducts() {
 const node = qs('#topProductsContent');
 if (!node) return;
 const products = state.dashboard?.products?.topOrdered?.length
 ? state.dashboard.products.topOrdered
 : state.dashboard?.products?.lowStock?.slice(0, 4) || [];
 const max = Math.max(1, ...products.map(item => toNumber(item.qty || item.stock || 0)), 1);

 node.innerHTML = products.length ? products.map((item, index) => {
 const amount = toNumber(item.qty || item.stock || 0);
 const width = Math.max(14, Math.round((amount / max) * 100));
 const label = item.qty ? `${amount} buc comandate` : `${toNumber(item.stock)} buc in stoc`;
 const color = ['var(--red)', 'var(--blue)', 'var(--gold)', 'var(--green)'][index % 4];
 return `
 <div>
 <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;gap:10px">
 <span class="td-bold" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(item.name || 'Produs')}</span>
 <span style="color:var(--mid);font-weight:600;white-space:nowrap">${escapeHtml(label)}</span>
 </div>
 <div class="progress"><div class="progress-bar" style="width:${width}%;background:${color}"></div></div>
 </div>`;
 }).join('') : `<div class="empty-state"><h3>Fara semnal de vanzare</h3><p>Topul produselor va aparea dupa primele comenzi server-side sincronizate.</p></div>`;
 }

 function renderSupplierOrders() {
 const tbody = qs('#supplierOrdersTable');
 if (!tbody) return;
 const queue = state.dashboard?.orders?.queue || [];
 tbody.innerHTML = queue.length ? queue.map((item) => {
 const src = String(item.source || '').toLowerCase();
 const cfg = API_CONFIGS[src] || {};
 const supplierBadge = cfg.label
 ? `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:3px 8px;border-radius:5px;background:${cfg.color}18;color:${cfg.color}">${escapeHtml(cfg.label)}</span>`
 : `<span style="font-size:12px;color:var(--muted)">—</span>`;
 return `
 <tr>
 <td class="td-mono">${escapeHtml(item.id || '-')}</td>
 <td class="td-bold">${escapeHtml(item.product || '-')}</td>
 <td>${supplierBadge}</td>
 <td style="font-size:12.5px;color:var(--muted)">${escapeHtml(formatDateTime(item.sent))}</td>
 <td class="td-mono" style="font-size:12.5px">${escapeHtml(item.response || '-')}</td>
 <td>${badgeForStatus(item.status)}</td>
 <td><button class="btn-sm btn-outline" style="padding:5px 10px;font-size:12px" onclick="syncSupplier()">Reverifica</button></td>
 </tr>`;
 }).join('') : emptyRow('Nu exista comenzi in asteptare pentru furnizor.', 7);
 }

 function saveMarginConfig(key) {
 try {
 localStorage.setItem(MARGIN_KEY, JSON.stringify(state.marginConfig));
 updateCalc();
 } catch (_) {}
 const label = API_CONFIGS[key]?.label || key;
 const margin = toNumber(state.marginConfig[key]?.margin);
 requestJson('/api/admin/margins', { method: 'POST', body: { margins: state.marginConfig } })
 .then(data => {
 if (data?.ok) showAdminToast(`Marja ${label} salvata: +${margin}% — shop actualizat`, 'success');
 else showAdminToast('Eroare la salvarea pe server.', 'error');
 })
 .catch(() => showAdminToast('Eroare la salvarea configuratiei.', 'error'));
 }

 function updateApiToggle(key, enabled) {
 if (!state.marginConfig[key]) {
 state.marginConfig[key] = { enabled: false, margin: API_CONFIGS[key]?.defaultMargin || 25 };
 }
 state.marginConfig[key].enabled = enabled;
 const card = qs(`#apiCard_${key}`);
 if (!card) return;
 const dot = card.querySelector('.api-status-dot');
 if (dot) { dot.className = 'api-status-dot' + (enabled ? ' active' : ''); }
 // Auto-save toggle change immediately
 localStorage.setItem(MARGIN_KEY, JSON.stringify(state.marginConfig));
 requestJson('/api/admin/margins', { method: 'POST', body: { margins: state.marginConfig } })
 .then(() => showAdminToast(`${API_CONFIGS[key]?.label || key} ${enabled ? 'activat' : 'dezactivat'} — shop actualizat`, enabled ? 'success' : 'info'))
 .catch(() => showAdminToast('Eroare la salvarea configuratiei.', 'error'));
 const val = card.querySelector('.api-status-val');
 if (val) { val.textContent = enabled ? 'Activ' : 'Inactiv'; val.style.color = enabled ? 'var(--green)' : '#bbb'; }
 const box = card.querySelector('.api-status-box');
 if (box) {
 box.style.background = enabled ? '#f0fdf4' : '#f5f6fa';
 box.style.borderColor = enabled ? '#bbf7d0' : 'var(--border)';
 box.style.color = enabled ? '#166534' : 'var(--muted)';
 box.textContent = enabled ? '● Conexiunea este activa si functiona la ultima verificare' : '○ Furnizor dezactivat manual';
 }
 updateCalc();
 }

 function updateApiMargin(key, value, fromNumber = false) {
 const numVal = Math.min(200, Math.max(0, parseFloat(value) || 0));
 if (!state.marginConfig[key]) {
 state.marginConfig[key] = { enabled: !API_CONFIGS[key]?.comingSoon, margin: API_CONFIGS[key]?.defaultMargin || 25 };
 }
 state.marginConfig[key].margin = numVal;
 const slider = qs(`#marginSlider_${key}`);
 const number = qs(`#marginNumber_${key}`);
 const label = qs(`#marginPctLabel_${key}`);
 const preview = qs(`#marginPreview_${key}`);
 const sliderVal = Math.min(100, numVal);
 if (slider && !fromNumber) { slider.value = sliderVal; }
 if (slider) slider.style.setProperty('--val', sliderVal + '%');
 if (number && fromNumber) number.value = numVal;
 if (label) label.textContent = numVal + '%';
 if (preview) preview.textContent = (100 * (1 + numVal / 100)).toFixed(2) + ' RON';
 updateCalc();
 }

 function updateCalc() {
 const apiKey = qs('#calcApiSelect')?.value || 'bravus';
 const base = parseFloat(qs('#calcBasePrice')?.value || '100') || 100;
 const margin = toNumber(state.marginConfig?.[apiKey]?.margin ?? API_CONFIGS[apiKey]?.defaultMargin ?? 25);
 const final = base * (1 + margin / 100);
 const pctEl = qs('#calcMarginPct');
 const finalEl = qs('#calcFinalPrice');
 if (pctEl) pctEl.textContent = margin + '%';
 if (finalEl) finalEl.textContent = final.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' RON';
 }

 function renderAgentsPanel() {
 const overview = qs('#agentsOverviewGrid');
 const tbody = qs('#agentsLogTable');
 const agents = state.dashboard?.agents?.items || [];
 if (overview) {
 overview.innerHTML = agents.map((agent) => `
 <div class="card">
 <div class="card-hdr">
 <div class="card-title">${escapeHtml(agent.name)}</div>
 ${badgeForStatus(agent.status)}
 </div>
 <div style="padding:18px 22px">
 <div class="alert ${agent.status === 'active' ? 'alert-success' : agent.status === 'blocked' ? 'alert-warn' : 'alert-info'}">
 ${agent.status === 'active' ? ICONS.check : agent.status === 'blocked' ? ICONS.alert : ICONS.api}
 ${escapeHtml(agent.note || '-')}
 </div>
 <div style="font-size:13px;color:var(--mid);font-weight:600">Ultimul refresh: ${escapeHtml(formatDateTime(state.dashboard?.generatedAt))}</div>
 </div>
 </div>`).join('');
 }

 if (!tbody) return;
 const logs = [];
 agents.forEach((agent) => {
 logs.push({
 time: formatTime(state.dashboard?.generatedAt),
 agent: agent.name,
 action: agent.note || '-',
 order: '-',
 result: agent.status,
 duration: 'sync',
 });
 });
 (state.dashboard?.orders?.queue || []).slice(0, 4).forEach((item) => {
 logs.push({
 time: formatTime(item.sent),
 agent: 'Order Agent',
 action: item.response || 'Queue check',
 order: item.id || '-',
 result: item.status,
 duration: 'live',
 });
 });

 tbody.innerHTML = logs.length ? logs.map((log) => `
 <tr>
 <td class="td-mono">${escapeHtml(log.time)}</td>
 <td class="td-bold">${escapeHtml(log.agent)}</td>
 <td>${escapeHtml(log.action)}</td>
 <td class="td-mono">${escapeHtml(log.order)}</td>
 <td>${badgeForStatus(log.result)}</td>
 <td style="font-size:12px;color:var(--muted)">${escapeHtml(log.duration)}</td>
 </tr>`).join('') : emptyRow('Nu exista loguri de agent disponibile.', 6);
 }

 function renderInvoices() {
 const tbody = qs('#invoicesTable');
 if (!tbody) return;
 const invoices = state.dashboard?.invoices?.recent || [];
 tbody.innerHTML = invoices.length ? invoices.map((invoice) => `
 <tr>
 <td class="td-mono">${escapeHtml(invoice.nr || '-')}</td>
 <td class="td-bold">${escapeHtml(invoice.client || '-')}</td>
 <td class="td-mono">${escapeHtml(invoice.order || '-')}</td>
 <td class="td-bold" style="color:var(--red)">${formatRON(invoice.total)}</td>
 <td>${badgeForStatus(invoice.status)}</td>
 <td style="font-size:12px;color:var(--muted)">${escapeHtml(formatDate(invoice.date))}</td>
 <td><button class="btn-sm btn-outline" style="padding:5px 10px;font-size:12px" onclick="showAdminToast('Exportul PDF va fi conectat in etapa urmatoare.')">PDF</button></td>
 </tr>`).join('') : emptyRow('Nu exista facturi deduse din plati confirmate.', 7);
 }

 function openSupplierBrowse(key) {
 if (API_CONFIGS[key]?.comingSoon) return;
 state.browse = { key, page: 1, data: null, loading: false, q: '', brand: '', stock: '' };
 const overlay = qs('#browseModalOverlay');
 if (!overlay) return;
 const cfg = API_CONFIGS[key] || {};
 const titleEl = overlay.querySelector('#browseModalTitle');
 if (titleEl) titleEl.textContent = `Produse — ${cfg.label || key}`;
 const qEl = overlay.querySelector('#browseQ');
 const brandEl = overlay.querySelector('#browseBrand');
 const stockEl = overlay.querySelector('#browseStock');
 if (qEl) qEl.value = '';
 if (brandEl) brandEl.value = '';
 if (stockEl) stockEl.value = '';
 overlay.classList.add('open');
 browseSupplierLoad(key, 1);
 }

 function closeBrowseModal() {
 qs('#browseModalOverlay')?.classList.remove('open');
 state.browse = { key: null, page: 1, data: null, loading: false, q: '', brand: '', stock: '' };
 }

 async function browseSupplierLoad(key, page) {
 if (!key) return;
 state.browse.loading = true;
 state.browse.page = page || 1;
 renderBrowseLoading();

 const endpointMap = { bravus: '/api/bravus', carhub: '/api/carhub', globiz: '/api/globiz', casabateriilor: '/api/casabateriilor' };
 const base = endpointMap[key];
 if (!base) { renderBrowseError('Endpoint indisponibil pentru ' + key); return; }

 const params = new URLSearchParams({ page: state.browse.page, limit: 50 });
 if (state.browse.q) params.set('q', state.browse.q);
 if (state.browse.brand) params.set('brand', state.browse.brand);
 if (state.browse.stock) params.set('stock', state.browse.stock);

 try {
 const data = await requestJson(`${base}?${params.toString()}`, { auth: false });
 state.browse.data = data;
 state.browse.loading = false;
 renderBrowseTable(data, key);
 } catch (error) {
 state.browse.loading = false;
 renderBrowseError(error.message || 'Eroare la incarcare produse.');
 }
 }

 function renderBrowseLoading() {
 const tbody = qs('#browseTableBody');
 const info = qs('#browsePaginationInfo');
 if (info) info.textContent = 'Se incarca…';
 if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--muted)">
 <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="animation:spin 1s linear infinite;display:inline-block"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
 Se incarca produsele…
 </td></tr>`;
 }

 function renderBrowseError(msg) {
 const tbody = qs('#browseTableBody');
 const info = qs('#browsePaginationInfo');
 if (info) info.textContent = '';
 if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="padding:28px;text-align:center;color:var(--red);font-weight:600">${escapeHtml(msg)}</td></tr>`;
 }

 function renderBrowseTable(data, key) {
 const tbody = qs('#browseTableBody');
 const info = qs('#browsePaginationInfo');
 const prevBtn = qs('#browsePrevBtn');
 const nextBtn = qs('#browseNextBtn');
 const brandsEl = qs('#browseBrand');

 if (!tbody) return;

 const items = data?.items || [];
 const total = toNumber(data?.total);
 const page = toNumber(data?.page) || 1;
 const pages = toNumber(data?.pages) || 1;
 const margin = toNumber(state.marginConfig[key]?.margin ?? API_CONFIGS[key]?.defaultMargin ?? 25);
 const cfg = API_CONFIGS[key] || {};

 if (info) info.textContent = `${total.toLocaleString('ro-RO')} produse · Pagina ${page}/${pages}`;
 if (prevBtn) prevBtn.disabled = page <= 1;
 if (nextBtn) nextBtn.disabled = page >= pages;

 // Populate brand filter if first page and brands available
 if (brandsEl && data?.brands?.length && page === 1 && !state.browse.brand) {
 const opts = ['<option value="">Toate marcile</option>']
 .concat((data.brands || []).slice(0, 60).map(b => `<option value="${escapeHtml(b.label)}">${escapeHtml(b.label)} (${b.count})</option>`));
 brandsEl.innerHTML = opts.join('');
 }

 if (!items.length) {
 tbody.innerHTML = `<tr><td colspan="7" style="padding:28px;text-align:center;color:var(--muted);font-weight:600">Niciun produs gasit pentru filtrul selectat.</td></tr>`;
 return;
 }

 tbody.innerHTML = items.map(item => {
 const supplierPrice = toNumber(item.price);
 const clientPrice = supplierPrice * (1 + margin / 100);
 const stockBadge = !toNumber(item.stock)
 ? '<span class="badge badge-cancelled" style="font-size:11px">Fara stoc</span>'
 : toNumber(item.stock) <= 3
 ? '<span class="badge badge-pending" style="font-size:11px">Stoc scazut</span>'
 : '<span class="badge badge-shipped" style="font-size:11px">In stoc</span>';
 return `<tr>
 <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(item.name || '')}">
 <span style="font-weight:700;font-size:13px;color:var(--dark)">${escapeHtml(item.name || 'Produs')}</span>
 </td>
 <td class="td-mono" style="font-size:12px">${escapeHtml(item.sku || item.id || '—')}</td>
 <td style="font-size:12.5px">${escapeHtml(item.brand || '—')}</td>
 <td class="td-bold" style="color:var(--mid)">${supplierPrice > 0 ? formatRON(supplierPrice) : '—'}</td>
 <td style="font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:800;color:var(--green)">${clientPrice > 0 ? formatRON(clientPrice) : '—'}</td>
 <td style="font-size:12px;color:var(--muted);font-weight:700">${margin > 0 ? '+' + margin + '%' : '—'}</td>
 <td>${stockBadge}</td>
 </tr>`;
 }).join('');
 }

 function browseSearch() {
 const key = state.browse.key;
 if (!key) return;
 state.browse.q = qs('#browseQ')?.value || '';
 state.browse.brand = qs('#browseBrand')?.value || '';
 state.browse.stock = qs('#browseStock')?.value || '';
 browseSupplierLoad(key, 1);
 }

 function browsePage(delta) {
 const key = state.browse.key;
 if (!key) return;
 const newPage = Math.max(1, state.browse.page + delta);
 browseSupplierLoad(key, newPage);
 }

 function updateBadges() {
 const metrics = state.dashboard?.metrics || {};
 const ordersBadge = qs('#badgeOrders');
 const productsBadge = qs('#badgeProd');
 if (ordersBadge) ordersBadge.textContent = String(toNumber(metrics.totalOrders));
 if (productsBadge) productsBadge.textContent = String(toNumber(metrics.lowStockProducts));
 }

 function filterOrders(value) {
 state.orderSearch = String(value || '');
 applyOrderFilters();
 renderOrdersTable();
 }

 function filterOrdersByStatus(value) {
 state.orderStatus = String(value || '');
 applyOrderFilters();
 renderOrdersTable();
 }

 function filterCustomers(value) {
 state.customerSearch = String(value || '');
 applyCustomerFilters();
 renderCustomersTable();
 }

 function exportCSV() {
 const rows = [['ID', 'Client', 'Email', 'Produse', 'Total', 'Plata', 'Status', 'Data']];
 state.filteredOrders.forEach((order) => {
 rows.push([
 order.id,
 order.client,
 order.email,
 order.products,
 formatRON(order.total),
 order.payment,
 order.status,
 formatDateTime(order.createdAt),
 ]);
 });

 const csv = rows
 .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
 .join('\n');
 const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a');
 link.href = url;
 link.download = 'motoras-admin-orders.csv';
 link.click();
 URL.revokeObjectURL(url);
 }

 async function testApi() {
 try {
 await fetchDashboard();
 renderDashboard();
 const active = (state.dashboard?.apiStatus || []).filter(item => item.status === 'active').length;
 showAdminToast(`API check OK: ${active}/${(state.dashboard?.apiStatus || []).length} endpoint-uri active`, 'success');
 } catch (error) {
 showAdminToast(error.message || 'Testul API a esuat.', 'error');
 }
 }

 async function syncSupplier() {
 try {
 await Promise.all([fetchDashboard()]);
 renderDashboard();
 showAdminToast('Snapshot-ul de produse a fost reimprospatat', 'success');
 } catch (error) {
 showAdminToast(error.message || 'Sincronizarea nu a reusit.', 'error');
 }
 }

 async function syncSupplierApi(key) {
 const label = API_CONFIGS[key]?.label || key;
 showAdminToast(`Sincronizare ${label}…`, 'info');
 try {
 await loadSupplierStats();
 renderApiPanel();
 showAdminToast(`${label} sincronizat: ${(state.supplierStats[key]?.total || 0).toLocaleString('ro-RO')} produse`, 'success');
 } catch (error) {
 showAdminToast(error.message || `Sincronizare ${label} esuata.`, 'error');
 }
 }

 async function loadSupplierStats() {
 const apis = {
 bravus: '/api/bravus?view=count',
 carhub: '/api/carhub?view=count',
 globiz: '/api/globiz?view=count',
 casabateriilor: '/api/casabateriilor?view=count',
 };
 await Promise.allSettled(
 Object.entries(apis).map(async ([key, url]) => {
 try {
 const data = await requestJson(url, { auth: false });
 if (data?.ok) state.supplierStats[key] = data;
 } catch (_) {}
 })
 );
 }

 const SUPPLIER_META = {
 bravus: { label: 'Bravus Auto', abbrev: 'BR', color: '#cc1111' },
 carhub: { label: 'CarHub', abbrev: 'CH', color: '#2563eb' },
 globiz: { label: 'Globiz', abbrev: 'GL', color: '#1a9e4a' },
 casabateriilor: { label: 'Casa Bateriilor', abbrev: 'CB', color: '#0ea5e9' },
 };
 const COURIERS = ['Fan Courier','DPD Romania','Cargus','DHL Romania','Sameday','GLS Romania','UPS','Altul'];
 const STATUS_FLOW = [
 { val: 'processing', label: 'In procesare', color: '#2563eb' },
 { val: 'ordered_supplier', label: 'Comandat furnizor', color: '#7c3aed' },
 { val: 'shipped', label: 'Expediat', color: '#1a9e4a' },
 { val: 'delivered', label: 'Livrat', color: '#059669' },
 { val: 'cancelled', label: 'Anulat', color: '#dc2626' },
 ];

 function supplierBadge(src) {
 const s = SUPPLIER_META[src];
 if (!s) return `<span style="background:#f3f4f6;color:#6b7280;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;text-transform:uppercase">Direct</span>`;
 return `<span style="background:${s.color}18;color:${s.color};font-size:10px;font-weight:800;padding:2px 7px;border-radius:4px;text-transform:uppercase">${escapeHtml(s.label)}</span>`;
 }

 async function viewOrder(id) {
 const modal = qs('.modal', qs('#modalOverlay'));
 if (modal) modal.style.maxWidth = '800px';
 qs('#modalTitle').textContent = `Comanda ${id}`;
 qs('#modalBody').innerHTML = `<div style="padding:40px;text-align:center;color:var(--muted);font-weight:600">Se incarca comanda...</div>`;
 qs('#modalOverlay').classList.add('open');

 let order = state.orders.find(o => o.id === id);
 try {
 const result = await requestJson(`/api/orders?id=${encodeURIComponent(id)}`);
 const enriched = normalizeOrder(result.order);
 // Merge enriched items (with source) back into state
 if (order) { order.raw = result.order; order = Object.assign(order, enriched); }
 else { order = enriched; }
 } catch (_) { /* use cached order */ }

 if (!order) {
 qs('#modalBody').innerHTML = `<div style="padding:24px">Comanda nu a fost gasita.</div>`;
 return;
 }

 const raw = order.raw || {};
 const items = Array.isArray(raw.items) ? raw.items : [];
 const tracking = raw.tracking_number || order.tracking_number || '';
 const courier = raw.tracking_courier || order.tracking_courier || '';
 const sentAt = raw.tracking_sent_at || order.tracking_sent_at || '';
 const fullAddr = [raw.address || order.address, raw.city || order.city, raw.county || order.county, raw.zip || order.zip].filter(Boolean).join(', ');

 // Group items by supplier
 const bySupplier = {};
 items.forEach(item => {
 const src = item.source || 'direct';
 (bySupplier[src] = bySupplier[src] || []).push(item);
 });

 // Items table rows
 const itemRows = items.length ? items.map((item, i) => `
 <tr>
 <td style="padding:9px 12px;font-size:12px;color:var(--muted);text-align:center">${i+1}</td>
 <td style="padding:9px 12px">
 <div style="font-size:13px;font-weight:700;line-height:1.3">${escapeHtml(item.name || 'Produs')}</div>
 ${item.brand ? `<div style="font-size:11px;color:var(--muted)">${escapeHtml(item.brand)}</div>` : ''}
 </td>
 <td style="padding:9px 12px;font-family:monospace;font-size:11.5px;color:var(--muted)">${escapeHtml(item.sku || item.id || '—')}</td>
 <td style="padding:9px 12px">${supplierBadge(item.source || '')}</td>
 <td style="padding:9px 12px;text-align:center;font-weight:800;font-size:14px">${item.qty || 1}</td>
 <td style="padding:9px 12px;text-align:right;font-weight:800;color:var(--red)">${formatRON(toNumber(item.price) * toNumber(item.qty || 1))}</td>
 </tr>`).join('')
 : `<tr><td colspan="6" style="padding:18px;text-align:center;color:var(--muted)">Niciun produs in snapshot.</td></tr>`;

 const supplierNotifiedAt = raw.supplier_notified_at || order.supplier_notified_at || '';
 const supplierEmailEnv = ''; // shown as placeholder

 // Supplier cards
 const supplierCards = Object.entries(bySupplier).map(([src, srcItems]) => {
 const s = SUPPLIER_META[src] || { label: src === 'direct' ? 'Direct / Necunoscut' : src, abbrev: src.slice(0,2).toUpperCase(), color: '#6b7280' };
 const rows = srcItems.map(item => `
 <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f0f2f5">
 <div style="flex:1;font-size:12.5px;font-weight:600;line-height:1.3">${escapeHtml(item.name)}</div>
 <code style="font-size:11px;color:var(--muted)">${escapeHtml(item.sku || item.id || '')}</code>
 <div style="font-weight:800;font-size:13px;flex-shrink:0">×${item.qty || 1}</div>
 </div>`).join('');
 return `<div style="flex:1;min-width:190px;background:#fafbfc;border:1.5px solid ${s.color}30;border-radius:10px;padding:14px">
 <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
 <div style="width:26px;height:26px;background:${s.color};border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;color:#fff;flex-shrink:0">${s.abbrev}</div>
 <div style="font-size:13px;font-weight:800">${escapeHtml(s.label)}</div>
 <div style="margin-left:auto;background:${s.color}20;color:${s.color};font-size:10px;font-weight:800;padding:1px 8px;border-radius:99px">${srcItems.length} prod.</div>
 </div>${rows}</div>`;
 }).join('');

 qs('#modalTitle').textContent = `Comanda ${order.id}`;
 qs('#modalBody').innerHTML = `
 <div style="padding:20px;display:flex;flex-direction:column;gap:18px">

 <!-- KPI strip -->
 <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
 <div style="background:#fafbfc;border-radius:8px;padding:11px 14px">
 <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Status</div>
 ${badgeForStatus(order.status)}
 </div>
 <div style="background:#fafbfc;border-radius:8px;padding:11px 14px">
 <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Plata</div>
 ${badgeForStatus(order.payment)}
 </div>
 <div style="background:#fafbfc;border-radius:8px;padding:11px 14px">
 <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Total</div>
 <div style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:800;color:var(--red)">${formatRON(order.total)}</div>
 </div>
 <div style="background:#fafbfc;border-radius:8px;padding:11px 14px">
 <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Data</div>
 <div style="font-size:12px;font-weight:600">${formatDateTime(order.createdAt)}</div>
 </div>
 </div>

 <!-- Products table -->
 <div>
 <div style="font-size:10.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:9px">📦 Produse Comandate</div>
 <div style="border:1.5px solid var(--border);border-radius:10px;overflow:hidden">
 <table style="width:100%;border-collapse:collapse">
 <thead style="background:#fafbfc"><tr>
 <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">#</th>
 <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Produs</th>
 <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">SKU</th>
 <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Furnizor</th>
 <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Cant.</th>
 <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Total</th>
 </tr></thead>
 <tbody>${itemRows}</tbody>
 </table>
 </div>
 </div>

 <!-- Supplier breakdown -->
 ${Object.keys(bySupplier).length ? `
 <div>
 <div style="font-size:10.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:9px">🏪 Comenzi de Plasat la Furnizor</div>
 <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">${supplierCards}</div>
 <div style="background:#fff9f9;border:1.5px solid rgba(204,17,17,.2);border-radius:10px;padding:14px 16px">
 <div style="font-size:10.5px;font-weight:800;color:var(--red);text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">📦 Trimite comandă la furnizor</div>
 <div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:flex-end">
 <div>
 <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:5px">Email furnizor (opțional — folosește SUPPLIER_EMAIL din env dacă lipsește)</div>
 <input id="supplierEmailInput" type="email" class="form-input" placeholder="furnizor@supplier.ro" style="font-size:13px;width:100%"/>
 </div>
 <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
 <button class="btn-sm btn-primary" style="white-space:nowrap;background:var(--red)" onclick="adminSendSupplierOrder('${escapeHtml(order.id)}')">
 <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
 Trimite la furnizor
 </button>
 </div>
 </div>
 ${supplierNotifiedAt ? `<div style="margin-top:8px;font-size:12px;color:#166534;display:flex;align-items:center;gap:5px"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Email trimis la furnizor: ${escapeHtml(formatDateTime(supplierNotifiedAt))}</div>` : ''}
 </div>
 </div>` : ''}

 <!-- Client info -->
 <div>
 <div style="font-size:10.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:9px">👤 Date Client</div>
 <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px">
 <div style="background:#fafbfc;border-radius:8px;padding:10px 13px">
 <div style="font-size:10px;color:var(--muted);font-weight:600;margin-bottom:3px">Nume</div>
 <div style="font-weight:700;font-size:13px">${escapeHtml(order.client)}</div>
 </div>
 <div style="background:#fafbfc;border-radius:8px;padding:10px 13px">
 <div style="font-size:10px;color:var(--muted);font-weight:600;margin-bottom:3px">Email</div>
 <a href="mailto:${escapeHtml(order.email)}" style="font-weight:700;font-size:13px;color:var(--red);text-decoration:none">${escapeHtml(order.email || '—')}</a>
 </div>
 <div style="background:#fafbfc;border-radius:8px;padding:10px 13px">
 <div style="font-size:10px;color:var(--muted);font-weight:600;margin-bottom:3px">Telefon</div>
 <div style="font-weight:700;font-size:13px">${escapeHtml(order.phone || '—')}</div>
 </div>
 ${fullAddr ? `<div style="background:#fafbfc;border-radius:8px;padding:10px 13px;grid-column:1/-1">
 <div style="font-size:10px;color:var(--muted);font-weight:600;margin-bottom:3px">Adresă livrare</div>
 <div style="font-weight:600;font-size:13px">${escapeHtml(fullAddr)}</div>
 </div>` : ''}
 </div>
 </div>

 <!-- Tracking / AWB -->
 <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:16px">
 <div style="font-size:10.5px;font-weight:800;color:#166534;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">🚚 Expediere & AWB</div>
 <div style="display:grid;grid-template-columns:190px 1fr auto;gap:10px;align-items:flex-end">
 <div>
 <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:5px">Curier</div>
 <select id="orderCourierSelect" class="form-select" style="font-size:13px">
 <option value="">Alege curier...</option>
 ${COURIERS.map(c => `<option value="${escapeHtml(c)}"${courier===c?' selected':''}>${escapeHtml(c)}</option>`).join('')}
 </select>
 </div>
 <div>
 <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:5px">Număr AWB</div>
 <input id="orderTrackingInput" class="form-input" type="text" placeholder="ex: 1234567890" value="${escapeHtml(tracking)}" style="font-family:monospace;font-size:14px;font-weight:700;letter-spacing:.5px"/>
 </div>
 <div style="display:flex;flex-direction:column;gap:6px">
 <button class="btn-sm btn-primary" style="white-space:nowrap" onclick="adminSendTrackingEmail('${escapeHtml(order.id)}')">
 <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
 Trimite email client
 </button>
 <button class="btn-sm btn-outline" style="white-space:nowrap" onclick="adminSaveTracking('${escapeHtml(order.id)}')">
 <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v14a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
 Salveaza AWB
 </button>
 </div>
 </div>
 ${sentAt ? `<div style="margin-top:10px;font-size:12px;color:#166534;display:flex;align-items:center;gap:5px"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Email trimis la ${escapeHtml(formatDateTime(sentAt))}</div>` : ''}
 </div>

 <!-- Status workflow -->
 <div>
 <div style="font-size:10.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:9px">🔄 Schimba Status</div>
 <div style="display:flex;gap:8px;flex-wrap:wrap">
 ${STATUS_FLOW.map(s => {
 const active = order.status === s.val;
 return `<button class="btn-sm" style="border:1.5px solid ${s.color};background:${active ? s.color : 'transparent'};color:${active ? '#fff' : s.color};font-weight:700" onclick="adminQuickStatus('${escapeHtml(order.id)}','${s.val}')">
 ${active ? '✓ ' : ''}${escapeHtml(s.label)}
 </button>`;
 }).join('')}
 </div>
 </div>

 <!-- Footer -->
 <div style="display:flex;justify-content:flex-end;padding-top:6px;border-top:1px solid var(--border)">
 <button class="btn-sm btn-outline" onclick="closeModal()">Inchide</button>
 </div>

 </div>`;
 }

 function closeModal() {
 qs('#modalOverlay').classList.remove('open');
 // Reset modal width
 const modal = qs('.modal', qs('#modalOverlay'));
 if (modal) modal.style.maxWidth = '';
 }

 async function adminQuickStatus(id, status) {
 try {
 await requestJson('/api/orders', { method: 'PATCH', body: { id, status } });
 const o = state.orders.find(x => x.id === id);
 if (o) { o.status = status; if (o.raw) o.raw.status = status; }
 applyOrderFilters();
 renderOrdersTable();
 showAdminToast('Status actualizat.', 'success');
 viewOrder(id);
 } catch (err) {
 showAdminToast(err.message || 'Actualizarea a esuat.', 'error');
 }
 }

 async function adminSaveTracking(id) {
 const tracking = String(qs('#orderTrackingInput')?.value || '').trim();
 const courier = String(qs('#orderCourierSelect')?.value || '').trim();
 if (!tracking || !courier) { showAdminToast('Introdu curierul si numarul AWB.', 'error'); return; }
 try {
 await requestJson('/api/orders', { method: 'PATCH', body: { id, tracking_number: tracking, tracking_courier: courier } });
 const o = state.orders.find(x => x.id === id);
 if (o) { o.tracking_number = tracking; o.tracking_courier = courier; if (o.raw) { o.raw.tracking_number = tracking; o.raw.tracking_courier = courier; } }
 showAdminToast('AWB salvat in Stripe.', 'success');
 } catch (err) {
 showAdminToast(err.message || 'Salvarea AWB a esuat.', 'error');
 }
 }

 async function adminSendSupplierOrder(id) {
 const supplierEmail = String(qs('#supplierEmailInput')?.value || '').trim();
 try {
 const body = { id, send_supplier_order: true };
 if (supplierEmail) body.supplier_email = supplierEmail;
 await requestJson('/api/orders', { method: 'PATCH', body });
 showAdminToast('Email trimis la furnizor cu succes.', 'success');
 viewOrder(id);
 } catch (err) {
 showAdminToast(err.message || 'Trimiterea la furnizor a eșuat.', 'error');
 }
 }

 async function adminSendTrackingEmail(id) {
 const tracking = String(qs('#orderTrackingInput')?.value || '').trim();
 const courier = String(qs('#orderCourierSelect')?.value || '').trim();
 if (!tracking || !courier) { showAdminToast('Introdu curierul si AWB-ul inainte de a trimite emailul.', 'error'); return; }
 const order = state.orders.find(o => o.id === id);
 if (!order) { showAdminToast('Comanda nu a fost gasita.', 'error'); return; }
 const raw = order.raw || {};
 const fullAddr = [raw.address || order.address, raw.city || order.city, raw.county || order.county, raw.zip || order.zip].filter(Boolean).join(', ');
 try {
 // Single PATCH call: saves tracking + sends email server-side
 const result = await requestJson('/api/orders', { method: 'PATCH', body: {
 id,
 tracking_number: tracking,
 tracking_courier: courier,
 send_email: true,
 email_to: order.email,
 email_customer_name: order.client,
 email_items: Array.isArray(raw.items) ? raw.items : [],
 email_total: order.total,
 email_address: fullAddr,
 }});
 if (result.email?.error) throw new Error(result.email.error);
 const now = new Date().toISOString();
 if (order.raw) { order.raw.tracking_sent_at = now; order.raw.tracking_number = tracking; order.raw.tracking_courier = courier; }
 order.tracking_sent_at = now;
 showAdminToast(`Email de expediere trimis la ${order.email}`, 'success');
 viewOrder(id);
 } catch (err) {
 showAdminToast(err.message || 'Trimiterea emailului a esuat.', 'error');
 }
 }

 async function saveOrderInline(id) {
 // Legacy — kept for any existing callers
 try {
 const status = String(qs('#orderStatusSelect')?.value || '');
 await requestJson('/api/orders', { method: 'PATCH', body: { id, status } });
 closeModal();
 await reloadAdminData();
 showAdminToast('Comanda a fost actualizata.', 'success');
 } catch (err) {
 showAdminToast(err.message || 'Actualizarea comenzii a esuat.', 'error');
 }
 }

 async function bootstrap() {
 setUserLabel();
 updateClock();
 setInterval(updateClock, 1000);

 ['#loginUser', '#loginPass'].forEach((selector) => {
 qs(selector)?.addEventListener('keydown', (event) => {
 if (event.key === 'Enter') doLogin();
 });
 });

 qs('#mobSidebarBtn')?.addEventListener('click', () => {
 qs('#sidebar')?.classList.toggle('mob-open');
 qs('#sidebarOverlay')?.classList.toggle('show');
 });
 qsa('.nav-item').forEach(item => item.addEventListener('click', closeSidebar));
 document.addEventListener('keydown', (event) => {
 if (event.key === 'Escape') {
 closeModal();
 closeSidebar();
 }
 });

 if (!state.token) {
 showLoginScreen();
 return;
 }

 try {
 showAppScreen();
 await reloadAdminData();
 } catch (error) {
 clearSession();
 showAdminToast(error.message || 'Nu am putut restaura sesiunea admin.', 'error');
 }
 }

 window.doLogin = doLogin;
 window.doLogout = doLogout;
 window.showPanel = showPanel;
 window.closeSidebar = closeSidebar;
 window.openModal = openModal;
 window.closeModal = closeModal;
 window.filterOrders = filterOrders;
 window.filterOrdersByStatus = filterOrdersByStatus;
 window.filterCustomers = filterCustomers;
 window.refreshProducts = refreshProducts;
 window.exportCSV = exportCSV;
 window.testApi = testApi;
 window.syncSupplier = syncSupplier;
 window.viewOrder = viewOrder;
 window.adminQuickStatus = adminQuickStatus;
 window.adminSaveTracking = adminSaveTracking;
 window.adminSendTrackingEmail = adminSendTrackingEmail;
 window.adminSendSupplierOrder = adminSendSupplierOrder;
 window.updateApiToggle = updateApiToggle;
 window.updateApiMargin = updateApiMargin;
 window.saveMarginConfig = saveMarginConfig;
 window.updateCalc = updateCalc;
 window.saveOrderInline = saveOrderInline;
 window.showAdminToast = showAdminToast;
 window.openSupplierBrowse = openSupplierBrowse;
 window.closeBrowseModal = closeBrowseModal;
 window.browseSearch = browseSearch;
 window.browsePage = browsePage;
 window.syncSupplierApi = syncSupplierApi;

 document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
})();
