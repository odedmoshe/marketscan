/**
 * Chrome Web Store — whole-store abandonment sample.
 *
 * READ THIS BEFORE COMPARING THE OUTPUT TO THE WORDPRESS FIGURE.
 *
 * The WordPress number in RESEARCH.md ("13.8% of the top 2,000") measures the
 * POPULAR HEAD, because wp.org exposes `browse=popular`. Chrome exposes no
 * ranking endpoint at all, so the only enumerable universe is the sitemap —
 * which is ordered by extension id and is therefore effectively random with
 * respect to popularity.
 *
 * That makes this a sample of THE WHOLE STORE, long tail included. Abandonment
 * in a long tail is always higher than in a popular head, for the obvious
 * reason. The two numbers answer different questions and putting them in the
 * same sentence would be misleading. This one answers: "of everything listed in
 * the Chrome Web Store, how much is still maintained?" — which nobody appears
 * to have published, and which is interesting precisely because the store keeps
 * serving all of it to users with no indication of age.
 *
 * Politeness: sequential, real delay, hard cap, resumable. robots.txt permits
 * detail pages (chromewebstore.google.com disallows nothing for `*`) and the
 * sitemap is the one Google itself advertises in chrome.google.com/robots.txt.
 *
 * Usage:  node chrome-scan.mjs [sampleSize] [shardCount]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parse, isStoreShell } from '../src/sources/chrome.mjs';

const SAMPLE = Number(process.argv[2] || 400);
const SHARDS = Number(process.argv[3] || 6);
const OUT = new URL('../data/chrome-extensions.json', import.meta.url);
const DELAY_MS = 1200;
const UA = 'marketscan-research/0.1 (marketplace maintenance study)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);

/**
 * Seeded PRNG so the sample is reproducible. An unseeded sample cannot be
 * checked by anyone else, which defeats the point of shipping the collector.
 */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  return { status: res.status, finalUrl: res.url, text: await res.text() };
}

// --- build the universe from the sitemap -----------------------------------

console.error('fetching sitemap index…');
const index = await get('https://chrome.google.com/webstore/sitemap');
const shardUrls = [...index.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
console.error(`  ${shardUrls.length} shards advertised; sampling from the first ${SHARDS}`);

const ids = [];
for (const url of shardUrls.slice(0, SHARDS)) {
  const { text } = await get(url);
  for (const m of text.matchAll(/\/detail\/[^/]+\/([a-p]{32})/g)) ids.push(m[1]);
  process.stderr.write(`\r  collected ${ids.length} ids`);
  await sleep(600);
}
process.stderr.write('\n');

const unique = [...new Set(ids)];
console.error(`  ${unique.length} unique extension ids in the sampling frame`);

// Deterministic shuffle, then take the first SAMPLE.
const rnd = lcg(20260831);
const shuffled = unique
  .map((id) => ({ id, k: rnd() }))
  .sort((a, b) => a.k - b.k)
  .map((x) => x.id);

const store = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const queue = shuffled.filter((id) => !store[id]).slice(0, SAMPLE);
console.error(`  ${Object.keys(store).length} already stored · ${queue.length} to fetch this run\n`);

// --- collect ---------------------------------------------------------------

let done = 0;
let delisted = 0;

for (const id of queue) {
  try {
    const { status, finalUrl, text } = await get(`https://chromewebstore.google.com/detail/${id}`);

    // A removed extension does not 404. Two shapes, and the second was only
    // found by running this at scale: an unknown id redirects away from
    // /detail/, but a REMOVED one keeps a /detail/ URL under the slug
    // "empty-title" and is served a generic shell. Checking only for /detail/
    // recorded 7 of the first 500 as live-with-no-date.
    if (!/\/detail\//.test(finalUrl) || /\/detail\/empty-title\//.test(finalUrl) || isStoreShell(text)) {
      store[id] = { id, delisted: true, seen: today };
      delisted++;
    } else {
      const rec = parse(text, id);
      store[id] = { ...rec, delisted: false, seen: today };
    }
  } catch (e) {
    store[id] = { id, error: String(e.message).slice(0, 60), seen: today };
  }

  done++;
  if (done % 25 === 0) {
    writeFileSync(OUT, JSON.stringify(store));
    process.stderr.write(`\r  ${done}/${queue.length} (${delisted} delisted)`);
  }
  await sleep(DELAY_MS);
}

writeFileSync(OUT, JSON.stringify(store));
process.stderr.write(`\n\ndone · ${done} fetched · ${delisted} delisted · ${Object.keys(store).length} total records\n`);
