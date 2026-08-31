# marketscan

**Is this marketplace software still maintained?**

```
$ npx github:odedmoshe/marketscan wp limit-login-attempts

Limit Login Attempts  limit-login-attempts
  by Automattic

  ABANDONED — no release in over two years
  last release 41 months ago · v1.7.2
  300k installs · 4.6/5 from 202 · tested to WP 6.2.11

  Roughly 300,000 installs depending on code last touched 41 months ago.
  https://wordpress.org/plugins/limit-login-attempts/
```

That is a login-security plugin on three hundred thousand sites, last touched in
2023, rated 4.6 stars. The marketplace listing does not say any of this anywhere
a site owner would look.

## Why this exists

If you install a package, this problem is solved for you. [deps.dev][],
[ecosyste.ms][] and [libraries.io][] between them index around a hundred package
registries, free, with maintenance signals built in.

Now check what those hundred registries are. npm, Go, PyPI, Maven, Cargo,
Docker, Alpine, Debian, Terraform, CRAN, Hex, postmarketOS. Every one of them is
a registry of things *developers import*. WordPress, Shopify, the VS Code
marketplace, Chrome, Figma — **absent, all of them**.

The reason is structural rather than accidental. Package registries publish
machine-readable manifests, so indexing one is an import. Application
marketplaces publish web pages, so indexing one is a crawler you have to keep
alive forever. That is why the free datasets that do exist go stale: the best
public Shopify app dataset still says "regularly updated" in its README and
carries a `dateModified` of November 2024.

Meanwhile the exposure is real and measurable. **13.8% of the 2,000 most popular
WordPress plugins have had no release in a year** — reproduce it with
`marketscan wp --abandoned --pages 20`. An abandoned listing still converts, so
nothing in the marketplace is incentivised to tell you.

[deps.dev]: https://deps.dev
[ecosyste.ms]: https://ecosyste.ms
[libraries.io]: https://libraries.io

## The research this came out of

[**The Distribution Census**](RESEARCH.md) — three marketplaces measured
directly to answer whether anything new can still get discovered in them.
2,000 WordPress plugins, 1,199 VS Code extensions, 465 Shopify apps.

- 46 WordPress plugins reached 50k installs since 2023. **Four were independent**,
  and all four already sold Elementor or Gutenberg addons.
- The independent share of new VS Code entrants **halved**, 73% → 37%, in three years.
- **34.7%** of Shopify apps rated 4.8★ or higher still sit under 25 reviews.

Everything is reproducible: the collectors and the raw datasets are in
[`research/`](research/) and [`data/`](data/). `node research/verify-census.mjs`
recomputes every published figure from the stored data and exits non-zero if any
of them drifts.

## Install

Not on npm yet, so run it straight from this repo:

```sh
npx github:odedmoshe/marketscan wp <plugin-slug>
npx github:odedmoshe/marketscan vsx <publisher.extension>
```

Or clone it:

```sh
git clone https://github.com/odedmoshe/marketscan
cd marketscan && node src/index.mjs wp <plugin-slug>
```

Requires Node 18 or newer. No dependencies, no API keys, no account, no
telemetry. Every source is a public, documented, key-free endpoint.

## Use

Check one thing:

```sh
marketscan wp   woocommerce-pdf-invoices-packing-slips
marketscan vsx  ms-python.python
marketscan shop judgeme
marketscan cr   ddkjiahejlhfcafbddmgiahcphecmpfh
```

Check a whole list — the actual job, if you look after more than one site:

```sh
marketscan audit plugins.txt
```

```
Audit — plugins.txt
  5 listings checked

  ABANDONED  41mo  Limit Login Attempts                wp:limit-login-attempts
  ABANDONED  61mo  Easy Google Fonts                   wp:easy-google-fonts
  UNKNOWN       -  Judge.me Product Reviews App        shop:judgeme
  ACTIVE      0mo  Akismet Anti-spam                   wp:akismet
  ACTIVE      0mo  Python                              vsx:ms-python.python
  SKIPPED          line 7: unknown marketplace "figma"

  2 of 5 abandoned or delisted.
```

The manifest is one entry per line; `#` comments and blank lines are ignored:

```
wp:limit-login-attempts
vsx:ms-python.python
shop:judgeme
cr:ddkjiahejlhfcafbddmgiahcphecmpfh
```

**`audit` exits 1 if anything is `ABANDONED` or `DELISTED`**, so it drops
straight into CI or a cron job. `STALE` deliberately does *not* fail the build —
twelve months is normal for a small, finished plugin, and a check that cries
wolf gets switched off within a week. Add `--json` for machine-readable output.

A malformed line is reported by line number and skipped; a listing that fails to
respond is reported as an error and the audit continues. One bad entry never
stops a run of forty.

Find what is popular and unmaintained:

```sh
marketscan wp  --abandoned --pages 20
marketscan vsx --abandoned
```

```
Depended on, but no longer maintained — wordpress (120 found in 1200 scanned)
  installs   stale   rating   name
     1.0M   12mo    4.6   Regenerate Thumbnails
     400k   19mo    1.5   WooCommerce Legacy REST API
     300k   41mo    4.6   Limit Login Attempts
     100k   61mo    4.6   Easy Google Fonts
```

## What the grades mean

Time since last release. Nothing else.

| Grade | Last release |
|---|---|
| `ACTIVE` | under 6 months |
| `SLOWING` | 6–12 months |
| `STALE` | 12–24 months |
| `ABANDONED` | over 24 months |
| `DELISTED` | removed from the marketplace |
| `UNKNOWN` | the marketplace published too little to judge |

The cutoffs are blunt on purpose, and they are printed so you can disagree with
them. A hidden weighted composite would be no more accurate and much harder to
argue with.

**This measures maintenance, not quality.** A small, finished, well-loved tool
that genuinely needed no changes in three years grades `ABANDONED` and may still
be exactly the right choice. The grade is the beginning of a judgement, not the
end of one. That is why every result prints the evidence next to the verdict.

The one combination worth acting on is **neglect plus dependents**: an abandoned
plugin nobody installed is housekeeping, and a popular plugin under active
development is fine. Only listings that are both popular *and* unmaintained
raise the highlighted warning.

## Sources and their caveats

| Marketplace | Source | Caveat |
|---|---|---|
| WordPress.org | `api.wordpress.org` plugin API | Installed counts are bucketed by the directory (`300k`, not `312,481`) |
| VS Code | the public gallery API the editor itself queries | Install counts are inflated by auto-updates and bundling; compare within this marketplace only |
| Shopify | schema.org JSON-LD embedded in the listing page | **No last-updated date exists**, so listings grade `UNKNOWN` and there is no `--abandoned` view |
| Chrome Web Store | server-rendered listing HTML | User counts are heavily rounded by the store (`18,000,000`); a rating is served without a ratings count; no endpoint enumerates popular extensions, so lookups only |

### On Shopify grading `UNKNOWN`

That is a fact about the store, not a gap in this tool. The App Store publishes
no last-updated or launch date anywhere in the listing markup, so a maintenance
grade cannot be computed honestly. Review volume and whether the listing still
resolves are the only signals it exposes, and those are what you get.

Inventing a grade from something adjacent — last review date, say — would
produce a number that looks like the others and means something different. The
whole tool is worth less if one column silently changes definition.

`isDomainVerified` on a VS Code publisher is reported as `unverified publisher`
where it applies. Treat it as a proxy for "is an organisation", not a fact —
several real companies have never verified a domain, so it overstates
independence in one known direction.

## Library use

```js
import { verdict } from 'marketscan/health';

verdict({ lastUpdated: '2023-04-02', installs: 300000 });
// { grade: 'abandoned', label: 'ABANDONED', months: 41, exposure: { … } }
```

## Contributing

The obvious gaps are Figma and Obsidian. Neither has a public API, which is the
whole reason neither is indexed anywhere.

Shopify and Chrome are worth reading first if you are adding one. Neither has an
API, and both were assumed to need a headless browser. Neither does: Shopify
embeds schema.org JSON-LD server-side, and Chrome server-renders its fields as
plain text. Check what the server actually returns before reaching for a
browser — it is more than people assume.

Two traps found the hard way, both in `src/sources/chrome.mjs`:

- A removed Chrome extension does **not** 404. It answers `200` and redirects to
  the store homepage, so existence must be checked against the final URL.
- Match against visible text, never raw HTML. The first probe of the Chrome
  store "found" an updated date that was a string inside inline JavaScript.

Run the tests with `npm test`. The grading logic is the only place in this tool
that makes a judgement, so it is the only place that can be quietly wrong; it is
covered accordingly.

## License

MIT.
