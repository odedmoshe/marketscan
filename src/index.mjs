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
 * Meanwhile the exposure is real: 14% of the most popular WordPress plugins have
 * had no release in twelve months, and the marketplace listing does not say so
 * anywhere a site owner would look. An abandoned listing still converts.
 */

import { verdict, GRADES } from './health.mjs';
import * as wordpress from './sources/wordpress.mjs';
import * as vscode from './sources/vscode.mjs';

const SOURCES = { wp: wordpress, wordpress, vsx: vscode, vscode };

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
  if (rec.rating) bits.push(`${rec.rating.toFixed(1)}/5 from ${rec.numRatings}`);
  if (rec.testedUpTo) bits.push(`tested to WP ${rec.testedUpTo}`);
  if (rec.support) bits.push(`${rec.support.resolveRate}% support resolved`);
  if (rec.publisherVerified === false) bits.push('unverified publisher');
  if (bits.length) console.log(`  ${C.dim}${bits.join(' · ')}${C.r}`);

  if (v.exposure) {
    console.log(`\n  ${C.yel}${v.exposure.note}${C.r}`);
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

async function abandoned(src, name, pages) {
  process.stderr.write(`collecting ${name}…\n`);
  const list = name === 'wordpress' ? await src.popular({ pages }) : await src.top({ pages });
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

const HELP = `
${C.b}marketscan${C.r} — is this marketplace software still maintained?

  ${C.b}marketscan wp${C.r} <plugin-slug>          a WordPress.org plugin
  ${C.b}marketscan vsx${C.r} <publisher.name>      a VS Code extension

  ${C.b}marketscan wp --abandoned${C.r} [--pages N]   popular but unmaintained
  ${C.b}marketscan vsx --abandoned${C.r} [--pages N]

Examples
  marketscan wp woocommerce-pdf-invoices-packing-slips
  marketscan vsx ms-python.python
  marketscan wp --abandoned --pages 20

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
  if (!which || flags.has('--help') || flags.has('-h')) {
    console.log(HELP);
    process.exit(which ? 0 : 1);
  }

  const src = SOURCES[which];
  if (!src) {
    console.error(`unknown marketplace "${which}". Try: wp, vsx`);
    process.exit(1);
  }
  const name = which === 'wp' || which === 'wordpress' ? 'wordpress' : 'vscode';

  try {
    if (flags.has('--abandoned')) return await abandoned(src, name, pages);
    if (!target) {
      console.error(`marketscan ${which} needs an id, or --abandoned. See --help.`);
      process.exit(1);
    }
    card(await src.lookup(target));
  } catch (e) {
    console.error(`\n  ${C.red}${e.message}${C.r}\n`);
    process.exit(1);
  }
}

main();
