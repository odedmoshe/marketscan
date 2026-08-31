/**
 * Insert the Shopify cohort section into the published census, and remove the
 * withdrawn "Built for Shopify" clause from the paragraph that carries it.
 *
 * Same rule as the WordPress publisher: nothing numeric is typed into the HTML.
 * The template carries {{TOKENS}} and this computes them, so the page and the
 * dataset cannot drift apart without the script noticing.
 *
 * The withdrawal is a deletion from published text, so it is done by exact
 * match and fails loudly rather than silently leaving the wrong number up.
 *
 * Idempotent. Usage:  node publish-shopify-section.mjs [--dry]
 */

import { readFileSync, writeFileSync } from 'node:fs';

const DRY = process.argv.includes('--dry');
const PAGE = new URL('../docs/index.html', import.meta.url);
const TEMPLATE = new URL('./templates/shopify-cohort-section.html', import.meta.url);

const rows = Object.values(JSON.parse(readFileSync(new URL('../data/shopify-cohort.json', import.meta.url), 'utf8')));
const live = rows.filter((r) => !r.delisted && !r.error);
const dated = live.filter((r) => r.launched);

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor((a.length - 1) / 2)] : 0);

const cutoffDate = (() => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 24);
  return d.toISOString().slice(0, 10);
})();
const MONTHS = 'January February March April May June July August September October November December'.split(' ');
const cutoffLabel = `${MONTHS[Number(cutoffDate.slice(5, 7)) - 1]} ${cutoffDate.slice(0, 4)}`;

const recent = dated.filter((r) => r.launched >= cutoffDate);
const older = dated.filter((r) => r.launched < cutoffDate);
const vis = (set) => pct(set.filter((r) => (r.reviews || 0) >= 25).length, set.length);

const recentVis = vis(recent);
const olderVis = vis(older);

if (recent.length < 200 || older.length < 200) {
  console.error(`refusing to publish: cohorts are ${recent.length} and ${older.length}; nothing under ~200 goes on the page`);
  process.exit(1);
}

const tokens = {
  SHOP_N: rows.length.toLocaleString(),
  SHOP_USABLE: live.length.toLocaleString(),
  SHOP_CUTOFF_LABEL: cutoffLabel,
  SHOP_RECENT_VIS: recentVis,
  SHOP_OLDER_VIS: olderVis,
  SHOP_ZERO: pct(recent.filter((r) => !r.reviews).length, recent.length),
  SHOP_OLDER_MED: med(older.map((r) => r.reviews || 0)),
  SHOP_RATIO: Math.round((olderVis / recentVis) * 10) / 10,
  SHOP_BFS: pct(live.filter((r) => r.builtForShopify).length, live.length),
};

console.log('computed tokens:');
for (const [k, v] of Object.entries(tokens)) console.log(`  ${k.padEnd(20)} ${v}`);
console.log(`  (recent cohort n=${recent.length}, older n=${older.length})`);

let section = readFileSync(TEMPLATE, 'utf8');
for (const [k, v] of Object.entries(tokens)) section = section.replaceAll(`{{${k}}}`, String(v));
const left = section.match(/\{\{[A-Z_]+\}\}/g);
if (left) {
  console.error(`unsubstituted tokens: ${[...new Set(left)].join(', ')}`);
  process.exit(1);
}

let page = readFileSync(PAGE, 'utf8');

// --- the withdrawal ----------------------------------------------------------
const WITHDRAWN = ', and only 15.1% carry the &ldquo;Built for Shopify&rdquo; badge';
if (page.includes(WITHDRAWN)) {
  page = page.replace(WITHDRAWN, '');
  console.log('\nremoved the withdrawn Built for Shopify clause');
} else if (page.includes('15.1%')) {
  console.error('\n15.1% is still on the page but not in the expected wording — remove it by hand, do not guess');
  process.exit(1);
} else {
  console.log('\nwithdrawn clause already removed');
}

// --- the section -------------------------------------------------------------
const A = '<!-- shopify-cohort:start -->';
const B = '<!-- shopify-cohort:end -->';
const wrapped = `${A}\n${section.trim()}\n${B}\n\n`;

if (page.includes(A)) {
  page = page.replace(new RegExp(`${A}[\\s\\S]*?${B}\\n*`), wrapped);
  console.log('replaced the existing section');
} else {
  const anchor = '<h2>Chrome: how much of a store is still alive</h2>';
  if (!page.includes(anchor)) {
    console.error(`cannot find the insertion anchor: ${anchor}`);
    process.exit(1);
  }
  page = page.replace(anchor, wrapped + anchor);
  console.log('inserted before the Chrome section');
}

if (DRY) console.log('dry run — nothing written');
else {
  writeFileSync(PAGE, page);
  console.log(`wrote docs/index.html (${page.length} bytes)`);
}
