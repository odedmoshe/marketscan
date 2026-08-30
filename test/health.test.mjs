/**
 * The grading logic is the only place in this tool where a judgement is made,
 * so it is the only place that can be wrong in a way nobody notices. Earlier in
 * this project a parser silently produced confident wrong numbers for days;
 * these tests exist so that cannot happen to the verdict.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthsSince, grade, exposure, verdict } from '../src/health.mjs';

const monthsAgo = (n) => {
  const d = new Date(Date.now() - n * 2629800000);
  return d.toISOString().slice(0, 10);
};

test('monthsSince parses the formats these marketplaces actually return', () => {
  // wp.org uses a form Date cannot parse; that is why there is a regex.
  assert.equal(monthsSince('2024-11-28 9:30am GMT'), monthsSince('2024-11-28'));
  assert.equal(monthsSince('2026-08-31T12:00:00Z'), 0);
  assert.equal(monthsSince(null), null);
  assert.equal(monthsSince('not a date'), null);
  assert.equal(monthsSince(''), null);
});

test('monthsSince counts roughly right', () => {
  assert.equal(monthsSince(monthsAgo(0)), 0);
  assert.equal(monthsSince(monthsAgo(13)), 13);
  assert.equal(monthsSince(monthsAgo(41)), 41);
});

test('grade thresholds are the documented ones', () => {
  assert.equal(grade({ months: 0 }), 'active');
  assert.equal(grade({ months: 5 }), 'active');
  assert.equal(grade({ months: 6 }), 'slowing');
  assert.equal(grade({ months: 11 }), 'slowing');
  assert.equal(grade({ months: 12 }), 'stale');
  assert.equal(grade({ months: 23 }), 'stale');
  assert.equal(grade({ months: 24 }), 'abandoned');
  assert.equal(grade({ months: 41 }), 'abandoned');
});

test('missing data grades unknown rather than guessing', () => {
  assert.equal(grade({ months: null }), 'unknown');
  assert.equal(grade({}), 'unknown');
});

test('delisted beats every other signal', () => {
  assert.equal(grade({ months: 0, delisted: true }), 'gone');
});

test('exposure needs BOTH neglect and dependents', () => {
  // Abandoned but nobody uses it: housekeeping, not a finding.
  assert.equal(exposure({ installs: 40, months: 40 }), null);
  // Popular but actively maintained: fine.
  assert.equal(exposure({ installs: 500000, months: 1 }), null);
  // Popular and abandoned: the actual signal.
  const e = exposure({ installs: 300000, months: 41 });
  assert.equal(e.grade, 'abandoned');
  assert.equal(e.installs, 300000);
  assert.match(e.note, /300,000 installs/);
});

test('exposure fires for stale as well as abandoned', () => {
  assert.equal(exposure({ installs: 50000, months: 13 })?.grade, 'stale');
  assert.equal(exposure({ installs: 50000, months: 6 }), null);
});

test('a delisted listing with dependents is reported, and says to replace it', () => {
  const e = exposure({ installs: 80000, months: 2, delisted: true });
  assert.equal(e.grade, 'gone');
  assert.match(e.note, /Replace it/);
});

test('verdict derives months from lastUpdated when not given', () => {
  const v = verdict({ lastUpdated: monthsAgo(41), installs: 300000 });
  assert.equal(v.grade, 'abandoned');
  assert.equal(v.label, 'ABANDONED');
  assert.equal(v.months, 41);
  assert.ok(v.exposure);
});

test('verdict on a healthy popular listing reports no exposure', () => {
  const v = verdict({ lastUpdated: monthsAgo(0), installs: 300000 });
  assert.equal(v.grade, 'active');
  assert.equal(v.exposure, null);
});

test('an unknown date never fabricates an exposure', () => {
  const v = verdict({ lastUpdated: null, installs: 1000000 });
  assert.equal(v.grade, 'unknown');
  assert.equal(v.exposure, null);
});
