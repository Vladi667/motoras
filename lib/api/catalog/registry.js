const bravus = require('../suppliers/bravus');
const carhub = require('../suppliers/carhub');
const globiz = require('../suppliers/globiz');
const casabateriilor = require('../suppliers/casabateriilor');
const { normalizeSourceKey } = require('./types');

const adapters = [bravus, carhub, globiz, casabateriilor];
const byKey = new Map(adapters.map(adapter => [adapter.key, adapter]));

function getAdapter(source) {
  return byKey.get(normalizeSourceKey(source)) || null;
}

function listAdapters() {
  return adapters.slice();
}

module.exports = {
  getAdapter,
  listAdapters,
};
