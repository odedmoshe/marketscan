/**
 * Everything that broke through recently — the whole list, not a sample.
 *
 * The cohort study answers "is it still enterable" and the answer is going to
 * be discouraging. That on its own is not useful to anyone: a builder reading
 * "the directory is closed" cannot act on it, and a page that says so is a page
 * nobody links to.
 *
 * The useful question is the one only population data can answer: *of the
 * plugins added recently, exactly which ones reached a real install base, and
 * what do they have in common?* With the whole directory in hand that list is
 * short enough to read end to end rather than sample. Whatever it contains is
 * the actual answer to "what works now", and it is an observed answer rather
 * than an opinion about growth.
 *
 * Usage:  node wp-breakthroughs.mjs [minInstalls] [sinceYear]
 */

import { readFileSync } from 'node:fs';

const MIN = Number(process.argv[2] || 10000);
const SINCE = Number(process.argv[3] || 2024);

const rows = Object.values(JSON.parse(readFileSync(new URL('../data/wp-directory.json', import.meta.url), 'utf8')));

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const clean = (s) =>
  String(s || '')
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, '&')
    .replace(/&#8211;/g, '–');

const dated = rows.filter((r) => r.added && r.up);
const cohort = dated.filter((r) => Number(r.added.slice(0, 4)) >= SINCE);
const won = cohort.filter((r) => r.i >= MIN).sort((a, b) => b.i - a.i);

console.log(`\nWORDPRESS — WHAT BROKE THROUGH SINCE ${SINCE}`);
console.log(`directory: ${dated.length} plugins with dates`);
console.log(`added ${SINCE} or later: ${cohort.length}`);
console.log(`of those, at ${MIN.toLocaleString()}+ installs: ${won.length} (${pct(won.length, cohort.length)}%)\n`);

if (!won.length) {
  console.log('  Nothing. That is the finding.');
} else {
  console.log(
    '  ' + 'installs'.padStart(10) + '  ' + 'added'.padEnd(11) + 'rating'.padStart(7) + 'revs'.padStart(6) + '  ' + 'plugin / author',
  );
  for (const r of won) {
    console.log(
      '  ' + r.i.toLocaleString().padStart(10) + '  ' + r.added.padEnd(11) +
        String(r.r ? Math.round((r.r / 20) * 10) / 10 : '-').padStart(7) + String(r.nr).padStart(6) + '  ' +
        clean(r.n).slice(0, 46).padEnd(48) + clean(r.a).slice(0, 28),
    );
  }
}

// --- who are these authors, and had they been here before? -------------------

console.log('\nARE THESE NEW AUTHORS, OR EXISTING ONES SHIPPING AGAIN?');
console.log('  The distinction is the whole question. An existing author reaching');
console.log('  10k installs is distribution being reused, not distribution being won.\n');

const byAuthor = new Map();
for (const r of dated) {
  const a = clean(r.a) || '(none)';
  if (!byAuthor.has(a)) byAuthor.set(a, []);
  byAuthor.get(a).push(r);
}

let firstTimer = 0;
let hadPrior = 0;
let hadPriorBig = 0;
const detail = [];
for (const r of won) {
  const a = clean(r.a) || '(none)';
  const all = byAuthor.get(a) || [];
  const prior = all.filter((p) => p.s !== r.s && p.added < r.added);
  const priorBig = prior.filter((p) => p.i >= MIN);
  // The author's existing installed base at the time this one launched. A sum
  // of buckets and therefore a floor — but a floor is enough to separate "had
  // an audience already" from "had none", which is the only distinction being
  // drawn. Labelling authors as hosts or conglomerates by hand would be a
  // judgement; this is a measurement.
  const priorInstalls = prior.reduce((s, p) => s + (p.i || 0), 0);
  if (!prior.length) firstTimer++;
  else {
    hadPrior++;
    if (priorBig.length) hadPriorBig++;
  }
  detail.push({ slug: r.s, author: a, prior: prior.length, priorBig: priorBig.length, priorInstalls, installs: r.i });
}

console.log(`  no earlier plugin in the directory:            ${firstTimer} (${pct(firstTimer, won.length)}%)`);
console.log(`  had shipped before:                            ${hadPrior} (${pct(hadPrior, won.length)}%)`);
console.log(`    of those, already had a ${MIN.toLocaleString()}+ plugin:  ${hadPriorBig} (${pct(hadPriorBig, won.length)}%)`);

const bases = detail.map((d) => d.priorInstalls).sort((a, b) => a - b);
const median = bases.length ? bases[Math.floor((bases.length - 1) / 2)] : 0;
console.log(`\n  the author's existing installed base when this plugin launched:`);
console.log(`    median across all breakthroughs:  ${median.toLocaleString()}`);
console.log(`    breakthroughs from an author with zero prior installs: ${detail.filter((d) => !d.priorInstalls).length} of ${detail.length}`);
console.log(`    breakthroughs from an author with 1,000,000+ prior:    ${detail.filter((d) => d.priorInstalls >= 1e6).length} of ${detail.length}`);

console.log('\n  breakdown (prior base is a sum of buckets, so a floor):');
for (const d of detail) {
  console.log(
    `    ${d.slug.slice(0, 36).padEnd(38)} ${String(d.installs).padStart(9)}  author had ${String(d.prior).padStart(3)} earlier` +
      ` (${d.priorBig} big, ${d.priorInstalls.toLocaleString()} installs)`,
  );
}

// --- the same question at a lower bar ----------------------------------------

const bars = [1000, 5000, 10000, 50000, 100000];
console.log('\nTHE SAME COHORT AT EVERY BAR');
console.log('  (install figures are wordpress.org buckets, so each is "reached at least")\n');
for (const bar of bars) {
  const n = cohort.filter((r) => r.i >= bar).length;
  console.log(`  ${String(bar.toLocaleString()).padStart(8)}+  ${String(n).padStart(5)}  ${String(pct(n, cohort.length)).padStart(5)}% of the ${SINCE}+ cohort`);
}
console.log('');
