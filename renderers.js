
window.MotorasCommon = (() => {
  const map = {
    terms:'termeni.html', privacy:'confidentialitate.html', returns:'retururi.html', delivery:'livrare.html', contact:'contact.html', cookies:'cookies.html', faq:'faq.html', about:'despre.html', admin:'admin.html'
  };

  const legalChrome = {
    topbar: `<div class="common-topbar"><div class="in"><span>Motoraș · Piese auto & accesorii</span><span>București · Livrare în toată România · 0731 284 932</span></div></div>`,
    header: `<header class="legal-header"><div class="in"><a class="brand-link" href="index.html"><span class="brand-badge">M</span><span>Motoraș</span></a><nav class="common-nav"><a href="index.html">Acasă</a><a href="category.html?cat=piese">Piese</a><a href="category.html?cat=uleiuri">Uleiuri</a><a href="category.html?cat=filtre">Filtre</a><a href="account.html">Contul meu</a><a href="contact.html">Contact</a></nav></div></header>`,
    footer: `<footer class="common-footer"><div class="in"><div class="common-footer-grid"><div><h4>Motoraș</h4><p>Piese auto originale și aftermarket, livrare rapidă și suport clar înainte și după comandă.</p></div><div><h4>Magazin</h4><p><a href="category.html?cat=piese">Piese auto</a></p><p><a href="category.html?cat=filtre">Filtre</a></p><p><a href="category.html?cat=uleiuri">Uleiuri</a></p></div><div><h4>Ajutor</h4><p><a href="livrare.html">Livrare &amp; plată</a></p><p><a href="retururi.html">Retururi</a></p><p><a href="contact.html">Contact</a></p><p><a href="faq.html">FAQ</a></p></div><div><h4>Legal</h4><p><a href="termeni.html">Termeni</a></p><p><a href="confidentialitate.html">Confidențialitate</a></p><p><a href="cookies.html">Cookies</a></p></div></div><div class="bottom"><span>© 2026 Motoraș · structură demo pregătită pentru integrare Stripe / FGO / supplier API</span><span><a href="https://anpc.ro/ce-este-sal/" target="_blank" rel="noopener">ANPC SAL</a> · <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener">SOL UE</a></span></div></div></footer>`
  };

  function patchFooterLinks(){
    document.querySelectorAll('a[href="index.html#footer"]').forEach(a=>{
      const t=(a.textContent||'').toLowerCase();
      if(t.includes('termen')) a.href = map.terms;
      else if(t.includes('confiden')) a.href = map.privacy;
      else if(t.includes('cookie')) a.href = map.cookies;
      else if(t.includes('retur')) a.href = map.returns;
      else if(t.includes('livrare') || t.includes('plată') || t.includes('plata')) a.href = map.delivery;
      else if(t.includes('contact') || t.includes('program') || t.includes('loca')) a.href = map.contact;
      else if(t.includes('despre')) a.href = 'despre.html';
      else if(t.includes('faq') || t.includes('intreb')) a.href = map.faq;
      else if(t.includes('admin')) a.href = map.admin;
    });
  }
  function patchLegalMentions(){
    document.querySelectorAll('a[href="checkout.html"]').forEach(a=>{
      if((a.textContent||'').toLowerCase().includes('livrare')) a.href='livrare.html';
    });
  }
  function renderLegalChrome(){
    const topbar = document.querySelector('[data-legal-topbar]');
    if (topbar) topbar.outerHTML = legalChrome.topbar;
    const header = document.querySelector('[data-legal-header]');
    if (header) header.outerHTML = legalChrome.header;
    const footer = document.querySelector('[data-legal-footer]');
    if (footer) footer.outerHTML = legalChrome.footer;
  }
  document.addEventListener('DOMContentLoaded',()=>{renderLegalChrome();patchFooterLinks();patchLegalMentions();});
  return {patchFooterLinks, patchLegalMentions, renderLegalChrome};
})();
