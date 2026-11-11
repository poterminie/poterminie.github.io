# PoTerminie — start here

A Polish-language tool site for businesses chasing late invoices. It calculates late-payment
interest and the statutory 40/70/100 EUR compensation at the correct NBP exchange rate, and
generates the demand letter and accounting notes. Goal: cover a Claude Pro subscription
(89 PLN/month) with as little of your time as possible.

**State (10 November 2026):** the site is **live** at
<https://poterminie.github.io/> and maintains itself. **Pro is on sale via Naffy; no sale yet, and nothing else is
connected yet** — that needs a payment account only you can create.

---

## What is already done

| | |
|---|---|
| Calculator | Commercial, statutory (Civil Code) and contractual interest; 40/70/100 EUR compensation; partial payments; weekend/holiday due-date shift (art. 115 KC) |
| Documents | Demand letter (free), interest note and compensation debit note (Pro) — editable preview, print/PDF, Word export |
| Content | 116 pages: one per month since 2020 ("rekompensata 40 euro listopad 2026"), one per half-year of interest rates, yearly tables, guides, legal pages |
| Data | Live from NBP: reference-rate history and 132 month-end EUR rates |
| Tests | 66 checks, including that the holiday calendar matches every NBP publication date since 2015 |
| Automation | GitHub Actions: every working day fetches NBP data, runs the tests, rebuilds, publishes, pings search engines. New month → new page appears by itself |
| Monetisation hooks | Pro unlock (one-time code), tip button, affiliate cards, optional AdSense — each switches on when you paste one link |

Running cost: **0 PLN**. No server, no database, no dependencies.

---

## Already online

- Live site: <https://poterminie.github.io/>
- Code: <https://github.com/poterminie/poterminie.github.io> (public). GitHub Pages is set to
  "GitHub Actions"; the workflow in the Actions tab rebuilds and republishes on every push and
  every working day.
- The `private/` folder (your Pro code and the buyer message) is git-ignored and exists only on
  this machine. Keep a copy of it somewhere safe.
- The GitHub CLI (`gh`) is installed and signed in on this machine, so publishing a change is:

```bash
git add -A
```
```bash
git commit -m "describe the change"
```
```bash
git push
```

> GitHub's terms say Pages is not meant for sites that are *primarily* a shop or SaaS. A free
> calculator with a tip button and an optional unlock is the kind of site people commonly host
> there, but if you would rather not rely on that, use **Cloudflare Pages** instead: connect the
> same repository, build command `node build.mjs`, output directory `dist`, environment variable
> `SITE_URL=https://your-address`. Then add the repository variable `GH_PAGES=off` on GitHub so
> the daily job only refreshes data and Cloudflare rebuilds on each commit.

A custom `.pl` domain is optional. It makes a legal-document tool look more trustworthy and
usually ranks better than a `github.io` address; set it under Settings → Pages and the build
picks it up automatically (then update `siteUrl` in `site.config.json` and re-run
`node scripts/setup.mjs` so the buyer message uses the new address).

---

## The two things only you can do (about 20 minutes, once)

### 1. Connect one way to get paid (10 min)


Open `site.config.json`. Any one of these is enough to start; all three can run together.

**a) Tips — fastest.** Create a profile on a tipping service (in Poland e.g. buycoffee.to, which
takes BLIK; reported fee about 10% in total — check their current price list). Paste the profile
link into `support.url`. The button appears under every result.

**b) Pro unlock — best income per visitor.** I already generated a unique activation code; only
its fingerprint is in the config.
1. Sign up at naffy.io (free; it accepts sellers without a registered business, takes 6% per
   sale, and pays out through a Stripe account you connect — choose "Sole Proprietor (Osoba
   fizyczna)" there). Turn on BLIK.
2. Add a digital product using the ready files in `private/sprzedaz/`:
   `opis-produktu.txt` (title, price, descriptions to paste), `okladka-pro.png` (cover) and
   `PoTerminie-Pro-kod-aktywacyjny.pdf` (the file buyers receive — it contains the code).
3. Paste the product's link into `pro.checkoutUrl`, commit and push.

Regenerate those files any time with `node scripts/make-sales-kit.mjs` (needed after changing
the price, the site address or the code).

Until `pro.checkoutUrl` is filled in, every feature is free and nothing is locked.
Naffy's own FAQ says the VAT question with Stripe concerns only Stripe's fee; confirm your case
with an accountant.

**c) Affiliate cards.** If you join a partner programme that fits the audience (debt collection,
factoring, invoicing/accounting software, business bank accounts), add entries to `affiliates`:

```json
{ "title": "Dłużnik nadal nie płaci?", "text": "Short pitch.", "cta": "Sprawdź", "url": "https://your-affiliate-link" }
```

They render under the results, labelled "Link partnerski" and marked `sponsored nofollow`.

Also fill in `owner.name` and `owner.email`. Polish law requires a site that offers a service to
identify who runs it; they appear on the contact and terms pages. A dedicated mailbox is a good
idea, since the address becomes public.

Commit and push after editing the config — the site republishes itself.

### 2. Tell Google the site exists (10 min)

1. search.google.com/search-console → add the site as a "URL prefix" property.
2. Choose the "HTML tag" method, copy the `content="…"` value into `verification.google`, push.
3. Click Verify, then Sitemaps → submit `sitemap.xml`.

Bing, and the search engines that use Bing's index, are notified automatically after every
deploy (IndexNow) — the first submission of all 114 pages was accepted on launch day.

---

## The income math

Target: **89 PLN/month**.

| Source | Per event (after ~10% fees) | Needed per month |
|---|---|---|
| Pro unlock, 29 PLN | about 26 PLN | **4 sales** |
| Tip, typically 10–15 PLN | about 9–13 PLN | 7–10 tips |
| Affiliate lead | set by the programme — unverified | possibly 1–2 |

Assumptions for Pro (mine, not measured): 40% of visitors enter an invoice, 10% of those want a
Pro feature (a note, a 4th invoice, Word export), 10–15% of those pay. That is roughly
0.4–0.6% of visitors, so **about 700–1,000 visits a month (25–35 a day)** covers the
subscription from Pro alone; tips and affiliate links lower that number.

Why a buyer pays: one overdue invoice entitles them to at least 175.82 PLN compensation this
month. 29 PLN to document it correctly is an easy decision.

Where the visits should come from: 96 month and year pages each answer a query accountants
repeat every month ("rekompensata 40 euro kurs listopad 2026"), 14 half-year pages answer
"odsetki w transakcjach handlowych II półrocze 2026", and the tool pages target the calculator
and template searches. The site adds the next page on its own the day NBP publishes the rate.

**What I cannot promise:** traffic. A new site typically sees almost nothing for the first
4–8 weeks and grows slowly after that, and the main keywords have established competitors
(accounting portals, invoicing software). It may reach the target in a few months, later, or
not at all. The build keeps the downside at zero cost; it does not guarantee the upside.

To speed it up without ongoing work: post the calculator once where Polish freelancers and
bookkeepers ask about late payers (Facebook groups for księgowi / freelancerzy, Wykop, GoldenLine
-style forums, LinkedIn), and ask for the link from any business blog you have access to.

---

## Tax, briefly (Poland)

- Income this small fits **działalność nierejestrowana**: no company and no ZUS while revenue
  stays under 225% of the minimum wage **per quarter** — 10,813.50 PLN in 2026; 11,137.50 PLN in
  2027 if the announced 4,950 PLN minimum wage is confirmed. 89 PLN a month is about 2.5% of that.
- You report it once a year in **PIT-36** and keep a simple list of sales.
- Tips: the tax office and the courts have disagreed on whether they are gifts or income.
  Treating them as income is the cautious choice.
- Being paid by a company in another EU country (Google AdSense, Stripe) can require a
  **VAT-UE** registration even without a business. A Polish platform avoids the question;
  otherwise ask an accountant before switching AdSense on.

This is orientation, not tax advice — confirm your own case with an accountant or the KIS helpline.

---

## Day to day

Nothing. If you want to look under the hood:

```bash
npm run all
```
refreshes NBP data, runs the tests and rebuilds `dist/`.

```bash
npm run serve
```
previews the site at http://localhost:4173.

| File | Purpose |
|---|---|
| `site.config.json` | The only file you edit: address, owner, payment links, verification codes |
| `src/calc.js` | Calculation engine (shared by the site, the build and the tests) |
| `src/app.js`, `src/style.css` | Calculator interface and document generator |
| `build.mjs` | Generates all pages and their text |
| `scripts/update-data.mjs` | Fetches NBP rates into `data/` |
| `scripts/setup.mjs` | Creates the Pro code and the buyer message in `private/` |
| `tests/calc.test.mjs` | Blocks a deploy if data or logic is wrong |
| `.github/workflows/site.yml` | The daily self-maintenance job |

If rates ever look stale, the Actions tab shows whether the daily job failed; a failed job
leaves the previous version of the site online.

## Known limits

- The site is informational, not legal advice, and says so. Document wording follows standard
  Polish templates but has not been reviewed by a lawyer.
- The Pro code is a single shared code checked in the browser. That is simple and needs no
  server, but a determined person could bypass it or pass the code on. At this price and
  audience that is an acceptable trade; a per-buyer licence would need a backend.
- I could not take screenshots in the preview pane, so layout was checked by measuring the page
  at desktop and phone widths rather than by eye. Worth a two-minute look yourself.
