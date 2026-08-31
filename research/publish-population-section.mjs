/**
 * Insert the population-scale WordPress section into the published census, with
 * every number computed from the dataset at the moment of writing.
 *
 * Done as a script rather than by hand because the figures on that page go out
 * under a real person's name, and hand-transcription is precisely how the two
 * figures already corrected in that page's own caveats section got there. The
 * template carries {{TOKENS}}; nothing numeric is typed into the HTML.
 *
 * Idempotent: re-running replaces the section rather than adding a second one.
 *
 * Usage:  node publish-population-section.mjs [--dry]
 */

import { readFileSync, writeFileSync } from 'node:fs';

const DRY = process.argv.includes('--dry');
const PAGE = new URL('../docs/index.html', import.meta.url);
const TEMPLATE = new URL('./templates/wp-population-section.html', import.meta.url);
const DIRECTORY_TOTAL = 71091;

const rows = Object.values(JSON.parse(readFileSync(new URL('../data/wp-directory.json', import.meta.url), 'utf8')));
const dated = rows.filter((r) => r.added && r.up);

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const monthsSince = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.max(0, Math.round((Date.now() - Date.UTC(y, m - 1, d)) / 2629800000));
};

const cohort = dated.filter((r) => r.added >= '2024-01-01');
const won = cohort.filter((r) => r.i >= 10000);
const stale12 = dated.filter((r) => monthsSince(r.up) >= 12).length;

const tokens = {
  N_COLLECTED: rows.length.toLocaleString(),
  COVERAGE: pct(rows.length, DIRECTORY_TOTAL),
  STALE12: pct(stale12, dated.length),
  COHORT_N: cohort.length.toLocaleString(),
  COHORT_10K: pct(won.length, cohort.length),
};

// The breakthrough counts are hard-coded in the template's table, so they are
// asserted here rather than trusted. If the data moves, this stops rather than
// publishing a table that disagrees with the dataset beside it.
const clean = (s) => String(s || '').replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const byAuthor = new Map();
for (const r of dated) {
  const a = clean(r.a) || '(none)';
  if (!byAuthor.has(a)) byAuthor.set(a, []);
  byAuthor.get(a).push(r);
}
const priors = won.map((r) => {
  const p = (byAuthor.get(clean(r.a) || '(none)') || []).filter((x) => x.s !== r.s && x.added < r.added);
  return { count: p.length, big: p.filter((x) => x.i >= 10000).length, installs: p.reduce((s, x) => s + (x.i || 0), 0) };
});
const sorted = priors.map((p) => p.installs).sort((a, b) => a - b);

const any = priors.filter((p) => p.count).length;
const big = priors.filter((p) => p.big).length;
const m1 = priors.filter((p) => p.installs >= 1e6).length;
const none = priors.filter((p) => !p.count).length;
const medianPrior = sorted[Math.floor((sorted.length - 1) / 2)];

// Bars are drawn relative to the largest row rather than to 100, so the widest
// bar fills its cell and the rest are honestly proportional to it.
const bar = (n) => Math.round((n / Math.max(any, big, m1, none)) * 100);

Object.assign(tokens, {
  BT_TOTAL: won.length,
  BT_ANY: any,
  BT_BIG: big,
  BT_1M: m1,
  BT_NONE: none,
  BT_ANY_PCT: pct(any, won.length),
  BT_BIG_PCT: pct(big, won.length),
  BT_1M_PCT: pct(m1, won.length),
  BT_NONE_PCT: pct(none, won.length),
  BAR_ANY: bar(any),
  BAR_BIG: bar(big),
  BAR_1M: bar(m1),
  BAR_NONE: bar(none),
  // Rounded to the nearest ten thousand and written the way the prose reads it.
  MEDIAN_PRIOR: `${Math.round(medianPrior / 1000)}k`,
});

// Two claims in the prose are counts I verified by reading the list, not
// computed ones. If the underlying list changes size, they need re-reading, so
// the script refuses rather than letting stale prose ride on fresh numbers.
if (none !== 19 && none !== 20) {
  console.error(`\nthe "nothing in the directory" row is now ${none}; the prose names five businesses and three add-ons out of it. Re-read the list before publishing.`);
  process.exit(1);
}

// --- the supply surge --------------------------------------------------------
//
// Rows are generated rather than typed. Eight rows of four numbers is exactly
// the volume at which hand-transcription starts introducing errors nobody
// notices, and this table is the load-bearing evidence for the strongest claim
// on the page.

const YEARS = ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'];
const cohortRows = [];
const zeroBy = {};
for (const y of YEARS) {
  const v = dated.filter((r) => r.added.startsWith(y));
  if (!v.length) continue;
  const zero = pct(v.filter((r) => !r.i).length, v.length);
  zeroBy[y] = zero;
  const k1 = v.filter((r) => r.i >= 1000).length;
  const label = y === '2026' ? `${y} <span style="color:var(--ink-3)">(8 months)</span>` : y;
  const hot = zero >= 60 ? ' class="n" style="color:var(--decay)"' : ' class="n"';
  cohortRows.push(
    `    <tr><td>${label}</td><td class="n">${v.length.toLocaleString()}</td>` +
      `<td class="n">${k1.toLocaleString()}</td><td${hot}>${zero}%</td></tr>`,
  );
}

const monthly = {};
for (const r of dated.filter((x) => x.added >= '2025-01')) {
  const k = r.added.slice(0, 7);
  monthly[k] = (monthly[k] || 0) + 1;
}
const monthKeys = Object.keys(monthly).sort();
// The final month is partial — collection happened inside it — so the last
// complete month is the one quoted. Quoting a partial month understates the
// trend, which is the wrong direction to be wrong in when the claim is a rise.
const lastComplete = monthKeys[monthKeys.length - 2];
const MONTH_NAMES = 'January February March April May June July August September October November December'.split(' ');

Object.assign(tokens, {
  COHORT_TABLE: cohortRows.join('\n'),
  RATE_START: monthly['2025-01'].toLocaleString(),
  RATE_END: monthly[lastComplete].toLocaleString(),
  RATE_END_LABEL: `${MONTH_NAMES[Number(lastComplete.slice(5)) - 1]} ${lastComplete.slice(0, 4)}`,
  Z2024: zeroBy['2024'],
  Z2019: zeroBy['2019'],
});

// --- the companion page ------------------------------------------------------
//
// Recomputed here with the same filter build-graveyard.mjs uses, rather than
// read off that page or remembered from a console line. Two files describing
// one list is exactly where a number goes stale unnoticed.

const grave = dated
  .filter((r) => r.i >= 10000 && monthsSince(r.up) >= 24)
  .map((r) => ({ mo: monthsSince(r.up), i: r.i }));
const graveSil = grave.map((g) => g.mo).sort((a, b) => a - b);
const graveMax = grave.reduce((a, b) => (b.mo > a.mo ? b : a), grave[0]);

Object.assign(tokens, {
  GRAVEYARD_N: grave.length,
  GRAVEYARD_MED: graveSil[Math.floor(graveSil.length / 2)],
  GRAVEYARD_MAX: graveMax.mo,
  GRAVEYARD_MAX_INSTALLS: graveMax.i.toLocaleString(),
});

console.log('computed tokens:');
for (const [k, v] of Object.entries(tokens)) {
  console.log(`  ${k.padEnd(14)} ${k === 'COHORT_TABLE' ? `<${cohortRows.length} rows>` : v}`);
}

let section = readFileSync(TEMPLATE, 'utf8');
for (const [k, v] of Object.entries(tokens)) section = section.replaceAll(`{{${k}}}`, String(v));
const left = section.match(/\{\{[A-Z_]+\}\}/g);
if (left) {
  console.error(`\nunsubstituted tokens: ${[...new Set(left)].join(', ')}`);
  process.exit(1);
}

// --- the headline n ----------------------------------------------------------
//
// The page's eyebrow and meta description both carry "n = 4,164", which was the
// four original samples. The WordPress directory is no longer a sample, so that
// number now understates the work by an order of magnitude and is replaced by
// one computed from the datasets actually on the page.

function updateN(html) {
  const vsx = JSON.parse(readFileSync(new URL('../data/vsx-extensions.json', import.meta.url), 'utf8')).length;
  const chrome = Object.keys(JSON.parse(readFileSync(new URL('../data/chrome-extensions.json', import.meta.url), 'utf8'))).length;
  const shopA = Object.keys(JSON.parse(readFileSync(new URL('../data/app-details.json', import.meta.url), 'utf8'))).length;
  const shopB = Object.keys(JSON.parse(readFileSync(new URL('../data/shopify-cohort.json', import.meta.url), 'utf8'))).length;
  const total = rows.length + vsx + chrome + shopA + shopB;
  // Rounded down to the nearest thousand. A precise total invites the reader to
  // add up four datasets collected on different days and find it does not
  // reconcile; the claim being made is one of order, not of exactness.
  const label = `n = ${Math.floor(total / 1000)},000+`;
  console.log(`  headline n     ${label}  (wp ${rows.length} + vsx ${vsx} + chrome ${chrome} + shopify ${shopA}+${shopB})`);
  return html.replaceAll('n = 4,164', label).replaceAll('n=4,164', label.replace(/ /g, ''));
}

// The published file is stored with CRLF (git converts on checkout on this
// machine) while these blocks are authored with LF. Anything inserted is
// converted to whatever the file already uses — mixing both inside one file
// produces a confusing diff for no reason, and a multi-line anchor written with
// LF silently fails to match, which is how this was found.
const eolOf = (s) => (s.includes('\r\n') ? '\r\n' : '\n');
const toEol = (block, eol) => block.replace(/\r?\n/g, eol);

// --- caveats -----------------------------------------------------------------
//
// The page keeps a "what would make this wrong" list, and it is the reason the
// page is worth reading. New method has new limits, so the list grows with it.

function updateCaveats(html) {
  const shopRows = Object.values(JSON.parse(readFileSync(new URL('../data/shopify-cohort.json', import.meta.url), 'utf8')));
  const shopLive = shopRows.filter((r) => !r.delisted && !r.error);
  const extra = { ...tokens, SHOP_BFS: pct(shopLive.filter((r) => r.builtForShopify).length, shopLive.length) };

  let block = readFileSync(new URL('./templates/caveats-additions.html', import.meta.url), 'utf8');
  for (const [k, v] of Object.entries(extra)) block = block.replaceAll(`{{${k}}}`, String(v));
  const unresolved = block.match(/\{\{[A-Z_0-9]+\}\}/g);
  if (unresolved) {
    console.error(`\ncaveats have unsubstituted tokens: ${[...new Set(unresolved)].join(', ')}`);
    process.exit(1);
  }

  const eol = eolOf(html);
  const A = '<!-- caveats-v2:start -->';
  const B = '<!-- caveats-v2:end -->';
  const wrapped = toEol(`${A}\n${block.trimEnd()}\n${B}\n`, eol);
  if (html.includes(A)) return html.replace(new RegExp(`${A}[\\s\\S]*?${B}(\\r?\\n)*`), wrapped);

  // Appended to the end of the existing list, so the original caveats keep
  // their order and a reader comparing versions can see what was added.
  const anchor = /(\r?\n)  <\/ul>(\r?\n)<\/div>/;
  if (!anchor.test(html)) {
    console.error('\ncannot find the caveats list to extend');
    process.exit(1);
  }
  return html.replace(anchor, `${eol}${wrapped}  </ul>${eol}</div>`);
}

const MARK_A = '<!-- population-section:start -->';
const MARK_B = '<!-- population-section:end -->';
const wrapped = `${MARK_A}\n${section.trim()}\n${MARK_B}\n\n`;

let page = updateCaveats(updateN(readFileSync(PAGE, 'utf8')));
if (page.includes(MARK_A)) {
  page = page.replace(new RegExp(`${MARK_A}[\\s\\S]*?${MARK_B}\\n*`), wrapped);
  console.log('\nreplaced the existing section');
} else {
  const anchor = '<h2>VS Code: the one door still open</h2>';
  if (!page.includes(anchor)) {
    console.error(`\ncannot find the insertion anchor: ${anchor}`);
    process.exit(1);
  }
  page = page.replace(anchor, toEol(wrapped, eolOf(page)) + anchor);
  console.log('\ninserted before the VS Code section');
}

if (DRY) {
  console.log('dry run — nothing written');
} else {
  writeFileSync(PAGE, page);
  console.log(`wrote ${PAGE.pathname.split('/').pop()} (${page.length} bytes)`);
}
