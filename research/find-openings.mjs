/**
 * Where is there demand that nobody is currently serving?
 *
 * The census answered "can anything new get discovered" and the answer was
 * mostly no. That is a true finding and a useless one on its own, because it
 * does not tell anyone what to do on Monday.
 *
 * This asks the question that has an action attached. For every topic, the whole
 * directory gives three numbers nobody else can put together:
 *
 *   demand   — how many sites run something in this niche (summed install
 *              buckets, so a floor)
 *   supply   — how many plugins are actively maintained here
 *   decay    — how much of that demand is sitting on software that has stopped
 *              shipping
 *
 * A niche where a lot of installed base is parked on abandoned plugins is
 * demand with no current supplier. That is the clearest opening a directory can
 * show you, and it is invisible without the whole population: a popular-head
 * sample only contains the winners, which is precisely the part that is alive.
 *
 * Two honest limits, stated because they bound what the output means:
 *   - Topics are matched on plugin NAME. A plugin whose name does not say what
 *     it does is missed, so counts are floors and the ratios are the signal
 *     rather than the absolute figures.
 *   - "Abandoned" is a release date, not a judgement. Some of these are
 *     finished software that needs nothing.
 *
 * Usage:  node find-openings.mjs [minInstalls]
 */

import { readFileSync } from 'node:fs';

const MIN = Number(process.argv[2] || 1000);
const rows = Object.values(JSON.parse(readFileSync(new URL('../data/wp-directory.json', import.meta.url), 'utf8')));

const clean = (s) =>
  String(s || '').replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const months = (iso) => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return Math.max(0, Math.round((Date.now() - Date.UTC(y, m - 1, d)) / 2629800000));
};
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const M = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

const TOPICS = [
  ['accessibility', /accessib|wcag|\ba11y\b|screen reader/i],
  ['cookie consent / GDPR', /cookie|consent|gdpr|ccpa/i],
  ['AI / LLM / MCP', /\bai\b|\bllm|\bmcp\b|chatgpt|claude|openai|gpt-/i],
  ['image optimisation', /\bwebp\b|\bavif\b|image optimi|compress image|lazy load/i],
  ['backup / migration', /backup|migrat|restore|clone|staging/i],
  ['security / firewall', /security|firewall|malware|antivirus|hardening/i],
  ['login protection', /login|brute.?force|two.?factor|\b2fa\b|otp/i],
  ['spam / captcha', /spam|captcha|honeypot|akismet/i],
  ['forms', /\bform\b|\bforms\b|contact form/i],
  ['SEO / schema', /\bseo\b|schema|meta tag|open graph|sitemap/i],
  ['caching / speed', /cache|caching|speed|performance|minify/i],
  ['translation / multilingual', /translat|multilingual|polylang|\bi18n\b|language switch/i],
  ['booking / appointments', /booking|appointment|reservation|calendar|schedul/i],
  ['invoicing / accounting', /invoice|accounting|bookkeep|receipt|billing/i],
  ['analytics / stats', /analytic|statistic|\bstats\b|tracking|matomo/i],
  ['newsletters / email', /newsletter|email marketing|\bsmtp\b|mailing list/i],
  ['membership / subscriptions', /membership|subscription|restrict content|paywall/i],
  ['galleries / sliders', /gallery|slider|carousel|lightbox|portfolio/i],
  ['maps / store locator', /\bmaps?\b|store locator|geolocat/i],
  ['social feeds', /instagram|facebook feed|twitter|tiktok|social feed|youtube/i],
  ['import / export', /\bimport\b|\bexport\b|\bcsv\b|migration tool/i],
  ['popups / optin', /popup|pop-up|opt-?in|exit intent|lead capture/i],
  ['reviews / testimonials', /review|testimonial|rating|star/i],
  ['chat / support', /live chat|\bchat\b|helpdesk|support ticket|whatsapp/i],
  ['PDF / documents', /\bpdf\b|document|invoice generator|print/i],
  ['woo payments', /payment gateway|checkout|stripe|paypal|payment/i],
];

const scored = TOPICS.map(([name, rx]) => {
  const all = rows.filter((r) => r.up && r.i >= MIN && rx.test(clean(r.n)));
  const demand = all.reduce((s, r) => s + r.i, 0);
  const dead = all.filter((r) => months(r.up) >= 24);
  const alive = all.filter((r) => months(r.up) < 12);
  const deadDemand = dead.reduce((s, r) => s + r.i, 0);
  // The biggest single abandoned plugin in the niche: an installed base sitting
  // on software with nobody behind it, and the most concrete form the
  // opportunity takes.
  const biggestDead = dead.sort((a, b) => b.i - a.i)[0];
  return {
    name,
    plugins: all.length,
    alive: alive.length,
    demand,
    deadDemand,
    deadShare: pct(deadDemand, demand),
    biggestDead,
  };
}).filter((t) => t.plugins >= 8);

console.log(`\nWHERE IS DEMAND PARKED ON DEAD SOFTWARE?`);
console.log(`plugins with ${MIN.toLocaleString()}+ installs, matched by name, from all ${rows.length.toLocaleString()}\n`);
console.log(
  '  ' + 'niche'.padEnd(28) + 'plugins'.padStart(8) + 'alive'.padStart(7) +
    'installed'.padStart(11) + 'on dead'.padStart(9) + '  share  biggest abandoned',
);

for (const t of scored.sort((a, b) => b.deadShare - a.deadShare)) {
  console.log(
    '  ' + t.name.padEnd(28) + String(t.plugins).padStart(8) + String(t.alive).padStart(7) +
      M(t.demand).padStart(11) + M(t.deadDemand).padStart(9) + String(t.deadShare + '%').padStart(7) + '  ' +
      (t.biggestDead ? `${clean(t.biggestDead.n).slice(0, 34)} (${M(t.biggestDead.i)}, ${months(t.biggestDead.up)}mo)` : '—'),
  );
}

console.log('\n  "share" is the fraction of the niche\'s installed base sitting on plugins');
console.log('  that have not shipped in two years. High share = users with nobody behind');
console.log('  their software. Names are a floor: a plugin that does not say what it does');
console.log('  is not counted.\n');
