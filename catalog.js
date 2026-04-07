
:root{
  --red:#e30613;
  --red-dark:#b0000d;
  --dark:#0d1117;
  --dark2:#151b24;
  --light:#f5f7fb;
  --mid:#667085;
  --line:#e5e7eb;
  --ok:#0f9f6e;
  --warn:#f59e0b;
  --radius:18px;
  --shadow:0 16px 50px rgba(15,23,42,.10);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0}
.common-topbar{background:var(--dark);color:#fff;font:500 13px/1.4 Inter,Arial,sans-serif}
.common-topbar .in{max-width:1200px;margin:0 auto;padding:10px 20px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
.legal-header{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.96);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.legal-header .in{max-width:1200px;margin:0 auto;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:18px}
.brand-link{display:flex;align-items:center;gap:12px;text-decoration:none;color:var(--dark);font:800 24px/1 Inter,Arial,sans-serif;letter-spacing:-.03em}
.brand-badge{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,var(--red),#ff4b57);display:grid;place-items:center;color:#fff;font-weight:900;box-shadow:0 10px 30px rgba(227,6,19,.22)}
.common-nav{display:flex;gap:18px;flex-wrap:wrap}
.common-nav a{text-decoration:none;color:#243041;font:600 14px/1.4 Inter,Arial,sans-serif}
.common-nav a:hover{color:var(--red)}
.page-shell{background:#f6f8fc;min-height:100vh;padding:36px 20px 60px}
.page-card{max-width:1200px;margin:0 auto;background:#fff;border:1px solid var(--line);border-radius:28px;box-shadow:var(--shadow);overflow:hidden}
.page-hero{padding:40px 32px 22px;background:linear-gradient(180deg,#fff 0%,#f9fbff 100%);border-bottom:1px solid var(--line)}
.page-kicker{display:inline-flex;align-items:center;gap:8px;background:rgba(227,6,19,.08);color:var(--red);border:1px solid rgba(227,6,19,.12);padding:8px 12px;border-radius:999px;font:700 12px/1 Inter,Arial,sans-serif;text-transform:uppercase;letter-spacing:.06em}
.page-hero h1{margin:16px 0 12px;font:800 clamp(32px,4vw,52px)/1.02 Inter,Arial,sans-serif;color:#101828;letter-spacing:-.04em}
.page-hero p{max-width:780px;margin:0;color:#475467;font:500 18px/1.65 Inter,Arial,sans-serif}
.info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:28px}
.info-chip{border:1px solid var(--line);border-radius:18px;padding:18px;background:#fff}
.info-chip strong{display:block;margin-bottom:6px;font:800 14px/1.3 Inter,Arial,sans-serif;color:#111827}
.info-chip span{display:block;color:#667085;font:500 14px/1.5 Inter,Arial,sans-serif}
.content-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:28px;padding:32px}
.prose{color:#344054;font:500 16px/1.8 Inter,Arial,sans-serif}
.prose h2{margin:30px 0 12px;color:#101828;font:800 28px/1.15 Inter,Arial,sans-serif;letter-spacing:-.03em}
.prose h3{margin:24px 0 10px;color:#101828;font:800 20px/1.25 Inter,Arial,sans-serif}
.prose p,.prose li{color:#475467}
.prose ul{padding-left:20px}
.prose a{color:var(--red);text-decoration:none;font-weight:700}
.prose table{width:100%;border-collapse:collapse;margin:18px 0;background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden}
.prose th,.prose td{padding:14px 16px;border-bottom:1px solid var(--line);text-align:left;font-size:14px}
.prose th{background:#f8fafc;color:#101828}
.side-panel{display:grid;gap:16px;align-content:start}
.side-card{border:1px solid var(--line);border-radius:22px;padding:22px;background:#fff}
.side-card h3{margin:0 0 10px;color:#101828;font:800 18px/1.2 Inter,Arial,sans-serif}
.side-card p{margin:0 0 14px;color:#667085;font:500 14px/1.65 Inter,Arial,sans-serif}
.side-card a{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 18px;border-radius:14px;background:var(--red);color:#fff;text-decoration:none;font:800 14px/1 Inter,Arial,sans-serif;box-shadow:0 12px 24px rgba(227,6,19,.18)}
.side-links{display:grid;gap:10px;margin-top:10px}
.side-links a{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:#fff;color:#101828;text-decoration:none;font:700 14px/1.4 Inter,Arial,sans-serif}
.side-links a:hover{border-color:rgba(227,6,19,.22);color:var(--red)}
.common-footer{background:#0f1720;color:#d0d5dd;margin-top:48px}
.common-footer .in{max-width:1200px;margin:0 auto;padding:32px 20px}
.common-footer-grid{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:22px}
.common-footer h4{margin:0 0 12px;color:#fff;font:800 15px/1.2 Inter,Arial,sans-serif}
.common-footer p,.common-footer a{color:#98a2b3;font:500 14px/1.65 Inter,Arial,sans-serif;text-decoration:none}
.common-footer a:hover{color:#fff}
.common-footer .bottom{margin-top:24px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;font:500 13px/1.6 Inter,Arial,sans-serif;color:#98a2b3}
@media (max-width: 980px){.content-grid{grid-template-columns:1fr}.info-grid,.common-footer-grid{grid-template-columns:1fr 1fr}.common-nav{display:none}}
@media (max-width: 700px){.page-hero,.content-grid{padding:24px 18px}.info-grid,.common-footer-grid{grid-template-columns:1fr}.page-shell{padding:18px 12px 40px}}

.common-footer.shop-footer{margin-top:48px}
.motoras-card{background:#fff;border-radius:16px;border:1.5px solid var(--border);overflow:hidden;transition:all .24s cubic-bezier(.34,1.56,.64,1);position:relative}
.motoras-card:hover{border-color:var(--red);transform:translateY(-4px);box-shadow:0 10px 40px rgba(204,17,17,.12)}
.motoras-card__img{display:block;width:100%;height:200px;overflow:hidden;background:#f8f8f8}.motoras-card__img img{width:100%;height:100%;object-fit:cover}
.motoras-card__body{padding:14px}.motoras-card__brand{font-size:10px;font-weight:700;color:var(--red);letter-spacing:.8px;text-transform:uppercase;margin-bottom:4px}
.motoras-card__name{font-size:13px;font-weight:700;color:var(--dark);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:7px;display:block;text-decoration:none}
.motoras-card__rating{display:flex;align-items:center;gap:5px;margin-bottom:8px}.motoras-card__rating span{font-size:11px;color:#aaa;font-weight:600}
.motoras-card__pricing{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap;margin-bottom:5px}.motoras-card__price{font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:800;color:var(--red)}
.motoras-card__old{font-size:12.5px;color:#bbb;text-decoration:line-through;font-weight:600}.motoras-card__save{font-size:11px;font-weight:800;color:var(--green);background:#eaf7ef;padding:2px 7px;border-radius:5px}
.motoras-card__cta{width:100%;margin-top:11px;display:flex;align-items:center;justify-content:center;gap:8px;background:var(--dark);color:#fff;padding:10px;border-radius:9px;border:none;font-size:13px;font-weight:700;cursor:pointer;transition:background .18s}.motoras-card__cta:hover{background:var(--red)}
.prod-badge{position:absolute;top:12px;left:12px;z-index:2;color:#fff;font-size:10px;font-weight:800;padding:4px 9px;border-radius:6px}.badge-hot{background:var(--gold)}.badge-new{background:var(--red)}.badge-sale{background:#111}
.stock{font-size:11px;font-weight:700}.stock.ok{color:var(--green)}.stock.low{color:var(--gold)}.stock.out{color:var(--red)}
.page-hero{background:linear-gradient(135deg,#121624,#1e2235);color:#fff;border-radius:18px;padding:28px 30px;margin-bottom:22px}.page-hero p{color:rgba(255,255,255,.72);margin-top:8px;max-width:760px}
.page-wrap{max-width:1180px;margin:0 auto;padding:0 18px 48px}.content-card{background:#fff;border:1px solid var(--border);border-radius:18px;padding:24px}
.faq-item{border:1px solid var(--border);border-radius:14px;padding:18px 18px 12px;margin-bottom:14px;background:#fff}.faq-item h3{margin:0 0 8px;font-size:18px}
.admin-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:20px 0}.admin-stat{background:#fff;border:1px solid var(--border);border-radius:18px;padding:18px}.admin-stat .kpi{font-size:28px;font-weight:800;color:var(--red);font-family:'Barlow Condensed',sans-serif}
.admin-table{width:100%;border-collapse:collapse;background:#fff;border-radius:18px;overflow:hidden}.admin-table th,.admin-table td{padding:14px;border-bottom:1px solid var(--border);text-align:left;font-size:14px}.admin-actions{display:flex;gap:8px;flex-wrap:wrap}.admin-actions button{border:1px solid var(--border);background:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:700}
@media(max-width:900px){.admin-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){.admin-grid{grid-template-columns:1fr}}
