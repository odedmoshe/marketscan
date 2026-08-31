/**
 * Tests for the cohort collector's parser.
 *
 * The hazard on this store is proven and specific: listing pages carry other
 * apps' names, ratings and prices in sidebars, and an earlier parser here
 * attributed one app's numbers to another. So every test below is about
 * *attribution* — not "does it find a value" but "does it find the value
 * belonging to the subject of the page, and nothing else".
 *
 * The fixtures reproduce the real markup shape: JSON-LD for the numbers, a
 * label-then-value text sequence for launch date and categories, and a
 * feature accordion immediately after the categories that must not be read
 * as categories.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseListing, parseLaunched, textNodes } from '../research/shopify-scan.mjs';

const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;

const app = (over = {}) => ({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Test App',
  brand: 'Test Developer',
  aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.6, ratingCount: 214 },
  ...over,
});

const page = (o) => `<!doctype html><html><head>${ld(o.app ?? app())}</head><body>
  <h1>${o.title || 'Test App'}</h1>
  ${o.body || ''}
  <div><span>Launched</span><span>${o.launched || 'March 4, 2021'}</span></div>
  <div><h3>Categories</h3>${(o.categories || ['Store design']).map((c) => `<a href="/categories/x">${c}</a>`).join('')}
    <button>Show features</button><button>Hide features</button>
    <p>Customization</p><p>Page speed</p></div>
</body></html>`;

test('reads the page subject: name, developer, rating, reviews', () => {
  const r = parseListing(page({}), 'test-app');
  assert.equal(r.title, 'Test App');
  assert.equal(r.developer, 'Test Developer');
  assert.equal(r.rating, 4.6);
  assert.equal(r.reviews, 214);
});

test('categories stop at the feature accordion', () => {
  // "Customization" and "Page speed" are feature names that sit immediately
  // after the categories and look exactly like categories. Reading a fixed
  // number of nodes instead of stopping at the boundary would swallow them,
  // and every category count in the study would be inflated.
  const r = parseListing(page({ categories: ['Store design', 'Page builder'] }), 'x');
  assert.deepEqual(r.categories, ['Store design', 'Page builder']);
});

test('categories stop at a pricing block too', () => {
  // Seen live on folio-store-locator: the pricing section, not the feature
  // accordion, is what follows the category list.
  const html = `<!doctype html><html><head>${ld(app())}</head><body>
    <div><h3>Categories</h3><a>Store locator</a>
    <h3>Pricing</h3><p>Choose the plan that best fits your business.</p><p>Premium</p></div>
    </body></html>`;
  assert.deepEqual(parseListing(html, 'x').categories, ['Store locator']);
});

test('a missing launch date is null, not a guess', () => {
  const html = `<!doctype html><html><head>${ld(app())}</head><body><p>no date here</p></body></html>`;
  const r = parseListing(html, 'x');
  assert.equal(r.launched, null);
  assert.deepEqual(r.categories, []);
});

test('an unrated app reports zero reviews and no rating', () => {
  // Real and common: apps launched recently have no aggregateRating at all.
  // Recording rating 0 rather than null would drag every cohort average down
  // with apps that have not been rated rather than rated badly.
  const r = parseListing(page({ app: app({ aggregateRating: undefined }) }), 'x');
  assert.equal(r.rating, null);
  assert.equal(r.reviews, 0);
});

test('a second SoftwareApplication on the page is flagged, not silently used', () => {
  const html = `<!doctype html><html><head>
    ${ld(app({ name: 'The Subject' }))}
    ${ld(app({ name: 'A Sidebar Recommendation', aggregateRating: { ratingValue: 5, ratingCount: 9999 } }))}
    </head><body></body></html>`;
  const r = parseListing(html, 'x');
  assert.equal(r.title, 'The Subject', 'the first block is the page subject');
  assert.equal(r.reviews, 214, 'must not take the sidebar app’s review count');
  assert.equal(r.ambiguous, 2, 'and must say the page was ambiguous');
});

test('malformed JSON-LD does not lose the rest of the page', () => {
  const html = `<!doctype html><html><head>
    <script type="application/ld+json">{ this is not json </script>
    ${ld(app())}</head><body>
    <div><span>Launched</span><span>July 9, 2019</span></div></body></html>`;
  const r = parseListing(html, 'x');
  assert.equal(r.reviews, 214);
  assert.equal(r.launched, '2019-07-09');
});

test('the Built for Shopify badge is detected, and absent when absent', () => {
  assert.equal(parseListing(page({ body: '<span>Built for Shopify</span>' }), 'x').builtForShopify, true);
  assert.equal(parseListing(page({}), 'x').builtForShopify, false);
});

test('textNodes drops script and style content', () => {
  // The proven failure on the Chrome store was matching a date inside inline
  // JavaScript. Same hazard, same guard.
  const n = textNodes('<script>var launched = "January 1, 1999";</script><style>a{}</style><p>Real</p>');
  assert.deepEqual(n, ['Real']);
});

test('a date inside a script cannot become the launch date', () => {
  const html = `<!doctype html><html><head>${ld(app())}
    <script>const x = "Launched"; const y = "January 1, 1999";</script></head>
    <body><div><span>Launched</span><span>May 2, 2024</span></div></body></html>`;
  assert.equal(parseListing(html, 'x').launched, '2024-05-02');
});

test('parseLaunched handles the real format and refuses everything else', () => {
  assert.equal(parseLaunched('September 20, 2012'), '2012-09-20');
  assert.equal(parseLaunched('March 4, 2021'), '2021-03-04');
  assert.equal(parseLaunched('December 31, 1999'), '1999-12-31');
  for (const bad of ['', null, 'Smarch 4, 2021', '2021-03-04', 'March 2021', 'Oh no! That page doesn’t exist.']) {
    assert.equal(parseLaunched(bad), null, `${bad} must not parse`);
  }
});
