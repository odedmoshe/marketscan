/**
 * Add schema.org Dataset and Article markup to the published census, and write
 * a sitemap.
 *
 * The reason is distribution, and it is the one lever available without an
 * account. Google Dataset Search indexes `Dataset` markup specifically, and
 * this genuinely is a dataset — the complete WordPress plugin directory with
 * launch and release dates is not published anywhere else that I can find. A
 * page that only says it has data is invisible to that surface; a page that
 * declares it is discoverable there.
 *
 * Everything asserted in the markup is true and checkable: the distribution
 * URLs resolve to the actual JSON files in the repository, the licence is the
 * repository's real licence, and the record count is computed rather than
 * claimed.
 *
 * Idempotent. Usage:  node add-structured-data.mjs [--dry]
 */

import { readFileSync, writeFileSync } from 'node:fs';

const DRY = process.argv.includes('--dry');
const PAGE = new URL('../docs/index.html', import.meta.url);
const SITEMAP = new URL('../docs/sitemap.xml', import.meta.url);
// The canonical home is the owned domain; this copy is served from GitHub
// Pages but points every identifier at plugincensus.com so search engines
// consolidate on the domain rather than splitting the signal between two.
const SITE = 'https://plugincensus.com/';
const RAW = 'https://raw.githubusercontent.com/odedmoshe/marketscan/main/data/';

const count = (f) => {
  const j = JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
  return Array.isArray(j) ? j.length : Object.keys(j).length;
};

const files = [
  ['wp-directory.json', 'Every plugin in the WordPress directory, with the date added and the date of last release'],
  ['wp-plugins.json', 'The 2,000 most popular WordPress plugins, with support-thread resolution rates'],
  ['vsx-extensions.json', 'VS Code Marketplace extensions, with publisher domain verification'],
  ['shopify-cohort.json', 'Shopify apps sampled from the sitemap, with launch dates'],
  ['app-details.json', 'Shopify apps with pricing tiers and review counts'],
  ['chrome-extensions.json', 'Chrome Web Store extensions sampled from the sitemap'],
];

const total = files.reduce((n, [f]) => n + count(f), 0);
const today = new Date().toISOString().slice(0, 10);

const dataset = {
  '@context': 'https://schema.org',
  '@type': 'Dataset',
  name: 'The Distribution Census: four software marketplaces measured',
  description:
    'Primary data on discovery and maintenance across four software marketplaces. Includes the complete ' +
    'WordPress plugin directory (all 71,091 listings) with the date each plugin was added and the date it ' +
    'last shipped, plus samples of the VS Code Marketplace, the Shopify App Store and the Chrome Web Store. ' +
    'Collected from each marketplace’s own public endpoints. Every published figure is recomputed from ' +
    'the stored data by a script in the repository.',
  url: SITE,
  sameAs: 'https://github.com/odedmoshe/marketscan',
  license: 'https://opensource.org/licenses/MIT',
  isAccessibleForFree: true,
  creator: { '@type': 'Person', name: 'Oded Moshe', url: 'https://github.com/odedmoshe' },
  dateModified: today,
  temporalCoverage: `2004-12-13/${today}`,
  keywords: [
    'WordPress plugins',
    'plugin directory',
    'software marketplace',
    'app store discovery',
    'abandoned software',
    'VS Code extensions',
    'Shopify apps',
    'Chrome extensions',
    'software maintenance',
  ],
  variableMeasured: [
    { '@type': 'PropertyValue', name: 'dateAdded', description: 'When the listing first appeared in the marketplace' },
    { '@type': 'PropertyValue', name: 'lastUpdated', description: 'When the listing last shipped a release' },
    { '@type': 'PropertyValue', name: 'activeInstalls', description: 'Install base, bucketed by the marketplace itself; a floor rather than a count' },
    { '@type': 'PropertyValue', name: 'rating', description: 'Average user rating and the number of ratings behind it' },
    { '@type': 'PropertyValue', name: 'author', description: 'Publisher as the marketplace reports it; does not resolve corporate ownership' },
  ],
  distribution: files.map(([f, desc]) => ({
    '@type': 'DataDownload',
    name: f,
    description: `${desc} (${count(f).toLocaleString()} records)`,
    encodingFormat: 'application/json',
    contentUrl: RAW + f,
  })),
};

const article = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'The Distribution Census',
  description:
    'Four software marketplaces measured directly to answer whether anything new can still get discovered ' +
    'in them. In the WordPress directory the median plugin that reached 10,000 installs since 2024 belonged ' +
    'to an author who already had 420,000.',
  url: SITE,
  author: { '@type': 'Person', name: 'Oded Moshe', url: 'https://github.com/odedmoshe' },
  datePublished: '2026-08-30',
  dateModified: today,
  isBasedOn: { '@id': SITE },
  license: 'https://opensource.org/licenses/MIT',
};

const block =
  `<script type="application/ld+json">\n${JSON.stringify(dataset, null, 2)}\n</script>\n` +
  `<script type="application/ld+json">\n${JSON.stringify(article, null, 2)}\n</script>`;

const A = '<!-- structured-data:start -->';
const B = '<!-- structured-data:end -->';
const eolOf = (s) => (s.includes('\r\n') ? '\r\n' : '\n');
const toEol = (s, eol) => s.replace(/\r?\n/g, eol);

let page = readFileSync(PAGE, 'utf8');
const eol = eolOf(page);
const wrapped = toEol(`${A}\n${block}\n${B}\n`, eol);

if (page.includes(A)) {
  page = page.replace(new RegExp(`${A}[\\s\\S]*?${B}(\\r?\\n)*`), wrapped);
  console.log('replaced existing structured data');
} else {
  const anchor = '</head>';
  if (!page.includes(anchor)) {
    console.error('cannot find </head>');
    process.exit(1);
  }
  page = page.replace(anchor, wrapped + anchor);
  console.log('inserted structured data before </head>');
}

// Validate what is about to be published rather than trusting the serialiser.
for (const m of page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
  JSON.parse(m[1]);
}
console.log(`  ${total.toLocaleString()} records declared across ${files.length} files`);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE}abandoned.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
`;

if (DRY) {
  console.log('dry run — nothing written');
} else {
  writeFileSync(PAGE, page);
  writeFileSync(SITEMAP, sitemap);
  console.log(`wrote docs/index.html (${page.length} bytes) and docs/sitemap.xml`);
}
