const assert = require('assert');

async function run() {
  const { normalizeProduct, paginateItems, normalizeSourceKey } = require('../lib/api/catalog/types');

  assert.strictEqual(normalizeSourceKey(' Bravus '), 'bravus');
  assert.strictEqual(normalizeSourceKey('Casa Bateriilor'), 'casabateriilor');

  const product = normalizeProduct({
    id: 123,
    source: 'Bravus',
    name: 'Test Oil',
    price: '100.50',
    stock: '3',
  });

  assert.strictEqual(product.id, '123');
  assert.strictEqual(product.source, 'bravus');
  assert.strictEqual(product.price, 100.5);
  assert.strictEqual(product.stock, 3);
  assert.strictEqual(product.inStock, true);

  const page = paginateItems([1, 2, 3, 4, 5], { page: 2, limit: 2 });
  assert.deepStrictEqual(page.items, [3, 4]);
  assert.strictEqual(page.total, 5);
  assert.strictEqual(page.page, 2);
  assert.strictEqual(page.pages, 3);

  const { sanitizeMarginConfig, overrideKey, sanitizeOverride } = require('../lib/api/catalog/admin-config');
  const config = sanitizeMarginConfig({ bravus: { enabled: false, margin: 42 } });
  assert.strictEqual(config.bravus.enabled, false);
  assert.strictEqual(config.bravus.margin, 42);
  assert.strictEqual(config.carhub.enabled, true);
  assert.strictEqual(overrideKey('Bravus', 'ABC'), 'bravus:ABC');
  assert.strictEqual(
    sanitizeOverride({ hidden: true, priceOverride: '88.5', stockOverride: '2', nameOverride: 'Custom' }).hidden,
    true
  );

  const { applyAdminRules } = require('../lib/api/catalog/apply-admin-rules');
  const ruled = applyAdminRules(
    [
      { id: '1', source: 'bravus', name: 'Visible', price: 100, stock: 1 },
      { id: '2', source: 'carhub', name: 'Disabled', price: 100, stock: 1 },
      { id: '3', source: 'bravus', name: 'Hidden', price: 100, stock: 1 },
    ],
    {
      margins: {
        bravus: { enabled: true, margin: 35 },
        carhub: { enabled: false, margin: 25 },
      },
      overrides: {
        'bravus:3': { hidden: true },
      },
    }
  );
  assert.strictEqual(ruled.length, 1);
  assert.strictEqual(ruled[0].price, 135);

  const gateway = require('../lib/api/catalog/gateway');
  assert.strictEqual(typeof gateway.queryProducts, 'function');
  assert.strictEqual(typeof gateway.getProduct, 'function');

  console.log('gateway smoke tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
