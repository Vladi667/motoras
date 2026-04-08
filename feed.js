/**
 * /api/feed — Vercel Edge Function
 * Proxies the CarHub XML feed server-side (no CORS issues)
 * Caches for 6 hours via Vercel CDN cache headers.
 *
 * Deploy: place this file at /api/feed.js in your Vercel project root.
 *
 * Usage: fetch('/api/feed') from any page
 */

const XML_URL = 'https://www.carhub.ro/exports/feedprodusecarhub.xml';
const CACHE_SECONDS = 6 * 60 * 60; // 6 hours

export const config = { runtime: 'edge' };

export default async function handler(req) {
  try {
    const upstream = await fetch(XML_URL, {
      headers: {
        'User-Agent': 'Motorash/2.0 (+https://motorash.vercel.app)',
        'Accept': 'application/xml, text/xml, */*',
      },
      // Edge runtime supports CF-style cf object for caching hints
    });

    if (!upstream.ok) {
      return new Response(`Upstream error: ${upstream.status}`, {
        status: 502,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    const xml = await upstream.text();

    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        // Vercel CDN cache + stale-while-revalidate
        'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=3600`,
        // Allow browser to read response (CORS for same-origin is not needed,
        // but set it for local dev / staging domains)
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'X-Feed-Source': 'carhub',
        'X-Feed-Cached': new Date().toUTCString(),
      },
    });
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
