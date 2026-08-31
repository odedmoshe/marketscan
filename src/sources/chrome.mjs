/**
 * Chrome Web Store.
 *
 * The largest consumer software marketplace here, and the one most assumed to
 * need a headless browser. It does not. Listing pages are server-rendered:
 * user count, rating, version, size and — crucially — the last-updated date all
 * arrive in the HTML.
 *
 * There is no JSON-LD, unlike Shopify, so this reads visible text. Two defences
 * against the failure that produced wrong numbers earlier in this project:
 *
 *  1. Script and style bodies are stripped BEFORE any matching. The first probe
 *     of this store "found" an updated field that was actually inline
 *     JavaScript (`Version)[ \/]?(\S+)/.exec(a)`). Matching against raw HTML
 *     finds fields that do not exist.
 *  2. Every field is anchored to its own visible label, not to position.
 *
 * The delisting trap, which is specific to this store and would otherwise be
 * silent: a removed or unknown extension does NOT 404. It answers HTTP 200 and
 * redirects to the store homepage. Status codes are therefore useless here, and
 * existence is determined by whether the final URL is still a /detail/ URL.
 *
 * robots.txt (checked): chromewebstore.google.com disallows nothing for `*`;
 * chrome.google.com disallows /webstore/search. Detail pages are permitted;
 * search pages are not fetched.
 */

import { request } from '../http.mjs';

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** "August 25, 2026" -> "2026-08-25", the shape health.monthsSince expects. */
export function toIso(dateText) {
  const m = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(String(dateText || '').trim());
  if (!m) return null;
  const mo = MONTHS[m[1].toLowerCase()];
  if (!mo) return null;
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
}

/**
 * True when the store served its generic shell instead of a listing.
 *
 * Belt and braces alongside the `empty-title` URL check in `lookup`: the shell
 * carries the bare title "Chrome Web Store" and none of the listing fields, so
 * it is identifiable from the body alone. Callers that parse HTML they fetched
 * themselves — the research collector does — have no `res.url` to inspect, and
 * a shell parses into a plausible-looking record with a name and no date.
 */
export function isStoreShell(html) {
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html || '')?.[1] || '').trim();
  if (title !== 'Chrome Web Store') return false;
  const text = visibleText(html);
  return !/Updated\s+[A-Za-z]+\s+\d{1,2},\s*\d{4}/.test(text) && !/[\d,]+\s*users/i.test(text);
}

/** Strip executable content first, then tags, then collapse whitespace. */
export function visibleText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const num = (s) => (s ? Number(String(s).replace(/,/g, '')) : null);

/**
 * Pure and network-free, so it is testable without hitting the store.
 * `html` is the raw page; `id` is the extension id.
 */
export function parse(html, id) {
  const text = visibleText(html);

  // Title arrives as "<name> - Chrome Web Store"; take it from the raw HTML
  // because the visible-text pass has already flattened the document.
  const rawTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '';
  const name = rawTitle.replace(/\s*-\s*Chrome Web Store\s*$/i, '').trim() || null;

  const updatedText = /Updated\s+([A-Za-z]+\s+\d{1,2},\s*\d{4})/.exec(text)?.[1] || null;

  // "Offered by" is followed by the developer, then the next labelled field.
  const offered = /Offered by\s+(.{1,80}?)(?=\s+(?:Version|Updated|Size|Languages?|Developer|Flag concern)\b|$)/.exec(text)?.[1];

  return {
    source: 'chrome',
    id,
    name: name || id,
    author: offered ? offered.trim() : null,
    url: `https://chromewebstore.google.com/detail/${id}`,
    lastUpdated: toIso(updatedText),
    // The store reports users, not installs, and rounds hard ("18,000,000").
    // Reported under the installs key because that is what it proxies, with the
    // rounding noted in the README rather than silently implied to be exact.
    installs: num(/([\d,]+)\s*users/i.exec(text)?.[1]) ?? 0,
    rating: (() => {
      const r = Number(/([\d.]+)\s*out of 5/i.exec(text)?.[1]);
      return Number.isFinite(r) ? Math.round(r * 10) / 10 : null;
    })(),
    numRatings: num(/([\d,]+)\s*ratings?\b/i.exec(text)?.[1]) ?? 0,
    version: /Version\s+([\d][\w.\-]*)/.exec(text)?.[1] || null,
    size: /Size\s+([\d.]+\s*[KMG]i?B)/i.exec(text)?.[1] || null,
  };
}

export async function lookup(id) {
  // A bare 32-character id resolves — the store redirects it to the canonical
  // slug URL — so callers need not know the slug.
  const url = `https://chromewebstore.google.com/detail/${id}`;
  const res = await request(url, { headers: { Accept: 'text/html' } });

  // See the header note: removal does not 404 here. Two distinct shapes, and
  // the second was found only by sampling the store at scale:
  //
  //   1. An unknown id redirects away from /detail/ entirely (store homepage).
  //   2. A REMOVED extension keeps a /detail/ URL but gets the slug
  //      "empty-title" and is served a generic shell whose <title> is just
  //      "Chrome Web Store", with no fields at all.
  //
  // Checking only for /detail/ passes case 2, which then parses into a record
  // with a name and no date — indistinguishable from a live listing whose
  // markup changed. In a 500-extension sample that silently mislabelled 7.
  const finalUrl = res.url || '';
  if (!/\/detail\//.test(finalUrl) || /\/detail\/empty-title\//.test(finalUrl)) {
    return {
      source: 'chrome',
      id,
      url,
      delisted: true,
      error: 'not in the Chrome Web Store — either removed, or the id is wrong',
    };
  }
  if (!res.ok) throw new Error(`chrome: HTTP ${res.status} for "${id}"`);

  const rec = parse(await res.text(), id);
  // Landing on a detail page with no date means the markup changed; say so
  // rather than returning a record that grades UNKNOWN for the wrong reason.
  if (!rec.lastUpdated && !rec.installs) {
    throw new Error(`chrome: "${id}" returned a detail page with no recognisable fields — markup may have changed`);
  }
  return rec;
}
