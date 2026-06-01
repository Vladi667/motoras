# SEO setup — what to do once

Most of the technical SEO is now in place. The remaining work is **account creation + token pasting**. Do these once and the site becomes discoverable.

## 1. Google Search Console (10 min)

1. Go to <https://search.google.com/search-console>.
2. Click "Add property" → choose **URL prefix** → enter `https://www.pieseautomotoras.ro/`.
3. Pick the **HTML tag** verification method. Google will show a meta tag like:
   ```html
   <meta name="google-site-verification" content="abc123XYZ..."/>
   ```
4. Copy the value of `content="..."`.
5. Open [`index.html`](../index.html), find the line:
   ```html
   <meta name="google-site-verification" content="REPLACE_WITH_GOOGLE_TOKEN"/>
   ```
6. Replace `REPLACE_WITH_GOOGLE_TOKEN` with the value from step 4.
7. Run `vercel --prod --yes --force` (or trigger a deploy any other way).
8. Back in Search Console, click **Verify**. You should see ✓ Verified.
9. In Search Console left nav: **Sitemaps** → add `https://www.pieseautomotoras.ro/sitemap.xml` → submit. Add `https://www.pieseautomotoras.ro/product-sitemap.xml` as well.
10. (Optional but recommended) Go to **URL Inspection** → paste the homepage → click **Request indexing**. Do the same for the 3-4 most important landing pages.

**Expected timeline:** crawled in 1-7 days, first appearance in SERPs in 2-4 weeks.

## 2. Bing Webmaster Tools (5 min)

1. Go to <https://www.bing.com/webmasters>.
2. Sign in with a Microsoft account.
3. Click **Add a site** → enter `https://www.pieseautomotoras.ro/`.
4. Choose **HTML Meta Tag** verification. Copy the `content="..."` value.
5. Open [`index.html`](../index.html), find:
   ```html
   <meta name="msvalidate.01" content="REPLACE_WITH_BING_TOKEN"/>
   ```
6. Replace `REPLACE_WITH_BING_TOKEN` with the value from step 4.
7. Deploy.
8. Click **Verify** in Bing Webmaster.
9. In Bing left nav: **Sitemaps** → submit both sitemap URLs.
10. **Important for AI search:** Bing Webmaster has an **IndexNow** integration — enable it. It pushes new/changed URLs to Bing instantly. Bing powers ChatGPT Search, DuckDuckGo, and Perplexity's Bing layer, so this is the fastest path to AI discovery.

**Expected timeline:** crawled within 24-48h, surface in Bing/DDG/ChatGPT Search within 1-2 weeks.

## 3. Google Business Profile (15 min) — local SEO

This is what wins "piese auto bucurești" local-pack rankings.

1. Go to <https://www.google.com/business>.
2. Sign in → **Add your business**.
3. Business name: `Motoraș - Piese Auto & Detailing`.
4. Category (primary): **Auto Parts Store**. Additional: **Car Wash Equipment Supplier**, **Detailing Service** (only if you do detailing in-store).
5. Address: Strada Agricultori 2, Sector 2, București.
6. Service area: leave at "I deliver goods and services to my customers".
7. Phone: 0731 284 932. Website: https://www.pieseautomotoras.ro.
8. Verify: Google will mail a postcard with a 5-digit code to the address. Takes 5-14 days. Enter the code in GBP → you're live.
9. Once verified, upload **8-12 photos**: storefront, interior, a few hero products, the BMW/Dacia covers display, etc. Photos drive a measurable bump in local pack appearance.
10. Set hours, add a short description, enable messaging.

**Expected impact:** within 2-3 weeks of verification, you'll start appearing in the Google Maps local pack for "piese auto sector 2", "piese auto bucurești", "detailing auto bucurești".

## 4. After all above are done

- Wait 2 weeks, then go back to **Search Console → Performance** to see your first impressions/clicks.
- Watch **Coverage** for any crawl errors.
- After the first month, submit the site to:
  - <https://www.trustpilot.com/business> (for review collection)
  - Local Romanian directories: paginiaurii.ro, paginalbe.ro
  - Detailing-specific communities: facebook.com/groups/detailingromania, dacia-club.ro, forum.bmwclub.ro (with a useful post, not spam)

## 5. AI-specific tweaks already in place

- `/llms.txt` is published — ChatGPT, Claude, and Perplexity crawlers read this to understand the site
- Structured data (schema.org/AutoPartsStore + Organization + WebSite + Product) is on every page
- `/api/product-sitemap.xml` exposes all 3,558 SKUs with current prices/stock

No further AI-specific action is needed beyond getting indexed in Bing (step 2).
