/**
 * Shopify App Store.
 *
 * The other two sources have APIs. This one does not, which is exactly why no
 * package-health index covers it — and why it was worth checking whether a
 * browser is actually required. It is not: listing pages embed schema.org
 * JSON-LD server-side, so a plain fetch and a JSON parse are enough.
 *
 * That matters beyond convenience. An earlier collector for this same store
 * scraped rendered text and silently attributed *other apps'* review counts —
 * from the "recommended" sidebar — to the app being measured, reporting an app
 * with zero reviews as having 2,894. JSON-LD is a declared contract about one
 * subject, so that entire class of bug does not arise.
 *
 * Two honest limits, both load-bearing:
 *
 *  - The markup carries no last-updated or launch date. So Shopify records
 *    CANNOT carry a maintenance grade, and this module returns
 *    `lastUpdated: null` rather than inventing one from something adjacent.
 *    An UNKNOWN grade is a true statement; a fabricated one is not.
 *  - A page may contain several JSON-LD blocks (breadcrumbs, organisation).
 *    Only the SoftwareApplication block describes the app, so it is selected by
 *    type rather than by position. Taking the first block would reintroduce
 *    exactly the "wrong subject" bug described above.
 */

import { request } from '../http.mjs';

/** schema.org allows a bare string or a node object wherever a thing is named. */
function nameOf(v) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return nameOf(v[0]);
  return typeof v.name === 'string' ? v.name : null;
}

/** Walk @graph containers as well as top-level nodes and arrays. */
function* nodes(parsed) {
  const seen = Array.isArray(parsed) ? [...parsed] : [parsed];
  while (seen.length) {
    const n = seen.shift();
    if (!n || typeof n !== 'object') continue;
    if (Array.isArray(n['@graph'])) seen.push(...n['@graph']);
    yield n;
  }
}

const typeOf = (n) => (Array.isArray(n['@type']) ? n['@type'] : [n['@type']]).filter(Boolean);

/**
 * Pure, network-free, and therefore testable. Returns null when the page
 * carries no SoftwareApplication — which is the correct answer for a category
 * page or an interstitial, and better than a half-filled record.
 */
export function parse(htmlText, handle) {
  const blocks = [...htmlText.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  // Collect every candidate before choosing one. The failure that motivated
  // this whole module was a parser that grabbed the first plausible match and
  // got a *different app's* numbers, so "how many subjects does this page
  // describe" has to be an answered question rather than an assumption.
  const candidates = [];
  for (const [, raw] of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      continue; // A malformed block is not a reason to abandon the others.
    }
    for (const node of nodes(parsed)) {
      if (typeOf(node).includes('SoftwareApplication')) candidates.push(node);
    }
  }

  if (candidates.length === 0) return null;

  {
    // One subject is the normal case and the verified one. If the store ever
    // starts emitting sidebar or related apps as SoftwareApplication too, this
    // surfaces it as data instead of silently returning the wrong app.
    const node = candidates[0];
    const ambiguous = candidates.length > 1;

      const agg = node.aggregateRating || {};
      const rating = Number(agg.ratingValue);
      const reviews = Number(agg.ratingCount ?? agg.reviewCount);

      return {
        source: 'shopify',
        id: handle,
        name: nameOf(node.name) || handle,
        author: nameOf(node.brand) || nameOf(node.author) || null,
        url: `https://apps.shopify.com/${handle}`,
        // Deliberately absent — see the header note. Do not populate this.
        lastUpdated: null,
        rating: Number.isFinite(rating) ? Math.round(rating * 10) / 10 : null,
        numRatings: Number.isFinite(reviews) ? reviews : 0,
        // The store publishes no installed-base figure at all. Review count is
        // the only traction proxy available, and it is NOT an install count, so
        // it is not reported as one.
        installs: 0,
        categories: node.applicationCategory ? [node.applicationCategory] : [],
        // Present and true only when the page described more than one app.
        // Callers should treat an ambiguous record as unverified.
        ...(ambiguous ? { ambiguous: true, subjectsOnPage: candidates.length } : {}),
      };
  }
}

export async function lookup(handle) {
  const url = `https://apps.shopify.com/${handle}`;
  const res = await request(url);

  // A handle the store no longer serves is the strongest signal available here.
  // Since there is no update date, delisting is the only maintenance fact this
  // marketplace exposes — so it matters more, not less, than on the others.
  if (res.status === 404) {
    return {
      source: 'shopify',
      id: handle,
      url,
      delisted: true,
      error: 'not in the app store — either removed, or the handle is wrong',
    };
  }
  if (!res.ok) throw new Error(`shopify: HTTP ${res.status} for "${handle}"`);

  const rec = parse(await res.text(), handle);
  if (!rec) {
    throw new Error(
      `shopify: "${handle}" returned a page with no SoftwareApplication data — the listing markup may have changed`,
    );
  }
  return rec;
}
