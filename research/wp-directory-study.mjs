/**
 * The WordPress plugin directory, whole, by cohort.
 *
 * Every figure here is a population figure, not a sample figure, so it carries
 * no sampling error — but it does carry the directory's own quirks, and those
 * are stated where they bite rather than in a footnote:
 *
 *   - `active_installs` is bucketed by wordpress.org (10, 100, 1000, 10000...).
 *     It is a floor. Every threshold below is therefore "reached at least this
 *     bucket", which is the honest reading, and no figure here sums it.
 *   - `rating` is 0-100 in this API, not 0-5.
 *   - Coverage is printed. Deep paging over a ranked endpoint can shift under
 *     you, and a gap treated as the population would corrupt every rate.
 *
 * The question this exists to answer: can a plugin published today reach
 * anyone? Which is a question about the 97% of the directory that the
 * published "top 2,000" figure says nothing about.
 *
 * Usage:  node wp-directory-study.mjs
 */

import { readFileSync } from 'node:fs';

const rows = Object.values(JSON.parse(readFileSync(new URL('../data/wp-directory.json', import.meta.url), 'utf8')));

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const months = (iso) => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return Math.max(0, Math.round((Date.now() - Date.UTC(y, m - 1, d)) / 2629800000));
};
const year = (iso) => (iso ? Number(iso.slice(0, 4)) : null);

const NOW_Y = new Date().getUTCFullYear();

console.log(`\nWORDPRESS PLUGIN DIRECTORY — WHOLE-DIRECTORY STUDY`);
console.log(`records: ${rows.length}`);
const dated = rows.filter((r) => r.added && r.up);
console.log(`with both an added and an updated date: ${dated.length} (${pct(dated.length, rows.length)}%)\n`);

// --- maintenance across the whole directory ---------------------------------

const ages = dated.map((r) => months(r.up));
const band = (lo, hi) => ages.filter((m) => m >= lo && (hi == null || m < hi)).length;

console.log('MAINTENANCE — TIME SINCE LAST RELEASE, WHOLE DIRECTORY');
for (const [label, lo, hi] of [
  ['under 6 months', 0, 6],
  ['6-12 months', 6, 12],
  ['12-24 months', 12, 24],
  ['2-5 years', 24, 60],
  ['5-10 years', 60, 120],
  ['over 10 years', 120, null],
]) {
  const n = band(lo, hi);
  console.log(`  ${label.padEnd(16)} ${String(n).padStart(6)}  ${String(pct(n, ages.length)).padStart(5)}%`);
}
const stale12 = ages.filter((m) => m >= 12).length;
console.log(`\n  no release in 12 months: ${pct(stale12, ages.length)}% (${stale12} of ${ages.length})`);
console.log(`  the published figure is 13.8% of the top 2,000 — the head, deliberately.`);
console.log(`  these answer different questions and both are true.`);

// --- the cohort question -----------------------------------------------------

console.log('\nCOHORTS — OF THE PLUGINS ADDED IN EACH YEAR, WHAT BECAME OF THEM');
console.log('  "alive" = released something in the last 12 months');
console.log('  install figures are wordpress.org buckets, so they are floors\n');
console.log(
  '  ' + 'added'.padEnd(7) + 'count'.padStart(7) + 'alive'.padStart(8) + 'alive%'.padStart(8) +
    '1k+'.padStart(7) + '1k+%'.padStart(7) + '10k+'.padStart(7) + '10k+%'.padStart(7) + '50k+'.padStart(6),
);

const byYear = new Map();
for (const r of dated) {
  const y = year(r.added);
  if (!byYear.has(y)) byYear.set(y, []);
  byYear.get(y).push(r);
}

for (const y of [...byYear.keys()].sort((a, b) => a - b)) {
  const v = byYear.get(y);
  const alive = v.filter((r) => months(r.up) < 12).length;
  const k1 = v.filter((r) => r.i >= 1000).length;
  const k10 = v.filter((r) => r.i >= 10000).length;
  const k50 = v.filter((r) => r.i >= 50000).length;
  console.log(
    '  ' + String(y).padEnd(7) + String(v.length).padStart(7) + String(alive).padStart(8) +
      String(pct(alive, v.length)).padStart(8) + String(k1).padStart(7) + String(pct(k1, v.length)).padStart(7) +
      String(k10).padStart(7) + String(pct(k10, v.length)).padStart(7) + String(k50).padStart(6),
  );
}

// --- how long does it take, for the ones that make it ------------------------

console.log('\nHOW LONG DOES IT TAKE TO REACH 10,000 INSTALLS?');
console.log('  Cannot be answered directly — the directory publishes no install history.');
console.log('  What can be said: of plugins that HAVE reached 10k+, how old are they?\n');
const big = dated.filter((r) => r.i >= 10000);
const ageOfBig = big.map((r) => Math.floor(months(r.added) / 12));
const bigBands = [[0, 1], [1, 2], [2, 3], [3, 5], [5, 10], [10, 99]];
for (const [lo, hi] of bigBands) {
  const n = ageOfBig.filter((a) => a >= lo && a < hi).length;
  console.log(`  ${String(lo).padStart(2)}-${String(hi).padEnd(3)} years old  ${String(n).padStart(5)}  ${String(pct(n, big.length)).padStart(5)}% of all 10k+ plugins`);
}
console.log(`  total plugins at 10k+ installs: ${big.length} (${pct(big.length, dated.length)}% of the directory)`);

// --- entry rate over time ----------------------------------------------------

console.log('\nENTRY — NEW PLUGINS ADDED PER YEAR (as still listed today)');
console.log('  Note: this counts SURVIVORS. Plugins added in 2015 and later removed');
console.log('  are not here, so early years are undercounted and the real decline');
console.log('  is steeper than it looks, not shallower.\n');
for (const y of [...byYear.keys()].sort((a, b) => a - b)) {
  const v = byYear.get(y);
  const bar = '#'.repeat(Math.round(v.length / 120));
  console.log(`  ${y}  ${String(v.length).padStart(6)}  ${bar}`);
}

// --- the verdict -------------------------------------------------------------

const recent = dated.filter((r) => year(r.added) >= NOW_Y - 2);
const recentBig = recent.filter((r) => r.i >= 1000).length;
console.log('\nVERDICT INPUT — THE LAST THREE COHORTS');
console.log(`  plugins added since ${NOW_Y - 2}: ${recent.length}`);
console.log(`  of those, reaching 1,000+ installs: ${pct(recentBig, recent.length)}% (${recentBig} of ${recent.length})`);
console.log(`  of those, reaching 10,000+ installs: ${pct(recent.filter((r) => r.i >= 10000).length, recent.length)}% (${recent.filter((r) => r.i >= 10000).length} of ${recent.length})`);
console.log(`  still alive: ${pct(recent.filter((r) => months(r.up) < 12).length, recent.length)}%`);
console.log('');
