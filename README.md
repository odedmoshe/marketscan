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

Meanwhile the exposure is real and measurable. **10% of the twelve hundred most
popular WordPress plugins have had no release in a year.** An abandoned listing
still converts, so nothing in the marketplace is incentivised to tell you.

[deps.dev]: https://deps.dev
[ecosyste.ms]: https://ecosyste.ms
[libraries.io]: https://libraries.io

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
marketscan wp woocommerce-pdf-invoices-packing-slips
marketscan vsx ms-python.python
```

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

The obvious gaps are Chrome Web Store, Figma, Obsidian and Shopify. Each needs a
crawler rather than an API, which is the whole reason none of them are indexed
anywhere — so each is real work and each is welcome.

Run the tests with `npm test`. The grading logic is the only place in this tool
that makes a judgement, so it is the only place that can be quietly wrong; it is
covered accordingly.

## License

MIT.
