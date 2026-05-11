const crypto = require('crypto');

function isProductionRuntime() {
 return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

function isAdminConfigured() {
 return Boolean(process.env.ADMIN_USER && process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET);
}

function getAdminUser() {
 return process.env.ADMIN_USER || (isProductionRuntime() ? '' : 'admin');
}

function getAdminPassword() {
 return process.env.ADMIN_PASSWORD || (isProductionRuntime() ? '' : 'motoras2026');
}

function getSessionSecret() {
 return process.env.ADMIN_SESSION_SECRET || (isProductionRuntime() ? '' : 'motoras-admin-session-secret');
}

function timingSafeEquals(left, right) {
 const a = Buffer.from(String(left || ''), 'utf8');
 const b = Buffer.from(String(right || ''), 'utf8');
 if (a.length !== b.length) return false;
 return crypto.timingSafeEqual(a, b);
}

function base64UrlEncode(value) {
 return Buffer.from(String(value), 'utf8').toString('base64url');
}

function base64UrlDecode(value) {
 return Buffer.from(String(value || ''), 'base64url').toString('utf8');
}

function sign(value) {
 const secret = getSessionSecret();
 if (!secret) return '';
 return crypto
 .createHmac('sha256', secret)
 .update(String(value))
 .digest('base64url');
}

function createToken(payload = {}) {
 const body = base64UrlEncode(JSON.stringify(payload));
 const signature = sign(body);
 return `${body}.${signature}`;
}

function verifyToken(token) {
 if (!getSessionSecret()) return null;
 const [body, signature] = String(token || '').split('.');
 if (!body || !signature) return null;
 if (!timingSafeEquals(signature, sign(body))) return null;

 try {
 const payload = JSON.parse(base64UrlDecode(body));
 if (!payload?.exp || Date.now() > Number(payload.exp)) return null;
 return payload;
 } catch (_) {
 return null;
 }
}

function readBearerToken(req) {
 const auth = req?.headers?.authorization || req?.headers?.Authorization || '';
 if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
 return req?.headers?.['x-admin-token'] || req?.headers?.['X-Admin-Token'] || '';
}

function requireAdmin(req) {
 const token = readBearerToken(req);
 const payload = verifyToken(token);
 if (!payload?.user) return null;
 return payload;
}

module.exports = {
 createToken,
 getAdminPassword,
 getAdminUser,
 isAdminConfigured,
 isProductionRuntime,
 requireAdmin,
 timingSafeEquals,
};
