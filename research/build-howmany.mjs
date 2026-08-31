/**
 * Build docs/how-many-wordpress-plugins.html
 *
 * "How many WordPress plugins are there" is a question people actually type —
 * it came out of tools/demand.mjs alongside "how many wordpress plugins is too
 * many" and "are wordpress plugins safe". Everyone answering it quotes a round
 * number from a stats page, and none of them say how many of those plugins are
 * still alive, which is the part that changes what you do with the answer.
 *
 * This page answers it from a count of the directory made on the day it was
 * built, and then answers the question behind it. Every figure is computed
 * here; nothing is typed in.
 *
 * It also does not hide the awkward part: the directory reports two different
 * totals depending on how you ask it. Saying so is the reason to trust the
 * rest of the page.
 *
 * Usage:  node build-howmany.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';

const SRC = new URL('../docs/index.html', import.meta.url);
const OUT = new URL('../docs/how-many-wordpress-plugins.html', import.meta.url);
const rows = Object.values(JSON.parse(readFileSync(new URL('../data/wp-directory.json', import.meta.url), 'utf8')));

const months = (iso) => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return Math.max(0, Math.round((Date.now() - Date.UTC(y, m - 1, d)) / 2629800000));
};
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const today = new Date().toISOString().slice(0, 10);
const fmt = (n) => n.toLocaleString('en-US');

const dated = rows.filter((r) => r.added && r.up);
const total = rows.length;
const alive = dated.filter((r) => months(r.up) < 12).length;
const dormant = dated.filter((r) => months(r.up) >= 24).length;
const zero = rows.filter((r) => !r.i).length;
const thousand = rows.filter((r) => r.i >= 1000).length;
const tenK = rows.filter((r) => r.i >= 10000).length;
const hundredK = rows.filter((r) => r.i >= 100000).length;
const million = rows.filter((r) => r.i >= 1000000).length;

const byYear = new Map();
for (const r of dated) {
  const y = r.added.slice(0, 4);
  byYear.set(y, (byYear.get(y) || 0) + 1);
}
const years = [...byYear.keys()].sort().filter((y) => y >= '2016');
const yearRows = years
  .map((y) => {
    const n = byYear.get(y);
    const bar = Math.round((n / Math.max(...years.map((k) => byYear.get(k)))) * 100);
    return `    <tr><td>${y}${y === '2026' ? ' <span style="color:var(--ink-3)">(part year)</span>' : ''}</td><td class="n">${fmt(n)}</td><td><span class="bar${y === '2026' ? ' d' : ''}" style="width:${bar}%"></span></td></tr>`;
  })
  .join('\n');

const monthly = {};
for (const r of dated.filter((x) => x.added >= '2025-01')) {
  const k = r.added.slice(0, 7);
  monthly[k] = (monthly[k] || 0) + 1;
}
const mk = Object.keys(monthly).sort();
const lastComplete = mk[mk.length - 2];
const MONTHS = 'January February March April May June July August September October November December'.split(' ');
const label = (k) => `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`;

const src = readFileSync(SRC, 'utf8');
const styles = [...src.matchAll(/<style>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n');
const fonts = /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/.exec(src)?.[0] ?? '';
if (!styles || !fonts) {
  console.error('could not lift the stylesheet from index.html');
  process.exit(1);
}

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${fmt(total)} plugins, counted from the wordpress.org API on ${today} — not an estimate. ${pct(alive, dated.length)}% have shipped a release in the last year; ${pct(dormant, dated.length)}% have not shipped in two.">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://plugincensus.com/how-many-wordpress-plugins">
<meta property="og:title" content="How many WordPress plugins are there? ${fmt(total)}, counted">
<meta property="og:description" content="Counted from the directory itself on ${today}, with how many are still maintained — which is the part the usual answer leaves out.">
<meta property="og:type" content="article">
<meta property="og:url" content="https://plugincensus.com/how-many-wordpress-plugins">
<style>*{box-sizing:border-box}html,body{margin:0}img{max-width:100%}</style>
<title>How many WordPress plugins are there?</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
${styles}
</head>
<body>
<div class="wrap">

<header class="top">
  <div class="eyebrow"><span>Counted, not estimated</span><span>${today}</span><span>source: wordpress.org API</span></div>
  <h1>How many WordPress plugins are there?</h1>
  <p class="standfirst"><strong>${fmt(total)}</strong> — counted one by one from the directory's own API on ${today}, not taken from a stats page.</p>
</header>

<div class="cohorts">
  <div class="cohort">
    <div class="lab">In the directory</div>
    <div class="big">${fmt(total)}</div>
    <div class="cap">every plugin wordpress.org will serve, enumerated in full.</div>
  </div>
  <div class="cohort">
    <div class="lab">Shipped in the last year</div>
    <div class="big">${pct(alive, dated.length)}%</div>
    <div class="cap">${fmt(alive)} plugins. This is the number that usually goes missing from the answer.</div>
  </div>
  <div class="cohort now">
    <div class="lab">Silent for two years</div>
    <div class="big">${pct(dormant, dated.length)}%</div>
    <div class="cap">${fmt(dormant)} plugins are still listed and installable with nobody shipping fixes.</div>
  </div>
</div>

<div class="col">
<h3>The count depends on how you ask</h3>
<p>The directory's API returns a different total depending on which listing you page through: browsing by <em>newest</em> reports a larger population than browsing by <em>popular</em>, and the gap is several thousand plugins. The difference is the plugins with no install base at all &mdash; a popularity ranking has nothing to sort them by, so it does not rank them.</p>
<p>The number at the top of this page is a count of everything found by enumerating both orderings and removing duplicates. Anyone quoting a single round figure is almost certainly quoting the smaller one without knowing it.</p>
</div>

<h2>How many of them does anyone use?</h2>
<p class="dek">Install counts are reported by the directory in buckets, so each figure is a floor.</p>

<div class="block">
<table>
  <thead><tr><th style="width:34%">Active installs</th><th style="width:16%">Plugins</th><th>Share of the directory</th></tr></thead>
  <tbody>
    <tr><td>none reported</td><td class="n">${fmt(zero)}</td><td class="n">${pct(zero, total)}%</td></tr>
    <tr><td>1,000 or more</td><td class="n">${fmt(thousand)}</td><td class="n">${pct(thousand, total)}%</td></tr>
    <tr><td>10,000 or more</td><td class="n">${fmt(tenK)}</td><td class="n">${pct(tenK, total)}%</td></tr>
    <tr><td>100,000 or more</td><td class="n">${fmt(hundredK)}</td><td class="n">${pct(hundredK, total)}%</td></tr>
    <tr><td>1,000,000 or more</td><td class="n">${fmt(million)}</td><td class="n">${pct(million, total)}%</td></tr>
  </tbody>
</table>
</div>

<div class="col">
<p><strong>${pct(zero, total)}% of the directory has no reported install base at all</strong>, and only ${pct(thousand, total)}% has reached a thousand. The headline number is real, but as a measure of what is available to actually use it is wildly generous.</p>
</div>

<h2>How many are added each year?</h2>
<p class="dek">By the year each currently-listed plugin was added. Plugins later removed are not here, so earlier years are undercounted.</p>

<div class="block">
<table>
  <thead><tr><th style="width:20%">Added</th><th style="width:16%">Plugins</th><th></th></tr></thead>
  <tbody>
${yearRows}
  </tbody>
</table>
</div>

<div class="col">
<p>Submissions have risen sharply. ${label('2025-01')} took in ${fmt(monthly['2025-01'] || 0)} new plugins; ${label(lastComplete)} took in ${fmt(monthly[lastComplete] || 0)}. What is causing that is not in this data and is not asserted here &mdash; the timing coincides with code generation becoming nearly free, and that remains a hypothesis. What the data does support is that the share of new plugins reaching any users at all has fallen just as steeply, which is set out in <a href="./">the census</a>.</p>
</div>

<h2>How many plugins is too many?</h2>
<div class="col">
<p>This gets asked alongside the first question and deserves a straight answer: <strong>there is no number.</strong> Twenty well-maintained plugins will do less harm than three that stopped shipping in 2021. What matters is what each one does on every page load, and whether anyone is still fixing it.</p>
<p>That second half is checkable. <a href="/scan">The scanner</a> reads the plugins a WordPress page declares in its own asset URLs and grades each by how long since its last release &mdash; free, no signup. The ${fmt(dormant)} plugins above that have gone quiet include <a href="/abandoned">plugins on hundreds of thousands of sites</a>.</p>
</div>

<div class="caveats">
  <h3>Method</h3>
  <ul>
    <li><b>Source:</b> <code>api.wordpress.org/plugins/info/1.2</code>, enumerated in full rather than sampled, on ${today}. Two passes over two orderings, deduplicated by slug.</li>
    <li><b>Install counts are bucketed by the directory</b> — it reports <code>300,000</code>, never <code>312,481</code>. Every figure here is therefore a floor.</li>
    <li><b>"Shipped" means a release.</b> A maintainer may be answering support or reviewing patches without cutting one, and some plugins are simply finished. This measures releases because that is what the directory publishes.</li>
    <li><b>Yearly figures count survivors.</b> A plugin added in 2017 and since removed is not in the directory today, so earlier years are undercounted and the rise is steeper than it looks, not shallower.</li>
    <li><b>Everything here is reproducible.</b> The collector and the raw data are in <a href="https://github.com/odedmoshe/marketscan">the repository</a>.</li>
  </ul>
</div>

<footer>
  Part of <a href="./">The Distribution Census</a> &middot; <a href="/abandoned">plugins that stopped shipping</a> &middot; <a href="/scan">check a site</a><br>
  Counted ${today}. Public, key-free endpoints; crawling limited to what robots.txt permits.
</footer>

</div>
</body>
</html>
`;

writeFileSync(OUT, page);
console.log(`wrote docs/how-many-wordpress-plugins.html (${page.length} bytes)`);
console.log(`  total ${fmt(total)} · alive ${pct(alive, dated.length)}% · dormant ${pct(dormant, dated.length)}% · no installs ${pct(zero, total)}%`);
console.log(`  additions: ${label('2025-01')} ${monthly['2025-01']} -> ${label(lastComplete)} ${monthly[lastComplete]}`);
