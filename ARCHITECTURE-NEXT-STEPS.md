# Motoras refactor foundation

This sprint introduces the first shared application layer:

- `js/catalog.js` centralizes products and category metadata
- `js/store.js` centralizes cart storage, badge updates, order handoff, and price formatting

## Why this matters
Previously, product and cart logic were duplicated across multiple pages. That made every catalog or checkout change expensive and error-prone.

## Recommended next sprint
1. Move shared header/footer/cart drawer markup into reusable partials or migrate to a component framework.
2. Extract shared CSS into `/css/app.css`.
3. Replace hardcoded homepage featured products with renders from `MotorasCatalog.products`.
4. Add legal/trust pages: contact, livrare, retururi, termeni, confidentialitate.
5. Add `/api` mock layer before supplier/Stripe/FGO integration.


Sprint 3 completed:
- Homepage popular products now render from shared catalog data.
- Homepage category counts now derive from the shared catalog.
- Legal pages now use shared chrome placeholders rendered by js/common.js, reducing repeated markup.


Sprint 4 completed:
- shared product renderer
- shared shop footer for storefront pages
- category/search/related products rendered from shared catalog
- FAQ, About, Admin, robots.txt, sitemap.xml
- local admin order dashboard fed by checkout demo
