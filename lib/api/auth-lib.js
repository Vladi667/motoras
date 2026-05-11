const crypto = require('crypto');

const KV_URL = process.env.UPSTASH_REDIS_REST_KV_REST_API_URL;
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
const USERS_KEY = 'motoras:users';

async function kvExec(command) {
 const res = await fetch(KV_URL, {
 method: 'POST',
 headers: {
 Authorization: `Bearer ${KV_TOKEN}`,
 'Content-Type': 'application/json',
 },
 body: JSON.stringify(command),
 });
 return res.json();
}

// --- Password hashing ---
function hashPassword(password) {
 const salt = crypto.randomBytes(16).toString('hex');
 const hash = crypto.scryptSync(password, salt, 32).toString('hex');
 return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
 const [salt, hash] = stored.split(':');
 const attempt = crypto.scryptSync(password, salt, 32).toString('hex');
 return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attempt, 'hex'));
}

// --- Token ---
function getSecret() {
 return process.env.ADMIN_SESSION_SECRET || 'motoras-user-secret-2026';
}

function createUserToken(user) {
 const payload = Buffer.from(JSON.stringify({
 id: user.id,
 email: user.email,
 name: user.name,
 type: 'user',
 exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
 })).toString('base64url');
 const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
 return `${payload}.${sig}`;
}

function verifyUserToken(token) {
 const [payload, sig] = String(token || '').split('.');
 if (!payload || !sig) return null;
 const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
 const a = Buffer.from(sig), b = Buffer.from(expected);
 if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
 try {
 const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
 if (data.type !== 'user' || Date.now() > data.exp) return null;
 return data;
 } catch (_) { return null; }
}

function readBearerToken(req) {
 const auth = req?.headers?.authorization || '';
 if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
 return req?.headers?.['x-user-token'] || '';
}

// --- User store (Upstash Redis REST) ---
async function readUsers() {
 try {
 const { result } = await kvExec(['GET', USERS_KEY]);
 return result ? JSON.parse(result) : [];
 } catch (_) { return []; }
}

async function writeUsers(users) {
 await kvExec(['SET', USERS_KEY, JSON.stringify(users)]);
}

async function findByEmail(email) {
 const users = await readUsers();
 return users.find(u => u.email === email.toLowerCase().trim());
}

function safeUser(u) {
 const { password: _, ...rest } = u;
 return rest;
}

module.exports = { hashPassword, verifyPassword, createUserToken, verifyUserToken, readBearerToken, readUsers, writeUsers, findByEmail, safeUser };
