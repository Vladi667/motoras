#!/usr/bin/env python3
import os

SITE = r"C:\Users\Admin\Desktop\site"

WA_WIDGET = (
    "\n<!-- ===== WHATSAPP FLOATING BUTTON ===== -->\n"
    "<style>\n"
    ".wa-float{position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;align-items:center;gap:10px;flex-direction:row-reverse}\n"
    ".wa-btn{width:56px;height:56px;background:#25D366;border-radius:50%;display:flex;align-items:center;justify-content:center;"
    "box-shadow:0 4px 16px rgba(37,211,102,.45);cursor:pointer;text-decoration:none;transition:transform .2s,box-shadow .2s;flex-shrink:0}\n"
    ".wa-btn:hover{transform:scale(1.1);box-shadow:0 6px 24px rgba(37,211,102,.6)}\n"
    ".wa-btn svg{width:30px;height:30px;fill:#fff}\n"
    ".wa-tooltip{background:#fff;color:#1a1a1a;font-size:13px;font-weight:600;padding:7px 14px;border-radius:20px;"
    "box-shadow:0 2px 12px rgba(0,0,0,.15);white-space:nowrap;opacity:0;transform:translateX(8px);"
    "transition:opacity .2s,transform .2s;pointer-events:none}\n"
    ".wa-float:hover .wa-tooltip{opacity:1;transform:translateX(0)}\n"
    "@keyframes wa-pulse{0%,100%{box-shadow:0 4px 16px rgba(37,211,102,.45)}50%{box-shadow:0 4px 28px rgba(37,211,102,.75)}}\n"
    ".wa-btn{animation:wa-pulse 2.5s ease-in-out infinite}\n"
    ".wa-btn:hover{animation:none}\n"
    "</style>\n"
    '<div class="wa-float">\n'
    '  <a class="wa-btn" href="https://wa.me/40731284932?text=Bun%C4%83%20ziua%2C%20am%20o%20%C3%AEntrebare%20despre%20un%20produs." '
    'target="_blank" rel="noopener" aria-label="Chat pe WhatsApp">\n'
    '    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">'
    '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075'
    '-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497'
    '.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372'
    '-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625'
    '.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347'
    'm-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26'
    'c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884'
    'm8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654'
    'a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>'
    '</svg>\n'
    '  </a>\n'
    '  <span class="wa-tooltip">Chat pe WhatsApp</span>\n'
    '</div>\n'
    "<!-- ===== END WHATSAPP ===== -->\n"
)

pages = [
    "index.html", "category.html", "product.html", "search.html",
    "account.html", "checkout.html", "contact.html", "confirmation.html",
    "404.html", "cookies.html", "confidentialitate.html"
]

for fn in pages:
    path = os.path.join(SITE, fn)
    if not os.path.exists(path):
        print(f"SKIP (missing): {fn}")
        continue
    with open(path, encoding="utf-8") as f:
        content = f.read()
    if "wa-float" in content or "wa.me" in content:
        print(f"SKIP (already has WA): {fn}")
        continue
    if "</body>" not in content:
        print(f"NO </body>: {fn}")
        continue
    content = content.replace("</body>", WA_WIDGET + "</body>", 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"ADDED: {fn}")

print("Done!")
