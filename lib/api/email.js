// Shared email library — nodemailer (Gmail SMTP) + Resend fallback
const nodemailer = require('nodemailer');

// ── TVA CONFIG ────────────────────────────────────────────────────────────────
// Set TVA_ENABLED = true once the company is registered as TVA payer (plătitor TVA)
const TVA_ENABLED = false;
const TVA_RATE = 0.19; // 19% Romanian TVA
// ─────────────────────────────────────────────────────────────────────────────
const { generateInvoicePdf, buildInvoiceNumber } = require('./invoice');

const STORE_NAME = 'Motoraș';
const STORE_EMAIL = 'contact@motoras.ro';
const STORE_PHONE = '0731 284 932';
const STORE_WEB = 'https://www.pieseautomotoras.ro';

const COURIER_TRACKING = {
 'Fan Courier': 'https://www.fancourier.ro/en/awb-tracking/?tracking=',
 'DPD Romania': 'https://tracking.dpd.de/status/ro_RO/parcel/',
 'Cargus': 'https://www.cargus.ro/tracking-colet/?awb=',
 'DHL Romania': 'https://www.dhl.com/ro-en/home/tracking.html?tracking-id=',
 'Sameday': 'https://sameday.ro/search?AWB=',
 'GLS Romania': 'https://gls-group.com/track/?match=',
 'UPS': 'https://www.ups.com/track?tracknum=',
};

function esc(v) {
 return String(v ?? '').replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').replace(/"/g,'"');
}

// ── Transporter factory ────────────────────────────────────────────
function createTransporter() {
 const gmailUser = process.env.GMAIL_USER;
 const gmailPass = process.env.GMAIL_APP_PASSWORD;
 if (!gmailUser || !gmailPass) throw new Error('GMAIL_USER or GMAIL_APP_PASSWORD not set in Vercel environment variables.');
 return nodemailer.createTransport({
 host: 'smtp.gmail.com',
 port: 587,
 secure: false,
 auth: { user: gmailUser, pass: gmailPass },
 });
}

function fromAddress() {
 const user = process.env.GMAIL_USER || STORE_EMAIL;
 return `${STORE_NAME} <${user}>`;
}

// ── ORDER CONFIRMATION + INVOICE email ───────────────────────────────
function buildConfirmationHtml(order) {
 const items = Array.isArray(order.items) ? order.items : [];
 const invNr = buildInvoiceNumber(order.id);

 const itemRows = items.map(item => `
 <tr>
 <td style="padding:10px 14px;border-bottom:1px solid #f0f2f7;vertical-align:middle">
 ${item.img ? `<img src="${esc(item.img)}" width="52" height="52" style="border-radius:8px;object-fit:contain;background:#f9fafb;border:1px solid #e5e7ec;vertical-align:middle;margin-right:10px" alt="">` : ''}
 <span style="font-size:13px;font-weight:700;color:#12151d">${esc(item.name || 'Produs')}</span>
 ${item.brand ? `<br><span style="font-size:11px;color:#9ca3af">${esc(item.brand)}</span>` : ''}
 </td>
 <td style="padding:10px 14px;border-bottom:1px solid #f0f2f7;text-align:center;font-size:14px;font-weight:800;color:#12151d">${item.qty || 1}</td>
 <td style="padding:10px 14px;border-bottom:1px solid #f0f2f7;text-align:right;font-size:13px;font-weight:800;color:#cc1111">${(Number(item.price||0)*Number(item.qty||1)).toFixed(2)} RON</td>
 </tr>`).join('');

 const addrLine = [order.address, order.city, order.county, order.zip].filter(Boolean).join(', ');
 const total = Number(order.total || 0);
 const shipping = Number(order.shippingCost || 0);
 const vat = TVA_ENABLED ? total - total / (1 + TVA_RATE) : 0;

 return `<!DOCTYPE html>
<html lang="ro"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Confirmare comandă ${esc(order.id)}</title></head>
<body style="margin:0;padding:0;background:#f0f2f7;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f7;padding:32px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.1)">

 <!-- Header -->
 <tr><td style="background:#cc1111;padding:28px 36px">
 <table width="100%" cellpadding="0" cellspacing="0"><tr>
 <td><div style="font-family:'Arial Black',Arial,sans-serif;font-size:28px;font-weight:900;color:#fff;letter-spacing:-1px">MOTORAȘ</div>
 <div style="color:rgba(255,255,255,.65);font-size:11px;margin-top:2px">PIESE AUTO & DETAILING</div></td>
 <td align="right"><div style="background:rgba(255,255,255,.15);border-radius:10px;padding:10px 18px;text-align:center">
 <div style="font-size:10px;color:rgba(255,255,255,.7);letter-spacing:.8px;text-transform:uppercase">Factură</div>
 <div style="font-size:16px;font-weight:900;color:#fff;font-family:'Courier New',monospace">${esc(invNr)}</div>
 </div></td>
 </tr></table>
 </td></tr>

 <!-- Hero -->
 <tr><td style="padding:32px 36px 20px;text-align:center;border-bottom:1px solid #f0f2f7">
 <div style="font-size:42px;margin-bottom:10px">🎉</div>
 <div style="font-size:22px;font-weight:800;color:#12151d">Comanda ta a fost confirmată!</div>
 <div style="color:#6b7280;margin-top:8px;font-size:14px;line-height:1.6">
 Bună <strong>${esc(order.name || 'client')}</strong>! Comanda <strong style="color:#cc1111">${esc(order.id)}</strong> a fost înregistrată și plata confirmată.<br>
 Vei primi un email cu numărul AWB imediat ce coletul este expediat.
 </div>
 </td></tr>

 <!-- Order meta -->
 <tr><td style="padding:20px 36px 0">
 <table width="100%" cellpadding="0" cellspacing="0">
 <tr>
 <td style="width:50%;padding-right:10px">
 <div style="background:#fafbfc;border-radius:10px;padding:14px 16px">
 <div style="font-size:10px;font-weight:700;color:#9ca3af;letter-spacing:.7px;text-transform:uppercase;margin-bottom:6px">Comandă</div>
 <div style="font-size:15px;font-weight:800;color:#cc1111">${esc(order.id)}</div>
 <div style="font-size:11px;color:#9ca3af;margin-top:3px">${esc(new Date(order.createdAt||Date.now()).toLocaleDateString('ro-RO',{day:'2-digit',month:'long',year:'numeric'}))}</div>
 </div>
 </td>
 <td style="width:50%;padding-left:10px">
 <div style="background:#fafbfc;border-radius:10px;padding:14px 16px">
 <div style="font-size:10px;font-weight:700;color:#9ca3af;letter-spacing:.7px;text-transform:uppercase;margin-bottom:6px">Livrare la</div>
 <div style="font-size:13px;font-weight:700;color:#12151d">${esc(order.name||'-')}</div>
 ${addrLine ? `<div style="font-size:11px;color:#6b7280;margin-top:3px">${esc(addrLine)}</div>` : ''}
 </div>
 </td>
 </tr>
 </table>
 </td></tr>

 <!-- Items -->
 <tr><td style="padding:20px 36px 0">
 <div style="font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:.7px;text-transform:uppercase;margin-bottom:10px">Produse comandate</div>
 <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7ec;border-radius:10px;overflow:hidden">
 <thead><tr style="background:#f9fafb">
 <th style="padding:9px 14px;text-align:left;font-size:10.5px;color:#9ca3af;font-weight:700;text-transform:uppercase">Produs</th>
 <th style="padding:9px 14px;text-align:center;font-size:10.5px;color:#9ca3af;font-weight:700;text-transform:uppercase">Cant.</th>
 <th style="padding:9px 14px;text-align:right;font-size:10.5px;color:#9ca3af;font-weight:700;text-transform:uppercase">Total</th>
 </tr></thead>
 <tbody>${itemRows}</tbody>
 </table>
 </td></tr>

 <!-- Totals -->
 <tr><td style="padding:16px 36px 0">
 <table width="100%" cellpadding="0" cellspacing="0">
 ${shipping > 0 ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280">Transport</td><td style="padding:4px 0;font-size:13px;color:#6b7280;text-align:right">${shipping.toFixed(2)} RON</td></tr>` : ''}
 ${TVA_ENABLED ? `<tr><td style="padding:4px 0;font-size:12px;color:#9ca3af">TVA (${Math.round(TVA_RATE*100)}%)</td><td style="padding:4px 0;font-size:12px;color:#9ca3af;text-align:right">${vat.toFixed(2)} RON</td></tr>` : ''}
 <tr><td style="padding:10px 0 4px;font-size:16px;font-weight:800;color:#12151d;border-top:2px solid #e5e7ec">TOTAL</td>
 <td style="padding:10px 0 4px;font-size:20px;font-weight:900;color:#cc1111;text-align:right;border-top:2px solid #e5e7ec">${total.toFixed(2)} RON</td></tr>
 </table>
 </td></tr>

 <!-- Payment badge -->
 <tr><td style="padding:16px 36px 20px">
 <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:14px 18px;display:flex;align-items:center">
 <span style="font-size:18px;margin-right:10px">✅</span>
 <div>
 <div style="font-size:13px;font-weight:800;color:#059669">Plată confirmată prin Stripe</div>
 <div style="font-size:11.5px;color:#166534;margin-top:2px">Factura PDF este atașată la acest email.</div>
 </div>
 </div>
 </td></tr>

 <!-- Footer -->
 <tr><td style="background:#f9fafb;padding:22px 36px;text-align:center;border-top:1px solid #e5e7ec">
 <div style="font-size:13px;color:#6b7280;line-height:1.7">
 Întrebări? <a href="mailto:${esc(STORE_EMAIL)}" style="color:#cc1111;font-weight:700">${esc(STORE_EMAIL)}</a> · <strong>${esc(STORE_PHONE)}</strong>
 </div>
 <div style="margin-top:12px">
 <a href="${esc(STORE_WEB)}" style="color:#cc1111;font-size:12px;font-weight:600">${esc(STORE_WEB)}</a>
 </div>
 <div style="font-size:10px;color:#9ca3af;margin-top:8px">&copy; 2026 ${esc(STORE_NAME)} SRL · CUI RO52459678. Toate drepturile rezervate.</div>
 </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

// ── TRACKING email (already used from dashboard) ──────────────────
function buildTrackingHtml({ orderid, customerName, tracking, courier, items, total, address }) {
 const trackingUrl = COURIER_TRACKING[courier];
 const trackingLink = trackingUrl ? `${trackingUrl}${encodeURIComponent(tracking)}` : null;
 const itemRows = (Array.isArray(items) ? items : []).map(item => `
 <tr>
 <td style="padding:8px 14px;border-bottom:1px solid #f0f0f0;font-size:13px">${esc(item.name||'Produs')}</td>
 <td style="padding:8px 14px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px;font-weight:700">${item.qty||1}</td>
 <td style="padding:8px 14px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;font-weight:700;color:#cc1111">${Number(item.price||0).toFixed(2)} RON</td>
 </tr>`).join('');
 return `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Expediere ${esc(orderid)}</title></head>
<body style="margin:0;padding:0;background:#f0f2f7;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f7;padding:32px 16px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.1)">
 <tr><td style="background:#cc1111;padding:26px 32px;text-align:center">
 <div style="font-family:'Arial Black',Arial,sans-serif;font-size:30px;font-weight:900;color:#fff;letter-spacing:-1px">MOTORAȘ</div>
 </td></tr>
 <tr><td style="padding:32px;text-align:center">
 <div style="font-size:40px;margin-bottom:10px">🚚</div>
 <div style="font-size:22px;font-weight:800;color:#12151d">Comanda ta a fost expediată!</div>
 <div style="color:#6b7280;margin-top:8px;font-size:14px">Bună <strong>${esc(customerName)}</strong>, comanda <strong style="color:#cc1111">${esc(orderid)}</strong> este pe drum.</div>
 </td></tr>
 <tr><td style="padding:0 32px 24px">
 <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef9f9;border:2px solid #cc1111;border-radius:12px">
 <tr><td style="padding:22px;text-align:center">
 <div style="font-size:10px;font-weight:700;color:#9ca3af;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">Număr AWB</div>
 <div style="font-family:'Courier New',monospace;font-size:26px;font-weight:900;color:#cc1111;letter-spacing:3px">${esc(tracking)}</div>
 <div style="font-size:13px;color:#6b7280;margin-top:6px">Curier: <strong style="color:#12151d">${esc(courier)}</strong></div>
 ${trackingLink?`<div style="margin-top:16px"><a href="${esc(trackingLink)}" style="display:inline-block;background:#cc1111;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px">📍 Urmărește coletul</a></div>`:''}
 </td></tr>
 </table>
 </td></tr>
 ${address?`<tr><td style="padding:0 32px 20px"><div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;margin-bottom:6px">Adresă livrare</div><div style="font-size:14px;color:#374151">${esc(address)}</div></td></tr>`:''}
 ${itemRows?`<tr><td style="padding:0 32px 24px"><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden"><thead><tr style="background:#f9fafb"><th style="padding:9px 14px;text-align:left;font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase">Produs</th><th style="padding:9px 14px;text-align:center;font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase">Cant.</th><th style="padding:9px 14px;text-align:right;font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase">Preț</th></tr></thead><tbody>${itemRows}</tbody><tfoot><tr style="background:#f9fafb;border-top:2px solid #e5e7eb"><td colspan="2" style="padding:10px 14px;font-weight:800">TOTAL</td><td style="padding:10px 14px;font-weight:900;color:#cc1111;text-align:right;font-size:16px">${Number(total||0).toFixed(2)} RON</td></tr></tfoot></table></td></tr>`:''}
 <tr><td style="background:#f9fafb;padding:22px 32px;text-align:center;border-top:1px solid #e5e7eb">
 <div style="font-size:13px;color:#6b7280">Ai întrebări? <a href="mailto:${esc(STORE_EMAIL)}" style="color:#cc1111;font-weight:700">${esc(STORE_EMAIL)}</a> · <strong>${esc(STORE_PHONE)}</strong></div>
 <div style="font-size:11px;color:#9ca3af;margin-top:8px">&copy; 2026 ${esc(STORE_NAME)}. Toate drepturile rezervate.</div>
 </td></tr>
</table></td></tr></table></body></html>`;
}

// ── SUPPLIER ORDER email ──────────────────────────────────────────
function buildSupplierOrderHtml({ orderId, items, deliveryName, deliveryAddress, portalUrl }) {
 const itemRows = (Array.isArray(items) ? items : []).map(item => `
 <tr>
 <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;font-size:13px;font-weight:600;color:#12151d">${esc(item.name || 'Produs')}</td>
 <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;font-family:monospace;font-size:12px;color:#9ca3af">${esc(item.sku || item.id || '—')}</td>
 <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:15px;font-weight:900;color:#12151d">${item.qty || 1}</td>
 </tr>`).join('');

 return `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><title>Comanda noua ${esc(orderId)}</title></head>
<body style="margin:0;padding:0;background:#f0f2f7;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f7;padding:32px 16px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.1)">
 <tr><td style="background:#cc1111;padding:24px 32px;text-align:center">
 <div style="font-family:'Arial Black',Arial,sans-serif;font-size:28px;font-weight:900;color:#fff;letter-spacing:-1px">MOTORAȘ</div>
 <div style="color:rgba(255,255,255,.7);font-size:12px;margin-top:4px">Comandă nouă de procesat — ${esc(orderId)}</div>
 </td></tr>
 <tr><td style="padding:28px 32px">
 <div style="font-size:16px;font-weight:800;color:#12151d;margin-bottom:6px">Aveți o comandă nouă</div>
 <div style="font-size:13px;color:#6b7280;margin-bottom:22px">Pregătiți și expediați produsele de mai jos, apoi introduceți numărul AWB pe portalul dedicat.</div>
 <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px">Produse de expediat</div>
 <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7ec;border-radius:10px;overflow:hidden;margin-bottom:20px">
 <thead><tr style="background:#f9fafb">
 <th style="padding:9px 14px;text-align:left;font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase">Produs</th>
 <th style="padding:9px 14px;text-align:left;font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase">SKU</th>
 <th style="padding:9px 14px;text-align:center;font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase">Cant.</th>
 </tr></thead>
 <tbody>${itemRows}</tbody>
 </table>
 <div style="background:#fafbfc;border:1.5px solid #e5e7ec;border-radius:10px;padding:14px 16px;margin-bottom:24px">
 <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.7px;margin-bottom:6px">Adresă de livrare client</div>
 <div style="font-size:14px;font-weight:700;color:#12151d">${esc(deliveryName)}</div>
 ${deliveryAddress ? `<div style="font-size:13px;color:#6b7280;margin-top:3px">${esc(deliveryAddress)}</div>` : ''}
 </div>
 <div style="text-align:center">
 <a href="${esc(portalUrl)}" style="display:inline-block;background:#cc1111;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:800;font-size:15px;letter-spacing:.3px">Introduceți numărul AWB →</a>
 <div style="margin-top:10px;font-size:11px;color:#9ca3af">Link portal: <span style="font-family:monospace;word-break:break-all">${esc(portalUrl)}</span></div>
 </div>
 </td></tr>
 <tr><td style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #e5e7ec">
 <div style="font-size:12px;color:#9ca3af">${esc(STORE_NAME)} · <a href="${esc(STORE_WEB)}" style="color:#cc1111">${esc(STORE_WEB)}</a></div>
 </td></tr>
</table></td></tr></table></body></html>`;
}

// ── PUBLIC API ────────────────────────────────────────────────────

async function sendConfirmationEmail(order) {
 const transporter = createTransporter();
 const invNr = buildInvoiceNumber(order.id);

 // Generate PDF — if it fails, send email without attachment
 let pdfBuffer = null;
 try {
 pdfBuffer = await generateInvoicePdf(order);
 } catch (err) {
 console.error('PDF generation failed:', err.message);
 }

 const mailOptions = {
 from: fromAddress(),
 to: order.email,
 subject: `Confirmare comandă ${order.id} — Factură ${invNr}`,
 html: buildConfirmationHtml(order),
 attachments: pdfBuffer ? [{
 filename: `Factura-${invNr}.pdf`,
 content: pdfBuffer,
 contentType: 'application/pdf',
 }] : [],
 };

 return transporter.sendMail(mailOptions);
}

async function sendSupplierOrderEmail({ to, orderId, items, deliveryName, deliveryAddress, portalUrl }) {
 const transporter = createTransporter();
 return transporter.sendMail({
 from: fromAddress(),
 to,
 subject: `Comandă nouă de procesat — ${orderId}`,
 html: buildSupplierOrderHtml({ orderId, items, deliveryName, deliveryAddress, portalUrl }),
 });
}

async function sendTrackingEmail({ to, orderid, customerName, tracking, courier, items, total, address }) {
 const transporter = createTransporter();
 return transporter.sendMail({
 from: fromAddress(),
 to,
 subject: `Comanda ${orderid} a fost expediată — AWB: ${tracking}`,
 html: buildTrackingHtml({ orderid, customerName, tracking, courier, items, total, address }),
 });
}

module.exports = { sendConfirmationEmail, sendTrackingEmail, sendSupplierOrderEmail };
