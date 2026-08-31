/**
 * The whole WordPress plugin directory — every listing, not a sample.
 *
 * WHY THIS REPLACES THE SAMPLED FIGURE.
 *
 * The published census says "13.8% of the top 2,000 plugins have had no release
 * in a year". That is a real measurement of the popular head, and it has been
 * carefully qualified everywhere it appears. But the head is 3% of the
 * directory, and the interesting question — can a plugin published today reach
 * anyone — is a question about the other 97%.
 *
 * `query_plugins` pages through the entire directory 100 at a time, and each
 * record carries `added` as well as `last_updated`. 670 requests gets the
 * population. When you can afford the population, sampling is a choice to be
 * less certain for no reason.
 *
 * TWO FIELDS, TWO DIFFERENT QUESTIONS.
 *
 *   last_updated -> is this plugin still maintained?   (the census question)
 *   added        -> when did it enter?                 (the cohort question)
 *
 * Together they answer the one that matters to someone deciding where to build:
 * of the plugins added in year X, how many are alive now, and how many ever
 * reached an install base worth having?
 *
 * A CAVEAT THAT IS PART OF THE DATA, NOT A FOOTNOTE.
 *
 * `active_installs` is bucketed by wordpress.org itself — 10, 100, 1000,
 * 10000 and so on. It is a floor, not a count, and any sum of it is a sum of
 * floors. It is recorded as given and never interpolated.
 *
 * Politeness: sequential, ~1s apart, resumable, and requesting the reduced
 * field set so each response is 70KB rather than 700KB.
 *
 * Usage:  node wp-census.mjs [maxPages]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const OUT = new URL('../data/wp-directory.json', import.meta.url);
const MAX_PAGES = Number(process.argv[2] || 0); // 0 = all
/**
 * Which ordering to page through. Both are needed, and the reason is measured
 * rather than theoretical: paging `popular` to depth returns the same plugin
 * repeatedly and skips others — 5,359 repeats by page 350 on the first run —
 * because most of the directory shares an install bucket and the order within
 * a tie is not stable between requests. `new` is ordered by date added, which
 * almost never ties, so it enumerates cleanly and fills exactly the gaps the
 * other pass leaves. The union of the two is the population; either alone is
 * a sample that does not know it is one.
 */
const BROWSE = process.argv[3] || 'popular';
const DELAY_MS = 1000;
const UA = 'marketscan-research/0.2 (marketplace maintenance study; +https://github.com/odedmoshe/marketscan)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// tags are kept: they are the only categorisation the directory publishes, and
// they are what makes "what else does this job, and is it alive?" answerable.
const DROP_FIELDS = ['description', 'short_description', 'icons', 'ratings', 'screenshots', 'sections'];

function pageUrl(page) {
  const p = new URLSearchParams();
  p.set('action', 'query_plugins');
  p.set('request[browse]', BROWSE);
  p.set('request[per_page]', '100');
  p.set('request[page]', String(page));
  for (const f of DROP_FIELDS) p.set(`request[fields][${f}]`, '0');
  return `https://api.wordpress.org/plugins/info/1.2/?${p}`;
}

/** "2026-08-27 10:01am GMT" -> "2026-08-27". Anything unparseable becomes null. */
export function isoDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Only what the study needs. Short keys because there are 67,000 of these. */
export function compact(p) {
  return {
    s: p.slug,
    n: p.name,
    a: p.author ? String(p.author).replace(/<[^>]*>/g, '').trim() : null,
    added: isoDate(p.added),
    up: isoDate(p.last_updated),
    // Bucketed by wordpress.org, not a count. See the header.
    i: p.active_installs ?? 0,
    dl: p.downloaded ?? 0,
    r: p.rating ?? 0,
    nr: p.num_ratings ?? 0,
    t: p.tested || null,
    tags: p.tags ? Object.keys(p.tags) : [],
    th: p.support_threads ?? 0,
    thr: p.support_threads_resolved ?? 0,
  };
}

async function main() {
  const store = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
  console.error(`resuming with ${Object.keys(store).length} plugins already stored — pass: ${BROWSE}`);

  const first = await (await fetch(pageUrl(1), { headers: { 'User-Agent': UA } })).json();
  const total = first.info.pages;
  const results = first.info.results;
  const last = MAX_PAGES ? Math.min(MAX_PAGES, total) : total;
  console.error(`directory reports ${results} plugins across ${total} pages; fetching ${last}`);

  let dupes = 0;
  let failed = 0;

  const absorb = (plugins) => {
    for (const p of plugins) {
      if (!p?.slug) continue;
      if (store[p.slug]) dupes++;
      store[p.slug] = compact(p);
    }
  };

  absorb(first.plugins);

  for (let page = 2; page <= last; page++) {
    try {
      const res = await fetch(pageUrl(page), {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      absorb(j.plugins || []);
    } catch (e) {
      failed++;
      console.error(`  page ${page} failed: ${e.message}`);
    }

    if (page % 25 === 0) {
      writeFileSync(OUT, JSON.stringify(store));
      console.error(`  page ${page}/${last} — ${Object.keys(store).length} unique, ${dupes} repeats, ${failed} failed`);
    }
    await sleep(DELAY_MS);
  }

  writeFileSync(OUT, JSON.stringify(store));
  const n = Object.keys(store).length;
  console.error(`done: ${n} unique plugins (directory claims ${results}), ${dupes} repeats seen, ${failed} pages failed`);
  // Coverage is reported rather than assumed. Deep paging over a ranked
  // endpoint can shift under you, and a gap silently treated as the population
  // would corrupt every rate computed from it.
  console.error(`coverage: ${Math.round((n / results) * 1000) / 10}% of what the directory reports`);
}

if (process.argv[1]?.endsWith('wp-census.mjs')) {
  main().catch((e) => {
    console.error('fatal:', e.message);
    process.exit(1);
  });
}
