/**
 * Recompute every figure that appears in the published census, from the stored
 * data, and compare against what was written down.
 *
 * This exists because two figures have already had to be corrected in public
 * this session — one contaminated by a parser bug, one simply computed on too
 * small a sample — and because publishing puts these numbers under a real
 * person's name. A claim nobody has re-derived is a claim nobody has checked.
 *
 * Prints PASS/FAIL per figure. Any FAIL must be fixed in the census before it
 * is published, not explained away.
 */

import { readFileSync } from 'node:fs';
import { monthsSince } from '../src/health.mjs';

const wp = JSON.parse(readFileSync(new URL('../data/wp-plugins.json', import.meta.url), 'utf8'));
const vsx = JSON.parse(readFileSync(new URL('../data/vsx-extensions.json', import.meta.url), 'utf8'));
const shop = Object.values(JSON.parse(readFileSync(new URL('../data/app-details.json', import.meta.url), 'utf8')));
const chrome = Object.values(JSON.parse(readFileSync(new URL('../data/chrome-extensions.json', import.meta.url), 'utf8')));

let fails = 0;
const pct = (n, d) => Math.round((n / d) * 1000) / 10;

function check(label, actual, claimed, tolerance = 0.15) {
  const ok =
    typeof claimed === 'number' && typeof actual === 'number'
      ? Math.abs(actual - claimed) <= tolerance
      : String(actual) === String(claimed);
  if (!ok) fails++;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} claimed ${String(claimed).padStart(8)}   actual ${String(actual).padStart(8)}`,
  );
}

console.log('\n=== WORDPRESS (n=' + wp.length + ') ===');
// Note: wp-plugins.json carries `stale` (months since update) computed at collection time.
const wpStale12 = wp.filter((r) => r.stale !== null && r.stale >= 12).length;
check('% of top-2000 with no release in 12 months', pct(wpStale12, wp.length), 14, 0.5);

console.log('\n=== VS CODE (n=' + vsx.length + ') ===');
const recent = vsx.filter((r) => r.released >= '2023-01');
const pre = vsx.filter((r) => r.released && r.released < '2023-01');
const unvRecent = recent.filter((r) => !r.verified).length;
const unvPre = pre.filter((r) => !r.verified).length;
check('entrants released 2023+', recent.length, 112, 0);
check('  of those, unverified (%)', pct(unvRecent, recent.length), 37, 0.6);
check('  of those, verified (%)', pct(recent.length - unvRecent, recent.length), 63, 0.6);
check('pre-2023 cohort unverified (%)', pct(unvPre, pre.length), 73, 0.6);

console.log('\n=== SHOPIFY (n=' + shop.length + ') ===');
const live = shop.filter((a) => !a.delisted && typeof a.reviews === 'number');
const under25 = live.filter((a) => a.reviews < 25).length;
const rated = live.filter((a) => a.rating && a.reviews >= 5);
const excellent = rated.filter((a) => a.rating >= 4.8);
const excellentInvisible = excellent.filter((a) => a.reviews < 25);
const freeish = live.filter((a) => a.hasFreePlan || a.freeToInstall).length;
const bfs = live.filter((a) => a.builtForShopify).length;
const tiers = live.flatMap((a) => a.priceTiers || []).filter((n) => n > 0).sort((a, b) => a - b);

check('% under 25 reviews', pct(under25, live.length), 45.6, 0.11);
check('% of rated apps at 4.8+', pct(excellent.length, rated.length), 45.8, 0.11);
check('% of 4.8+ apps still under 25 reviews', pct(excellentInvisible.length, excellent.length), 34.7, 0.11);
check('% offering a free plan or free install', pct(freeish, live.length), 96.1, 0.11);
check('% carrying "Built for Shopify"', pct(bfs, live.length), 15.1, 0.11);
check('median monthly tier ($)', tiers[Math.floor((tiers.length - 1) * 0.5)], 20, 0);

const byDev = new Map();
for (const a of live) if (a.developer) byDev.set(a.developer, (byDev.get(a.developer) || 0) + 1);
check('developers shipping >1 app', [...byDev.values()].filter((n) => n > 1).length, 53, 0);

console.log('\n=== CHROME (n=' + chrome.length + ') ===');
// Reclassify the generic store shell, exactly as chrome-study.mjs does. A
// removed extension keeps a /detail/ URL and is served a shell with no fields;
// counting those as live inflates the "no date" bucket and hides the delisting.
const cShell = (r) => !r.delisted && !r.error && !r.lastUpdated && !r.installs;
const cAll = chrome.map((r) => (cShell(r) ? { ...r, delisted: true } : r));
const cLive = cAll.filter((r) => !r.delisted && !r.error && r.lastUpdated);
const cMonths = cLive.map((r) => monthsSince(r.lastUpdated)).filter((m) => m !== null);
check('usable listings', cLive.length, 478, 0);
check('delisted / shell while sampling', cAll.filter((r) => r.delisted).length, 22, 0);
check('no update in 12 months (%)', pct(cMonths.filter((m) => m >= 12).length, cMonths.length), 44.1, 0.11);
check('no update in 24 months (%)', pct(cMonths.filter((m) => m >= 24).length, cMonths.length), 27.2, 0.11);
check('last touched 6+ years ago (%)', pct(cMonths.filter((m) => m >= 72).length, cMonths.length), 11.5, 0.11);

// --- the README/CONSTRAINTS inconsistency -----------------------------------
console.log('\n=== RESOLVING THE 10% vs 14% DISCREPANCY ===');
console.log(`  Both are real, on different samples of the same directory:`);
console.log(`    top-2000 (this stored dataset): ${pct(wpStale12, wp.length)}%`);
console.log(`    top-1200 (marketscan --abandoned run): 10%`);
console.log('  These are not contradictory, but publishing both without the n is.');
console.log(`  DECISION: quote the stored, reproducible figure — ${pct(wpStale12, wp.length)}% of the top ${wp.length}.`);

console.log(`\n${fails === 0 ? 'ALL FIGURES VERIFIED' : fails + ' FIGURE(S) FAILED — fix before publishing'}\n`);
process.exit(fails ? 1 : 0);
