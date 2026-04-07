
window.MotorasStore = (() => {
  const CART_KEY = 'motoras_cart';
  const LAST_ORDER_KEY = 'motoras_last_order';
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch { return fallback; }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const getCart = () => read(CART_KEY, []);
  const setCart = cart => write(CART_KEY, cart);
  const getCartCount = () => getCart().reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const getCartTotal = () => getCart().reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
  const formatPrice = value => `${Number(value || 0).toLocaleString('ro-RO')} RON`;
  const updateBadges = () => {
    document.querySelectorAll('#cartBadge, .cart-count').forEach(el => { if (el.id === 'cartBadge' || el.classList.contains('cart-count')) el.textContent = getCartCount(); });
  };
  const addToCart = (name, brand, price, img, id = null) => {
    const cart = getCart();
    const existing = cart.find(item => String(item.id) === String(id || item.id) || item.name === name);
    if (existing) existing.qty += 1;
    else cart.push({ id: id || Date.now(), name, brand, price, img, qty: 1 });
    setCart(cart); updateBadges();
    return cart;
  };
  const removeFromCart = id => {
    const cart = getCart().filter(item => item.id !== id);
    setCart(cart); updateBadges(); return cart;
  };
  const changeQty = (id, delta) => {
    const cart = getCart().map(item => item.id === id ? { ...item, qty: item.qty + delta } : item).filter(item => item.qty > 0);
    setCart(cart); updateBadges(); return cart;
  };
  const saveLastOrder = order => write(LAST_ORDER_KEY, order);
  const getLastOrder = () => read(LAST_ORDER_KEY, null);
  const attachSearch = ({ inputId = 'searchInput', target = 'search.html' } = {}) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    const go = () => {
      const q = input.value.trim();
      if (q) window.location.href = `${target}?q=${encodeURIComponent(q)}`;
    };
    input.form?.addEventListener('submit', e => { e.preventDefault(); go(); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  };
  document.addEventListener('DOMContentLoaded', updateBadges);
  return { CART_KEY, LAST_ORDER_KEY, getCart, setCart, getCartCount, getCartTotal, formatPrice, updateBadges, addToCart, removeFromCart, changeQty, saveLastOrder, getLastOrder, attachSearch };
})();
