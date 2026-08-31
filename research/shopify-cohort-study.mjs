/**
 * Shopify App Store — is it enterable?
 *
 * Written before the collection finished, against the thresholds recorded in
 * state/VENTURE-3-CRITERIA.md, so that the verdict is computed rather than
 * chosen. The previous venture died because a category was nearly picked from
 * nine data points; this script refuses to report any category figure below the
 * minimum count and prints the count next to every percentage it does report.
 *
 * Usage:  node shopify-cohort-study.mjs
 */

import { readFileSync } from 'node:fs';

const DATA = new URL('../data/shopify-cohort.json', import.meta.url);

/** The visibility floor established by the earlier census. */
const VISIBLE_REVIEWS = 25;
/** "Recent" for cohort purposes. */
const RECENT_MONTHS = 24;
/** Below this, a per-category figure is not reported at all. */
const MIN_CATEGORY_N = 60;

const rows = Object.values(JSON.parse(readFileSync(DATA, 'utf8')));

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor((a.length - 1) / 2)] : null);
const say = (n, d, what) => `${pct(n, d)}% (${n} of ${d}) ${what}`;

const cutoff = (() => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - RECENT_MONTHS);
  return d.toISOString().slice(0, 7);
})();

const live = rows.filter((r) => !r.delisted && !r.error);
const dated = live.filter((r) => r.launched);
const recent = dated.filter((r) => r.launched.slice(0, 7) >= cutoff);
const older = dated.filter((r) => r.launched.slice(0, 7) < cutoff);

console.log(`\nSHOPIFY APP STORE — COHORT STUDY`);
console.log(`sample ${rows.length} of 25,692 listings (seeded random draw from the sitemap)`);
console.log(`  usable: ${live.length}   delisted: ${rows.filter((r) => r.delisted).length}   errors: ${rows.filter((r) => r.error).length}`);
console.log(`  with a launch date: ${dated.length}`);
console.log(`  "recent" = launched on or after ${cutoff}\n`);

// --- how old is the store, really -------------------------------------------

console.log('AGE OF THE STORE');
const byYear = new Map();
for (const r of dated) {
  const y = r.launched.slice(0, 4);
  byYear.set(y, (byYear.get(y) || 0) + 1);
}
for (const y of [...byYear.keys()].sort()) {
  const n = byYear.get(y);
  const withRevs = dated.filter((r) => r.launched.startsWith(y) && (r.reviews || 0) >= VISIBLE_REVIEWS).length;
  console.log(
    `  ${y}  ${String(n).padStart(5)} apps   ${String(pct(n, dated.length)).padStart(5)}% of sample   ` +
      `${String(withRevs).padStart(4)} reached ${VISIBLE_REVIEWS}+ reviews (${pct(withRevs, n)}%)`,
  );
}

// --- the primary threshold ---------------------------------------------------

const recentVisible = recent.filter((r) => (r.reviews || 0) >= VISIBLE_REVIEWS).length;
const olderVisible = older.filter((r) => (r.reviews || 0) >= VISIBLE_REVIEWS).length;
const share = pct(recentVisible, recent.length);

console.log('\nPRIMARY — CAN A NEW APP STILL REACH VISIBILITY?');
console.log(`  launched in the last ${RECENT_MONTHS} months: ${say(recentVisible, recent.length, `reached ${VISIBLE_REVIEWS}+ reviews`)}`);
console.log(`  launched before that:                 ${say(olderVisible, older.length, `reached ${VISIBLE_REVIEWS}+ reviews`)}`);
console.log(`  recent cohort with zero reviews:      ${say(recent.filter((r) => !r.reviews).length, recent.length, 'have none at all')}`);
console.log(`  median reviews, recent cohort:        ${med(recent.map((r) => r.reviews || 0))}`);
console.log(`  median reviews, older cohort:         ${med(older.map((r) => r.reviews || 0))}`);

const verdict = share >= 15 ? 'ENTERABLE' : share >= 5 ? 'MARGINAL' : 'CLOSED';
console.log(`\n  threshold: >=15% enterable | 5-15% marginal | <5% closed`);
console.log(`  RESULT: ${share}%  ->  ${verdict}`);

// --- the secondary threshold -------------------------------------------------

console.log('\nSECONDARY — IS THERE A CATEGORY WORTH ENTERING?');
console.log(`  (categories with fewer than ${MIN_CATEGORY_N} apps in the sample are not reported —`);
console.log('   the previous venture was nearly chosen from nine)\n');

const cats = new Map();
for (const r of live) for (const c of r.categories || []) {
  if (!cats.has(c)) cats.set(c, []);
  cats.get(c).push(r);
}

const reported = [...cats.entries()]
  .map(([cat, v]) => {
    const rated = v.filter((r) => r.rating != null && (r.reviews || 0) >= 5);
    const rec = v.filter((r) => r.launched && r.launched.slice(0, 7) >= cutoff);
    const recVis = rec.filter((r) => (r.reviews || 0) >= VISIBLE_REVIEWS).length;
    return {
      cat,
      n: v.length,
      rated: rated.length,
      medRating: med(rated.map((r) => r.rating)),
      recentN: rec.length,
      recentVisiblePct: pct(recVis, rec.length),
      medRecentReviews: med(rec.map((r) => r.reviews || 0)),
      bfs: pct(v.filter((r) => r.builtForShopify).length, v.length),
    };
  })
  .sort((a, b) => b.n - a.n);

const big = reported.filter((r) => r.n >= MIN_CATEGORY_N);
if (!big.length) {
  console.log(`  No category reached n=${MIN_CATEGORY_N}. Largest was "${reported[0]?.cat}" at n=${reported[0]?.n}.`);
  console.log('  Nothing is reported per category. That is the correct output, not a gap.');
} else {
  console.log(
    '  ' + 'category'.padEnd(28) + 'n'.padStart(5) + 'medRat'.padStart(8) + '(rated)'.padStart(9) +
      'recent'.padStart(8) + 'vis%'.padStart(7) + 'medRev'.padStart(8) + 'BFS%'.padStart(7),
  );
  for (const r of big) {
    console.log(
      '  ' + r.cat.slice(0, 27).padEnd(28) + String(r.n).padStart(5) + String(r.medRating ?? '-').padStart(8) +
        String(r.rated).padStart(9) + String(r.recentN).padStart(8) +
        String(r.recentVisiblePct ?? '-').padStart(7) + String(r.medRecentReviews ?? '-').padStart(8) +
        String(r.bfs).padStart(7),
    );
  }
  const openings = big.filter((r) => r.medRating != null && r.medRating < 4.5 && (r.medRecentReviews ?? 0) >= 10);
  console.log('\n  categories meeting BOTH secondary conditions (median rating < 4.5 AND median recent reviews >= 10):');
  console.log(openings.length ? openings.map((r) => `    ${r.cat} (n=${r.n})`).join('\n') : '    none');
}

// --- a figure already published that this sample can check -------------------

console.log('\nCHECK ON A PUBLISHED FIGURE');
const bfs = live.filter((r) => r.builtForShopify).length;
console.log(`  The census says 15.1% of live apps carry "Built for Shopify" (n=465, popular-head sample).`);
console.log(`  This whole-store sample: ${say(bfs, live.length, 'carry it')}`);
console.log('  If these disagree sharply, one of them is wrong and the published one has to be corrected.');

console.log('');
