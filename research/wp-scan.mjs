/**
 * WordPress.org plugin-directory opportunity scan.
 *
 * Why this directory and not another marketplace: it is the only large software
 * marketplace that publishes DEMAND and MAINTENANCE as public, key-free API
 * fields. `active_installs` is real installed base, and `last_updated` plus
 * `tested` say whether anyone is still home. Every other marketplace makes you
 * guess at one side of that.
 *
 * The signal being hunted is not "bad plugin." It is DEMAND WITH DECAYING SUPPLY:
 * a plugin that hundreds of thousands of sites still depend on, whose author has
 * stopped shipping. Users of an abandoned plugin are already looking, already
 * have the problem, and already pay for solutions in this ecosystem. That is the
 * one shape that survives the constraint set — no capital, no calls, no audience
 * — because the directory itself is the distribution.
 *
 * Caveat kept in view: an abandoned plugin with big installs is often abandoned
 * because the category is commercially dead, or because the platform absorbed
 * the feature. High score here is a lead, not a conclusion. Run killcheck next.
 *
 * Usage:  node wp-scan.mjs [pages]     (100 plugins per page, default 25)
 */

import { writeFileSync } from 'node:fs';

const PAGES = Number(process.argv[2] || 25);
const OUT = new URL('../data/wp-plugins.json', import.meta.url);
const DELAY_MS = 700;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The API wants PHP-style bracket params, and they must be percent-encoded. */
function url(params) {
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `https://api.wordpress.org/plugins/info/1.2/?${qs}`;
}

const stripTags = (s) => String(s || '').replace(/<[^>]*>/g, '').trim();

async function page(n) {
  const res = await fetch(
    url({
      action: 'query_plugins',
      'request[browse]': 'popular',
      'request[page]': n,
      'request[per_page]': 100,
    }),
    { headers: { 'User-Agent': 'wp-opportunity-scan/1.0 (market research)' } },
  );
  if (!res.ok) throw new Error(`page ${n}: HTTP ${res.status}`);
  return res.json();
}

const all = new Map();
for (let n = 1; n <= PAGES; n++) {
  try {
    const d = await page(n);
    for (const p of d.plugins || []) all.set(p.slug, p);
    process.stderr.write(`\r  page ${n}/${PAGES} · ${all.size} plugins`);
  } catch (e) {
    console.error(`\n  ${e.message}`);
  }
  await sleep(DELAY_MS);
}
process.stderr.write('\n');

const now = Date.now();
const monthsSince = (s) => {
  // last_updated arrives as "2024-11-28 9:30am GMT" — Date can't parse that form.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  return Math.round((now - Date.UTC(+m[1], +m[2] - 1, +m[3])) / 2629800000);
};

const rows = [...all.values()].map((p) => {
  const threads = p.support_threads || 0;
  const resolved = p.support_threads_resolved || 0;
  return {
    slug: p.slug,
    name: stripTags(p.name).slice(0, 52),
    author: stripTags(p.author).slice(0, 28),
    installs: p.active_installs || 0,
    stale: monthsSince(p.last_updated),
    tested: p.tested || '',
    rating: Math.round((p.rating || 0) / 20 * 10) / 10, // API gives 0-100
    numRatings: p.num_ratings || 0,
    threads,
    resolved,
    resolveRate: threads ? Math.round((resolved / threads) * 100) : null,
  };
});

writeFileSync(OUT, JSON.stringify(rows, null, 1));

// --- ranking ---------------------------------------------------------------
// Deliberately simple and inspectable. A weighted composite would hide which
// factor drove a result, and the whole point is to read WHY something surfaced.

const abandoned = rows
  .filter((r) => r.installs >= 10000 && r.stale !== null && r.stale >= 18)
  .sort((a, b) => b.installs - a.installs);

const unhappy = rows
  .filter((r) => r.installs >= 20000 && r.numRatings >= 40 && r.rating > 0 && r.rating <= 4.2)
  .sort((a, b) => b.installs - a.installs);

const unsupported = rows
  .filter((r) => r.installs >= 20000 && r.threads >= 20 && r.resolveRate !== null && r.resolveRate <= 30)
  .sort((a, b) => b.installs - a.installs);

const fmt = (n) => (n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
const line = (r) =>
  `  ${fmt(r.installs).padStart(6)}  ${String(r.stale ?? '?').padStart(3)}mo  ` +
  `${(r.rating ? r.rating.toFixed(1) : ' - ').padStart(4)}/${String(r.numRatings).padEnd(6)} ` +
  `${r.resolveRate === null ? '  - ' : String(r.resolveRate).padStart(3) + '%'}  ${r.name}`;

console.log(`\nsample: ${rows.length} plugins (browse=popular)\n`);
console.log('legend: installs · months since update · rating/#ratings · support resolve rate\n');

console.log('=== ABANDONED BUT DEPENDED ON (>=10k installs, no update in 18mo) ===');
if (!abandoned.length) console.log('  none in sample');
abandoned.slice(0, 25).forEach((r) => console.log(line(r)));

console.log('\n=== INSTALLED BUT DISLIKED (>=20k installs, rating <=4.2) ===');
if (!unhappy.length) console.log('  none in sample');
unhappy.slice(0, 25).forEach((r) => console.log(line(r)));

console.log('\n=== UNSUPPORTED (>=20k installs, <=30% of support threads resolved) ===');
if (!unsupported.length) console.log('  none in sample');
unsupported.slice(0, 25).forEach((r) => console.log(line(r)));

const staleN = rows.filter((r) => r.stale !== null && r.stale >= 12).length;
console.log(
  `\nbaseline: ${staleN}/${rows.length} (${Math.round((staleN / rows.length) * 100)}%) of the most popular ` +
    'plugins have had no update in 12 months.',
);
console.log(`written: ${OUT}`);
