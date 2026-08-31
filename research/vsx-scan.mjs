/**
 * VS Code Marketplace — third marketplace measurement.
 *
 * The thesis after Shopify and WordPress is that marketplace discovery is
 * captured: scale goes to whoever arrived with an audience, and the marketplace
 * is where that audience is cashed in, not where it is acquired.
 *
 * This is the test that could break it. VS Code is the marketplace whose users
 * are developers, where reputation travels through GitHub and Hacker News rather
 * than through hosting deals, and where a single well-made tool can be adopted
 * on merit. If cold-start entry works anywhere, it works here. If it does not
 * work here either, the thesis holds on three independent marketplaces and the
 * conclusion is structural rather than about any one platform.
 *
 * Data source: the public gallery API the VS Code client itself queries. Read
 * only, modest page count, identified user agent.
 *
 * Usage:  node vsx-scan.mjs [pages]   (100 per page, default 12)
 */

import { writeFileSync } from 'node:fs';

const PAGES = Number(process.argv[2] || 12);
const OUT = new URL('../data/vsx-extensions.json', import.meta.url);
const DELAY_MS = 800;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// filterType 8 = target platform; sortBy 4 = install count desc.
// flags 914 = versions + categories + statistics + latest-version-only.
const body = (pageNumber) => ({
  filters: [
    {
      criteria: [{ filterType: 8, value: 'Microsoft.VisualStudio.Code' }],
      pageNumber,
      pageSize: 100,
      sortBy: 4,
      sortOrder: 0,
    },
  ],
  flags: 914,
});

async function page(n) {
  const res = await fetch('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
    method: 'POST',
    headers: {
      Accept: 'application/json;api-version=3.0-preview.1',
      'Content-Type': 'application/json',
      'User-Agent': 'marketplace-research/1.0',
    },
    body: JSON.stringify(body(n)),
  });
  if (!res.ok) throw new Error(`page ${n}: HTTP ${res.status}`);
  return res.json();
}

const all = new Map();
for (let n = 1; n <= PAGES; n++) {
  try {
    const d = await page(n);
    for (const e of d.results?.[0]?.extensions || []) {
      const st = Object.fromEntries((e.statistics || []).map((s) => [s.statisticName, s.value]));
      const id = `${e.publisher.publisherName}.${e.extensionName}`;
      all.set(id, {
        id,
        publisher: e.publisher.publisherName,
        displayName: (e.publisher.displayName || '').slice(0, 30),
        // The mechanical independence proxy. Verifying a domain requires
        // controlling one, and organisations do it; individuals overwhelmingly
        // do not. Better evidence than me recognising publisher names, which is
        // exactly the kind of recall that produced a wrong number earlier.
        domain: e.publisher.domain || null,
        verified: !!e.publisher.isDomainVerified,
        name: (e.displayName || e.extensionName).slice(0, 44),
        installs: Math.round(st.install || 0),
        rating: st.averagerating ? Math.round(st.averagerating * 10) / 10 : null,
        numRatings: Math.round(st.ratingcount || 0),
        released: (e.releaseDate || '').slice(0, 10),
        updated: (e.lastUpdated || '').slice(0, 10),
      });
    }
    process.stderr.write(`\r  page ${n}/${PAGES} · ${all.size} extensions`);
  } catch (err) {
    console.error(`\n  ${err.message}`);
  }
  await sleep(DELAY_MS);
}
process.stderr.write('\n');

const rows = [...all.values()];
writeFileSync(OUT, JSON.stringify(rows, null, 1));

// --- the same question asked of WordPress ----------------------------------

const byYear = {};
for (const r of rows) {
  const y = r.released.slice(0, 4);
  if (y) byYear[y] = (byYear[y] || 0) + 1;
}
console.log(`\nsample: ${rows.length} extensions, ranked by install count\n`);
console.log('year first released -> count in this top slice');
for (const y of Object.keys(byYear).sort()) {
  if (y >= '2015') console.log(`  ${y} ${String(byYear[y]).padStart(4)} ${'#'.repeat(Math.min(byYear[y], 60))}`);
}

const recent = rows.filter((r) => r.released >= '2023-01').sort((a, b) => b.installs - a.installs);
const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

console.log(`\nentrants first released 2023+ that reached this top slice: ${recent.length}\n`);
for (const r of recent.slice(0, 30)) {
  console.log(
    `  ${fmt(r.installs).padStart(7)}  ${r.released}  ${r.publisher.slice(0, 20).padEnd(21)} ${r.name}`,
  );
}

const pubs = {};
for (const r of recent) pubs[r.publisher] = (pubs[r.publisher] || 0) + 1;
console.log('\npublisher concentration among those entrants:');
for (const [p, n] of Object.entries(pubs).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(n).padStart(2)}  ${p}`);
}
console.log(`\nwritten: ${OUT}`);
