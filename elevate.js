/* ==========================================================================
 MOTORAȘ · ELEVATION LAYER (v2 — PERFORMANCE TUNED)
 Cheap, event-driven, no polling. Respects prefers-reduced-motion.
 ========================================================================== */
(function () {
 'use strict';

 var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 var d = document;

 /* ----------- 1. Scroll-reveal (single observer, MutationObserver-driven) ----------- */
 var REVEAL_SELECTORS = '.section-hdr,.trust-it,.cat-card,.prod-card,.promo-text,.promo-badges,.pbadge,.home-map-card,.home-collection-note,.vs-in,.footer-col,.footer-brand';

 var revealIO = null;
 function ensureRevealIO() {
 if (revealIO) return revealIO;
 if (reduced) return null;
 revealIO = new IntersectionObserver(function (entries) {
 for (var i = 0; i < entries.length; i++) {
 var entry = entries[i];
 if (entry.isIntersecting) {
 entry.target.classList.add('is-in');
 if (entry.target.classList.contains('section-hdr')) {
 entry.target.classList.add('elev-in');
 }
 revealIO.unobserve(entry.target);
 }
 }
 }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
 return revealIO;
 }

 function observeReveal(root) {
 if (reduced) {
 (root || d).querySelectorAll(REVEAL_SELECTORS).forEach(function (el) {
 if (!el.hasAttribute('data-reveal')) el.setAttribute('data-reveal', '');
 el.classList.add('is-in');
 if (el.classList.contains('section-hdr')) el.classList.add('elev-in');
 });
 return;
 }
 var io = ensureRevealIO();
 if (!io) return;
 (root || d).querySelectorAll(REVEAL_SELECTORS).forEach(function (el) {
 if (el.dataset.revealObserved) return;
 el.dataset.revealObserved = '1';
 el.setAttribute('data-reveal', '');
 io.observe(el);
 });
 }

 /* ----------- 2. Header scroll shadow (passive, rAF-throttled) ----------- */
 function headerScroll() {
 var header = d.querySelector('.header');
 if (!header) return;
 var ticking = false;
 function update() {
 if (window.scrollY > 40) header.classList.add('elev-scrolled');
 else header.classList.remove('elev-scrolled');
 ticking = false;
 }
 window.addEventListener('scroll', function () {
 if (!ticking) { requestAnimationFrame(update); ticking = true; }
 }, { passive: true });
 update();
 }

 /* ----------- 3. Add-to-cart thunk + flying "+1" + badge kick ----------- */
 function flyPlusOne(fromEl, toEl, label) {
 if (reduced || !fromEl || !toEl) return;
 var fromRect = fromEl.getBoundingClientRect();
 var toRect = toEl.getBoundingClientRect();
 var chip = d.createElement('div');
 chip.className = 'elev-fly-chip';
 chip.textContent = label || '+1';
 chip.style.left = (fromRect.left + fromRect.width / 2 - 20) + 'px';
 chip.style.top = (fromRect.top + fromRect.height / 2 - 14) + 'px';
 chip.style.opacity = '0';
 chip.style.transform = 'translate3d(0,0,0) scale(.6)';
 d.body.appendChild(chip);

 var targetX = toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2);
 var targetY = toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2);

 requestAnimationFrame(function () {
 chip.style.transition = 'transform .14s cubic-bezier(.34,1.56,.64,1), opacity .14s ease';
 chip.style.opacity = '1';
 chip.style.transform = 'translate3d(0,-8px,0) scale(1.05)';
 setTimeout(function () {
 chip.style.transition = 'transform .42s cubic-bezier(.6,.04,.98,.34), opacity .42s ease-in';
 chip.style.transform = 'translate3d(' + targetX + 'px,' + targetY + 'px,0) scale(.35)';
 chip.style.opacity = '0';
 }, 140);
 setTimeout(function () {
 if (chip.parentNode) chip.parentNode.removeChild(chip);
 }, 620);
 });
 }

 function kickBadge(el) {
 if (!el) return;
 el.classList.remove('elev-kick');
 void el.offsetWidth;
 el.classList.add('elev-kick');
 setTimeout(function () { el.classList.remove('elev-kick'); }, 480);
 }

 function thunkButton(btn) {
 if (!btn || reduced) return;
 btn.classList.remove('elev-thunk');
 void btn.offsetWidth;
 btn.classList.add('elev-thunk');
 setTimeout(function () { btn.classList.remove('elev-thunk'); }, 400);
 }

 function wireAddToCart() {
 d.addEventListener('click', function (ev) {
 var t = ev.target;
 if (!t || !t.closest) return;
 var btn = t.closest('.btn-add, .btn-quick-add, [data-add-to-cart], .btn-add-to-cart');
 if (btn) {
 thunkButton(btn);
 var cartIcon = d.querySelector('.btn-cart');
 flyPlusOne(btn, cartIcon, '+1');
 setTimeout(function () { kickBadge(d.querySelector('.cart-count')); }, 520);
 return;
 }
 var wish = t.closest('.prod-wish, [data-toggle-favorite], .btn-fav-toggle');
 if (wish) {
 var favBtn = d.querySelector('.btn-fav');
 flyPlusOne(wish, favBtn, '♥');
 setTimeout(function () { kickBadge(d.querySelector('.fav-count')); }, 520);
 }
 }, true);
 }

 /* ----------- 4. Hero word-rise (one-shot) ----------- */
 function heroTitleRise() {
 if (reduced) return;
 var title = d.querySelector('.hero-title');
 if (!title || title.dataset.elevated) return;
 title.dataset.elevated = '1';

 function splitTextNode(node) {
 var frag = d.createDocumentFragment();
 var words = node.textContent.split(/(\s+)/);
 for (var i = 0; i < words.length; i++) {
 var w = words[i];
 if (/^\s+$/.test(w)) { frag.appendChild(d.createTextNode(w)); continue; }
 var span = d.createElement('span');
 span.className = 'elev-word';
 span.textContent = w;
 frag.appendChild(span);
 }
 return frag;
 }

 try {
 var kids = Array.prototype.slice.call(title.childNodes);
 for (var i = 0; i < kids.length; i++) {
 var n = kids[i];
 if (n.nodeType === 3 && n.textContent.trim()) {
 title.replaceChild(splitTextNode(n), n);
 } else if (n.nodeType === 1 && n.tagName === 'EM') {
 n.classList.add('elev-word-em');
 }
 }
 var parts = title.querySelectorAll('.elev-word');
 for (var j = 0; j < parts.length; j++) {
 parts[j].style.animationDelay = (40 + j * 40) + 'ms';
 }
 } catch (err) {
 title.querySelectorAll('.elev-word').forEach(function (el) {
 el.style.opacity = '1';
 el.style.transform = 'none';
 });
 }
 }

 /* ----------- 5. Init ----------- */
 function init() {
 observeReveal();
 headerScroll();
 wireAddToCart();
 heroTitleRise();

 // Watch for dynamically-added product grids (category/search/home featured).
 // Cheaper than setInterval polling.
 if (!reduced && 'MutationObserver' in window) {
 var mo = new MutationObserver(function (mutations) {
 for (var i = 0; i < mutations.length; i++) {
 var adds = mutations[i].addedNodes;
 for (var j = 0; j < adds.length; j++) {
 var node = adds[j];
 if (node.nodeType !== 1) continue;
 if (node.matches && node.matches(REVEAL_SELECTORS)) {
 observeReveal(node.parentNode || d);
 } else if (node.querySelector && node.querySelector(REVEAL_SELECTORS)) {
 observeReveal(node);
 }
 }
 }
 });
 mo.observe(d.body, { childList: true, subtree: true });
 }
 }

 if (d.readyState === 'loading') {
 d.addEventListener('DOMContentLoaded', init);
 } else {
 init();
 }

 // Public API for other scripts (cart, favorites)
 window.MotorasElevate = {
 flyPlusOne: flyPlusOne,
 kickCartBadge: function () { kickBadge(d.querySelector('.cart-count')); },
 kickFavBadge: function () { kickBadge(d.querySelector('.fav-count')); },
 thunk: thunkButton
 };
})();
