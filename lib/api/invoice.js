// PDF invoice generator — no serverless function, pure lib
const PDFDocument = require('pdfkit');

// ── TVA CONFIG ────────────────────────────────────────────────────────────────
// Set TVA_ENABLED = true once the company is registered as TVA payer (plătitor TVA)
const TVA_ENABLED = false;
const TVA_RATE = 0.19; // 19% Romanian TVA
// ─────────────────────────────────────────────────────────────────────────────

const COMPANY = {
 name: 'Motoraș SRL',
 address: 'Str. Agricultori Nr. 2',
 city: 'București, Romania',
 cui: 'RO52459678',
 reg: 'J2025067651008',
 email: 'contact@motoras.ro',
 phone: '0731 284 932',
 web: 'www.pieseautomotoras.ro',
};

// Colors
const RED = '#CC1111';
const DARK = '#12151D';
const MID = '#4B5563';
const MUTED = '#9CA3AF';
const LIGHT_BG = '#F9FAFB';
const BORDER = '#E5E7EB';
const GREEN = '#059669';
const GREEN_BG = '#F0FDF4';

function n(v) { return Number(v) || 0; }
function fmtMoney(v) { return n(v).toFixed(2) + ' RON'; }
function fmtDate(d) {
 return new Date(d || Date.now()).toLocaleDateString('ro-RO', {
 day: '2-digit', month: '2-digit', year: 'numeric',
 });
}
function buildInvoiceNumber(orderId) {
 const year = new Date().getFullYear();
 const seq = String(orderId || '').replace(/\D/g, '').slice(-6).padStart(6, '0');
 return `INV-${year}-${seq}`;
}

async function fetchImg(url) {
 if (!url || !url.startsWith('http')) return null;
 try {
 const ctrl = new AbortController();
 const timer = setTimeout(() => ctrl.abort(), 4000);
 const res = await fetch(url, { signal: ctrl.signal });
 clearTimeout(timer);
 if (!res.ok) return null;
 return Buffer.from(await res.arrayBuffer());
 } catch { return null; }
}

async function generateInvoicePdf(order) {
 const items = Array.isArray(order.items) ? order.items : [];
 const invNr = buildInvoiceNumber(order.id);
 const invDate = fmtDate(order.createdAt);

 // Pre-fetch product images (all in parallel, max 4 s each)
 const imgBufs = await Promise.all(items.map(it => fetchImg(it.img || '')));

 const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Factura ${invNr}`, Author: 'Motoraș' } });
 const chunks = [];
 doc.on('data', c => chunks.push(c));

 const W = 595.28;
 const ML = 50;
 const MR = 50;
 const CW = W - ML - MR; // 495.28

 // ── RED HEADER ──────────────────────────────────────────────────
 doc.rect(0, 0, W, 92).fill(RED);

 doc.fillColor('#fff').font('Helvetica-Bold').fontSize(30)
 .text('MOTORAȘ', ML, 22);
 doc.fillColor('rgba(255,255,255,0.65)').font('Helvetica').fontSize(10)
 .text('Piese Auto & Detailing', ML, 57);

 doc.fillColor('#fff').font('Helvetica-Bold').fontSize(22)
 .text('FACTURĂ', 0, 24, { align: 'right', width: W - ML });
 doc.fillColor('rgba(255,255,255,0.65)').font('Helvetica').fontSize(9.5)
 .text('FISCALĂ SIMPLIFICATĂ', 0, 52, { align: 'right', width: W - ML });

 // ── INVOICE META BOX (right) ─────────────────────────────────────
 const boxX = W / 2 + 10;
 const boxW = W - boxX - MR;
 let yBox = 108;
 doc.roundedRect(boxX, yBox, boxW, 108, 8).fill(LIGHT_BG);
 yBox += 10;
 [
 ['Factură nr.:', invNr],
 ['Data emiterii:', invDate],
 ['Comandă:', String(order.id || '-')],
 ['Metodă plată:', order.paymentLabel || 'Carte online'],
 ['Status:', 'PLĂTIT ✓'],
 ].forEach(([lbl, val]) => {
 doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(lbl, boxX + 12, yBox);
 const isStatus = lbl === 'Status:';
 doc.fillColor(isStatus ? GREEN : DARK).font('Helvetica-Bold').fontSize(8.5)
 .text(val, boxX + 95, yBox, { width: boxW - 107 });
 yBox += 18;
 });

 // ── FROM (company, left) ─────────────────────────────────────────
 let yLeft = 108;
 doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7.5)
 .text('DE LA', ML, yLeft, { characterSpacing: 0.8 });
 yLeft += 13;
 doc.fillColor(DARK).font('Helvetica-Bold').fontSize(12).text(COMPANY.name, ML, yLeft);
 yLeft += 16;
 doc.fillColor(MID).font('Helvetica').fontSize(9);
 [COMPANY.address, COMPANY.city, `CUI: ${COMPANY.cui}`, `Reg. Com.: ${COMPANY.reg}`, COMPANY.email, COMPANY.phone].forEach(l => {
 doc.text(l, ML, yLeft); yLeft += 13;
 });

 // ── BILL TO ───────────────────────────────────────────────────────
 let yBill = 228;
 doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7.5)
 .text('FACTURAT CĂTRE', ML, yBill, { characterSpacing: 0.8 });
 yBill += 13;
 doc.fillColor(DARK).font('Helvetica-Bold').fontSize(13).text(order.name || 'Client Motoraș', ML, yBill);
 yBill += 17;
 const addrLine = [order.address, order.city, order.county, order.zip].filter(Boolean).join(', ');
 if (addrLine) { doc.fillColor(MID).font('Helvetica').fontSize(9.5).text(addrLine, ML, yBill, { width: CW / 2 }); yBill += 14; }
 if (order.email) { doc.fillColor(MID).font('Helvetica').fontSize(9.5).text(order.email, ML, yBill); yBill += 13; }
 if (order.phone) { doc.fillColor(MID).font('Helvetica').fontSize(9.5).text(order.phone, ML, yBill); yBill += 13; }

 // ── DIVIDER ───────────────────────────────────────────────────────
 let yT = Math.max(yBill, 300) + 18;
 doc.moveTo(ML, yT - 8).lineTo(W - MR, yT - 8).strokeColor(BORDER).lineWidth(0.5).stroke();

 // ── ITEMS TABLE ───────────────────────────────────────────────────
 const C = {
 img: { x: ML, w: 54 },
 name: { x: ML + 60, w: 218 },
 qty: { x: ML + 286, w: 55 },
 price: { x: ML + 349, w: 84 },
 total: { x: ML + 441, w: 54 },
 };

 // Header
 doc.rect(ML, yT, CW, 22).fill('#F3F4F6');
 const hY = yT + 7;
 doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7.5);
 doc.text('PRODUS', C.name.x, hY, { characterSpacing: 0.5 });
 doc.text('CANT.', C.qty.x, hY, { width: C.qty.w, align: 'center', characterSpacing: 0.5 });
 doc.text('PREȚ/BUC', C.price.x, hY, { width: C.price.w, align: 'right', characterSpacing: 0.5 });
 doc.text('TOTAL', C.total.x, hY, { width: C.total.w, align: 'right', characterSpacing: 0.5 });
 yT += 22;

 for (let i = 0; i < items.length; i++) {
 const item = items[i];
 const imgBuf = imgBufs[i];
 const rowH = 60;

 if (i % 2 === 1) doc.rect(ML, yT, CW, rowH).fill('#FAFBFC');

 // Image cell
 const pad = 5;
 if (imgBuf) {
 try {
 doc.image(imgBuf, C.img.x + pad, yT + pad, {
 fit: [C.img.w - pad * 2, rowH - pad * 2],
 });
 } catch { drawImgPlaceholder(doc, C.img.x + pad, yT + pad, C.img.w - pad * 2, rowH - pad * 2); }
 } else {
 drawImgPlaceholder(doc, C.img.x + pad, yT + pad, C.img.w - pad * 2, rowH - pad * 2);
 }

 // Name + brand + SKU
 const nY = yT + 9;
 doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9.5)
 .text((item.name || 'Produs').slice(0, 52), C.name.x, nY, { width: C.name.w, lineBreak: false, ellipsis: true });
 let nYoff = 22;
 if (item.brand) {
 doc.fillColor(MID).font('Helvetica').fontSize(8)
 .text(item.brand, C.name.x, nY + nYoff, { width: C.name.w }); nYoff += 13;
 }
 if (item.sku || item.id) {
 doc.fillColor(MUTED).font('Helvetica').fontSize(7.5)
 .text(`SKU: ${item.sku || item.id}`, C.name.x, nY + nYoff, { width: C.name.w });
 }

 // Qty / Price / Total (vertically centered)
 const midY = yT + rowH / 2 - 6;
 doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
 .text(String(item.qty || 1), C.qty.x, midY, { width: C.qty.w, align: 'center' });
 doc.fillColor(MID).font('Helvetica').fontSize(9.5)
 .text(fmtMoney(item.price), C.price.x, midY, { width: C.price.w, align: 'right' });
 doc.fillColor(RED).font('Helvetica-Bold').fontSize(10)
 .text(fmtMoney(n(item.price) * n(item.qty || 1)), C.total.x, midY, { width: C.total.w, align: 'right' });

 // Row border
 doc.moveTo(ML, yT + rowH).lineTo(W - MR, yT + rowH).strokeColor(BORDER).lineWidth(0.4).stroke();
 yT += rowH;

 if (yT > 720 && i < items.length - 1) { doc.addPage(); yT = 50; }
 }

 // ── TOTALS ────────────────────────────────────────────────────────
 yT += 18;
 const totX = W - MR - 210;
 const lblW = 110;
 const valW = 100;
 const total = n(order.total);
 const shipping = n(order.shippingCost);
 const subtotal = n(order.subtotal) || (total - shipping);
 const vat = TVA_ENABLED ? total - total / (1 + TVA_RATE) : 0;

 [
 ['Subtotal produse:', fmtMoney(subtotal), false],
 shipping > 0 ? ['Transport:', fmtMoney(shipping), false] : null,
 TVA_ENABLED ? ['TVA (' + Math.round(TVA_RATE * 100) + '%):', fmtMoney(vat), false] : null,
 ].filter(Boolean).forEach(([lbl, val]) => {
 doc.fillColor(MID).font('Helvetica').fontSize(10).text(lbl, totX, yT, { width: lblW });
 doc.fillColor(DARK).font('Helvetica').fontSize(10).text(val, totX + lblW, yT, { width: valW, align: 'right' });
 yT += 19;
 });

 doc.moveTo(totX, yT).lineTo(totX + lblW + valW, yT).strokeColor(DARK).lineWidth(0.8).stroke();
 yT += 7;
 doc.fillColor(DARK).font('Helvetica-Bold').fontSize(13).text('TOTAL:', totX, yT, { width: lblW });
 doc.fillColor(RED).font('Helvetica-Bold').fontSize(16).text(fmtMoney(total), totX + lblW - 5, yT - 2, { width: valW + 5, align: 'right' });

 // ── PAYMENT CONFIRMATION BOX ──────────────────────────────────────
 yT += 46;
 if (yT > 720) { doc.addPage(); yT = 50; }
 doc.roundedRect(ML, yT, CW, 56, 8).fill(GREEN_BG);
 doc.circle(ML + 30, yT + 28, 15).fill(GREEN);
 doc.fillColor('#fff').font('Helvetica-Bold').fontSize(15).text('✓', ML + 23, yT + 19);
 doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(12).text('Plată confirmată', ML + 54, yT + 9);
 doc.fillColor('#166534').font('Helvetica').fontSize(9)
 .text('Plata a fost procesată cu succes prin Stripe. Această factură este documentul tău fiscal.', ML + 54, yT + 26, { width: CW - 70 });
 if (order.paymentReference) {
 doc.fillColor(MUTED).font('Helvetica').fontSize(8)
 .text(`Ref. Stripe: ${order.paymentReference}`, ML + 54, yT + 40, { width: CW - 70 });
 }

 // ── FOOTER ────────────────────────────────────────────────────────
 const footY = 805;
 doc.moveTo(ML, footY).lineTo(W - MR, footY).strokeColor(BORDER).lineWidth(0.4).stroke();
 doc.fillColor(MUTED).font('Helvetica').fontSize(8)
 .text('Vă mulțumim pentru încredere! Această factură a fost generată automat.', ML, footY + 8, { width: CW, align: 'center' });
 doc.text(`${COMPANY.name} · CUI ${COMPANY.cui} · ${COMPANY.email} · ${COMPANY.phone} · ${COMPANY.web}`,
 ML, footY + 21, { width: CW, align: 'center' });

 return new Promise((resolve, reject) => {
 doc.on('end', () => resolve(Buffer.concat(chunks)));
 doc.on('error', reject);
 doc.end();
 });
}

function drawImgPlaceholder(doc, x, y, w, h) {
 doc.rect(x, y, w, h).fill('#F3F4F6');
 doc.fillColor(MUTED).font('Helvetica').fontSize(7)
 .text('IMG', x, y + h / 2 - 4, { width: w, align: 'center' });
}

module.exports = { generateInvoicePdf, buildInvoiceNumber };
