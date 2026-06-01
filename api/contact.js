const { json, readJson } = require('../lib/api/stripe');
const { sendContactMessage } = require('../lib/api/email');

// Per-IP rate-limit so the form cannot be abused as a free spam relay.
const recentByIp = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 3;

function clientIp(req) {
 const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
 return fwd || req.socket?.remoteAddress || 'unknown';
}

module.exports = async function handler(req, res) {
 if (req.method !== 'POST') {
 res.setHeader('Allow', 'POST');
 return json(res, 405, { ok: false, error: 'Method not allowed.' });
 }

 const ip = clientIp(req);
 const now = Date.now();
 const log = (recentByIp.get(ip) || []).filter(ts => now - ts < RATE_WINDOW_MS);
 if (log.length >= RATE_MAX) {
 return json(res, 429, { ok: false, error: 'Prea multe mesaje. Încearcă din nou peste un minut.' });
 }
 log.push(now);
 recentByIp.set(ip, log);
 if (recentByIp.size > 5000) {
 for (const [key, arr] of recentByIp) {
 if (!arr.length || now - arr[arr.length - 1] > RATE_WINDOW_MS) recentByIp.delete(key);
 }
 }

 try {
 const body = await readJson(req);
 const name = String(body.name || '').trim();
 const email = String(body.email || '').trim();
 const phone = String(body.phone || '').trim();
 const subject = String(body.subject || '').trim();
 const message = String(body.message || '').trim();

 if (!name || !email || !message) {
 return json(res, 400, { ok: false, error: 'Numele, emailul și mesajul sunt obligatorii.' });
 }
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
 return json(res, 400, { ok: false, error: 'Email invalid.' });
 }
 if (message.length > 4000) {
 return json(res, 400, { ok: false, error: 'Mesajul este prea lung.' });
 }

 await sendContactMessage({ name, email, phone, subject, message });
 return json(res, 200, { ok: true });
 } catch (err) {
 console.error('Contact form error:', err.message);
 return json(res, 500, { ok: false, error: 'Nu am putut trimite mesajul. Încearcă din nou.' });
 }
};
