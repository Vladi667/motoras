const { json, readJson } = require('../../lib/api/stripe');
const { hashPassword, verifyPassword, createUserToken, verifyUserToken, readBearerToken, readUsers, writeUsers, findByEmail, safeUser } = require('../../lib/api/auth-lib');
const { sendPasswordResetEmail } = require('../../lib/api/email');
const crypto = require('crypto');

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://www.pieseautomotoras.ro';

module.exports = async function handler(req, res) {
 res.setHeader('Access-Control-Allow-Origin', '*');
 res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Token');
 if (req.method === 'OPTIONS') return json(res, 200, {});

 const action = req.query.action;

 // POST /api/auth/register
 if (action === 'register') {
 if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed.' });
 try {
 const body = await readJson(req);
 const firstName = String(body.firstName || '').trim();
 const lastName = String(body.lastName || '').trim();
 const email = String(body.email || '').trim().toLowerCase();
 const phone = String(body.phone || '').trim();
 const password = String(body.password || '');

 if (!firstName || !lastName) return json(res, 400, { ok: false, error: 'Prenumele și numele sunt obligatorii.' });
 if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { ok: false, error: 'Email invalid.' });
 if (password.length < 8) return json(res, 400, { ok: false, error: 'Parola trebuie să aibă minim 8 caractere.' });

 if (await findByEmail(email)) return json(res, 409, { ok: false, error: 'Există deja un cont cu acest email.' });

 const user = {
 id: crypto.randomBytes(8).toString('hex'),
 firstName, lastName,
 name: `${firstName} ${lastName}`,
 email, phone,
 password: hashPassword(password),
 createdAt: new Date().toISOString(),
 };

 const users = await readUsers();
 users.push(user);
 await writeUsers(users);

 const token = createUserToken(user);
 return json(res, 201, { ok: true, token, user: safeUser(user) });
 } catch (err) {
 return json(res, 500, { ok: false, error: err.message || 'Eroare la creare cont.' });
 }
 }

 // POST /api/auth/login
 if (action === 'login') {
 if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed.' });
 try {
 const body = await readJson(req);
 const email = String(body.email || '').trim().toLowerCase();
 const password = String(body.password || '');

 if (!email || !password) return json(res, 400, { ok: false, error: 'Email și parola sunt obligatorii.' });

 const user = await findByEmail(email);
 if (!user || !verifyPassword(password, user.password)) {
 return json(res, 401, { ok: false, error: 'Email sau parolă incorectă.' });
 }

 const token = createUserToken(user);
 return json(res, 200, { ok: true, token, user: safeUser(user) });
 } catch (err) {
 return json(res, 500, { ok: false, error: err.message || 'Eroare la autentificare.' });
 }
 }

 // GET /api/auth/me
 if (action === 'me') {
 const payload = verifyUserToken(readBearerToken(req));
 if (!payload) return json(res, 401, { ok: false, error: 'Sesiune expirată. Autentificați-vă din nou.' });

 const users = await readUsers();
 const user = users.find(u => u.id === payload.id);
 if (!user) return json(res, 404, { ok: false, error: 'Contul nu mai există.' });

 return json(res, 200, { ok: true, user: safeUser(user) });
 }

 // POST /api/auth/forgot — start password reset flow
 if (action === 'forgot') {
 if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed.' });
 try {
 const body = await readJson(req);
 const email = String(body.email || '').trim().toLowerCase();
 if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
 // Always return ok=true to avoid leaking which emails are registered.
 return json(res, 200, { ok: true });
 }

 const users = await readUsers();
 const user = users.find(u => u.email === email);
 if (user) {
 const token = crypto.randomBytes(32).toString('hex');
 user.resetToken = token;
 user.resetExpiresAt = Date.now() + RESET_TOKEN_TTL_MS;
 await writeUsers(users);
 const resetUrl = `${SITE_ORIGIN}/account.html?reset=${encodeURIComponent(token)}`;
 try {
 await sendPasswordResetEmail({ to: user.email, name: user.firstName || user.name, resetUrl });
 } catch (mailErr) {
 console.error('Password reset email failed:', mailErr.message);
 // Do not surface the failure to the caller (avoid enumeration).
 }
 }
 return json(res, 200, { ok: true });
 } catch (err) {
 return json(res, 500, { ok: false, error: err.message || 'Eroare la trimiterea emailului.' });
 }
 }

 // POST /api/auth/reset — finalize password reset
 if (action === 'reset') {
 if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed.' });
 try {
 const body = await readJson(req);
 const token = String(body.token || '').trim();
 const password = String(body.password || '');
 if (!token) return json(res, 400, { ok: false, error: 'Token invalid.' });
 if (password.length < 8) return json(res, 400, { ok: false, error: 'Parola trebuie să aibă minim 8 caractere.' });

 const users = await readUsers();
 const user = users.find(u => u.resetToken && u.resetToken === token);
 if (!user || !user.resetExpiresAt || Date.now() > user.resetExpiresAt) {
 return json(res, 400, { ok: false, error: 'Linkul de resetare a expirat. Cere unul nou.' });
 }

 user.password = hashPassword(password);
 delete user.resetToken;
 delete user.resetExpiresAt;
 await writeUsers(users);

 const sessionToken = createUserToken(user);
 return json(res, 200, { ok: true, token: sessionToken, user: safeUser(user) });
 } catch (err) {
 return json(res, 500, { ok: false, error: err.message || 'Eroare la resetarea parolei.' });
 }
 }

 return json(res, 404, { ok: false, error: 'Acțiune necunoscută.' });
};
