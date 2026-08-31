/**
 * Chrome is the only source reading visible prose rather than a structured
 * field, so it gets the most adversarial tests. The specific hazard is proven:
 * the first probe of this store matched an "updated" field inside inline
 * JavaScript that did not exist in the page's actual content.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, toIso, visibleText, isStoreShell } from '../src/sources/chrome.mjs';
import { verdict } from '../src/health.mjs';

// Shaped after the real served page for uBlock Origin Lite, 2026-08-31.
const PAGE = `<html><head><title>uBlock Origin Lite - Chrome Web Store</title>
<script>var x = "Version)[ \\/]?(\\S+)/.exec(a)"; var updated="Updated January 1, 1999";</script>
</head><body>
<div>uBlock Origin Lite</div><div>4.5 out of 5</div><div>18,000,000 users</div>
<div>Version 2026.825.1619</div><div>Updated August 25, 2026</div>
<div>Flag concern</div><div>Offered by raymondhill Size 9.2MiB</div>
</body></html>`;

test('reads the real field set', () => {
  const r = parse(PAGE, 'ddkjiahejlhfcafbddmgiahcphecmpfh');
  assert.equal(r.name, 'uBlock Origin Lite');
  assert.equal(r.installs, 18000000);
  assert.equal(r.rating, 4.5);
  assert.equal(r.version, '2026.825.1619');
  assert.equal(r.size, '9.2MiB');
  assert.equal(r.lastUpdated, '2026-08-25');
  assert.equal(r.author, 'raymondhill');
});

test('does NOT read fields out of inline JavaScript', () => {
  // The script block above contains "Updated January 1, 1999". If script
  // stripping regresses, this is the test that catches it.
  const r = parse(PAGE, 'x');
  assert.equal(r.lastUpdated, '2026-08-25');
  assert.notEqual(r.lastUpdated, '1999-01-01');
});

test('visibleText removes script and style bodies entirely', () => {
  const t = visibleText('<style>.a{color:red}</style><script>var a=1</script><p>kept</p>');
  assert.equal(t, 'kept');
});

test('the parsed date drives a real maintenance grade', () => {
  const r = parse(PAGE.replace('August 25, 2026', 'March 3, 2021'), 'x');
  assert.equal(r.lastUpdated, '2021-03-03');
  const v = verdict(r);
  assert.equal(v.grade, 'abandoned');
  assert.ok(v.exposure, 'an abandoned extension with 18M users must raise exposure');
});

test('toIso handles every month and rejects nonsense', () => {
  assert.equal(toIso('January 1, 2020'), '2020-01-01');
  assert.equal(toIso('September 9, 2024'), '2024-09-09');
  assert.equal(toIso('December 31, 1999'), '1999-12-31');
  assert.equal(toIso('Smarch 4, 2020'), null);
  assert.equal(toIso('2020-01-01'), null);
  assert.equal(toIso(''), null);
  assert.equal(toIso(null), null);
});

test('title suffix is stripped, and a missing title falls back to the id', () => {
  assert.equal(parse('<title>Dark Reader - Chrome Web Store</title>', 'abc').name, 'Dark Reader');
  assert.equal(parse('<html><body>nothing</body></html>', 'abc').name, 'abc');
});

test('missing fields yield nulls and zeros, never invented values', () => {
  const r = parse('<html><title>Bare - Chrome Web Store</title><body>nothing useful</body></html>', 'abc');
  assert.equal(r.lastUpdated, null);
  assert.equal(r.rating, null);
  assert.equal(r.installs, 0);
  assert.equal(r.version, null);
  // And an absent date must grade unknown rather than active.
  assert.equal(verdict(r).grade, 'unknown');
});

test('user counts with commas parse to numbers', () => {
  assert.equal(parse('<body>7,000,000 users</body>', 'x').installs, 7000000);
  assert.equal(parse('<body>512 users</body>', 'x').installs, 512);
});

test('developer capture stops at the next label', () => {
  const r = parse('<body>Offered by Some Dev Version 1.2.3</body>', 'x');
  assert.equal(r.author, 'Some Dev');
});

// --- the generic shell -----------------------------------------------------
// Found by sampling 500 extensions: a REMOVED extension does not 404 and does
// not redirect away from /detail/. It keeps a /detail/ URL with the slug
// "empty-title" and is served this shell. Seven of 500 were silently recorded
// as live-with-no-date before this was caught.

const SHELL = `<html><head><title>Chrome Web Store</title></head><body>
<style>body,html{height:100%;overflow:hidden}</style></body></html>`;

test('the generic store shell is recognised, not parsed as a listing', () => {
  assert.equal(isStoreShell(SHELL), true);
});

test('a real listing is not mistaken for the shell', () => {
  assert.equal(isStoreShell(PAGE), false);
});

test('a shell-titled page that still has real fields is not a shell', () => {
  // Defensive: the title alone must not be enough to discard a live listing.
  const odd = `<html><head><title>Chrome Web Store</title></head><body>
    <div>18,000,000 users</div><div>Updated August 25, 2026</div></body></html>`;
  assert.equal(isStoreShell(odd), false);
});

test('parsing the shell yields no usable fields', () => {
  const r = parse(SHELL, 'abc');
  assert.equal(r.lastUpdated, null);
  assert.equal(r.installs, 0);
  assert.equal(r.rating, null);
});
