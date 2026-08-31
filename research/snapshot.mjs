/**
 * Take a dated snapshot of the directory, stored as a delta.
 *
 * WHY THIS IS THE MOST URGENT THING IN THE PROJECT.
 *
 * Everything measured so far is a photograph: how many plugins there are today,
 * how many are maintained today, what each one's install bucket is today. That
 * is worth something, and anyone with a week and the API can reproduce it.
 *
 * What nobody can reproduce is the *series*. Install counts move, plugins stall,
 * ratings drift, and wordpress.org publishes no history at all — only the
 * current value. A daily record turns 71,000 photographs into 71,000 growth
 * curves, and that is the one asset here with a moat: it can only be built by
 * having started, and **it cannot be backfilled**. Every day without a snapshot
 * is a day of history that is gone permanently.
 *
 * HOW IT IS STORED.
 *
 * A full daily dump of the 16,743 plugins above 100 installs is ~750 KB, which
 * is 270 MB a year of almost entirely unchanged rows. So: one baseline, then a
 * delta per day carrying only what actually moved. Install figures are buckets
 * and move rarely, so the deltas are small.
 *
 * The delta records the *new* value of any field that changed, plus first-seen
 * and last-seen markers. Reconstructing any date means replaying the baseline
 * and every delta up to it, which `read-series.mjs` does.
 *
 * Only plugins at 100+ installs are tracked. Below that the install bucket is
 * too coarse to show movement, and the row would be noise costing bytes.
 *
 * Usage:  node snapshot.mjs          take today's snapshot
 *         node snapshot.mjs --dry    report what would change
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';

const DRY = process.argv.includes('--dry');
const DIR = new URL('../data/series/', import.meta.url);
const SRC = new URL('../data/wp-directory.json', import.meta.url);
const MIN_INSTALLS = 100;
const today = new Date().toISOString().slice(0, 10);

/** Fields worth a place in the series. Anything that cannot move is excluded. */
const TRACKED = ['i', 'up', 'r', 'nr', 'dl', 'th', 'thr', 't'];

const rows = Object.values(JSON.parse(readFileSync(SRC, 'utf8')));
const tracked = rows.filter((r) => (r.i || 0) >= MIN_INSTALLS);
const current = new Map(tracked.map((r) => [r.s, Object.fromEntries(TRACKED.map((k) => [k, r[k] ?? null]))]));

mkdirSync(DIR, { recursive: true });
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => /\.json$/.test(f)).sort() : [];

/** Replay the baseline and every delta to reconstruct the latest known state. */
function replay() {
  const state = new Map();
  for (const f of files) {
    const d = JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));
    for (const [slug, patch] of Object.entries(d.changed || {})) {
      state.set(slug, { ...(state.get(slug) || {}), ...patch });
    }
    for (const slug of d.gone || []) state.delete(slug);
  }
  return state;
}

const previous = replay();
const isBaseline = files.length === 0;

const changed = {};
const added = [];
for (const [slug, now] of current) {
  const before = previous.get(slug);
  if (!before) {
    changed[slug] = now;
    added.push(slug);
    continue;
  }
  const patch = {};
  for (const k of TRACKED) if (before[k] !== now[k]) patch[k] = now[k];
  if (Object.keys(patch).length) changed[slug] = patch;
}

// A plugin that leaves the tracked set is recorded rather than forgotten: it
// either fell below the threshold or was removed from the directory, and both
// are events worth being able to see later.
const gone = [...previous.keys()].filter((s) => !current.has(s));

const out = {
  date: today,
  baseline: isBaseline,
  trackedTotal: current.size,
  minInstalls: MIN_INSTALLS,
  changed,
  gone,
  counts: { changed: Object.keys(changed).length, added: added.length, gone: gone.length },
};

const file = new URL(`${today}.json`, DIR);
const json = JSON.stringify(out);

console.log(`${isBaseline ? 'BASELINE' : 'delta'} for ${today}`);
console.log(`  tracked (>=${MIN_INSTALLS} installs): ${current.size.toLocaleString()}`);
console.log(`  changed: ${out.counts.changed.toLocaleString()}   new to the set: ${added.length}   left the set: ${gone.length}`);
console.log(`  size: ${(json.length / 1024).toFixed(0)} KB`);

if (DRY) {
  console.log('  dry run — nothing written');
} else if (existsSync(file)) {
  console.log(`  ${today}.json already exists — not overwriting. A day gets one snapshot.`);
} else {
  writeFileSync(file, json);
  console.log(`  wrote data/series/${today}.json`);
}
