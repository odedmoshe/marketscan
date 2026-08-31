/**
 * Build the index that answers "what else does this job, and is it alive?"
 *
 * The directory publishes tags on every plugin and a search that ranks by
 * relevance-ish popularity. What it does not do — and what nobody does — is
 * tell you, for a plugin you are already looking at, which *maintained*
 * plugins do the same job. wordpress.org will happily show you a dead one.
 *
 * Answering it needs the whole population: alternatives to an obscure plugin
 * live in the tail, and a popular-head sample simply does not contain them.
 *
 * The index maps each tag to the best actively-maintained plugins carrying it.
 * "Best" is deliberately dull and stated on the page: shipped within a year,
 * enough installs to be a real option, and rated well by enough people to mean
 * something. No editorial judgement, because there is no way to make an
 * editorial judgement over 71,000 plugins that is honest.
 *
 * Usage:  node build-alternatives-index.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';

const OUT = new URL('../data/alternatives-index.json', import.meta.url);
const rows = Object.values(JSON.parse(readFileSync(new URL('../data/wp-directory.json', import.meta.url), 'utf8')));

const months = (iso) => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return Math.max(0, Math.round((Date.now() - Date.UTC(y, m - 1, d)) / 2629800000));
};
const clean = (s) =>
  String(s || '').replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&').trim();

const withTags = rows.filter((r) => Array.isArray(r.tags) && r.tags.length);

// What matters is not overall tag coverage but coverage among the plugins that
// could be *recommended*. The long tail of zero-install plugins is never a
// candidate, so its tags are irrelevant here and demanding them would gate the
// build on data it does not use.
const recommendable = rows.filter((r) => r.i >= 1000);
const recommendableTagged = recommendable.filter((r) => Array.isArray(r.tags) && r.tags.length);
const coverage = recommendable.length ? recommendableTagged.length / recommendable.length : 0;

console.log(`records: ${rows.length}   with tags: ${withTags.length}`);
console.log(`plugins at 1,000+ installs: ${recommendable.length}   of those tagged: ${recommendableTagged.length} (${Math.round(coverage * 1000) / 10}%)`);
if (coverage < 0.9) {
  console.error(`only ${Math.round(coverage * 100)}% of recommendable plugins carry tags — let wp-census.mjs finish before building this`);
  process.exit(1);
}

/**
 * A plugin worth suggesting to someone. The bars are low on purpose: the point
 * is to exclude the dead and the untested, not to crown winners.
 */
const CANDIDATE = (r) =>
  r.up &&
  months(r.up) < 12 &&        // shipped within the year
  r.i >= 1000 &&              // enough installs to be a real option
  (r.nr >= 10 ? r.r >= 70 : true); // if enough people rated it, 3.5 stars or better

const candidates = withTags.filter(CANDIDATE);
console.log(`candidates (alive, 1k+ installs, not badly rated): ${candidates.length}`);

// Tags carried by almost everything ("wordpress", "plugin") separate nothing.
// A tag is only useful here if it picks out a subset small enough to be a
// recommendation rather than a phone book.
const tagCount = new Map();
for (const r of withTags) for (const t of r.tags) tagCount.set(t, (tagCount.get(t) || 0) + 1);

const TOO_BROAD = 4000;
const index = {};
let skippedBroad = 0;

for (const [tag, total] of tagCount) {
  if (total > TOO_BROAD) {
    skippedBroad++;
    continue;
  }
  const inTag = candidates
    .filter((r) => r.tags.includes(tag))
    // Rank by installs. Rating decides ties, and only where enough people rated
    // it — a lone 5-star review is not evidence about anything.
    .sort((a, b) => b.i - a.i || (b.nr >= 10 ? b.r : 0) - (a.nr >= 10 ? a.r : 0))
    .slice(0, 8)
    .map((r) => ({
      s: r.s,
      n: clean(r.n).slice(0, 80),
      a: clean(r.a).slice(0, 50),
      i: r.i,
      r: r.nr >= 10 ? Math.round((r.r / 20) * 10) / 10 : null,
      nr: r.nr,
      mo: months(r.up),
    }));
  if (inTag.length >= 2) index[tag] = inTag;
}

const meta = {
  builtAt: new Date().toISOString().slice(0, 10),
  directorySize: rows.length,
  tagsIndexed: Object.keys(index).length,
  tagsSkippedAsTooBroad: skippedBroad,
  candidatePool: candidates.length,
  rule: 'shipped within 12 months, 1,000+ installs, and 3.5 stars or better where 10+ people rated it',
};

writeFileSync(OUT, JSON.stringify({ meta, index }));
const bytes = readFileSync(OUT).length;
console.log(`tags indexed: ${meta.tagsIndexed}   skipped as too broad: ${skippedBroad}`);
console.log(`wrote data/alternatives-index.json (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
