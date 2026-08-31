/**
 * WordPress.org plugin directory.
 *
 * The richest of the three sources: wp.org publishes installed base, last
 * release, support-thread resolution and tested-up-to version, all key-free.
 * That combination is why the abandonment signal is sharpest here.
 */

import { request } from '../http.mjs';

const API = 'https://api.wordpress.org/plugins/info/1.2/';

/** The API takes PHP-style bracket params and they must be percent-encoded. */
function qs(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#039': "'", '#8211': '–', '#8212': '—', nbsp: ' ' };

/** wp.org returns HTML in name and author, entity-encoded. Both are displayed raw. */
const clean = (s) =>
  String(s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? m)
    .trim();

function shape(p) {
  const threads = p.support_threads || 0;
  const resolved = p.support_threads_resolved || 0;
  return {
    source: 'wordpress',
    id: p.slug,
    name: clean(p.name),
    author: clean(p.author),
    url: `https://wordpress.org/plugins/${p.slug}/`,
    installs: p.active_installs || 0,
    lastUpdated: p.last_updated || null,
    // wp.org reports rating out of 100.
    rating: p.rating ? Math.round((p.rating / 20) * 10) / 10 : null,
    numRatings: p.num_ratings || 0,
    version: p.version || null,
    // "Tested up to" is the field that betrays abandonment even when a
    // maintainer bumps the version for appearances: it requires actually
    // checking against a current WordPress release.
    testedUpTo: p.tested || null,
    requiresPhp: p.requires_php || null,
    support: threads ? { threads, resolved, resolveRate: Math.round((resolved / threads) * 100) } : null,
  };
}

export async function lookup(slug) {
  const res = await request(`${API}?${qs({ action: 'plugin_information', 'request[slug]': slug })}`);

  // A slug the directory does not serve is the single most important result this
  // tool can return — a plugin pulled for a security issue looks exactly like a
  // typo from here, and the sites running it are the ones most exposed. So 404
  // is a finding, not a failure. The caller is told which of the two it might be
  // rather than being handed a stack trace.
  if (res.status === 404) {
    return {
      source: 'wordpress',
      id: slug,
      url: `https://wordpress.org/plugins/${slug}/`,
      delisted: true,
      error: 'not in the directory — either removed, or the slug is wrong',
    };
  }
  if (!res.ok) throw new Error(`wordpress: HTTP ${res.status} for "${slug}"`);

  const p = await res.json();
  // Some error shapes still arrive with a 200.
  if (!p || p.error) {
    return { source: 'wordpress', id: slug, delisted: true, error: String(p?.error || 'not found') };
  }
  return shape(p);
}

/** Popular plugins, paged. Used to build the dataset and the --abandoned view. */
export async function popular({ pages = 10, perPage = 100 } = {}) {
  const out = new Map();
  for (let page = 1; page <= pages; page++) {
    const res = await request(
      `${API}?${qs({ action: 'query_plugins', 'request[browse]': 'popular', 'request[page]': page, 'request[per_page]': perPage })}`,
    );
    if (!res.ok) throw new Error(`wordpress: HTTP ${res.status} on page ${page}`);
    const d = await res.json();
    for (const p of d.plugins || []) out.set(p.slug, shape(p));
    await new Promise((r) => setTimeout(r, 700));
  }
  return [...out.values()];
}
