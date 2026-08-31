#!/usr/bin/env node
/**
 * marketscan — is this marketplace software still maintained?
 *
 * Package registries have this covered. deps.dev, ecosyste.ms and libraries.io
 * between them index a hundred registries of things developers import, free.
 * Not one of them indexes an application marketplace: WordPress, Shopify, the
 * VS Code marketplace, Chrome, Figma are all absent.
 *
 * The reason is structural rather than accidental. Package registries publish
 * machine-readable manifests; application marketplaces publish web pages. So
 * indexing them is not a one-off import, it is a crawler you have to keep alive
 * forever — which is why the free datasets that do exist are stale. The best
 * public Shopify app dataset says "regularly updated" in its README and carries
 * a dateModified of November 2024.
 *
 * Meanwhile the exposure is real: 13.8% of the 2,000 most popular WordPress
 * plugins have had no release in twelve months, and the marketplace listing does
 * not say so anywhere a site owner would look. An abandoned listing still converts.
 */

import { verdict, GRADES } from './health.mjs';
import * as wordpress from './sources/wordpress.mjs';
import * as vscode from './sources/vscode.mjs';
import * as shopify from './sources/shopify.mjs';
import * as chrome from './sources/chrome.mjs';
import { parseManifest } from './manifest.mjs';

const SOURCES = {
  wp: { mod: wordpress, name: 'wordpress', bulk: 'popular' },
  wordpress: { mod: wordpress, name: 'wordpress', bulk: 'popular' },
  vsx: { mod: vscode, name: 'vscode', bulk: 'top' },
  vscode: { mod: vscode, name: 'vscode', bulk: 'top' },
  // No bulk listing: the store publishes no update date, so there is nothing
  // to rank an "abandoned" view by. Saying so is better than a view that
  // silently ranks on something else.
  shop: { mod: shopify, name: 'shopify', bulk: null },
  shopify: { mod: shopify, name: 'shopify', bulk: null },
  // Chrome has last-updated dates and therefore real grades, but no public
  // endpoint that enumerates popular extensions — so lookups only, no --abandoned.
  cr: { mod: chrome, name: 'chrome', bulk: null },
  chrome: { mod: chrome, name: 'chrome', bulk: null },
};

// --- presentation ----------------------------------------------------------

const C = process.stdout.isTTY
  ? { dim: '\x1b[2m', b: '\x1b[1m', r: '\x1b[0m', red: '\x1b[31m', yel: '\x1b[33m', grn: '\x1b[32m', cy: '\x1b[36m' }
  : { dim: '', b: '', r: '', red: '', yel: '', grn: '', cy: '' };

const COLOUR = { active: C.grn, slowing: C.cy, stale: C.yel, abandoned: C.red, gone: C.red, unknown: C.dim };

const fmt = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n ?? 0);

function card(rec) {
  const v = verdict(rec);
  const col = COLOUR[v.grade];

  if (rec.delisted) {
    console.log(`\n${C.b}${rec.id}${C.r}`);
    console.log(`  ${col}${C.b}${v.label}${C.r} — ${GRADES[v.grade].blurb}`);
    if (rec.error) console.log(`  ${C.dim}marketplace said: ${rec.error}${C.r}`);
    console.log();
    return;
  }

  console.log(`\n${C.b}${rec.name}${C.r} ${C.dim}${rec.id}${C.r}`);
  console.log(`  ${C.dim}by ${rec.author}${C.r}`);
  console.log(`\n  ${col}${C.b}${v.label}${C.r} — ${v.blurb}`);
  console.log(`  ${C.dim}last release ${v.months === null ? 'unknown' : `${v.months} months ago`}` +
    `${rec.version ? ` · v${rec.version}` : ''}${C.r}`);

  const bits = [];
  if (rec.installs) bits.push(`${fmt(rec.installs)} installs`);
  // "from 0" would assert that nobody rated it. Chrome serves a rating without
  // a count, so an absent count must read as absent, not as zero.
  if (rec.rating) {
    bits.push(rec.numRatings ? `${rec.rating.toFixed(1)}/5 from ${rec.numRatings}` : `${rec.rating.toFixed(1)}/5`);
  }
  if (rec.testedUpTo) bits.push(`tested to WP ${rec.testedUpTo}`);
  if (rec.size) bits.push(rec.size);
  if (rec.support) bits.push(`${rec.support.resolveRate}% support resolved`);
  if (rec.publisherVerified === false) bits.push('unverified publisher');
  if (bits.length) console.log(`  ${C.dim}${bits.join(' · ')}${C.r}`);

  if (v.exposure) {
    console.log(`\n  ${C.yel}${v.exposure.note}${C.r}`);
  }

  // An UNKNOWN grade should never look like the tool failed. Where the reason
  // is the marketplace and not us, say which marketplace and what it withholds.
  if (v.grade === 'unknown' && rec.source === 'shopify') {
    console.log(
      `\n  ${C.dim}The Shopify App Store publishes no last-updated date, so no\n` +
        `  maintenance grade is possible here. Review volume and whether the\n` +
        `  listing still exists are the only signals it exposes.${C.r}`,
    );
  }

  if (rec.ambiguous) {
    console.log(
      `\n  ${C.red}This page described ${rec.subjectsOnPage} apps, not one. Treat these numbers` +
        `\n  as unverified — they may belong to a different listing.${C.r}`,
    );
  }

  console.log(`  ${C.dim}${rec.url}${C.r}\n`);
}

function table(rows, title) {
  console.log(`\n${C.b}${title}${C.r}`);
  console.log(`${C.dim}  installs   stale   rating   name${C.r}`);
  for (const { rec, v } of rows) {
    const col = COLOUR[v.grade];
    console.log(
      `  ${fmt(rec.installs).padStart(7)}  ${col}${String(v.months).padStart(3)}mo${C.r}  ` +
        `${(rec.rating ? rec.rating.toFixed(1) : '  -').padStart(5)}   ${rec.name.slice(0, 46)}`,
    );
  }
  console.log();
}

// --- commands --------------------------------------------------------------

async function abandoned({ mod, name, bulk }, pages) {
  if (!bulk) {
    console.error(
      `\n  ${name} publishes no last-updated date, so there is nothing to rank an` +
        `\n  --abandoned view by. Look up individual listings instead.\n`,
    );
    process.exit(1);
  }
  process.stderr.write(`collecting ${name}…\n`);
  const list = await mod[bulk]({ pages });
  const rows = list
    .map((rec) => ({ rec, v: verdict(rec) }))
    .filter(({ v }) => v.exposure)
    .sort((a, b) => b.rec.installs - a.rec.installs);

  table(rows.slice(0, 30), `Depended on, but no longer maintained — ${name} (${rows.length} found in ${list.length} scanned)`);

  const stale = list.filter((r) => (verdict(r).months ?? 0) >= 12).length;
  console.log(
    `${C.dim}${stale}/${list.length} (${Math.round((stale / list.length) * 100)}%) of the most popular ` +
      `${name} listings have had no release in 12 months.${C.r}\n`,
  );
}

/**
 * Batch audit. Sequential and rate-limited on purpose: a list of forty is
 * normal, and hammering three marketplaces in parallel to save nine seconds is
 * a bad trade for a tool asking to be run on a schedule.
 *
 * Exits non-zero when anything is ABANDONED or DELISTED, so it works as a CI
 * gate. STALE deliberately does not fail the build — twelve months is common
 * and healthy for a small, finished plugin, and a check that cries wolf gets
 * switched off within a week.
 */
async function audit(file, asJson) {
  const { readFile } = await import('node:fs/promises');

  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    console.error(`\n  cannot read manifest: ${file}\n`);
    process.exit(2);
  }

  const { entries, errors } = parseManifest(text);
  if (!entries.length && !errors.length) {
    console.error(`\n  ${file} has no entries. See --help for the format.\n`);
    process.exit(2);
  }

  const results = [];
  for (const [i, e] of entries.entries()) {
    if (!asJson) process.stderr.write(`\r  checking ${i + 1}/${entries.length}…   `);
    try {
      const rec = await SOURCES[e.prefix].mod.lookup(e.id);
      results.push({ entry: e, rec, v: verdict(rec) });
    } catch (err) {
      // A single unreachable listing must not abort an audit of forty.
      results.push({ entry: e, error: String(err.message) });
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!asJson) process.stderr.write('\r' + ' '.repeat(30) + '\r');

  const rank = { gone: 0, abandoned: 1, stale: 2, slowing: 3, unknown: 4, active: 5 };
  results.sort((a, b) => (rank[a.v?.grade] ?? 9) - (rank[b.v?.grade] ?? 9));

  const failing = results.filter((r) => r.v && (r.v.grade === 'abandoned' || r.v.grade === 'gone'));

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          file,
          checked: results.length,
          failing: failing.length,
          manifestErrors: errors,
          results: results.map((r) => ({
            source: r.entry.source,
            id: r.entry.id,
            ...(r.error ? { error: r.error } : { grade: r.v.grade, months: r.v.months, name: r.rec.name, url: r.rec.url }),
          })),
        },
        null,
        2,
      ),
    );
    process.exit(failing.length ? 1 : 0);
  }

  console.log(`\n${C.b}Audit — ${file}${C.r}`);
  console.log(`${C.dim}  ${results.length} listings checked${C.r}\n`);

  for (const r of results) {
    if (r.error) {
      console.log(`  ${C.red}ERROR     ${C.r} ${r.entry.prefix}:${r.entry.id}  ${C.dim}${r.error.slice(0, 60)}${C.r}`);
      continue;
    }
    const col = COLOUR[r.v.grade];
    // Width must match "NNmo" exactly, or the UNKNOWN rows shift the column.
    const age = r.v.months === null ? '   -' : `${String(r.v.months).padStart(2)}mo`;
    console.log(
      `  ${col}${r.v.label.padEnd(10)}${C.r}${age}  ${r.rec.name.slice(0, 40).padEnd(41)}${C.dim}${r.entry.prefix}:${r.entry.id}${C.r}`,
    );
  }

  for (const e of errors) {
    console.log(`  ${C.yel}SKIPPED   ${C.r}       ${C.dim}line ${e.lineNo}: ${e.reason}${C.r}`);
  }

  console.log(
    failing.length
      ? `\n  ${C.red}${failing.length} of ${results.length} abandoned or delisted.${C.r}\n`
      : `\n  ${C.grn}Nothing abandoned or delisted.${C.r}\n`,
  );
  process.exit(failing.length ? 1 : 0);
}

const HELP = `
${C.b}marketscan${C.r} — is this marketplace software still maintained?

  ${C.b}marketscan wp${C.r} <plugin-slug>          a WordPress.org plugin
  ${C.b}marketscan vsx${C.r} <publisher.name>      a VS Code extension
  ${C.b}marketscan shop${C.r} <app-handle>        a Shopify app
  ${C.b}marketscan cr${C.r} <extension-id>        a Chrome extension

  ${C.b}marketscan audit${C.r} <file> [--json]    check a whole list at once

  ${C.b}marketscan wp --abandoned${C.r} [--pages N]   popular but unmaintained
  ${C.b}marketscan vsx --abandoned${C.r} [--pages N]

Examples
  marketscan wp woocommerce-pdf-invoices-packing-slips
  marketscan vsx ms-python.python
  marketscan shop judgeme
  marketscan cr ddkjiahejlhfcafbddmgiahcphecmpfh
  marketscan wp --abandoned --pages 20
  marketscan audit plugins.txt

Manifest format, one per line; # comments and blank lines ignored:
  wp:limit-login-attempts
  vsx:ms-python.python
  shop:judgeme
  cr:ddkjiahejlhfcafbddmgiahcphecmpfh

audit exits 1 if anything is ABANDONED or DELISTED, so it works as a CI gate.
STALE does not fail the build — 12 months is normal for a small finished tool,
and a check that cries wolf gets switched off.

Shopify publishes no last-updated date, so its listings grade UNKNOWN and have
no --abandoned view. That is a fact about the store, not a gap in the tool.

Grades are based on time since last release: ACTIVE <6mo, SLOWING 6-12,
STALE 12-24, ABANDONED 24+. Blunt on purpose, and stated so you can disagree.
This measures maintenance, not quality — a finished tool that needed no changes
scores badly and may still be the right choice.
`;

async function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const pagesArg = argv.indexOf('--pages');
  const pages = pagesArg !== -1 ? Number(argv[pagesArg + 1]) || 10 : 10;
  const positional = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--pages');

  const [which, target] = positional;

  if (which === 'audit') {
    if (!target) {
      console.error('marketscan audit needs a manifest file. See --help.');
      process.exit(2);
    }
    return audit(target, flags.has('--json'));
  }

  if (!which || flags.has('--help') || flags.has('-h')) {
    console.log(HELP);
    process.exit(which ? 0 : 1);
  }

  const src = SOURCES[which];
  if (!src) {
    console.error(`unknown marketplace "${which}". Try: wp, vsx, shop, cr`);
    process.exit(1);
  }

  try {
    if (flags.has('--abandoned')) return await abandoned(src, pages);
    if (!target) {
      console.error(`marketscan ${which} needs an id, or --abandoned. See --help.`);
      process.exit(1);
    }
    card(await src.mod.lookup(target));
  } catch (e) {
    console.error(`\n  ${C.red}${e.message}${C.r}\n`);
    process.exit(1);
  }
}

main();
