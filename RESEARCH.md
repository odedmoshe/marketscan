# The Distribution Census

**Three software marketplaces, measured directly. August 2026.**

The question was narrow: *can something new still get found in these places?*
The usual way to answer it is to read other people's posts about other people's
outcomes, which is survivorship bias with a citation. So this measures the
marketplaces' own public endpoints instead.

| | |
|---|---|
| WordPress | **9%** of plugins reaching 50k installs since 2023 were independent |
| VS Code | **37%** of new entrants are independent — down from **73%** before 2023 |
| Shopify | **34.7%** of apps rated 4.8★+ still sit under 25 reviews |

Sample: 2,000 WordPress plugins, 1,199 VS Code extensions, 465 Shopify apps
(n = 3,664). Every figure below is recomputed from the stored data by
[`verify-census.mjs`](https://github.com/odedmoshe/marketscan) before publication.

---

## Method

- **WordPress** — `api.wordpress.org/plugins/info/1.2`, `browse=popular`, 2,000
  records. Publisher attribution taken from the API's own `author` field.
- **VS Code** — the public gallery API the editor itself queries, ranked by
  install count, 1,199 records.
- **Shopify** — crawled from the store sitemap in file order, 465 records.
  Sitemap order is not ranked, so this is a sample of the store rather than a
  sample of its winners. Category pages would have skewed every figure upward.

One methodological note that changed a conclusion. My first pass at classifying
VS Code publishers worked by recognising company names — that is recall, and
recall is how you end up confidently wrong. The gallery API publishes
`isDomainVerified`; verifying a domain requires controlling one, and
organisations do it while individuals mostly do not. Mechanical, checkable, and
independent of what I happen to know.

---

## WordPress: the directory is not the distribution

71,064 plugins. Free to list, no review fee. The strongest possible case for
"marketplaces distribute".

**46 plugins added since January 2023 have reached 50,000+ active installs.**

| Who | n | How they actually got there |
|---|---|---|
| Existing large portfolios | 21 | Cross-promotion into an install base they already owned — Softaculous 6, Elementor 5, Brainstorm Force 5, Awesome Motive 4, AIOSEO 1 |
| The platform itself | 12 | WP Performance Team, WooCommerce, WordPress.org, Automattic |
| Established companies entering | 5 | Omnisend, LatePoint, WP All Import, erecht24, OneTap — they brought an audience |
| Hosting companies | 4 | Bundled or auto-installed onto customer sites — Hostinger, SiteGround, XServer |
| **Plausibly independent** | **4** | And all four already sold Elementor or Gutenberg addons |

Not one entrant reached scale on directory search alone.

The directory is also ossifying. Counting the top 2,000 by year added: roughly
**180/yr** for 2016–2018, **68/yr** for 2021–2022, **29/yr** for 2023–2026.

> **The directory is not the distribution. Hosting deals and portfolio
> cross-promotion are. The directory is where they get cashed in.**

**Also measured:** 13.8% of the top 2,000 plugins have had no release in twelve
months. Reproduce with `marketscan wp --abandoned --pages 20`.

**Filed as an observation, not an opportunity:** among plugins with very large
install bases, the worst-rated are overwhelmingly *first-party integrations from
large companies*. WooCommerce Tax sits at 2.0★ on 500k installs; Meta for
WooCommerce at 2.1★ on 400k; WordPress Importer at 3.1★ on two million with 0%
of support threads resolved. People install them because they are official.

---

## VS Code: the one door still open

134,919 extensions, developers as users, reputation travelling through GitHub
rather than hosting deals. This was the test that could break the thesis, and it
partly did.

Of **112** extensions first released since January 2023 that reached the top
slice by installs: **63%** belong to domain-verified organisations, **37%** do
not. Against WordPress's 9%, roughly four times more open.

Then the same measurement on the earlier cohort:

| Cohort | Independent share |
|---|---|
| Released before 2023 | **73%** |
| Released 2023 onward | **37%** |

The door is open and closing. What came through it is narrow: essentially
everything independent that reached scale is either **free open-source developer
tooling** — Biome, BasedPyright, Pretty TypeScript Errors, opencode, DevDb — or
an AI assistant wrapper. The clearest cold start in any marketplace here is
Cline, which went from nothing in 2024 to 5.2M installs and is now
domain-verified, because it became a company.

The uncomfortable part: **the channel that still works distributes *free*
things.** Almost none of the independent winners charge for the extension. This
is a route to adoption, not to revenue.

---

## Shopify: quality is not the constraint

465 apps sampled from the sitemap. **45.6% sit under 25 reviews** — the
threshold below which listings are widely reported to convert at 1–2% rather
than 5–8%. Long tails are long; that alone is unremarkable.

The finding is what happens when you filter for the good ones. Among apps with
at least five reviews, **45.8% are rated 4.8★ or higher** — and **34.7% of those
excellent apps are themselves under 25 reviews.**

> **If a third of excellent apps stay invisible, quality is not the binding
> constraint. Discovery is.**

Consistent surrounding economics: **96.1%** offer a free plan or free install,
the median paid tier is **$20/month**, and **15.1%** carry the "Built for
Shopify" badge. 53 developers in the sample ship more than one app.

---

## What it adds up to

Three marketplaces, measured independently, produce one shape. Discovery is
captured by parties who arrived with an audience — a hosting relationship, an
existing portfolio, a platform to promote from. **The marketplace is not where
distribution is acquired. It is the settlement layer where distribution acquired
elsewhere is converted into installs.**

The single exception is free, open-source developer tooling, and that exception
is measurably narrowing.

The corollary is the part that costs people years: **building a better product
is not a distribution strategy** in any of these three places. If you are
choosing where to spend a year, the first question is not *what should I build* —
it is *which of these doors is open to me specifically.*

---

## What would make this wrong

- **VS Code install counts are inflated** and not comparable across
  marketplaces — auto-updates and bundling both increment them. Only the
  within-marketplace cohort comparison is load-bearing.
- **`isDomainVerified` overstates independence.** Alibaba Cloud, Tencent Cloud,
  Moonshot AI and Eclipse are organisations that have not verified a domain.
  Read 37% as a ceiling, not a point estimate.
- **WordPress install counts are bucketed** by the directory — it reports
  `300,000`, never `312,481` — so thresholds near a bucket edge are approximate.
- **Two figures in earlier drafts were wrong and are corrected here.** A parser
  bug read Shopify review counts from a page's sidebar, attributing other apps'
  numbers to the app being measured; extraction now reads labelled fields and is
  checked against four independently verified apps. Separately, the "4.8★+"
  share was published at ~37% on a 65-app sample and is **45.8%** at 465 —
  under-powered rather than corrupted.
- **One figure was withdrawn rather than corrected.** "The top 10 apps hold 65%
  of all reviews" became 57.9% at the larger sample, because the top 10 of 465
  is mechanically a smaller slice than the top 10 of 65. It was measuring the
  sample, not the market. Nothing computed on fewer than ~200 records appears
  here, and every percentage carries its n.
- **These are three marketplaces, not all of them.** Chrome Web Store, Figma,
  Obsidian and Slack are unmeasured. Each has a different discovery mechanism
  and could plausibly behave differently.

---

*Collected August 2026 from public, key-free endpoints, with crawling limited to
what each `robots.txt` permits. Collection code is in this repository.*
