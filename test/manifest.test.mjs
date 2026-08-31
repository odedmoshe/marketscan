import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseManifest } from '../src/manifest.mjs';

test('parses the three prefixes', () => {
  const { entries, errors } = parseManifest(`
wp:limit-login-attempts
vsx:ms-python.python
shop:judgeme
`);
  assert.equal(errors.length, 0);
  assert.deepEqual(
    entries.map((e) => [e.source, e.id]),
    [
      ['wordpress', 'limit-login-attempts'],
      ['vscode', 'ms-python.python'],
      ['shopify', 'judgeme'],
    ],
  );
});

test('accepts long-form prefixes and is case-insensitive about them', () => {
  const { entries } = parseManifest('WordPress:foo\nVSCODE:a.b\nShopify:c');
  assert.deepEqual(entries.map((e) => e.source), ['wordpress', 'vscode', 'shopify']);
});

test('ignores comments and blank lines', () => {
  const { entries } = parseManifest(`
# client sites, reviewed quarterly

wp:akismet   # keep

`);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, 'akismet');
});

test('one bad line does not stop the rest, and is reported by line number', () => {
  const { entries, errors } = parseManifest('wp:good\nnonsense\nvsx:a.b');
  assert.equal(entries.length, 2);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].lineNo, 2);
  assert.match(errors[0].reason, /missing marketplace prefix/);
});

test('unknown marketplace is an error, not a silent skip', () => {
  const { errors } = parseManifest('figma:something');
  assert.equal(errors.length, 1);
  assert.match(errors[0].reason, /unknown marketplace "figma"/);
});

test('a prefix with no id is an error', () => {
  const { errors } = parseManifest('wp:');
  assert.equal(errors.length, 1);
  assert.match(errors[0].reason, /no id after it/);
});

test('ids containing dots and dashes survive intact', () => {
  const { entries } = parseManifest('vsx:ms-toolsai.jupyter-keymap');
  assert.equal(entries[0].id, 'ms-toolsai.jupyter-keymap');
});

test('duplicates are deduped across prefix spellings', () => {
  const { entries } = parseManifest('wp:akismet\nwordpress:akismet\nwp:akismet');
  assert.equal(entries.length, 1);
});

test('the same id in two marketplaces is not a duplicate', () => {
  const { entries } = parseManifest('wp:foo\nshop:foo');
  assert.equal(entries.length, 2);
});

test('empty and whitespace-only input is not an error', () => {
  assert.deepEqual(parseManifest(''), { entries: [], errors: [] });
  assert.deepEqual(parseManifest('\n\n   \n'), { entries: [], errors: [] });
  assert.deepEqual(parseManifest(null), { entries: [], errors: [] });
});

test('handles CRLF line endings', () => {
  const { entries, errors } = parseManifest('wp:a\r\nvsx:b.c\r\n');
  assert.equal(errors.length, 0);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].id, 'a');
});
