const memory = new Map();

function now() {
  return Date.now();
}

function getCache(key) {
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= now()) {
    memory.delete(key);
    return null;
  }
  return hit.value;
}

function setCache(key, value, ttlMs) {
  memory.set(key, {
    value,
    expiresAt: now() + Math.max(1000, Number(ttlMs) || 60000),
  });
  return value;
}

function clearCache(prefix = '') {
  Array.from(memory.keys()).forEach((key) => {
    if (!prefix || key.startsWith(prefix)) memory.delete(key);
  });
}

async function withCache(key, ttlMs, loader) {
  const hit = getCache(key);
  if (hit !== null) return hit;
  const value = await loader();
  return setCache(key, value, ttlMs);
}

module.exports = {
  clearCache,
  getCache,
  setCache,
  withCache,
};
