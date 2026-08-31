/**
 * What the Chrome sample says.
 *
 * The framing constraint, repeated here because it is the easiest thing to get
 * wrong: this is a random sample of the WHOLE STORE (the sitemap is ordered by
 * extension id, not by popularity), whereas the WordPress figure in RESEARCH.md
 * is the popular head. Long tails are always more abandoned than heads. These
 * two numbers must never appear in the same comparison.
 *
 * Usage: node chrome-study.mjs
 */

import { readFileSync } from 'node:fs';
import { monthsSince } from '../src/health.mjs';

const store = JSON.parse(readFileSync(new URL('../data/chrome-extensions.json', import.meta.url), 'utf8'));

/**
 * Reclassify the generic store shell as delisted.
 *
 * A removed extension keeps a /detail/ URL under the slug "empty-title" and is
 * served a shell whose title is bare "Chrome Web Store" with no fields. The
 * first version of the collector recorded those as live-with-no-date. The
 * collector is fixed, but this stays so the study is correct against data
 * gathered by either version — a silently mislabelled record is exactly the
 * failure this project has already paid for once.
 */
const shell = (r) => !r.delisted && !r.error && !r.lastUpdated && !r.installs && (r.name === 'Chrome Web Store' || !r.name);
const all = Object.values(store).map((r) => (shell(r) ? { ...r, delisted: true, reclassified: true } : r));

const errored = all.filter((r) => r.error);
const delisted = all.filter((r) => r.delisted);
const reclassified = all.filter((r) => r.reclassified).length;
if (reclassified) console.log(`\n  note: ${reclassified} record(s) reclassified as delisted (generic store shell)`);
const live = all.filter((r) => !r.delisted && !r.error && r.lastUpdated);
const noDate = all.filter((r) => !r.delisted && !r.error && !r.lastUpdated);

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const bar = (n, d, w = 44) => '#'.repeat(Math.round((n / Math.max(d, 1)) * w));

console.log('='.repeat(68));
console.log('  CHROME WEB STORE — whole-store maintenance sample');
console.log(`  ${all.length} sampled at random from the sitemap (~355k listed)`);
console.log('='.repeat(68));
console.log(`\n  usable: ${live.length}   delisted while sampling: ${delisted.length}` +
  `   no date in markup: ${noDate.length}   fetch errors: ${errored.length}`);

console.log('\n1. TIME SINCE LAST UPDATE\n');
const bands = [
  ['< 6 mo', (m) => m < 6],
  ['6-12 mo', (m) => m >= 6 && m < 12],
  ['1-2 yr', (m) => m >= 12 && m < 24],
  ['2-4 yr', (m) => m >= 24 && m < 48],
  ['4-6 yr', (m) => m >= 48 && m < 72],
  ['6 yr +', (m) => m >= 72],
];
const months = live.map((r) => monthsSince(r.lastUpdated)).filter((m) => m !== null);
for (const [label, f] of bands) {
  const n = months.filter(f).length;
  console.log(`  ${label.padEnd(9)} ${String(n).padStart(4)}  ${String(pct(n, months.length)).padStart(5)}%  ${bar(n, months.length)}`);
}

const stale12 = months.filter((m) => m >= 12).length;
const aband24 = months.filter((m) => m >= 24).length;
console.log(`\n  no update in 12 months: ${pct(stale12, months.length)}%`);
console.log(`  no update in 24 months: ${pct(aband24, months.length)}%`);
console.log('\n  NOTE: whole-store sample, long tail included. NOT comparable to');
console.log('  the WordPress "top 2,000" figure, which measures the popular head.');

console.log('\n2. DOES ANYONE USE THE ABANDONED ONES?\n');
const withUsers = live.filter((r) => (r.installs || 0) > 0);
const tiers = [
  ['1k+ users', 1000],
  ['10k+ users', 10000],
  ['100k+ users', 100000],
];
for (const [label, min] of tiers) {
  const pool = withUsers.filter((r) => r.installs >= min);
  const old = pool.filter((r) => (monthsSince(r.lastUpdated) ?? 0) >= 24);
  console.log(`  ${label.padEnd(12)} n=${String(pool.length).padStart(4)}   abandoned (24mo+): ${String(old.length).padStart(4)}  ${pct(old.length, pool.length)}%`);
}
console.log('\n  If the abandoned share falls as user count rises, popularity and');
console.log('  maintenance travel together and the long tail carries the neglect.');

console.log('\n3. THE ONES THAT MATTER — 10k+ users, untouched 2+ years\n');
const exposed = withUsers
  .filter((r) => r.installs >= 10000 && (monthsSince(r.lastUpdated) ?? 0) >= 24)
  .sort((a, b) => b.installs - a.installs);
const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
if (!exposed.length) console.log('  none in this sample');
for (const r of exposed.slice(0, 20)) {
  console.log(`  ${fmt(r.installs).padStart(7)} users  ${String(monthsSince(r.lastUpdated)).padStart(3)}mo  ${(r.name || r.id).slice(0, 46)}`);
}

console.log('\n' + '='.repeat(68));
