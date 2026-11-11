#!/usr/bin/env node
// Generator statycznej strony. Zero zależności: `node build.mjs` -> katalog dist/.
// Adres strony: zmienna SITE_URL (ustawia ją GitHub Actions) albo "siteUrl" w site.config.json.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import './src/calc.js';

const C = globalThis.PTCalc;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const readJson = async (p) => JSON.parse(await readFile(path.resolve(ROOT, p), 'utf8'));

const cfg = await readJson(process.env.SITE_CONFIG || 'site.config.json');   // SITE_CONFIG: inny plik konfiguracji, np. do testów
const ref = await readJson('data/ref-rates.json');
const eur = await readJson('data/eur-month-end.json');
const meta = await readJson('data/meta.json');
const E = C.create({ ref, eur });
const TODAY = C.todayWarsaw();
const YEAR = +TODAY.slice(0, 4);

const SITE_URL = String(process.env.SITE_URL || cfg.siteUrl || '').replace(/\/+$/, '');
let BASE = process.env.BASE_PATH || '';
if (!BASE && SITE_URL) { try { BASE = new URL(SITE_URL).pathname; } catch { /* zły adres */ } }
BASE = BASE.replace(/\/+$/, '');
const NAME = cfg.siteName || 'PoTerminie';
const PRO_ON = !!(cfg.pro?.checkoutUrl && cfg.pro?.codeHash);
const PRICE = cfg.pro?.priceLabel || '29 zł';
const FREE_INV = cfg.pro?.freeInvoices || 3;
const ACT = 'ustawy z dnia 8 marca 2013 r. o przeciwdziałaniu nadmiernym opóźnieniom w transakcjach handlowych';

/* ---------- pomocnicze ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const u = (p) => BASE + p;
const abs = (p) => (SITE_URL ? SITE_URL + p : '');
const pct = (r) => C.fmtRate(r) + '%';
const zl = (gr) => C.fmtMoney(gr) + '\u00a0zł';
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const strip = (h) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const interest = (amountGr, rate, days) => Math.round(amountGr * Math.round(rate * 100) * days / 3650000);
const eurPln = (amt, mid) => Math.round(amt * Math.round(mid * 10000) / 100);
const link = (p, text, attrs = '') => `<a href="${u(p)}"${attrs}>${text}</a>`;

/* ---------- dane pochodne ---------- */
const eurKeys = Object.keys(eur).sort();
const months = [];                       // miesiące wymagalności, dla których znamy kurs
for (const key of eurKeys) {
  const ym = C.nextMonthKey(key);
  if (ym < '2020-01') continue;
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  months.push({
    ym, y, m, rate: eur[key], slug: `${C.M_SLUG[m - 1]}-${y}`, path: `/rekompensata-40-euro/${C.M_SLUG[m - 1]}-${y}/`,
    name: `${C.M_NOM[m - 1]} ${y}`, loc: `${C.M_LOC[m - 1]} ${y}\u00a0r.`, gen: `${C.M_GEN[m - 1]} ${y}\u00a0r.`,
    p40: eurPln(40, eur[key].mid), p70: eurPln(70, eur[key].mid), p100: eurPln(100, eur[key].mid)
  });
}
const monthByYm = Object.fromEntries(months.map((x) => [x.ym, x]));
const curMonth = monthByYm[TODAY.slice(0, 7)] || months[months.length - 1];
const nextYm = C.nextMonthKey(months[months.length - 1].ym);
const nextRateDay = C.lastBusinessDay(+months[months.length - 1].ym.slice(0, 4), +months[months.length - 1].ym.slice(5, 7));
const compYears = [...new Set(months.map((x) => x.y))];

const halves = [];
for (let y = 2016; y <= YEAR; y++) for (const h of [1, 2]) {
  const start = `${y}-${h === 1 ? '01' : '07'}-01`;
  if (start > TODAY) continue;
  const end = `${y}-${h === 1 ? '06-30' : '12-31'}`;
  halves.push({
    y, h, start, end, days: C.diff(start, end) + 1, ref: E.refOn(start), rate: E.commercialRate(start, false), rateH: E.commercialRate(start, true),
    label: `${h === 1 ? 'I' : 'II'} półrocze ${y}`, slug: `${y}-${h === 1 ? 'i' : 'ii'}-polrocze`,
    path: y >= 2020 ? `/odsetki-w-transakcjach-handlowych/${y}-${h === 1 ? 'i' : 'ii'}-polrocze/` : null, current: TODAY >= start && TODAY <= end
  });
}
const curHalf = halves[halves.length - 1];
const now = E.currentRates(TODAY);
const refList = E.refList();
const refPeriods = refList.map((r, i) => ({ from: r.from < '2016-01-01' ? '2016-01-01' : r.from, to: refList[i + 1] ? C.addDays(refList[i + 1].from, -1) : null, ref: r.rate, rate: E.statutoryRate(r.from), max: E.maxRate(r.from) }));
const curRefFrom = refList[refList.length - 1].from;

/* ---------- zasoby (skróty treści do odświeżania pamięci podręcznej) ---------- */
const assets = {};
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10);
const publicCfg = {
  siteName: NAME, siteUrl: SITE_URL,
  pro: { enabled: PRO_ON, checkoutUrl: PRO_ON ? cfg.pro.checkoutUrl : '', priceLabel: PRICE, codeHash: PRO_ON ? cfg.pro.codeHash : '', freeInvoices: FREE_INV },
  support: { url: cfg.support?.url || '', label: cfg.support?.label || '' },
  affiliates: (cfg.affiliates || []).filter((a) => a && a.url && a.title)
};
const files = {
  'assets/calc.js': await readFile(path.join(ROOT, 'src/calc.js'), 'utf8'),
  'assets/app.js': await readFile(path.join(ROOT, 'src/app.js'), 'utf8'),
  'assets/style.css': await readFile(path.join(ROOT, 'src/style.css'), 'utf8'),
  'assets/data.js': `window.PT_DATA=${JSON.stringify({ ref, eur, updated: meta.updated })};\nwindow.PT_CFG=${JSON.stringify(publicCfg)};\n`
};
assets.calc = hash(files['assets/calc.js']); assets.app = hash(files['assets/app.js']);
assets.style = hash(files['assets/style.css']); assets.data = hash(files['assets/data.js']);

/* ---------- układ strony ---------- */
const NAV = [
  ['/', 'Kalkulator'], ['/rekompensata-40-euro/', 'Rekompensata 40 euro'], ['/odsetki-w-transakcjach-handlowych/', 'Odsetki handlowe'],
  ['/odsetki-ustawowe-za-opoznienie/', 'Odsetki ustawowe'], ['/wezwanie-do-zaplaty/', 'Wezwanie do zapłaty']
];
const LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0a6b4d"/><circle cx="16" cy="16" r="9.2" fill="none" stroke="#fff" stroke-width="2" opacity=".55"/><path d="M16 9.5V16l4.6 2.7" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const pages = [];

function headExtras() {
  let h = '';
  if (cfg.verification?.google) h += `<meta name="google-site-verification" content="${esc(cfg.verification.google)}">\n`;
  if (cfg.verification?.bing) h += `<meta name="msvalidate.01" content="${esc(cfg.verification.bing)}">\n`;
  if (cfg.analytics?.goatcounter) h += `<script data-goatcounter="https://${esc(cfg.analytics.goatcounter)}.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>\n`;
  if (cfg.analytics?.cloudflareToken) h += `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${esc(cfg.analytics.cloudflareToken)}"}'></script>\n`;
  if (cfg.adsenseClient) h += `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(cfg.adsenseClient)}" crossorigin="anonymous"></script>\n`;
  return h;
}

function crumbsHtml(crumbs) {
  if (!crumbs.length) return '';
  const parts = [link('/', 'Kalkulator'), ...crumbs.map(([p, t], i) => (i === crumbs.length - 1 ? `<span aria-current="page">${t}</span>` : link(p, t)))];
  return `<nav class="crumbs wrap" aria-label="Okruszki">${parts.join('<span aria-hidden="true">›</span>')}</nav>`;
}
function crumbsLd(crumbs) {
  if (!crumbs.length || !SITE_URL) return null;
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [['/', 'Kalkulator'], ...crumbs].map(([p, t], i) => ({ '@type': 'ListItem', position: i + 1, name: strip(t), item: abs(p) }))
  };
}

function page({ path: p, title, desc, body, tool = false, appJs = false, jsonld = [], crumbs = [], noindex = false, navKey = null, file = null }) {
  const ld = [...jsonld, crumbsLd(crumbs)].filter(Boolean);
  const nav = NAV.map(([np, t]) => `<a href="${u(np)}"${(navKey ?? p) === np ? ' aria-current="page"' : ''}>${t}</a>`).join('') +
    (PRO_ON ? `<a class="nav-pro" href="${u('/pro/')}"${p === '/pro/' ? ' aria-current="page"' : ''}>Pro</a>` : '');
  const scripts = tool || appJs
    ? `<script src="${u('/assets/calc.js')}?v=${assets.calc}" defer></script>\n<script src="${u('/assets/data.js')}?v=${assets.data}" defer></script>\n<script src="${u('/assets/app.js')}?v=${assets.app}" defer></script>` : '';
  const html = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${noindex ? '<meta name="robots" content="noindex">' : (SITE_URL ? `<link rel="canonical" href="${abs(p)}">` : '')}
<meta property="og:type" content="website">
<meta property="og:locale" content="pl_PL">
<meta property="og:site_name" content="${esc(NAME)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${SITE_URL ? `<meta property="og:url" content="${abs(p)}">` : ''}
<meta name="theme-color" content="#0a6b4d">
<link rel="icon" href="${u('/favicon.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${u('/assets/style.css')}?v=${assets.style}">
${headExtras()}${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body>
<a class="skip" href="#tresc">Przejdź do treści</a>
<header class="site-header"><div class="wrap">
<a class="brand" href="${u('/')}">${LOGO}<span>${NAME === 'PoTerminie' ? 'Po<em>Terminie</em>' : esc(NAME)}</span></a>
<nav class="nav" aria-label="Główna nawigacja">${nav}</nav>
</div></header>
<main id="tresc">
${crumbsHtml(crumbs)}
${body}
</main>
<footer class="site-footer"><div class="wrap">
<div class="foot-grid">
<div><h2>Narzędzia</h2><ul>
<li>${link('/', 'Kalkulator odsetek i rekompensaty')}</li>
<li>${link('/wezwanie-do-zaplaty/', 'Generator wezwania do zapłaty')}</li>
<li>${link('/nota-odsetkowa/', 'Nota odsetkowa')}</li>
<li>${link('/nota-obciazeniowa-rekompensata/', 'Nota obciążeniowa - rekompensata')}</li>
</ul></div>
<div><h2>Aktualne stawki</h2><ul>
<li>${link(curMonth.path, `Rekompensata 40 euro - ${curMonth.name}`)}</li>
<li>${link(curHalf.path, `Odsetki handlowe - ${curHalf.label}`)}</li>
<li>${link('/odsetki-ustawowe-za-opoznienie/', 'Odsetki ustawowe za opóźnienie')}</li>
<li>${link(`/rekompensata-40-euro/${YEAR}/`, `Kursy do rekompensaty ${YEAR}`)}</li>
</ul></div>
<div><h2>Serwis</h2><ul>
<li>${link('/o-serwisie/', 'O serwisie, metodologia, kontakt')}</li>
<li>${link('/regulamin/', 'Regulamin')}</li>
<li>${link('/polityka-prywatnosci/', 'Polityka prywatności')}</li>
${PRO_ON ? `<li>${link('/pro/', 'Wersja Pro')}</li>` : ''}
${cfg.support?.url ? `<li><a href="${esc(cfg.support.url)}" target="_blank" rel="noopener">${esc(cfg.support.label || 'Wesprzyj serwis')}</a></li>` : ''}
</ul></div>
</div>
<p class="legal">Serwis ${esc(NAME)} ma charakter informacyjny i nie stanowi porady prawnej ani podatkowej. Wyniki warto zweryfikować przed wysłaniem dokumentów. Źródło stóp procentowych i kursów walut: Narodowy Bank Polski (api.nbp.pl). Dane zaktualizowano ${C.fmtDate(meta.updated)}. © ${YEAR} ${esc(NAME)}</p>
</div></footer>
${scripts}
</body>
</html>
`;
  pages.push({ path: p, file: file || (p.endsWith('/') ? p + 'index.html' : p), html, noindex });
}

function faq(items) {
  return {
    html: `<div class="faq">${items.map(([q, a]) => `<details><summary>${q}</summary>${a}</details>`).join('\n')}</div>`,
    ld: { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: strip(q), acceptedAnswer: { '@type': 'Answer', text: strip(a) } })) }
  };
}
const ctaBand = (strong, text, href = '/', btn = 'Otwórz kalkulator') =>
  `<div class="cta-band"><p><strong>${strong}</strong>${text}</p><a class="btn btn-primary" href="${u(href)}">${btn}</a></div>`;

/* ---------- kalkulator (szkielet HTML, logikę dokłada app.js) ---------- */
function toolHtml(defaultDoc = 'wezwanie') {
  const docBtn = (kind, label, pro) => `<button type="button" class="btn${kind === defaultDoc ? ' btn-primary' : ''}" data-doc="${kind}">${label}${pro ? ' <span class="lock" data-lock hidden>PRO</span>' : ''}</button>`;
  const order = { wezwanie: ['wezwanie', 'nota-odsetkowa', 'nota-rekompensata'], 'nota-odsetkowa': ['nota-odsetkowa', 'nota-rekompensata', 'wezwanie'], 'nota-rekompensata': ['nota-rekompensata', 'nota-odsetkowa', 'wezwanie'] }[defaultDoc];
  const btns = { wezwanie: docBtn('wezwanie', 'Wezwanie do zapłaty', false), 'nota-odsetkowa': docBtn('nota-odsetkowa', 'Nota odsetkowa', true), 'nota-rekompensata': docBtn('nota-rekompensata', 'Nota obciążeniowa (rekompensata)', true) };
  const inp = (label, attr, ph = '', extra = '') => `<label class="field"><span>${label}</span><input type="text" ${attr} placeholder="${ph}" maxlength="120"${extra}></label>`;
  return `<section class="tool" id="pt-tool" aria-label="Kalkulator odsetek za opóźnienie i rekompensaty">
<div class="tool-grid">
<form class="tool-form" autocomplete="off" novalidate onsubmit="return false">
<div class="card">
<h2 class="card-title"><span class="step">1</span> Faktury po terminie</h2>
<div id="pt-invoices"></div>
<div class="row-actions">
<button type="button" class="btn btn-ghost" id="pt-add">+ Dodaj fakturę <span class="lock" data-lock-add hidden>PRO</span></button>
<button type="button" class="btn btn-ghost" id="pt-csv">Wklej listę z arkusza <span class="lock" data-lock hidden>PRO</span></button>
</div>
</div>
<div class="card">
<h2 class="card-title"><span class="step">2</span> Odsetki i rekompensata</h2>
<label class="field"><span>Rodzaj odsetek</span><select id="pt-type">
<option value="handlowe">Transakcje handlowe (firma - firma) - ${pct(now.handlowe)}</option>
<option value="handlowe_leczniczy">Transakcje handlowe, dłużnik: publiczny podmiot leczniczy - ${pct(now.leczniczy)}</option>
<option value="ustawowe">Odsetki ustawowe za opóźnienie (Kodeks cywilny) - ${pct(now.ustawowe)}</option>
<option value="umowne">Odsetki umowne - własna stopa</option>
</select></label>
<label class="field" id="pt-custom-wrap" hidden><span>Stopa odsetek umownych <small>% w skali roku</small></span><input type="text" inputmode="decimal" id="pt-custom" placeholder="np. 12" maxlength="8"></label>
<label class="field"><span>Odsetki nalicz do dnia <small>dla faktur wciąż niezapłaconych</small></span><input type="date" id="pt-calcdate" min="2016-01-01" max="2099-12-31"></label>
<label class="check"><input type="checkbox" id="pt-comp" checked><span>Dolicz rekompensatę 40, 70 lub 100 euro za koszty odzyskiwania należności <small class="muted" id="pt-comp-hint" hidden>- przysługuje tylko w transakcjach handlowych</small></span></label>
<label class="check"><input type="checkbox" id="pt-115" checked><span>Termin wypadający w sobotę lub dzień wolny przesuń na najbliższy dzień roboczy (art. 115 KC)</span></label>
</div>
</form>
<div class="tool-out">
<div class="card" id="pt-result" aria-live="polite"><p class="result-empty">Wpisz kwotę faktury i termin płatności - wynik pojawi się tutaj od razu, bez klikania.</p></div>
<div class="upsell" id="pt-upsell"></div>
</div>
</div>
<div class="card docs" id="pt-docs">
<h2 class="card-title"><span class="step">3</span> Dokumenty dla dłużnika</h2>
<p class="muted" style="margin:0">Gotowe pisma z wyliczonymi kwotami. Otworzą się w podglądzie - możesz je poprawić, wydrukować albo zapisać jako PDF.</p>
<details>
<summary>Dane wierzyciela i dłużnika (opcjonalnie - puste pola zaznaczymy w dokumencie na żółto)</summary>
<div class="grid-2">
<fieldset><legend>Wierzyciel (Ty)</legend>
${inp('Nazwa firmy', 'data-p="creditor.name"', 'np. Studio Graficzne Anna Nowak')}
${inp('Ulica i numer', 'data-p="creditor.addr1"', 'ul. Długa 5/2')}
${inp('Kod pocztowy i miejscowość', 'data-p="creditor.addr2"', '00-001 Warszawa')}
${inp('NIP', 'data-p="creditor.nip"', '', ' inputmode="numeric"')}
${inp('Numer rachunku bankowego', 'data-p="creditor.account"', 'PL00 0000 0000 0000 0000 0000 0000')}
${inp('Miejscowość wystawienia', 'data-p="creditor.city"', 'Warszawa')}
${inp('Podpis (imię i nazwisko)', 'data-p="creditor.sign"', '')}
</fieldset>
<fieldset><legend>Dłużnik</legend>
${inp('Nazwa firmy', 'data-p="debtor.name"', '')}
${inp('Ulica i numer', 'data-p="debtor.addr1"', '')}
${inp('Kod pocztowy i miejscowość', 'data-p="debtor.addr2"', '')}
${inp('NIP', 'data-p="debtor.nip"', '', ' inputmode="numeric"')}
${inp('Termin na zapłatę (dni)', 'data-s="payDays"', '7', ' inputmode="numeric"')}
${inp('Numer noty <small>dla not księgowych</small>', 'data-s="docNo"', 'np. NO 1/11/2026')}
</fieldset>
</div>
</details>
<div class="doc-buttons">${order.map((k) => btns[k]).join('\n')}</div>
<p class="privacy-line">Nic nie wysyłamy na serwer - obliczenia i dokumenty powstają w Twojej przeglądarce. Wpisane dane zapisują się tylko na tym urządzeniu. <button type="button" class="link-btn" id="pt-reset">Wyczyść dane</button></p>
</div>
<noscript><p class="alert">Kalkulator wymaga włączonej obsługi JavaScript. Aktualne stawki i kursy znajdziesz w tabelach poniżej.</p></noscript>
</section>`;
}

/* ---------- wspólne fragmenty treści ---------- */
const tierTable = (m) => `<div class="table-scroll"><table class="data">
<thead><tr><th>Wartość świadczenia pieniężnego (kwota z faktury)</th><th class="num">Rekompensata</th><th class="num">W ${m.loc}</th></tr></thead>
<tbody>
<tr><td>do 5&nbsp;000 zł</td><td class="num">40 euro</td><td class="num">${zl(m.p40)}</td></tr>
<tr><td>powyżej 5&nbsp;000 zł, ale poniżej 50&nbsp;000 zł</td><td class="num">70 euro</td><td class="num">${zl(m.p70)}</td></tr>
<tr><td>50&nbsp;000 zł i więcej</td><td class="num">100 euro</td><td class="num">${zl(m.p100)}</td></tr>
</tbody></table></div>`;

const monthRows = (list, markCurrent = true) => list.map((m) => `<tr${markCurrent && m.ym === curMonth.ym ? ' class="now"' : ''}>
<td>${link(m.path, cap(m.name))}</td><td>${C.fmtDate(m.rate.d)}</td><td class="num">${C.fmtMid(m.rate.mid)}</td><td class="num">${zl(m.p40)}</td><td class="num">${zl(m.p70)}</td><td class="num">${zl(m.p100)}</td></tr>`).join('\n');
const monthTable = (list) => `<div class="table-scroll"><table class="data">
<thead><tr><th>Miesiąc wymagalności</th><th>Kurs NBP z dnia</th><th class="num">1 EUR</th><th class="num">40 euro</th><th class="num">70 euro</th><th class="num">100 euro</th></tr></thead>
<tbody>${monthRows(list)}</tbody></table></div>`;

function homeExample() {
  const y = +TODAY.slice(0, 4), m = +TODAY.slice(5, 7);
  const due = C.iso(new Date(Date.UTC(y, m - 3, 10))), paid = C.iso(new Date(Date.UTC(y, m - 2, 10)));
  const r = E.compute({ invoices: [{ id: 1, amount: '6150', due, paidOn: paid }], rateType: 'handlowe', calcDate: TODAY, compensation: true, art115: true }).invoices[0];
  if (!r.delayed || !r.comp || r.comp.pending) return '';
  return `<div class="callout"><p><strong>Przykład.</strong> Faktura na 6&nbsp;150,00 zł miała termin płatności ${C.fmtDateLong(r.dueAdjusted)} Kontrahent zapłacił ją dopiero ${C.fmtDateLong(paid)}, czyli ${r.daysLate} dni po terminie. Mimo że należność główna jest już uregulowana, wierzycielowi nadal przysługuje:</p>
<ul><li>${zl(r.interestGr)} odsetek (${r.segments.map((s) => `${s.days} dni × ${pct(s.rate)}`).join(' + ')}),</li>
<li>${zl(r.comp.plnGr)} rekompensaty - 70 euro po kursie ${C.fmtMid(r.comp.mid)} z ${C.fmtDate(r.comp.rateDate)}, bo faktura przekracza 5&nbsp;000 zł.</li></ul>
<p>Razem <strong>${zl(r.interestGr + r.comp.plnGr)}</strong> - do odzyskania notą odsetkową i notą obciążeniową.</p></div>`;
}

const kpiNow = () => `<ul class="kpis">
<li><span class="k">Odsetki w transakcjach handlowych</span><span class="v">${pct(now.handlowe)}</span><span class="s">${link(curHalf.path, curHalf.label)}</span></li>
<li><span class="k">Odsetki ustawowe za opóźnienie (KC)</span><span class="v">${pct(now.ustawowe)}</span><span class="s">${link('/odsetki-ustawowe-za-opoznienie/', `od ${C.fmtDate(curRefFrom)}`)}</span></li>
<li><span class="k">Rekompensata 40 euro w ${curMonth.loc}</span><span class="v">${zl(curMonth.p40)}</span><span class="s">${link(curMonth.path, `kurs ${C.fmtMid(curMonth.rate.mid)} z ${C.fmtDate(curMonth.rate.d)}`)}</span></li>
<li><span class="k">Stopa referencyjna NBP</span><span class="v">${pct(now.ref)}</span><span class="s">od ${C.fmtDate(curRefFrom)}</span></li>
</ul>`;

/* =================== STRONY =================== */

/* ---- strona główna ---- */
{
  const f = faq([
    ['Od kiedy liczy się odsetki za opóźnienie?', `<p>Od dnia następującego po terminie płatności aż do dnia zapłaty włącznie. Jeżeli termin wypada w sobotę albo dzień ustawowo wolny od pracy, przesuwa się na najbliższy dzień roboczy (art. 115 Kodeksu cywilnego) - kalkulator robi to automatycznie. Odsetki należą się bez wezwania i bez wykazywania szkody.</p>`],
    ['Ile wynoszą odsetki w transakcjach handlowych?', `<p>W ${curHalf.label.replace('półrocze', 'półroczu')} r. to <strong>${pct(curHalf.rate)}</strong> w skali roku (${pct(curHalf.rateH)}, gdy dłużnikiem jest publiczny podmiot leczniczy). Stawka zmienia się dwa razy w roku: to stopa referencyjna NBP z 1 stycznia lub 1 lipca powiększona o 10 punktów procentowych. Historię znajdziesz w ${link('/odsetki-w-transakcjach-handlowych/', 'tabeli stawek')}.</p>`],
    ['Czy rekompensata 40 euro należy się nawet przy jednym dniu opóźnienia?', `<p>Tak. Ustawa nie uzależnia rekompensaty od długości opóźnienia ani od wysokości faktycznie poniesionych kosztów - przysługuje od dnia nabycia prawa do odsetek, bez wezwania. Warunek jest jeden: wierzyciel sam spełnił swoje świadczenie (dostarczył towar, wykonał usługę). W skrajnych sytuacjach sąd może ocenić żądanie przez pryzmat nadużycia prawa, ale to wyjątek, a nie reguła.</p>`],
    ['Po jakim kursie przeliczyć 40 euro na złote?', `<p>Po średnim kursie euro ogłoszonym przez NBP ostatniego dnia roboczego miesiąca poprzedzającego miesiąc, w którym należność stała się wymagalna. Dla należności wymagalnych w ${curMonth.loc} jest to kurs ${C.fmtMid(curMonth.rate.mid)} z ${C.fmtDate(curMonth.rate.d)}, czyli 40 euro = ${zl(curMonth.p40)}. ${link('/rekompensata-40-euro/', 'Kursy dla wszystkich miesięcy')}.</p>`],
    ['Czy rekompensata przysługuje od każdej faktury?', `<p>Rekompensata przysługuje od transakcji handlowej. W praktyce każda faktura dokumentująca odrębną dostawę lub usługę to osobna transakcja i osobna rekompensata. Jeżeli strony umówiły się na zapłatę w ratach, rekompensata należy się od każdej niezapłaconej w terminie raty.</p>`],
    ['Czy na odsetki i rekompensatę wystawia się fakturę?', `<p>Nie. Odsetki dokumentuje się notą odsetkową, a rekompensatę notą obciążeniową (księgową). Żadna z tych kwot nie podlega VAT. Oba dokumenty wygenerujesz w kalkulatorze.</p>`],
    ['Czy mogę żądać rekompensaty od konsumenta?', `<p>Nie. Ustawa o przeciwdziałaniu nadmiernym opóźnieniom w transakcjach handlowych dotyczy umów między przedsiębiorcami i z podmiotami publicznymi. Od konsumenta można żądać odsetek ustawowych za opóźnienie z Kodeksu cywilnego (obecnie ${pct(now.ustawowe)}) - wybierz ten rodzaj odsetek w kalkulatorze.</p>`],
    ['Czy kalkulator zapisuje moje dane?', `<p>Nie na serwerze. Obliczenia i dokumenty powstają wyłącznie w Twojej przeglądarce, a wpisane dane zapisują się lokalnie na Twoim urządzeniu, żeby nie trzeba było ich wpisywać ponownie. Możesz je usunąć przyciskiem „Wyczyść dane”.</p>`]
  ]);
  page({
    path: '/', navKey: '/',
    title: `Kalkulator odsetek za opóźnienie i rekompensaty 40 euro (${YEAR}) | ${NAME}`,
    desc: `Policz odsetki od niezapłaconej faktury i rekompensatę 40, 70 lub 100 euro po właściwym kursie NBP. Aktualna stawka ${pct(now.handlowe)}. Wezwanie do zapłaty w 2 minuty, bez rejestracji.`,
    tool: true,
    jsonld: [
      SITE_URL ? { '@context': 'https://schema.org', '@type': 'WebSite', name: NAME, url: abs('/'), inLanguage: 'pl' } : null,
      { '@context': 'https://schema.org', '@type': 'WebApplication', name: `${NAME} - kalkulator odsetek i rekompensaty 40 euro`, applicationCategory: 'FinanceApplication', operatingSystem: 'Any', inLanguage: 'pl', ...(SITE_URL ? { url: abs('/') } : {}), offers: { '@type': 'Offer', price: '0', priceCurrency: 'PLN' } },
      f.ld
    ],
    body: `<section class="hero"><div class="wrap">
<h1>Kalkulator odsetek za opóźnienie i rekompensaty 40 euro</h1>
<p class="lead">Kontrahent nie zapłacił faktury w terminie? Policz, ile dokładnie jest Ci winien: odsetki za każdy dzień opóźnienia i rekompensatę 40, 70 lub 100 euro po właściwym kursie NBP. Potem jednym kliknięciem wygeneruj wezwanie do zapłaty.</p>
<ul class="badges"><li>Stawka ${pct(now.handlowe)} - ${curHalf.label}</li><li>Kurs euro prosto z NBP</li><li>Bez rejestracji</li></ul>
</div></section>
<div class="wrap">${toolHtml('wezwanie')}</div>
<section class="prose"><div class="wrap narrow">
<h2>Aktualne stawki</h2>
${kpiNow()}
<h2>Jak policzyć należność w trzech krokach</h2>
<ol class="steps">
<li><strong>Wpisz faktury.</strong> Kwota brutto i termin płatności wystarczą. Jeśli faktura została już zapłacona po terminie, podaj datę zapłaty.</li>
<li><strong>Sprawdź wynik.</strong> Kalkulator sam dobiera stawkę odsetek dla każdego okresu i kurs euro z właściwego dnia.</li>
<li><strong>Wyślij dokument.</strong> Wezwanie do zapłaty, nota odsetkowa i nota na rekompensatę mają już wpisane wszystkie kwoty i podstawy prawne.</li>
</ol>
<h2>Co Ci się należy za opóźnioną fakturę</h2>
<p>W transakcjach między firmami opóźnienie w zapłacie daje wierzycielowi trzy uprawnienia - wszystkie przysługują z mocy prawa, bez wezwania i bez dodatkowych zapisów w umowie:</p>
<ul>
<li><strong>Odsetki ustawowe za opóźnienie w transakcjach handlowych</strong> - obecnie ${pct(now.handlowe)} rocznie, liczone od dnia po terminie płatności do dnia zapłaty. Przy 10&nbsp;000 zł to ${zl(interest(1000000, now.handlowe, 1))} za każdy dzień.</li>
<li><strong>Rekompensata za koszty odzyskiwania należności</strong> - równowartość 40, 70 albo 100 euro, zależnie od kwoty faktury. Należy się już od pierwszego dnia opóźnienia, także wtedy, gdy kontrahent w końcu zapłacił.</li>
<li><strong>Zwrot dalszych kosztów</strong> odzyskiwania należności w uzasadnionej wysokości, jeżeli przekroczyły kwotę rekompensaty (np. koszt firmy windykacyjnej).</li>
</ul>
${tierTable(curMonth)}
${homeExample()}
<p>Przy umowach z konsumentami i między osobami prywatnymi stosuje się odsetki ustawowe za opóźnienie z Kodeksu cywilnego (obecnie ${pct(now.ustawowe)}); rekompensata w euro wtedy nie przysługuje. Szczegóły: ${link('/odsetki-ustawowe-za-opoznienie/', 'odsetki ustawowe za opóźnienie')} i ${link('/odsetki-w-transakcjach-handlowych/', 'odsetki w transakcjach handlowych')}.</p>
<h2>Najczęstsze pytania</h2>
${f.html}
</div></section>`
  });
}

/* ---- rekompensata: strona zbiorcza ---- */
{
  const yearMonths = months.filter((m) => m.y === YEAR);
  const f = faq([
    ['Czy trzeba wezwać dłużnika do zapłaty, żeby dostać rekompensatę?', `<p>Nie. Rekompensata przysługuje „bez wezwania” od dnia, w którym wierzyciel nabył prawo do odsetek, czyli od pierwszego dnia opóźnienia. W praktyce i tak trzeba poinformować dłużnika o kwocie - służy do tego nota obciążeniowa albo wezwanie do zapłaty.</p>`],
    ['Czy rekompensata należy się, gdy kontrahent zapłacił z kilkudniowym poślizgiem?', `<p>Tak. Późniejsza zapłata faktury nie znosi uprawnienia - rekompensata powstała w dniu, w którym należność stała się wymagalna. Można jej dochodzić osobno, także po uregulowaniu należności głównej.</p>`],
    ['Jak ustalić próg 5&nbsp;000 zł i 50&nbsp;000 zł?', `<p>Liczy się wartość świadczenia pieniężnego, czyli kwota do zapłaty wynikająca z danej transakcji (faktury), a nie suma wszystkich zaległości kontrahenta ani kwota pozostała po częściowej wpłacie.</p>`],
    ['Czy rekompensata podlega VAT i jak ją zaksięgować?', `<p>Rekompensata nie jest wynagrodzeniem za towar ani usługę, więc nie podlega VAT i nie wystawia się na nią faktury. Dokumentuje się ją notą obciążeniową (księgową). U wierzyciela jest przychodem w momencie otrzymania zapłaty.</p>`],
    ['Czy prawo do rekompensaty można sprzedać firmie windykacyjnej?', `<p>Nie. Uprawnienie do kwoty rekompensaty nie może zostać zbyte - przepis wprowadzono, aby rekompensata trafiała do wierzyciela, który faktycznie czekał na pieniądze.</p>`],
    ['Kiedy roszczenie o rekompensatę się przedawnia?', `<p>Roszczenia związane z prowadzeniem działalności gospodarczej przedawniają się co do zasady po 3 latach, a roszczenia z umowy sprzedaży po 2 latach - w obu przypadkach z końcem roku kalendarzowego. W razie wątpliwości co do konkretnej sprawy warto skonsultować termin z prawnikiem.</p>`]
  ]);
  page({
    path: '/rekompensata-40-euro/',
    title: `Rekompensata 40 euro ${YEAR} - kurs NBP, kwoty w zł i kalkulator`,
    desc: `Rekompensata 40, 70 i 100 euro za opóźnienie w zapłacie. W ${curMonth.loc.replace('\u00a0', ' ')}: ${C.fmtMoney(curMonth.p40)} zł, ${C.fmtMoney(curMonth.p70)} zł i ${C.fmtMoney(curMonth.p100)} zł (kurs NBP ${C.fmtMid(curMonth.rate.mid)}). Tabela kursów i kalkulator.`,
    tool: true, crumbs: [['/rekompensata-40-euro/', 'Rekompensata 40 euro']], jsonld: [f.ld],
    body: `<section class="hero"><div class="wrap">
<h1>Rekompensata 40, 70 i 100 euro za opóźnienie w zapłacie</h1>
<p class="lead">Za każdą fakturę zapłaconą po terminie przedsiębiorcy należy się rekompensata za koszty odzyskiwania należności. W ${curMonth.loc} to <strong>${zl(curMonth.p40)}</strong>, <strong>${zl(curMonth.p70)}</strong> albo <strong>${zl(curMonth.p100)}</strong> - według kursu NBP ${C.fmtMid(curMonth.rate.mid)} z ${C.fmtDate(curMonth.rate.d)}.</p>
</div></section>
<div class="wrap">${toolHtml('nota-rekompensata')}</div>
<section class="prose"><div class="wrap narrow">
<h2>Ile wynosi rekompensata</h2>
<p>Wysokość rekompensaty zależy od kwoty, której dotyczyło opóźnienie (art. 10 ust. 1 ${ACT}):</p>
${tierTable(curMonth)}
<p>Progi obowiązują dla należności wymagalnych od 1 stycznia 2020 r. Wcześniej rekompensata wynosiła zawsze 40 euro.</p>
<h2>Po jakim kursie przeliczyć euro</h2>
<p>Stosuje się <strong>średni kurs euro NBP z ostatniego dnia roboczego miesiąca poprzedzającego miesiąc, w którym świadczenie stało się wymagalne</strong>. Wymagalność to dzień następujący po terminie płatności. Liczy się więc nie data wystawienia faktury ani data zapłaty, tylko miesiąc, w którym minął termin.</p>
<div class="callout warn"><p><strong>Najczęstszy błąd:</strong> faktura z terminem płatności ostatniego dnia miesiąca staje się wymagalna pierwszego dnia kolejnego miesiąca - i wtedy obowiązuje już kurs z końca miesiąca, w którym przypadał termin, a nie z miesiąca wcześniejszego. Kalkulator pilnuje tego automatycznie, razem z przesunięciem terminów z sobót i dni wolnych.</p></div>
<h2>Kursy do rekompensaty w ${YEAR} r.</h2>
${monthTable(yearMonths)}
<p>Kurs dla należności wymagalnych w ${C.M_LOC[+nextYm.slice(5, 7) - 1]} ${nextYm.slice(0, 4)} r. NBP ogłosi ${C.fmtDateLong(nextRateDay)} Strona zaktualizuje się tego samego dnia.</p>
<p>Poprzednie lata:</p>
<ul class="pills">${compYears.map((y) => `<li>${link(`/rekompensata-40-euro/${y}/`, y)}</li>`).join('')}</ul>
<h2>Kiedy rekompensata przysługuje</h2>
<ul>
<li>umowa jest transakcją handlową - obie strony zawarły ją w związku z prowadzoną działalnością (firma, wolny zawód, podmiot publiczny); nie dotyczy konsumentów,</li>
<li>wierzyciel spełnił swoje świadczenie - towar został dostarczony, usługa wykonana,</li>
<li>zapłata nie wpłynęła w terminie - wystarczy jeden dzień opóźnienia,</li>
<li>przysługuje niezależnie od odsetek i bez wykazywania, że wierzyciel poniósł jakiekolwiek koszty.</li>
</ul>
<h2>Jak dochodzić rekompensaty</h2>
<p>Najprościej wystawić ${link('/nota-obciazeniowa-rekompensata/', 'notę obciążeniową')} z wyliczeniem kwoty i kursu, a przy większych zaległościach od razu ${link('/wezwanie-do-zaplaty/', 'wezwanie do zapłaty')} obejmujące należność główną, odsetki i rekompensatę. Jeżeli dłużnik nie zapłaci, rekompensaty można dochodzić przed sądem razem z fakturą - także w elektronicznym postępowaniu upominawczym.</p>
<h2>Najczęstsze pytania</h2>
${f.html}
</div></section>`
  });
}

/* ---- rekompensata: strony miesięczne ---- */
months.forEach((m, idx) => {
  const prev = months[idx - 1], next = months[idx + 1];
  const first = `${m.ym}-01`, last = C.monthEnd(m.y, m.m);
  // nominalne terminy płatności, dla których wymagalność (dzień po terminie, z przesunięciem z art. 115 KC) wypada w tym miesiącu
  let dueFrom = null, dueTo = null;
  for (let d = C.addDays(first, -12); d <= last; d = C.addDays(d, 1)) {
    const w = C.addDays(C.adjustDue(d), 1);
    if (w >= first && w <= last) { dueFrom ??= d; dueTo = d; }
  }
  const exDue = C.adjustDue(`${m.ym}-15`), exWym = C.addDays(exDue, 1);
  const half = halves.find((h) => first >= h.start && first <= h.end);
  const year = months.filter((x) => x.y === m.y);
  page({
    path: m.path, navKey: '/rekompensata-40-euro/',
    title: `Rekompensata 40 euro - ${m.name}: kurs NBP ${C.fmtMid(m.rate.mid)}, kwoty w zł`,
    desc: `Rekompensata za opóźnienie dla należności wymagalnych w ${m.loc.replace('\u00a0', ' ')}: 40 euro = ${C.fmtMoney(m.p40)} zł, 70 euro = ${C.fmtMoney(m.p70)} zł, 100 euro = ${C.fmtMoney(m.p100)} zł. Kurs NBP ${C.fmtMid(m.rate.mid)} z ${C.fmtDate(m.rate.d)}.`,
    crumbs: [['/rekompensata-40-euro/', 'Rekompensata 40 euro'], [`/rekompensata-40-euro/${m.y}/`, String(m.y)], [m.path, cap(m.name)]],
    body: `<section class="hero"><div class="wrap narrow">
<h1>Rekompensata 40 euro - ${m.name}</h1>
<p class="lead">Dla należności, które stały się wymagalne w ${m.loc}, rekompensatę za koszty odzyskiwania należności przelicza się po średnim kursie euro NBP z ${C.fmtDateLong(m.rate.d)}: <strong>1 EUR = ${C.fmtMid(m.rate.mid)} zł</strong> (tabela nr ${esc(m.rate.no)}).</p>
<ul class="kpis">
<li><span class="k">40 euro - faktury do 5&nbsp;000 zł</span><span class="v">${zl(m.p40)}</span></li>
<li><span class="k">70 euro - powyżej 5&nbsp;000 zł</span><span class="v">${zl(m.p70)}</span></li>
<li><span class="k">100 euro - od 50&nbsp;000 zł</span><span class="v">${zl(m.p100)}</span></li>
</ul>
</div></section>
<section class="prose"><div class="wrap narrow">
<h2>Których faktur dotyczy ten kurs</h2>
<p>O kursie decyduje miesiąc, w którym należność stała się wymagalna - czyli dzień następujący po terminie płatności. Kurs z ${C.fmtDate(m.rate.d)} stosujesz do faktur z terminem płatności <strong>od ${C.fmtDateLong(dueFrom).replace(' r.', '')} do ${C.fmtDateLong(dueTo)}</strong> Nie ma znaczenia data wystawienia faktury ani dzień, w którym kontrahent ostatecznie zapłacił.</p>
<p>Podany zakres uwzględnia już to, że termin płatności wypadający w sobotę lub dzień ustawowo wolny od pracy przesuwa się na najbliższy dzień roboczy (art. 115 Kodeksu cywilnego) - dlatego nie zawsze pokrywa się z granicami miesiąca kalendarzowego. ${link('/', 'Kalkulator')} stosuje tę zasadę automatycznie.</p>
<div class="callout"><p><strong>Przykład.</strong> Faktura na 3&nbsp;000 zł ma termin płatności ${C.fmtDateLong(exDue)} Jeśli kontrahent nie zapłaci, ${C.fmtDateLong(exWym).replace(' r.', '')} należność staje się wymagalna i od tego dnia wierzycielowi przysługuje 40 euro rekompensaty, czyli <strong>${zl(m.p40)}</strong>. Przy fakturze na 12&nbsp;000 zł będzie to 70 euro - ${zl(m.p70)}, a przy fakturze na 60&nbsp;000 zł - 100 euro, czyli ${zl(m.p100)}.</p></div>
${half ? `<h2>Odsetki za opóźnienie w ${m.loc}</h2>
<p>Oprócz rekompensaty wierzycielowi przysługują odsetki ustawowe za opóźnienie w transakcjach handlowych. W okresie ${C.fmtDate(half.start)}-${C.fmtDate(half.end)} wynoszą one <strong>${pct(half.rate)}</strong> w skali roku (${pct(half.rateH)}, gdy dłużnikiem jest publiczny podmiot leczniczy). Od 10&nbsp;000 zł to ${zl(interest(1000000, half.rate, 1))} dziennie i ${zl(interest(1000000, half.rate, 30))} za 30 dni opóźnienia. ${half.path ? link(half.path, `Więcej: ${half.label}`) + '.' : ''}</p>` : ''}
${ctaBand('Policz dokładną kwotę dla swojej faktury', 'Odsetki, rekompensata i gotowe wezwanie do zapłaty - w dwie minuty.')}
<h2>Kursy do rekompensaty w ${m.y} r.</h2>
<ul class="pills">${year.map((x) => `<li><a href="${u(x.path)}"${x.ym === m.ym ? ' aria-current="page"' : ''}>${cap(C.M_NOM[x.m - 1])}</a></li>`).join('')}</ul>
<div class="pager">${prev ? link(prev.path, `← ${cap(prev.name)}`, ' class="btn"') : '<span></span>'}${next ? link(next.path, `${cap(next.name)} →`, ' class="btn"') : '<span></span>'}</div>
<p class="small muted">Podstawa prawna: art. 10 ust. 1 i 1a ${ACT}. Źródło kursu: Narodowy Bank Polski, tabela A kursów średnich walut obcych nr ${esc(m.rate.no)} z ${C.fmtDate(m.rate.d)}.</p>
</div></section>`
  });
});

/* ---- rekompensata: strony roczne ---- */
compYears.forEach((y) => {
  const list = months.filter((m) => m.y === y);
  const mids = list.map((m) => m.rate.mid), lo = Math.min(...mids), hi = Math.max(...mids);
  page({
    path: `/rekompensata-40-euro/${y}/`, navKey: '/rekompensata-40-euro/',
    title: `Rekompensata 40 euro ${y} - tabela kursów NBP miesiąc po miesiącu`,
    desc: `Kursy euro do rekompensaty za opóźnienie w ${y} r. dla każdego miesiąca: 40, 70 i 100 euro w złotych. Kurs NBP od ${C.fmtMid(lo)} do ${C.fmtMid(hi)}.`,
    crumbs: [['/rekompensata-40-euro/', 'Rekompensata 40 euro'], [`/rekompensata-40-euro/${y}/`, String(y)]],
    body: `<section class="hero"><div class="wrap narrow">
<h1>Rekompensata 40 euro w ${y} r. - kursy NBP</h1>
<p class="lead">Tabela pokazuje, po jakim kursie przeliczyć rekompensatę 40, 70 i 100 euro dla należności wymagalnych w poszczególnych miesiącach ${y} r. W tym okresie 40 euro odpowiadało kwocie od ${zl(Math.min(...list.map((m) => m.p40)))} do ${zl(Math.max(...list.map((m) => m.p40)))}.</p>
</div></section>
<section class="prose"><div class="wrap narrow">
${monthTable(list)}
<p>W kolumnie „Kurs NBP z dnia” podano ostatni dzień roboczy miesiąca poprzedzającego - to z niego pochodzi kurs właściwy dla całego miesiąca wymagalności. Zasady naliczania opisujemy na stronie ${link('/rekompensata-40-euro/', 'Rekompensata 40 euro')}.</p>
${ctaBand('Masz fakturę po terminie?', 'Kalkulator sam dobierze kurs i policzy odsetki.')}
<ul class="pills">${compYears.map((x) => `<li><a href="${u(`/rekompensata-40-euro/${x}/`)}"${x === y ? ' aria-current="page"' : ''}>${x}</a></li>`).join('')}</ul>
</div></section>`
  });
});

/* ---- odsetki handlowe: strona zbiorcza ---- */
{
  const f = faq([
    ['Czy odsetki handlowe trzeba zapisać w umowie?', `<p>Nie. Przysługują z mocy ustawy, bez wezwania, jeżeli wierzyciel spełnił swoje świadczenie i nie otrzymał zapłaty w terminie. Strony mogą umówić się na odsetki wyższe, ale nie mogą wyłączyć ani ograniczyć ustawowych.</p>`],
    ['Czym różnią się od zwykłych odsetek ustawowych za opóźnienie?', `<p>Odsetki z Kodeksu cywilnego to stopa referencyjna NBP + 5,5 pkt proc. (obecnie ${pct(now.ustawowe)}) i dotyczą m.in. umów z konsumentami. Odsetki w transakcjach handlowych to stopa referencyjna + 10 pkt proc. (obecnie ${pct(now.handlowe)}) i dotyczą umów zawieranych w ramach działalności. Dodatkowo tylko przy transakcjach handlowych przysługuje ${link('/rekompensata-40-euro/', 'rekompensata 40, 70 lub 100 euro')}.</p>`],
    ['Dlaczego stawka nie zmienia się razem ze stopami NBP?', `<p>Dla transakcji handlowych bierze się stopę referencyjną z 1 stycznia (dla pierwszego półrocza) i z 1 lipca (dla drugiego). Zmiany stóp w trakcie półrocza wpływają dopiero na kolejny okres. Wysokość stawki potwierdza obwieszczenie w Monitorze Polskim.</p>`],
    ['Jak liczyć odsetki, gdy opóźnienie obejmuje dwa półrocza?', `<p>Osobno dla każdego okresu: liczba dni w danym półroczu × stawka z tego półrocza. Kalkulator dzieli okres opóźnienia automatycznie i pokazuje każdy odcinek w rozbiciu.</p>`]
  ]);
  page({
    path: '/odsetki-w-transakcjach-handlowych/',
    title: `Odsetki za opóźnienie w transakcjach handlowych ${YEAR} - aktualnie ${pct(now.handlowe)}`,
    desc: `Odsetki ustawowe za opóźnienie w transakcjach handlowych - ${curHalf.label}: ${pct(curHalf.rate)} (${pct(curHalf.rateH)} dla publicznych podmiotów leczniczych). Tabela stawek od 2016 r., wzór i kalkulator.`,
    crumbs: [['/odsetki-w-transakcjach-handlowych/', 'Odsetki w transakcjach handlowych']], jsonld: [f.ld],
    body: `<section class="hero"><div class="wrap narrow">
<h1>Odsetki ustawowe za opóźnienie w transakcjach handlowych</h1>
<p class="lead">Od ${C.fmtDateLong(curHalf.start).replace(' r.', '')} do ${C.fmtDateLong(curHalf.end)} odsetki za opóźnienie w transakcjach handlowych wynoszą <strong>${pct(curHalf.rate)}</strong> w skali roku.</p>
<ul class="kpis">
<li><span class="k">Stawka podstawowa - ${curHalf.label}</span><span class="v">${pct(curHalf.rate)}</span></li>
<li><span class="k">Dłużnik: publiczny podmiot leczniczy</span><span class="v">${pct(curHalf.rateH)}</span></li>
<li><span class="k">Koszt jednego dnia zwłoki od 10&nbsp;000 zł</span><span class="v">${zl(interest(1000000, curHalf.rate, 1))}</span></li>
</ul>
</div></section>
<section class="prose"><div class="wrap narrow">
<h2>Skąd bierze się stawka</h2>
<p>Stawka to <strong>stopa referencyjna NBP powiększona o 10 punktów procentowych</strong> (o 8 punktów, gdy dłużnikiem jest podmiot publiczny będący podmiotem leczniczym). Ustala się ją dwa razy w roku: dla okresu od 1 stycznia do 30 czerwca według stopy z 1 stycznia, a dla okresu od 1 lipca do 31 grudnia według stopy z 1 lipca. ${cap(curHalf.label)}: ${pct(curHalf.ref)} + 10 pkt proc. = ${pct(curHalf.rate)}.</p>
<h2>Tabela stawek od 2016 r.</h2>
<div class="table-scroll"><table class="data">
<thead><tr><th>Okres</th><th class="num">Stopa referencyjna NBP</th><th class="num">Odsetki handlowe</th><th class="num">Podmiot leczniczy</th></tr></thead>
<tbody>${[...halves].reverse().map((h) => `<tr${h.current ? ' class="now"' : ''}><td>${h.path ? link(h.path, h.label) : h.label}<br><span class="small muted">${C.fmtDate(h.start)}-${C.fmtDate(h.end)}</span></td><td class="num">${pct(h.ref)}</td><td class="num">${pct(h.rate)}</td><td class="num">${pct(h.rateH)}</td></tr>`).join('\n')}</tbody></table></div>
<p class="small muted">Do końca 2019 r. obowiązywała jedna stawka: stopa referencyjna + 8 pkt proc.</p>
<h2>Jak obliczyć odsetki</h2>
<p>Wzór jest prosty: <strong>kwota zaległości × stawka × liczba dni opóźnienia / 365</strong>. Dni liczy się od dnia następującego po terminie płatności do dnia zapłaty włącznie. Przykład: faktura na 10&nbsp;000 zł zapłacona 45 dni po terminie, w całości w bieżącym półroczu, to 10&nbsp;000 × ${pct(curHalf.rate)} × 45 / 365 = <strong>${zl(interest(1000000, curHalf.rate, 45))}</strong> odsetek.</p>
${ctaBand('Policz odsetki dla swojej faktury', 'Kalkulator sam podzieli opóźnienie na półrocza i doliczy rekompensatę.')}
<h2>Kiedy stosuje się te odsetki</h2>
<p>Przy umowach o odpłatną dostawę towaru lub świadczenie usługi zawieranych w związku z działalnością obu stron: między przedsiębiorcami, osobami wykonującymi wolny zawód oraz z podmiotami publicznymi. Nie dotyczą umów z konsumentami - tam stosuje się ${link('/odsetki-ustawowe-za-opoznienie/', 'odsetki ustawowe za opóźnienie z Kodeksu cywilnego')}.</p>
<h2>Najczęstsze pytania</h2>
${f.html}
</div></section>`
  });
}

/* ---- odsetki handlowe: strony półroczne ---- */
const halfPages = halves.filter((h) => h.path);
halfPages.forEach((h, idx) => {
  const prev = halfPages[idx - 1], next = halfPages[idx + 1];
  const amounts = [100000, 500000, 1000000, 5000000, 10000000];
  const hm = months.filter((m) => `${m.ym}-01` >= h.start && `${m.ym}-01` <= h.end);
  const period = `${C.fmtDateLong(h.start).replace(' r.', '')} do ${C.fmtDateLong(h.end)}`;
  page({
    path: h.path, navKey: '/odsetki-w-transakcjach-handlowych/',
    title: `Odsetki w transakcjach handlowych - ${h.label}: ${pct(h.rate)}`,
    desc: `Odsetki ustawowe za opóźnienie w transakcjach handlowych od ${C.fmtDate(h.start)} do ${C.fmtDate(h.end)}: ${pct(h.rate)} (${pct(h.rateH)} dla publicznych podmiotów leczniczych). Przykładowe kwoty i kursy do rekompensaty.`,
    crumbs: [['/odsetki-w-transakcjach-handlowych/', 'Odsetki w transakcjach handlowych'], [h.path, h.label]],
    body: `<section class="hero"><div class="wrap narrow">
<h1>Odsetki za opóźnienie w transakcjach handlowych - ${h.label}</h1>
<p class="lead">Od ${period} odsetki ustawowe za opóźnienie w transakcjach handlowych ${h.current ? 'wynoszą' : 'wynosiły'} <strong>${pct(h.rate)}</strong> w skali roku. Gdy dłużnikiem jest podmiot publiczny będący podmiotem leczniczym - <strong>${pct(h.rateH)}</strong>.</p>
</div></section>
<section class="prose"><div class="wrap narrow">
<h2>Skąd ta stawka</h2>
<p>Stopa referencyjna NBP obowiązująca ${C.fmtDateLong(h.start)} wynosiła ${pct(h.ref)}. Po dodaniu 10 punktów procentowych daje to ${pct(h.rate)}, a po dodaniu 8 punktów (podmioty lecznicze) - ${pct(h.rateH)}. Stawka obowiązuje przez całe półrocze, niezależnie od późniejszych decyzji Rady Polityki Pieniężnej.</p>
<h2>Ile to w złotych</h2>
<div class="table-scroll"><table class="data">
<thead><tr><th>Kwota zaległości</th><th class="num">1 dzień</th><th class="num">30 dni</th><th class="num">90 dni</th><th class="num">Całe półrocze (${h.days} dni)</th></tr></thead>
<tbody>${amounts.map((a) => `<tr><td>${zl(a)}</td><td class="num">${zl(interest(a, h.rate, 1))}</td><td class="num">${zl(interest(a, h.rate, 30))}</td><td class="num">${zl(interest(a, h.rate, 90))}</td><td class="num">${zl(interest(a, h.rate, h.days))}</td></tr>`).join('\n')}</tbody></table></div>
<p class="small muted">Wzór: kwota × ${pct(h.rate)} × liczba dni / 365.</p>
${hm.length ? `<h2>Rekompensata 40, 70 i 100 euro w tym półroczu</h2>
<p>Do odsetek dolicza się rekompensatę za koszty odzyskiwania należności. Jej wartość w złotych zależy od miesiąca, w którym należność stała się wymagalna:</p>
${monthTable(hm)}` : ''}
${ctaBand('Policz odsetki co do grosza', 'Wpisz kwotę i termin płatności - resztę zrobi kalkulator.')}
<div class="pager">${prev ? link(prev.path, `← ${prev.label}`, ' class="btn"') : '<span></span>'}${next ? link(next.path, `${next.label} →`, ' class="btn"') : '<span></span>'}</div>
<p class="small muted">Podstawa prawna: art. 4 pkt 3 oraz art. 11b ${ACT}.</p>
</div></section>`
  });
});

/* ---- odsetki ustawowe (KC) ---- */
{
  const f = faq([
    ['Kiedy stosuje się odsetki ustawowe za opóźnienie z Kodeksu cywilnego?', `<p>Zawsze wtedy, gdy dłużnik spóźnia się ze spełnieniem świadczenia pieniężnego, a wysokość odsetek nie została ustalona w umowie i nie stosuje się przepisów o transakcjach handlowych - np. przy pożyczce między osobami prywatnymi, czynszu najmu mieszkania albo niezapłaconej fakturze wystawionej konsumentowi.</p>`],
    ['Czym są odsetki maksymalne za opóźnienie?', `<p>To górna granica odsetek, jakie można zastrzec w umowie na wypadek opóźnienia: dwukrotność odsetek ustawowych za opóźnienie, czyli obecnie ${pct(now.maks)} rocznie. Jeśli umowa przewiduje więcej, należą się odsetki maksymalne.</p>`],
    ['Czy odsetki ustawowe za opóźnienie to to samo co odsetki ustawowe?', `<p>Nie. „Odsetki ustawowe” (kapitałowe, art. 359 KC) to wynagrodzenie za korzystanie z cudzych pieniędzy - stopa referencyjna + 3,5 pkt proc., obecnie ${pct(now.kapitalowe)}. „Odsetki ustawowe za opóźnienie” (art. 481 KC) to sankcja za nieterminową zapłatę - stopa referencyjna + 5,5 pkt proc., obecnie ${pct(now.ustawowe)}.</p>`]
  ]);
  page({
    path: '/odsetki-ustawowe-za-opoznienie/',
    title: `Odsetki ustawowe za opóźnienie ${YEAR} - aktualnie ${pct(now.ustawowe)} (tabela zmian)`,
    desc: `Odsetki ustawowe za opóźnienie z Kodeksu cywilnego wynoszą ${pct(now.ustawowe)} od ${C.fmtDate(curRefFrom)}. Odsetki maksymalne: ${pct(now.maks)}. Tabela wszystkich zmian od 2016 r., wzór i kalkulator.`,
    crumbs: [['/odsetki-ustawowe-za-opoznienie/', 'Odsetki ustawowe za opóźnienie']], jsonld: [f.ld],
    body: `<section class="hero"><div class="wrap narrow">
<h1>Odsetki ustawowe za opóźnienie (Kodeks cywilny)</h1>
<p class="lead">Od ${C.fmtDateLong(curRefFrom)} odsetki ustawowe za opóźnienie wynoszą <strong>${pct(now.ustawowe)}</strong> w skali roku. Zmieniają się za każdym razem, gdy Rada Polityki Pieniężnej zmienia stopę referencyjną NBP.</p>
<ul class="kpis">
<li><span class="k">Odsetki ustawowe za opóźnienie</span><span class="v">${pct(now.ustawowe)}</span><span class="s">stopa referencyjna + 5,5 pkt proc.</span></li>
<li><span class="k">Odsetki maksymalne za opóźnienie</span><span class="v">${pct(now.maks)}</span><span class="s">dwukrotność ustawowych</span></li>
<li><span class="k">Odsetki ustawowe (kapitałowe)</span><span class="v">${pct(now.kapitalowe)}</span><span class="s">stopa referencyjna + 3,5 pkt proc.</span></li>
</ul>
</div></section>
<section class="prose"><div class="wrap narrow">
<h2>Tabela zmian od 2016 r.</h2>
<div class="table-scroll"><table class="data">
<thead><tr><th>Obowiązuje od</th><th>do</th><th class="num">Stopa referencyjna NBP</th><th class="num">Odsetki za opóźnienie</th><th class="num">Maksymalne</th></tr></thead>
<tbody>${[...refPeriods].reverse().map((r) => `<tr${!r.to ? ' class="now"' : ''}><td>${C.fmtDate(r.from)}</td><td>${r.to ? C.fmtDate(r.to) : 'nadal'}</td><td class="num">${pct(r.ref)}</td><td class="num">${pct(r.rate)}</td><td class="num">${pct(r.max)}</td></tr>`).join('\n')}</tbody></table></div>
<h2>Jak obliczyć odsetki</h2>
<p>Wzór: <strong>kwota zaległości × stopa × liczba dni opóźnienia / 365</strong>. Jeżeli w trakcie opóźnienia stopa się zmieniła, każdy okres liczy się osobno według stawki, która wtedy obowiązywała. Przykład: 5&nbsp;000 zł zapłacone 60 dni po terminie przy obecnej stawce to 5&nbsp;000 × ${pct(now.ustawowe)} × 60 / 365 = <strong>${zl(interest(500000, now.ustawowe, 60))}</strong>.</p>
${ctaBand('Policz odsetki ustawowe', 'W kalkulatorze wybierz „Odsetki ustawowe za opóźnienie (Kodeks cywilny)”.')}
<h2>Firma czy konsument - które odsetki</h2>
<p>Jeżeli obie strony zawarły umowę w ramach działalności gospodarczej, wierzycielowi przysługują wyższe ${link('/odsetki-w-transakcjach-handlowych/', 'odsetki w transakcjach handlowych')} (obecnie ${pct(now.handlowe)}) oraz ${link('/rekompensata-40-euro/', 'rekompensata 40, 70 lub 100 euro')}. W pozostałych przypadkach stosuje się odsetki opisane na tej stronie.</p>
<h2>Najczęstsze pytania</h2>
${f.html}
<p class="small muted">Podstawa prawna: art. 481 § 2 i § 2¹ oraz art. 359 § 2 Kodeksu cywilnego.</p>
</div></section>`
  });
}

/* ---- wezwanie do zapłaty ---- */
{
  const f = faq([
    ['Czy wezwanie do zapłaty jest obowiązkowe przed pozwem?', `<p>Formalnie nie, ale w pozwie trzeba podać, czy strony podjęły próbę pozasądowego rozwiązania sporu, a jeśli nie - wyjaśnić dlaczego (art. 187 § 1 pkt 3 Kodeksu postępowania cywilnego). Wezwanie do zapłaty jest najprostszym dowodem takiej próby i często wystarcza, żeby dłużnik zapłacił.</p>`],
    ['Jak wysłać wezwanie, żeby mieć dowód doręczenia?', `<p>Najpewniej listem poleconym za potwierdzeniem odbioru. Dodatkowo warto wysłać skan e-mailem na adres, z którego kontrahent prowadził korespondencję - przyspiesza to reakcję. Zachowaj dowód nadania i kopię pisma.</p>`],
    ['Jaki termin wyznaczyć na zapłatę?', `<p>Przepisy go nie określają. Zwyczajowo wyznacza się 7 dni od doręczenia wezwania; przy dużych kwotach bywa 14 dni. Zbyt krótki termin (np. 1 dzień) może zostać uznany za nierealny.</p>`],
    ['Co zrobić, gdy dłużnik nie zareaguje?', `<p>Kolejnym krokiem jest pozew - przy bezspornych należnościach udokumentowanych fakturą najszybsze i najtańsze jest elektroniczne postępowanie upominawcze (e-sąd). Do żądania dolicza się odsetki i rekompensatę wyliczone w kalkulatorze.</p>`]
  ]);
  page({
    path: '/wezwanie-do-zaplaty/',
    title: `Wezwanie do zapłaty - generator z odsetkami i rekompensatą 40 euro (wzór ${YEAR})`,
    desc: 'Bezpłatny generator przedsądowego wezwania do zapłaty. Sam wylicza odsetki za opóźnienie i rekompensatę 40, 70 lub 100 euro, wpisuje podstawy prawne. PDF w 2 minuty, bez rejestracji.',
    tool: true, crumbs: [['/wezwanie-do-zaplaty/', 'Wezwanie do zapłaty']], jsonld: [f.ld],
    body: `<section class="hero"><div class="wrap">
<h1>Wezwanie do zapłaty - generator z odsetkami i rekompensatą</h1>
<p class="lead">Wpisz zaległe faktury, a dostaniesz gotowe przedsądowe wezwanie do zapłaty: z kwotą główną, odsetkami policzonymi co do dnia, rekompensatą 40, 70 lub 100 euro i podstawami prawnymi.</p>
</div></section>
<div class="wrap">${toolHtml('wezwanie')}</div>
<section class="prose"><div class="wrap narrow">
<h2>Co powinno zawierać wezwanie do zapłaty</h2>
<ul>
<li>dane wierzyciela i dłużnika oraz datę i miejsce sporządzenia,</li>
<li>dokładną kwotę z rozbiciem na należność główną, odsetki i rekompensatę,</li>
<li>wskazanie faktur lub umowy, z których wynika dług, wraz z terminami płatności,</li>
<li>termin zapłaty i numer rachunku bankowego,</li>
<li>informację o skierowaniu sprawy do sądu w razie braku zapłaty,</li>
<li>podpis wierzyciela lub osoby upoważnionej.</li>
</ul>
<p>Generator wypełnia wszystkie te elementy automatycznie. Pola, których nie uzupełnisz w formularzu, zostaną w dokumencie zaznaczone na żółto - możesz je wpisać bezpośrednio w podglądzie.</p>
<h2>Dlaczego warto doliczyć odsetki i rekompensatę</h2>
<p>Bo zwykle podwajają motywację dłużnika. Samo wezwanie „proszę zapłacić fakturę” nic go nie kosztuje. Wezwanie, w którym do faktury na 3&nbsp;000 zł doliczono ${zl(curMonth.p40)} rekompensaty i odsetki rosnące o ${zl(interest(300000, now.handlowe, 1))} dziennie, pokazuje, że zwłoka ma cenę. A rekompensata należy się nawet wtedy, gdy po wezwaniu faktura zostanie zapłacona.</p>
<h2>Najczęstsze pytania</h2>
${f.html}
</div></section>`
  });
}

/* ---- nota odsetkowa ---- */
page({
  path: '/nota-odsetkowa/',
  title: `Nota odsetkowa - generator i wzór ${YEAR} (odsetki handlowe i ustawowe)`,
  desc: `Generator noty odsetkowej: sam liczy dni opóźnienia i odsetki według aktualnych stawek (${pct(now.handlowe)} w transakcjach handlowych, ${pct(now.ustawowe)} ustawowe). Gotowy dokument do wydruku.`,
  tool: true, crumbs: [['/nota-odsetkowa/', 'Nota odsetkowa']],
  body: `<section class="hero"><div class="wrap">
<h1>Nota odsetkowa - generator</h1>
<p class="lead">Kontrahent zapłacił po terminie albo wciąż zalega? Nota odsetkowa to dokument, którym obciążasz go odsetkami za opóźnienie. Kalkulator policzy je co do dnia i przygotuje notę z tabelą okresów i stawek.</p>
</div></section>
<div class="wrap">${toolHtml('nota-odsetkowa')}</div>
<section class="prose"><div class="wrap narrow">
<h2>Co to jest nota odsetkowa</h2>
<p>To dokument księgowy, w którym wierzyciel informuje dłużnika o wysokości naliczonych odsetek za opóźnienie i wzywa do ich zapłaty. Nie jest fakturą - odsetki nie podlegają VAT. Wystawienie noty nie jest warunkiem powstania odsetek (należą się z mocy prawa), ale w praktyce bez niej dłużnik nie wie, ile ma dopłacić.</p>
<h2>Co powinna zawierać</h2>
<ul>
<li>numer i datę wystawienia, dane wystawcy i odbiorcy,</li>
<li>wskazanie faktur, których dotyczy, z kwotami i terminami płatności,</li>
<li>okres opóźnienia, liczbę dni, zastosowaną stopę i kwotę odsetek dla każdej pozycji,</li>
<li>łączną kwotę do zapłaty, termin i rachunek bankowy,</li>
<li>podstawę prawną naliczenia odsetek.</li>
</ul>
<h2>Kiedy wystawić notę</h2>
<p>Najczęściej po zapłacie faktury - wtedy znana jest ostateczna liczba dni opóźnienia. Przy długich zaległościach notę można wystawić na konkretny dzień, a dalsze odsetki doliczyć później. Do noty odsetkowej warto dołączyć ${link('/nota-obciazeniowa-rekompensata/', 'notę obciążeniową na rekompensatę 40, 70 lub 100 euro')}.</p>
<h2>Księgowanie</h2>
<p>U wierzyciela odsetki za opóźnienie są przychodem podatkowym dopiero w momencie ich otrzymania. Samo wystawienie noty nie powoduje powstania przychodu.</p>
</div></section>`
});

/* ---- nota obciążeniowa (rekompensata) ---- */
page({
  path: '/nota-obciazeniowa-rekompensata/',
  title: `Nota obciążeniowa na rekompensatę 40 euro - generator i wzór ${YEAR}`,
  desc: `Generator noty obciążeniowej na rekompensatę 40, 70 lub 100 euro. Sam dobiera kurs NBP z właściwego dnia (teraz ${C.fmtMid(curMonth.rate.mid)}) i wpisuje numer tabeli. Gotowy dokument do wydruku.`,
  tool: true, crumbs: [['/nota-obciazeniowa-rekompensata/', 'Nota obciążeniowa - rekompensata']],
  body: `<section class="hero"><div class="wrap">
<h1>Nota obciążeniowa na rekompensatę 40 euro - generator</h1>
<p class="lead">Rekompensatę za koszty odzyskiwania należności dokumentuje się notą obciążeniową. Kalkulator ustali próg (40, 70 lub 100 euro), dobierze kurs NBP z właściwego dnia i przygotuje notę z numerem tabeli kursów.</p>
</div></section>
<div class="wrap">${toolHtml('nota-rekompensata')}</div>
<section class="prose"><div class="wrap narrow">
<h2>Dlaczego nota, a nie faktura</h2>
<p>Rekompensata nie jest zapłatą za towar ani usługę, więc nie podlega VAT i nie można jej dokumentować fakturą. Właściwym dokumentem jest nota obciążeniowa (nota księgowa). Powinna wskazywać podstawę prawną - art. 10 ust. 1 ${ACT} - oraz sposób wyliczenia kwoty.</p>
<h2>Co wpisać w nocie</h2>
<ul>
<li>fakturę, której dotyczyło opóźnienie, jej kwotę i termin płatności,</li>
<li>dzień, w którym należność stała się wymagalna,</li>
<li>kwotę w euro (40, 70 lub 100) i zastosowany kurs NBP z datą i numerem tabeli,</li>
<li>kwotę w złotych, termin zapłaty i rachunek bankowy.</li>
</ul>
<p>W ${curMonth.loc} obowiązuje kurs ${C.fmtMid(curMonth.rate.mid)} z ${C.fmtDate(curMonth.rate.d)}: 40 euro = ${zl(curMonth.p40)}, 70 euro = ${zl(curMonth.p70)}, 100 euro = ${zl(curMonth.p100)}. Kursy dla innych miesięcy znajdziesz w zestawieniu ${link('/rekompensata-40-euro/', 'Rekompensata 40 euro')}.</p>
<h2>Jedna nota na kilka faktur</h2>
<p>Rekompensata przysługuje od każdej transakcji osobno, ale można ją ująć w jednej nocie zbiorczej - z osobnym wierszem dla każdej faktury, bo kursy i progi mogą się różnić. Tak właśnie przygotowuje ją generator.</p>
</div></section>`
});

/* ---- Pro ---- */
page({
  path: '/pro/', noindex: !PRO_ON, appJs: true,
  title: `${NAME} Pro - komplet dokumentów windykacyjnych za ${PRICE}`,
  desc: `Jednorazowa opłata ${PRICE}: nota odsetkowa, nota obciążeniowa na rekompensatę, dowolna liczba faktur, eksport do Worda. Bez abonamentu.`,
  crumbs: [['/pro/', 'Pro']],
  body: `<section class="hero"><div class="wrap narrow">
<h1>${esc(NAME)} Pro</h1>
<p class="lead">${PRO_ON ? `Jednorazowo ${PRICE}, bez abonamentu. Kalkulator i wezwanie do zapłaty pozostają bezpłatne - Pro dodaje resztę dokumentów i zdejmuje limity.` : 'Obecnie wszystkie funkcje serwisu są dostępne bezpłatnie.'}</p>
</div></section>
<section class="prose"><div class="wrap narrow" id="pt-pro-page">
<div class="card">
<ul class="ticks">
<li><strong>Nota odsetkowa</strong> z tabelą okresów, stawek i dni opóźnienia</li>
<li><strong>Nota obciążeniowa na rekompensatę</strong> 40/70/100 euro z kursem i numerem tabeli NBP</li>
<li><strong>Dowolna liczba faktur</strong> w jednej sprawie (bezpłatnie: ${FREE_INV}) i wklejanie listy prosto z arkusza</li>
<li><strong>Eksport do Worda</strong> (.doc) i dokumenty bez stopki serwisu</li>
</ul>
${PRO_ON ? `<a class="btn btn-primary btn-lg" href="${esc(cfg.pro.checkoutUrl)}" target="_blank" rel="noopener">Kup dostęp Pro - ${PRICE}</a>
<p class="small muted" style="margin:10px 0 0">Jedna zaległa faktura to co najmniej ${zl(curMonth.p40)} rekompensaty - Pro zwraca się przy pierwszej nocie.</p>` : ''}
<hr class="divider">
<p class="form-msg" data-pro-status></p>
<div data-pro-form></div>
</div>
<h2>Jak to działa</h2>
<ol>
<li>Po opłaceniu zamówienia od razu otrzymujesz kod aktywacyjny.</li>
<li>Wpisujesz go na tej stronie albo w kalkulatorze - funkcje Pro odblokowują się natychmiast.</li>
<li>Kod działa bezterminowo. Możesz go użyć ponownie na innym swoim urządzeniu lub po wyczyszczeniu przeglądarki.</li>
</ol>
<p class="small muted">Dostęp Pro jest treścią cyfrową dostarczaną natychmiast po zakupie. Szczegóły w ${link('/regulamin/', 'regulaminie')}.</p>
</div></section>`
});

/* ---- o serwisie ---- */
{
  const o = cfg.owner || {};
  const contact = o.name || o.email
    ? `<p>${o.name ? `Serwis prowadzi: <strong>${esc(o.name)}</strong>${o.address ? `, ${esc(o.address)}` : ''}.<br>` : ''}${o.email ? `Kontakt: <a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : ''}</p>`
    : '<p>Uwagi i zgłoszenia błędów prosimy kierować do administratora serwisu.</p>';
  page({
    path: '/o-serwisie/',
    title: `O serwisie, metodologia obliczeń i kontakt | ${NAME}`,
    desc: `Jak ${NAME} liczy odsetki i rekompensatę: źródła danych (NBP), zasady liczenia dni, zaokrąglenia, przesuwanie terminów. Kontakt z autorem.`,
    crumbs: [['/o-serwisie/', 'O serwisie']],
    body: `<section class="hero"><div class="wrap narrow"><h1>O serwisie i metodologia obliczeń</h1>
<p class="lead">${esc(NAME)} to bezpłatny kalkulator dla przedsiębiorców i księgowych, którzy chcą szybko i poprawnie policzyć należności za opóźnioną płatność.</p></div></section>
<section class="prose"><div class="wrap narrow">
<h2>Skąd pochodzą dane</h2>
<ul>
<li><strong>Stopa referencyjna NBP</strong> - z oficjalnych plików Narodowego Banku Polskiego, razem z całą historią zmian.</li>
<li><strong>Kurs euro</strong> - tabela A kursów średnich NBP, pobierana przez publiczne API (api.nbp.pl).</li>
</ul>
<p>Dane odświeżają się automatycznie każdego dnia roboczego. Ostatnia aktualizacja: ${C.fmtDateLong(meta.updated)} Jeżeli potrzebny kurs nie jest jeszcze zapisany na stronie, kalkulator pobiera go bezpośrednio z NBP.</p>
<h2>Jak liczymy</h2>
<ul>
<li><strong>Dni opóźnienia</strong> - od dnia następującego po terminie płatności do dnia zapłaty (lub wskazanego dnia naliczenia) włącznie.</li>
<li><strong>Termin w dzień wolny</strong> - termin wypadający w sobotę, niedzielę lub święto ustawowe przesuwamy na najbliższy dzień roboczy zgodnie z art. 115 Kodeksu cywilnego. Opcję można wyłączyć.</li>
<li><strong>Odsetki</strong> - kwota × stopa × liczba dni / 365, osobno dla każdego okresu obowiązywania danej stopy; wynik każdego okresu zaokrąglamy do grosza.</li>
<li><strong>Odsetki w transakcjach handlowych</strong> - stopa referencyjna NBP z 1 stycznia lub 1 lipca + 10 pkt proc. (8 pkt proc. dla publicznych podmiotów leczniczych; do końca 2019 r. zawsze 8 pkt proc.).</li>
<li><strong>Odsetki ustawowe za opóźnienie</strong> - stopa referencyjna NBP + 5,5 pkt proc., zmiana z dniem zmiany stopy.</li>
<li><strong>Odsetki umowne</strong> - według podanej stopy, nie więcej niż odsetki maksymalne za opóźnienie.</li>
<li><strong>Wpłaty częściowe</strong> - pomniejszają należność główną od dnia następującego po wpłacie.</li>
<li><strong>Rekompensata</strong> - 40, 70 lub 100 euro według kwoty faktury, po średnim kursie NBP z ostatniego dnia roboczego miesiąca poprzedzającego miesiąc wymagalności; wynik zaokrąglamy do grosza.</li>
</ul>
<p>Kalkulator obsługuje terminy płatności od 1 stycznia 2016 r.</p>
<h2>Zastrzeżenie</h2>
<p>Serwis ma charakter informacyjny. Nie jest kancelarią prawną i nie udziela porad prawnych ani podatkowych. Wygenerowane dokumenty są wzorami, które przed wysłaniem należy sprawdzić i dostosować do własnej sytuacji. W sprawach spornych lub o dużej wartości warto skorzystać z pomocy radcy prawnego lub adwokata.</p>
<h2>Kontakt</h2>
${contact}
</div></section>`
  });

  /* ---- regulamin ---- */
  page({
    path: '/regulamin/',
    title: `Regulamin | ${NAME}`,
    desc: `Regulamin korzystania z serwisu ${NAME}: zasady korzystania z kalkulatora, dostęp Pro, odpowiedzialność, reklamacje.`,
    crumbs: [['/regulamin/', 'Regulamin']],
    body: `<section class="hero"><div class="wrap narrow"><h1>Regulamin serwisu</h1></div></section>
<section class="prose"><div class="wrap narrow">
<h2>1. Postanowienia ogólne</h2>
<p>Regulamin określa zasady korzystania z serwisu ${esc(NAME)}${SITE_URL ? ` dostępnego pod adresem ${esc(SITE_URL)}` : ''}. Usługodawcą jest ${o.name ? esc(o.name) + (o.address ? ', ' + esc(o.address) : '') : 'administrator serwisu'}${o.email ? `, kontakt: ${esc(o.email)}` : ''}.</p>
<h2>2. Zakres usług</h2>
<p>Serwis udostępnia bezpłatnie kalkulator odsetek za opóźnienie i rekompensaty za koszty odzyskiwania należności, generator wzorów dokumentów oraz zestawienia stawek i kursów. Do korzystania wystarczy aktualna przeglądarka internetowa z włączoną obsługą JavaScript. Rejestracja nie jest wymagana.</p>
<h2>3. Charakter informacji</h2>
<p>Wyniki obliczeń i wzory dokumentów mają charakter informacyjny i pomocniczy. Nie stanowią porady prawnej, podatkowej ani opinii w indywidualnej sprawie. Użytkownik samodzielnie weryfikuje dane wejściowe, wyniki i treść dokumentów przed ich wykorzystaniem. Usługodawca dokłada starań, aby stawki i kursy były aktualne, ale nie gwarantuje bezbłędności i w najszerszym zakresie dopuszczalnym przez prawo nie odpowiada za skutki wykorzystania wyników.</p>
<h2>4. Dostęp Pro</h2>
<p>${PRO_ON ? `Dostęp Pro to płatna treść cyfrowa odblokowująca dodatkowe funkcje serwisu, opisane na stronie ${link('/pro/', 'Pro')}. Opłata jest jednorazowa (${PRICE}). Płatność obsługuje zewnętrzny operator wskazany przy zakupie. Po zapłacie kupujący otrzymuje kod aktywacyjny do własnego użytku.` : 'Serwis może w przyszłości oferować płatny dostęp do dodatkowych funkcji. Jego zasady zostaną opisane w tym punkcie.'}</p>
<p>Kod aktywacyjny jest dostarczany niezwłocznie po zapłacie. Konsument, który wyraził zgodę na dostarczenie treści cyfrowej przed upływem terminu do odstąpienia od umowy i został poinformowany o utracie tego prawa, nie może odstąpić od umowy po otrzymaniu kodu. Niezależnie od tego, jeżeli funkcje Pro nie działają zgodnie z opisem, kupujący może złożyć reklamację.</p>
<h2>5. Reklamacje</h2>
<p>Reklamacje i uwagi można zgłaszać${o.email ? ` na adres ${esc(o.email)}` : ' administratorowi serwisu'}. Odpowiedź zostanie udzielona w ciągu 14 dni. Konsument może skorzystać z pozasądowych sposobów rozpatrywania reklamacji, m.in. z pomocy miejskiego lub powiatowego rzecznika konsumentów.</p>
<h2>6. Linki partnerskie i wsparcie</h2>
<p>Serwis może zawierać oznaczone linki partnerskie do usług podmiotów trzecich oraz odnośnik umożliwiający dobrowolne wsparcie autora. Za usługi podmiotów trzecich odpowiadają ich dostawcy.</p>
<h2>7. Postanowienia końcowe</h2>
<p>Zasady przetwarzania danych opisuje ${link('/polityka-prywatnosci/', 'polityka prywatności')}. Regulamin może ulec zmianie; aktualna wersja jest zawsze dostępna na tej stronie. Wersja z dnia ${C.fmtDateLong(meta.updated)}</p>
</div></section>`
  });

  /* ---- polityka prywatności ---- */
  const third = [];
  if (cfg.analytics?.goatcounter) third.push('<li><strong>GoatCounter</strong> - statystyki odwiedzin bez plików cookie i bez identyfikowania użytkowników.</li>');
  if (cfg.analytics?.cloudflareToken) third.push('<li><strong>Cloudflare Web Analytics</strong> - zbiorcze statystyki odwiedzin bez plików cookie.</li>');
  if (cfg.adsenseClient) third.push('<li><strong>Google AdSense</strong> - wyświetlanie reklam; Google może używać plików cookie na zasadach opisanych w swoim komunikacie o zgodzie.</li>');
  page({
    path: '/polityka-prywatnosci/',
    title: `Polityka prywatności | ${NAME}`,
    desc: `Polityka prywatności serwisu ${NAME}: dane wpisane w kalkulatorze nie opuszczają przeglądarki. Jakie dane techniczne są przetwarzane i przez kogo.`,
    crumbs: [['/polityka-prywatnosci/', 'Polityka prywatności']],
    body: `<section class="hero"><div class="wrap narrow"><h1>Polityka prywatności</h1>
<p class="lead">W skrócie: to, co wpisujesz w kalkulatorze, nie trafia na żaden serwer.</p></div></section>
<section class="prose"><div class="wrap narrow">
<h2>Dane wpisywane w kalkulatorze</h2>
<p>Kwoty, numery faktur, dane wierzyciela i dłużnika są przetwarzane wyłącznie w Twojej przeglądarce. Serwis ich nie wysyła, nie zapisuje na serwerze i nie ma do nich dostępu. Dla wygody formularz zapamiętuje wpisane dane w pamięci lokalnej przeglądarki (localStorage) na Twoim urządzeniu. Usuniesz je przyciskiem „Wyczyść dane” w kalkulatorze albo czyszcząc dane witryny w przeglądarce.</p>
<h2>Kod Pro</h2>
<p>Informacja o aktywacji dostępu Pro również zapisuje się tylko lokalnie w przeglądarce. Zakup odbywa się na stronie zewnętrznego operatora płatności, który jest odrębnym administratorem danych podanych przy zamówieniu.</p>
<h2>Dane techniczne</h2>
<p>Strona jest serwowana przez dostawcę hostingu, który - jak każdy serwer WWW - może przetwarzać adres IP i podstawowe dane techniczne żądania w celu dostarczenia strony i zapewnienia bezpieczeństwa. Kurs euro, którego nie ma jeszcze na stronie, przeglądarka pobiera bezpośrednio z publicznego API Narodowego Banku Polskiego (api.nbp.pl); do NBP nie są przekazywane żadne dane wpisane w kalkulatorze.</p>
${third.length ? `<h2>Narzędzia podmiotów trzecich</h2><ul>${third.join('')}</ul>` : '<h2>Pliki cookie i śledzenie</h2><p>Serwis nie używa plików cookie do śledzenia ani profilowania i nie zawiera skryptów reklamowych.</p>'}
<h2>Administrator i Twoje prawa</h2>
<p>Administratorem danych w zakresie, w jakim dochodzi do ich przetwarzania (np. korespondencja e-mail), jest ${o.name ? esc(o.name) : 'administrator serwisu'}${o.email ? `, kontakt: ${esc(o.email)}` : ''}. Przysługuje Ci prawo dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, sprzeciwu oraz skargi do Prezesa Urzędu Ochrony Danych Osobowych.</p>
<p class="small muted">Wersja z dnia ${C.fmtDateLong(meta.updated)}</p>
</div></section>`
  });
}

/* ---- 404 ---- */
page({
  path: '/404.html', file: '/404.html', noindex: true,
  title: `Nie znaleziono strony | ${NAME}`, desc: 'Nie znaleziono strony.',
  body: `<section class="hero"><div class="wrap narrow"><h1>Nie ma takiej strony</h1>
<p class="lead">Adres mógł się zmienić. Najważniejsze miejsca:</p>
<ul><li>${link('/', 'Kalkulator odsetek i rekompensaty')}</li><li>${link(curMonth.path, `Rekompensata 40 euro - ${curMonth.name}`)}</li><li>${link('/odsetki-w-transakcjach-handlowych/', 'Odsetki w transakcjach handlowych')}</li></ul>
</div></section>`
});

/* =================== ZAPIS =================== */
await rm(DIST, { recursive: true, force: true });
await mkdir(path.join(DIST, 'assets'), { recursive: true });

for (const [name, content] of Object.entries(files)) await writeFile(path.join(DIST, name), content);
for (const pg of pages) {
  const out = path.join(DIST, pg.file);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, pg.html);
}
await writeFile(path.join(DIST, 'favicon.svg'), LOGO.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(' aria-hidden="true"', ''));
await writeFile(path.join(DIST, '.nojekyll'), '');
const indexable = pages.filter((p) => !p.noindex);
const base = SITE_URL || 'https://example.invalid';
await writeFile(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable.map((p) => `<url><loc>${base}${p.path}</loc><lastmod>${meta.updated}</lastmod></url>`).join('\n')}\n</urlset>\n`);
await writeFile(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n${SITE_URL ? `Sitemap: ${SITE_URL}/sitemap.xml\n` : ''}`);
if (cfg.indexNowKey) await writeFile(path.join(DIST, `${cfg.indexNowKey}.txt`), cfg.indexNowKey);

/* ---------- raport ---------- */
console.log(`Zbudowano ${pages.length} stron -> dist/  (kurs ${curMonth.name}: ${curMonth.rate.mid}, odsetki handlowe: ${now.handlowe}%)`);
const todo = [];
if (!SITE_URL) todo.push('adres strony (SITE_URL / siteUrl) - bez niego brak canonical i poprawnej mapy strony');
if (!cfg.owner?.name || !cfg.owner?.email) todo.push('owner.name i owner.email - dane usługodawcy w regulaminie i kontakcie');
if (!PRO_ON && !cfg.support?.url && !(cfg.affiliates || []).length) todo.push('ŻADNE źródło przychodu nie jest podłączone (pro.checkoutUrl / support.url / affiliates)');
else {
  if (!PRO_ON) todo.push('pro.checkoutUrl - sprzedaż Pro wyłączona, wszystkie funkcje są darmowe');
  if (!cfg.support?.url) todo.push('support.url - brak przycisku wsparcia');
}
if (!cfg.verification?.google) todo.push('verification.google - strona niezgłoszona w Google Search Console');
if (todo.length) console.log('\nDo uzupełnienia w site.config.json:\n' + todo.map((t) => '  • ' + t).join('\n'));
