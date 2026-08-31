/**
 * The Shopify parser is tested harder than the other two sources because it is
 * the only one reading a page rather than an API, and because the previous
 * attempt at reading this exact store produced confidently wrong numbers for
 * days — an app with zero reviews recorded as having 2,894, taken from a
 * different app in the sidebar.
 *
 * The JSON-LD below is the real payload served by apps.shopify.com/judgeme,
 * captured 2026-08-31 and trimmed. Ground truth for that listing at capture
 * time was 5.0 / 44,355, independently confirmed by a separate collector.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/sources/shopify.mjs';
import { verdict } from '../src/health.mjs';

const REAL = `{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Judge.me Product Reviews App","description":"Send unlimited, automatic review requests.","image":["https://cdn.shopify.com/x.png"],"operatingSystem":"Shopify","applicationCategory":"DeveloperApplication","brand":"Judge.me","aggregateRating":{"@type":"AggregateRating","ratingValue":5.0,"ratingCount":44355}}`;

const page = (...jsonBlocks) =>
  `<html><head>${jsonBlocks
    .map((b) => `<script type="application/ld+json">${b}</script>`)
    .join('')}</head><body>irrelevant text 2,894 reviews</body></html>`;

test('extracts the real listing exactly', () => {
  const r = parse(page(REAL), 'judgeme');
  assert.equal(r.name, 'Judge.me Product Reviews App');
  assert.equal(r.author, 'Judge.me');
  assert.equal(r.rating, 5);
  assert.equal(r.numRatings, 44355);
  assert.equal(r.id, 'judgeme');
  assert.equal(r.url, 'https://apps.shopify.com/judgeme');
});

test('never reports a maintenance date, because the store publishes none', () => {
  const r = parse(page(REAL), 'judgeme');
  assert.equal(r.lastUpdated, null);
  // And the grade that follows must be honest about that rather than invented.
  const v = verdict(r);
  assert.equal(v.grade, 'unknown');
  assert.equal(v.exposure, null);
});

test('does not report review count as an install count', () => {
  const r = parse(page(REAL), 'judgeme');
  assert.equal(r.installs, 0);
  assert.equal(r.numRatings, 44355);
});

test('ignores body text that looks like review counts', () => {
  // The old parser's actual failure mode: a number in surrounding page text.
  const r = parse(page(REAL), 'judgeme');
  assert.notEqual(r.numRatings, 2894);
});

test('selects by @type, not by position', () => {
  const breadcrumb = `{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}`;
  const org = `{"@context":"https://schema.org","@type":"Organization","name":"Shopify"}`;
  const r = parse(page(breadcrumb, org, REAL), 'judgeme');
  assert.equal(r.name, 'Judge.me Product Reviews App');
  assert.equal(r.numRatings, 44355);
});

test('flags a page describing more than one app instead of guessing', () => {
  const other = `{"@type":"SoftwareApplication","name":"Some Sidebar App","brand":"Other","aggregateRating":{"ratingValue":4.1,"ratingCount":2894}}`;
  const r = parse(page(REAL, other), 'judgeme');
  assert.equal(r.ambiguous, true);
  assert.equal(r.subjectsOnPage, 2);
});

test('a single-subject page is not flagged ambiguous', () => {
  const r = parse(page(REAL), 'judgeme');
  assert.equal(r.ambiguous, undefined);
});

test('survives a malformed block and still finds a later valid one', () => {
  const r = parse(page('{ not json at all', REAL), 'judgeme');
  assert.equal(r.numRatings, 44355);
});

test('reads an @graph container', () => {
  const graph = `{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},${REAL}]}`;
  const r = parse(page(graph), 'judgeme');
  assert.equal(r.name, 'Judge.me Product Reviews App');
});

test('accepts brand as an object as well as a string', () => {
  const objBrand = REAL.replace('"brand":"Judge.me"', '"brand":{"@type":"Brand","name":"Judge.me"}');
  assert.equal(parse(page(objBrand), 'judgeme').author, 'Judge.me');
});

test('handles an array @type', () => {
  const arr = REAL.replace('"@type":"SoftwareApplication"', '"@type":["SoftwareApplication","Product"]');
  assert.equal(parse(page(arr), 'judgeme').numRatings, 44355);
});

test('returns null rather than a half-filled record when there is no app', () => {
  assert.equal(parse(page(`{"@type":"BreadcrumbList"}`), 'x'), null);
  assert.equal(parse('<html><body>nothing here</body></html>', 'x'), null);
});

test('missing aggregateRating yields nulls, not zeros pretending to be data', () => {
  const noRating = `{"@type":"SoftwareApplication","name":"New App","brand":"Someone"}`;
  const r = parse(page(noRating), 'new-app');
  assert.equal(r.rating, null);
  assert.equal(r.numRatings, 0);
  assert.equal(r.name, 'New App');
});
