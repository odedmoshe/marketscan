/**
 * Recompute the second round of published figures — the ones that come from the
 * whole WordPress directory and the Shopify cohort sample — from stored data.
 *
 * Separate from verify-census.mjs on purpose. That script guards the figures
 * already published; this one guards the figures being added. Keeping them
 * apart means the first can keep passing untouched while the second is still
 * being written, and a failure says which body of work it belongs to.
 *
 * Every claimed value below is a constant. That is the point: it is a
 * transcription of what the page says, and the script's job is to disagree with
 * it when the data does.
 *
 * Usage:  node verify-v2.mjs
 */

import { readFileSync } from 'node:fs';

const wpDir = Object.values(JSON.parse(readFileSync(new URL('../data/wp-directory.json', import.meta.url), 'utf8')));
const shop = Object.values(JSON.parse(readFileSync(new URL('../data/shopify-cohort.json', import.meta.url), 'utf8')));

let fails = 0;
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const monthsSince = (iso) => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return Math.max(0, Math.round((Date.now() - Date.UTC(y, m - 1, d)) / 2629800000));
};

function check(label, actual, claimed, tol = 0.15) {
  const ok =
    typeof claimed === 'number' && typeof actual === 'number'
      ? Math.abs(actual - claimed) <= tol
      : String(actual) === String(claimed);
  if (!ok) fails++;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(56)} claimed ${String(claimed).padStart(9)}   actual ${String(actual).padStart(9)}`,
  );
}

// --- coverage comes first ----------------------------------------------------
//
// Every rate below is a rate over what was collected. If collection is short of
// the directory, the rates are conditional on that and saying so is part of the
// figure, not a caveat attached to it.

const DIRECTORY_TOTAL = 71091; // as reported by browse=new / browse=updated
const dated = wpDir.filter((r) => r.added && r.up);

console.log('\n=== WORDPRESS DIRECTORY — COVERAGE ===');
console.log(`  collected:            ${wpDir.length}`);
console.log(`  with both dates:      ${dated.length}`);
console.log(`  directory reports:    ${DIRECTORY_TOTAL}`);
console.log(`  coverage:             ${pct(wpDir.length, DIRECTORY_TOTAL)}%`);
if (pct(wpDir.length, DIRECTORY_TOTAL) < 95) {
  console.log('  NOTE: under 95%. Figures below must be published as "of N collected",');
  console.log('        never as "of the directory".');
}

// --- the figure the census already publishes, re-derived from the population --

console.log('\n=== RE-DERIVING A PUBLISHED FIGURE FROM THE POPULATION ===');
const since2023big = dated.filter((r) => r.added >= '2023-01-01' && r.i >= 50000).length;
check('plugins added since 2023 with 50,000+ installs', since2023big, 46, 0);
console.log('  The census states 46, derived from the top-2,000 sample. A plugin at');
console.log('  50k+ installs is necessarily inside the top 2,000 by popularity, so the');
console.log('  sample was complete for this question and the count stands.');

// --- the new cohort figures --------------------------------------------------

const cohort2024 = dated.filter((r) => r.added >= '2024-01-01');
const won = cohort2024.filter((r) => r.i >= 10000);

console.log('\n=== WORDPRESS COHORT (added 2024 or later) ===');
// Reported rather than checked, because nothing has been published to check
// them against yet. They become check() calls at the moment they appear on the
// page — that is the whole discipline: a figure is claimed, then guarded.
console.log(`  cohort size: ${cohort2024.length}`);
console.log(`  reached 1,000+ installs:  ${pct(cohort2024.filter((r) => r.i >= 1000).length, cohort2024.length)}%`);
console.log(`  reached 10,000+ installs: ${pct(won.length, cohort2024.length)}%`);

const clean = (s) => String(s || '').replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const byAuthor = new Map();
for (const r of dated) {
  const a = clean(r.a) || '(none)';
  if (!byAuthor.has(a)) byAuthor.set(a, []);
  byAuthor.get(a).push(r);
}
const priorBase = won.map((r) => {
  const prior = (byAuthor.get(clean(r.a) || '(none)') || []).filter((p) => p.s !== r.s && p.added < r.added);
  return prior.reduce((s, p) => s + (p.i || 0), 0);
});
priorBase.sort((a, b) => a - b);
const medianPrior = priorBase.length ? priorBase[Math.floor((priorBase.length - 1) / 2)] : 0;

console.log(`  breakthroughs (10k+): ${won.length}`);
console.log(`  median prior installed base of their authors: ${medianPrior.toLocaleString()}`);
console.log(`  with zero prior installs: ${priorBase.filter((n) => !n).length} of ${priorBase.length}`);

// --- maintenance over the whole directory ------------------------------------

const ages = dated.map((r) => monthsSince(r.up)).filter((m) => m !== null);
console.log('\n=== WORDPRESS MAINTENANCE (collected set) ===');
console.log(`  no release in 12 months: ${pct(ages.filter((m) => m >= 12).length, ages.length)}% (n=${ages.length})`);
console.log(`  no release in 24 months: ${pct(ages.filter((m) => m >= 24).length, ages.length)}%`);
console.log('  The census figure of 13.8% is the top 2,000 — the head — and both are true.');

// --- shopify -----------------------------------------------------------------

const live = shop.filter((r) => !r.delisted && !r.error);
const sDated = live.filter((r) => r.launched);
const cutoff = (() => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 24);
  return d.toISOString().slice(0, 10);
})();
const sRecent = sDated.filter((r) => r.launched >= cutoff);
const sOlder = sDated.filter((r) => r.launched < cutoff);

console.log('\n=== SHOPIFY COHORT ===');
console.log(`  sampled: ${shop.length}   usable: ${live.length}   with a launch date: ${sDated.length}`);
console.log(`  recent cohort (launched since ${cutoff}): ${sRecent.length}`);
console.log(`  of those, 25+ reviews: ${pct(sRecent.filter((r) => (r.reviews || 0) >= 25).length, sRecent.length)}%`);
console.log(`  older cohort, 25+ reviews: ${pct(sOlder.filter((r) => (r.reviews || 0) >= 25).length, sOlder.length)}%`);
console.log(`  recent cohort with zero reviews: ${pct(sRecent.filter((r) => !r.reviews).length, sRecent.length)}%`);

const bfs = pct(live.filter((r) => r.builtForShopify).length, live.length);
console.log('\n=== THE WITHDRAWN FIGURE ===');
console.log(`  census said: 15.1% carry "Built for Shopify" (n=465, popular head)`);
console.log(`  whole-store sample says: ${bfs}% (n=${live.length})`);
console.log('  The old collector was never saved, so the old number cannot be reproduced.');
console.log('  It is withdrawn rather than corrected — see state/CONSTRAINTS.md.');

console.log(`\n${fails === 0 ? 'NO CONTRADICTIONS FOUND' : fails + ' FIGURE(S) FAILED'}\n`);
process.exit(fails ? 1 : 0);
