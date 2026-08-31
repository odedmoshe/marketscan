/**
 * Shopify App Store — whole-store cohort sample.
 *
 * WHAT THIS IS FOR, AND WHY IT IS NOT THE EARLIER SHOPIFY DATASET.
 *
 * The first Shopify collection (data/app-details.json, n=465) measured how
 * crowded the store is. It answered that: 45.6% of live apps have under 25
 * reviews. What it could not answer is the question that actually decides
 * whether to build here — *is the store still enterable* — because it never
 * recorded when each app launched.
 *
 * Listing pages publish a launch date. With that, review count stops being a
 * popularity measure and becomes a cohort measure: an app launched in 2013 with
 * 40 reviews and an app launched last year with 40 reviews are telling opposite
 * stories. This collects launch date alongside rating and reviews so the
 * question can be answered as a distribution per cohort rather than an average
 * over a store where most apps are old.
 *
 * WHAT IT DELIBERATELY DOES NOT COLLECT.
 *
 * Price. Listing pages carry "$N/month" strings belonging to sidebar
 * recommendations as well as to the app itself, and the existing parser module
 * exists because an earlier version of exactly that pattern attributed one
 * app's numbers to another. A field that is right most of the time is worse
 * than an absent one, because it gets averaged. The median-tier figure in the
 * census comes from the earlier, narrower collection and stays there.
 *
 * SAMPLING.
 *
 * The universe is the English app sitemap that robots.txt advertises — every
 * listing, ordered by nothing in particular, so a seeded random draw from it is
 * a sample of the whole store including the long tail, not of the popular head.
 * Store-wide rates from this are unbiased; per-category rates are only as good
 * as the count that lands in each category, which the study script reports
 * alongside every figure rather than hiding.
 *
 * Politeness: one connection, sequential, ~1.2s apart, resumable, hard cap.
 * robots.txt permits listing pages (it disallows /internal/, /services/ and
 * search URLs, none of which are touched here).
 *
 * Usage:  node shopify-scan.mjs [sampleSize] [seed]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SAMPLE = Number(process.argv[2] || 2500);
const SEED = Number(process.argv[3] || 20260831);
const OUT = new URL('../data/shopify-cohort.json', import.meta.url);
const DELAY_MS = 1200;
const UA = 'marketscan-research/0.2 (marketplace maintenance study; +https://github.com/odedmoshe/marketscan)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);

/** Seeded PRNG, so the sample is reproducible by anyone with the script. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

async function get(url, timeout = 25000) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  });
  return { status: res.status, finalUrl: res.url, text: await res.text() };
}

// --- parsing ----------------------------------------------------------------

/** Page text as a list of trimmed non-empty nodes, scripts and styles removed. */
export function textNodes(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n))
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

const MONTHS = 'January February March April May June July August September October November December'.split(' ');

/** "September 20, 2012" -> "2012-09-20". Returns null on anything else. */
export function parseLaunched(s) {
  const m = /^([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(String(s || '').trim());
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1]);
  if (mi < 0) return null;
  return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
}

/**
 * Everything the study needs, from one listing page.
 *
 * Rating and review count come from the page's own JSON-LD, which names its
 * subject; the label-driven fields come from the rendered text. Both are
 * anchored — a value is only read when it sits immediately after the label that
 * introduces it — because the failure mode on this store is picking up a
 * neighbouring app's numbers, not failing to find any.
 */
export function parseListing(html, handle) {
  const out = {
    handle,
    title: null,
    developer: null,
    rating: null,
    reviews: null,
    launched: null,
    categories: [],
    builtForShopify: /Built for Shopify/.test(html),
    seen: today,
  };

  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const apps = [];
  for (const [, raw] of blocks) {
    let j;
    try {
      j = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    for (const node of Array.isArray(j) ? j : [j]) {
      const t = node?.['@type'];
      if (t && String(t).includes('SoftwareApplication')) apps.push(node);
    }
  }
  if (apps.length > 1) out.ambiguous = apps.length;
  const app = apps[0];
  if (app) {
    out.title = typeof app.name === 'string' ? app.name : null;
    out.developer = typeof app.brand === 'string' ? app.brand : app.brand?.name || null;
    const agg = app.aggregateRating || {};
    const r = Number(agg.ratingValue);
    const n = Number(agg.ratingCount ?? agg.reviewCount);
    out.rating = Number.isFinite(r) ? Math.round(r * 10) / 10 : null;
    out.reviews = Number.isFinite(n) ? n : 0;
  }

  const nodes = textNodes(html);

  const li = nodes.indexOf('Launched');
  if (li >= 0) out.launched = parseLaunched(nodes[li + 1]);

  // Categories are listed after the "Categories" label and end where the
  // feature accordion begins. Reading to a fixed offset instead would swallow
  // feature names, which look exactly like categories and are not.
  const ci = nodes.indexOf('Categories');
  if (ci >= 0) {
    for (let i = ci + 1; i < nodes.length && i < ci + 8; i++) {
      const v = nodes[i];
      if (/^(Show features|Hide features|Launched|Developer|Website|Pricing)$/.test(v)) break;
      if (v.length > 60) break;
      out.categories.push(v);
    }
  }

  return out;
}

// --- collection -------------------------------------------------------------

async function main() {
  const store = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
  const already = Object.keys(store).length;
  console.error(`resuming with ${already} records already collected`);

  console.error('fetching sitemap…');
  const sm = await get('https://apps.shopify.com/sitemap_apps_en.xml', 60000);
  const handles = [...sm.text.matchAll(/<loc>https:\/\/apps\.shopify\.com\/([a-z0-9][a-z0-9-]*)<\/loc>/gi)].map(
    (m) => m[1],
  );
  console.error(`universe: ${handles.length} listings`);

  // Fisher-Yates with the seeded PRNG, so run N and run N+1 draw the same set
  // and the sample can simply be extended rather than redrawn.
  const rnd = lcg(SEED);
  const shuffled = handles.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const target = shuffled.slice(0, SAMPLE).filter((h) => !store[h]);
  console.error(`to fetch: ${target.length} (sample ${SAMPLE}, seed ${SEED})`);

  let done = 0;
  let failed = 0;
  for (const handle of target) {
    try {
      const res = await get(`https://apps.shopify.com/${handle}`);
      if (res.status === 404) {
        store[handle] = { handle, delisted: true, seen: today };
      } else if (res.status !== 200) {
        store[handle] = { handle, error: `HTTP ${res.status}`, seen: today };
        failed++;
      } else {
        store[handle] = parseListing(res.text, handle);
      }
    } catch (e) {
      store[handle] = { handle, error: e.message, seen: today };
      failed++;
    }

    done++;
    if (done % 25 === 0) {
      writeFileSync(OUT, JSON.stringify(store, null, 1));
      console.error(`  ${done}/${target.length} (${failed} failed)`);
    }
    await sleep(DELAY_MS);
  }

  writeFileSync(OUT, JSON.stringify(store, null, 1));
  console.error(`done: ${Object.keys(store).length} records, ${failed} failures this run`);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('shopify-scan.mjs')) {
  main().catch((e) => {
    console.error('fatal:', e.message);
    process.exit(1);
  });
}
