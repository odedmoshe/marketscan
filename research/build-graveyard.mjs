/**
 * Build docs/abandoned.html — the popular WordPress plugins that stopped
 * shipping.
 *
 * WHY ONE PAGE AND NOT SEVENTY-ONE THOUSAND.
 *
 * The dataset would support a generated page per plugin, and that is the
 * obvious move for search traffic. It is also how a site whose entire value is
 * being a credible piece of research gets treated as a content farm, which
 * would cost more than the traffic is worth. So: one page, one table, every row
 * carrying a fact a reader cannot get from the plugin's own listing.
 *
 * The threshold is 10,000 installs and no release in 24 months. Both are
 * arbitrary and both are stated on the page. The first keeps the list to
 * plugins enough people actually run for the entry to matter; the second is the
 * census's existing "abandoned" line.
 *
 * Every number is computed. The page's CSS is lifted from index.html at build
 * time rather than copied, so the two cannot drift apart visually.
 *
 * Usage:  node build-graveyard.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';

const SRC = new URL('../docs/index.html', import.meta.url);
const OUT = new URL('../docs/abandoned.html', import.meta.url);
const MIN_INSTALLS = 10000;
const MIN_MONTHS = 24;

const rows = Object.values(JSON.parse(readFileSync(new URL('../data/wp-directory.json', import.meta.url), 'utf8')));

const months = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.max(0, Math.round((Date.now() - Date.UTC(y, m - 1, d)) / 2629800000));
};
const clean = (s) =>
  String(s || '')
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, '&');
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

const list = rows
  .filter((r) => r.up && r.i >= MIN_INSTALLS && months(r.up) >= MIN_MONTHS)
  .map((r) => ({ ...r, mo: months(r.up), name: clean(r.n), author: clean(r.a) }))
  .sort((a, b) => b.i - a.i || b.mo - a.mo);

const today = new Date().toISOString().slice(0, 10);
const oldest = list.reduce((a, b) => (b.mo > a.mo ? b : a), list[0]);
const totalInstalls = list.reduce((s, r) => s + r.i, 0);

// Support-thread resolution is published by the directory and is the one field
// that speaks to whether anyone is still answering rather than still releasing.
// It stays in the table, where each row is a fact about that plugin, and it is
// NOT promoted to a headline: only 16 of these plugins have any threads at all,
// and a proportion of 16 has no business being set in 52px type. This project
// has already withdrawn one figure for exactly that.
const withThreads = list.filter((r) => r.th > 0);
const unanswered = withThreads.filter((r) => r.thr === 0).length;

const silences = list.map((r) => r.mo).sort((a, b) => a - b);
const medianSilence = silences[Math.floor(silences.length / 2)];
const fourPlus = list.filter((r) => r.mo >= 48).length;

const tableRows = list
  .map((r) => {
    const rating = r.nr >= 5 ? `${Math.round((r.r / 20) * 10) / 10}&#9733;` : '&mdash;';
    const support = r.th > 0 ? `${pct(r.thr, r.th)}%` : '&mdash;';
    return (
      `    <tr>` +
      `<td class="n"${r.mo >= 48 ? ' style="color:var(--decay)"' : ''}>${r.mo}mo</td>` +
      `<td class="n">${r.i.toLocaleString()}</td>` +
      `<td><a href="https://wordpress.org/plugins/${esc(r.s)}/" rel="nofollow noopener">${esc(r.name)}</a>` +
      `<br><span class="how">${esc(r.author)}</span></td>` +
      `<td class="n">${rating}</td>` +
      `<td class="n">${support}</td>` +
      `</tr>`
    );
  })
  .join('\n');

// Reuse the census's own stylesheet rather than a copy of it.
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
<meta name="description" content="${list.length} WordPress plugins with more than ${MIN_INSTALLS.toLocaleString()} active installs that have not shipped a release in over two years. Measured from the whole directory, ${today}.">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://plugincensus.com/abandoned">
<meta property="og:title" content="Popular WordPress plugins that stopped shipping">
<meta property="og:description" content="${list.length} plugins with ${MIN_INSTALLS.toLocaleString()}+ installs and no release in two years. Median silence ${medianSilence} months; the longest is ${oldest ? oldest.mo : 0} months on ${oldest ? oldest.i.toLocaleString() : 0} sites.">
<meta property="og:type" content="article">
<meta property="og:url" content="https://plugincensus.com/abandoned">
<style>*{box-sizing:border-box}html,body{margin:0}img{max-width:100%}</style>
<title>Popular WordPress plugins that stopped shipping</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
${styles}
</head>
<body>
<div class="wrap">

<header class="top">
  <div class="eyebrow">
    <span>From the whole directory</span><span>71,091 plugins</span><span>${list.length} listed here</span><span>${today}</span>
  </div>
  <h1>Popular plugins that stopped shipping</h1>
  <p class="standfirst">Every WordPress plugin with more than ${MIN_INSTALLS.toLocaleString()} active installs whose last release was over two years ago. Not a sample &mdash; this is the complete list, from all 71,091 plugins in the directory.</p>
</header>

<div class="col">
<p>An abandoned plugin does not announce itself. It keeps working, it keeps its star rating, and its listing page carries no warning &mdash; a listing that still converts has no reason to add one. The dashboard tells you when an update is available. It never tells you that no update has come in three years.</p>

<p>That matters most for the plugins nobody thinks about: the login limiter, the backup runner, the form handler. Installed once, then trusted indefinitely. The longest entry on this list was last touched <strong>${oldest ? oldest.mo : 0} months ago</strong> and is still running on ${oldest ? oldest.i.toLocaleString() : 0} sites.</p>
</div>

<div class="cohorts">
  <div class="cohort">
    <div class="lab">On this list</div>
    <div class="big">${list.length}</div>
    <div class="cap">plugins with ${MIN_INSTALLS.toLocaleString()}+ installs and no release in two years.</div>
  </div>
  <div class="cohort now">
    <div class="lab">Sites running them</div>
    <div class="big">${(totalInstalls / 1e6).toFixed(1)}M</div>
    <div class="cap">summed install buckets. The directory reports installs in buckets, so this is a floor rather than a count.</div>
  </div>
  <div class="cohort">
    <div class="lab">Median silence</div>
    <div class="big">${medianSilence}mo</div>
    <div class="cap">${(medianSilence / 12).toFixed(1)} years. ${fourPlus} of the ${list.length} have been silent for four years or more.</div>
  </div>
</div>

<div class="col">
<h3>What this does and does not mean</h3>
<p><strong>This measures maintenance, not quality.</strong> A small, finished plugin that genuinely needed no changes in three years appears here and may still be the right choice. The grade is the start of a judgement, not the end of one.</p>
<p>What it does mean is that if a vulnerability is found in one of these tomorrow, there is no evidence anyone is there to fix it. That is the risk being described &mdash; not that the software is bad, but that it is unattended.</p>
</div>

<div class="block">
<table>
  <thead><tr>
    <th style="width:11%">Silent for</th>
    <th style="width:13%">Installs</th>
    <th>Plugin</th>
    <th style="width:10%">Rating</th>
    <th style="width:14%">Support resolved</th>
  </tr></thead>
  <tbody>
${tableRows}
  </tbody>
</table>
</div>

<div class="col">
<h3>Check your own site</h3>
<p><a href="https://marketwatch-rho.vercel.app">marketwatch</a> reads the plugin slugs a WordPress page already declares in its own asset URLs and checks each against the directory. Free, no signup. It only sees plugins that load assets on the page it is given, so a clean result is not a clean bill of health.</p>
<p>For a list of sites, or for CI:</p>
<p><code>npx github:odedmoshe/marketscan audit plugins.txt</code></p>
</div>

<div class="caveats">
  <h3>Method</h3>
  <ul>
    <li><b>Source:</b> <code>api.wordpress.org/plugins/info/1.2</code>, enumerated in full &mdash; ${rows.length.toLocaleString()} plugins, 100% of what the directory reports. Two passes over two orderings are needed; the collector is <code>research/wp-census.mjs</code> in the repository.</li>
    <li><b>Both thresholds are arbitrary.</b> ${MIN_INSTALLS.toLocaleString()} installs keeps the list to plugins enough people run for the entry to matter; 24 months is the line the <a href="./">census</a> already uses for "abandoned". Move either and the list changes size.</li>
    <li><b>Install counts are bucketed by the directory itself</b> &mdash; it reports <code>300,000</code>, never <code>312,481</code>. Every figure here is therefore a floor, and the summed total especially so.</li>
    <li><b>Support resolution is shown only where there were threads.</b> A plugin with no threads is not being ignored; nobody asked.</li>
    <li><b>A release date is not the same as activity.</b> A maintainer may be answering support, reviewing patches, or simply confident the code is finished. This measures releases, which is what the directory publishes.</li>
    <li><b>Measured ${today}.</b> Any of these could ship tomorrow.</li>
  </ul>
</div>

<footer>
  Part of <a href="./">The Distribution Census</a> &middot; data and collectors: <a href="https://github.com/odedmoshe/marketscan">github.com/odedmoshe/marketscan</a><br>
  Public, key-free endpoints; crawling limited to what robots.txt permits.
</footer>

</div>
</body>
</html>
`;

writeFileSync(OUT, page);
console.log(`wrote docs/abandoned.html — ${list.length} plugins, ${page.length} bytes`);
console.log(`  oldest: ${oldest?.name} (${oldest?.mo}mo, ${oldest?.i.toLocaleString()} installs)`);
console.log(`  summed installs: ${totalInstalls.toLocaleString()} (a floor)`);
console.log(`  no support thread resolved: ${unanswered} of ${withThreads.length}`);
