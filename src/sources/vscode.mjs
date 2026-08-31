/**
 * VS Code Marketplace, via the public gallery API the editor itself queries.
 *
 * Two caveats that belong in the code rather than in a footnote, because both
 * have already produced a wrong reading once:
 *
 *  1. Install counts here are not comparable to other marketplaces. Auto-updates
 *     and bundling both increment them. They are only meaningful against other
 *     extensions in the same marketplace.
 *  2. `isDomainVerified` is a proxy for "is an organisation," not a fact about
 *     it. Several real companies have not verified. It overstates independence,
 *     so anything derived from it is a ceiling, never a point estimate.
 */

import { request } from '../http.mjs';

const ENDPOINT = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';

const HEADERS = {
  Accept: 'application/json;api-version=3.0-preview.1',
  'Content-Type': 'application/json',
};

// filterType 7 = exact extension name; 8 = target platform. sortBy 4 = installs.
// flags 914 = versions + categories + statistics + latest version only.
function query(criteria, { pageNumber = 1, pageSize = 100, sortBy = 4 } = {}) {
  return JSON.stringify({
    filters: [{ criteria, pageNumber, pageSize, sortBy, sortOrder: 0 }],
    flags: 914,
  });
}

function shape(e) {
  const st = Object.fromEntries((e.statistics || []).map((s) => [s.statisticName, s.value]));
  const id = `${e.publisher.publisherName}.${e.extensionName}`;
  return {
    source: 'vscode',
    id,
    name: e.displayName || e.extensionName,
    author: e.publisher.displayName || e.publisher.publisherName,
    url: `https://marketplace.visualstudio.com/items?itemName=${id}`,
    installs: Math.round(st.install || 0),
    lastUpdated: (e.lastUpdated || '').slice(0, 10) || null,
    released: (e.releaseDate || '').slice(0, 10) || null,
    rating: st.averagerating ? Math.round(st.averagerating * 10) / 10 : null,
    numRatings: Math.round(st.ratingcount || 0),
    version: e.versions?.[0]?.version || null,
    publisherVerified: !!e.publisher.isDomainVerified,
    publisherDomain: e.publisher.domain || null,
  };
}

async function post(body) {
  const res = await request(ENDPOINT, { method: 'POST', headers: HEADERS, body });
  if (!res.ok) throw new Error(`vscode: HTTP ${res.status}`);
  return res.json();
}

export async function lookup(itemName) {
  const d = await post(query([{ filterType: 7, value: itemName }], { pageSize: 1 }));
  const e = d.results?.[0]?.extensions?.[0];
  if (!e) return { source: 'vscode', id: itemName, delisted: true, error: 'not found' };
  return shape(e);
}

/** Top extensions by install count, paged. */
export async function top({ pages = 10, perPage = 100 } = {}) {
  const out = new Map();
  for (let page = 1; page <= pages; page++) {
    const d = await post(
      query([{ filterType: 8, value: 'Microsoft.VisualStudio.Code' }], { pageNumber: page, pageSize: perPage }),
    );
    for (const e of d.results?.[0]?.extensions || []) {
      const r = shape(e);
      out.set(r.id, r);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return [...out.values()];
}
