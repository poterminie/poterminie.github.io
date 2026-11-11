#!/usr/bin/env node
// Pobiera oficjalne dane NBP i zapisuje je w data/*.json. Uruchamiane codziennie przez GitHub Actions.
//  - stopa referencyjna NBP (historia)            -> data/ref-rates.json
//  - średni kurs EUR z ostatniego dnia roboczego
//    każdego miesiąca (tabela A)                  -> data/eur-month-end.json
// Gdy NBP jest niedostępny, zostawia dotychczasowe dane (strona dalej działa).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import '../src/calc.js';

const C = globalThis.PTCalc;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const UA = { 'User-Agent': 'Mozilla/5.0 (static-site-data-refresh)', Accept: 'application/json, text/xml, */*' };
const FIRST_YEAR = 2015;

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(path.join(DATA, file), 'utf8')); } catch { return fallback; }
}
async function writeJsonIfChanged(file, value) {
  const next = JSON.stringify(value, null, 1) + '\n';
  let prev = null;
  try { prev = await readFile(path.join(DATA, file), 'utf8'); } catch { /* nowy plik */ }
  if (prev === next) return false;
  await writeFile(path.join(DATA, file), next);
  return true;
}
async function get(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { lastErr = e; await new Promise((res) => setTimeout(res, 1500 * (i + 1))); }
  }
  throw new Error(`${url}: ${lastErr?.message || lastErr}`);
}
const num = (s) => parseFloat(String(s).replace(',', '.'));

/* ---------- stopa referencyjna ---------- */
async function updateRefRates() {
  const existing = await readJson('ref-rates.json', []);
  const found = new Map(existing.map((e) => [e.from, e.rate]));
  try {
    const arch = await get('https://static.nbp.pl/dane/stopy/stopy_procentowe_archiwum.xml');
    const re = /<pozycje\s+obowiazuje_od="(\d{4}-\d{2}-\d{2})"\s*>([\s\S]*?)<\/pozycje>/g;
    let m, n = 0;
    while ((m = re.exec(arch || ''))) {
      const r = /id="ref"\s+oprocentowanie="([\d,]+)"/.exec(m[2]);
      if (r) { found.set(m[1], num(r[1])); n++; }
    }
    if (!n) throw new Error('nie rozpoznano formatu archiwum');
  } catch (e) { console.warn('! Archiwum stóp NBP niedostępne:', e.message); }
  try {
    const cur = await get('https://static.nbp.pl/dane/stopy/stopy_procentowe.xml');
    const tag = /<pozycja[^>]*id="ref"[^>]*>/.exec(cur || '');
    if (tag) {
      const rate = /oprocentowanie="([\d,]+)"/.exec(tag[0]);
      const from = /obowiazuje_od="(\d{4}-\d{2}-\d{2})"/.exec(tag[0]);
      if (rate && from) found.set(from[1], num(rate[1]));
    }
  } catch (e) { console.warn('! Bieżące stopy NBP niedostępne:', e.message); }

  const all = [...found.entries()].map(([from, rate]) => ({ from, rate })).sort((a, b) => (a.from < b.from ? -1 : 1));
  // zostaw historię od stopy obowiązującej 1.01.2016 i usuń wpisy bez zmiany stopy referencyjnej
  const out = [];
  for (const e of all) {
    if (!(e.rate >= 0 && e.rate < 40)) throw new Error(`Podejrzana stopa referencyjna ${e.rate} (${e.from})`);
    if (out.length && out[out.length - 1].rate === e.rate) continue;
    out.push(e);
  }
  let startIdx = 0;
  for (let i = 0; i < out.length; i++) if (out[i].from <= '2016-01-01') startIdx = i;
  const trimmed = out.slice(startIdx);
  if (!trimmed.length) throw new Error('Brak danych o stopie referencyjnej NBP');
  if (existing.length && trimmed[trimmed.length - 1].from < existing[existing.length - 1].from) throw new Error('Nowe dane są starsze niż zapisane');
  return { changed: await writeJsonIfChanged('ref-rates.json', trimmed), list: trimmed };
}

/* ---------- kurs EUR na koniec miesiąca ---------- */
async function updateEur(today) {
  const existing = await readJson('eur-month-end.json', {});
  const out = { ...existing };
  const thisYear = +today.slice(0, 4);
  for (let y = FIRST_YEAR; y <= thisYear; y++) {
    // rok jest kompletny, jeśli mamy już jego grudzień
    if (out[`${y}-12`] && y < thisYear) continue;
    const from = y === FIRST_YEAR ? `${y}-11-01` : `${y}-01-01`;
    const to = y === thisYear ? today : `${y}-12-31`;
    let body;
    try { body = await get(`https://api.nbp.pl/api/exchangerates/rates/a/eur/${from}/${to}/?format=json`); }
    catch (e) { console.warn(`! Kursy EUR ${y} niedostępne:`, e.message); continue; }
    if (!body) continue;
    const rates = JSON.parse(body).rates || [];
    const lastPerMonth = {};
    for (const r of rates) lastPerMonth[r.effectiveDate.slice(0, 7)] = r;
    for (const [key, r] of Object.entries(lastPerMonth)) {
      const [yy, mm] = key.split('-').map(Number);
      const monthOver = today > C.monthEnd(yy, mm);
      const isLastBusinessDay = r.effectiveDate === C.lastBusinessDay(yy, mm);
      if (!monthOver && !isLastBusinessDay) continue;               // miesiąc jeszcze trwa
      if (!(r.mid > 2.5 && r.mid < 8)) throw new Error(`Podejrzany kurs EUR ${r.mid} (${r.effectiveDate})`);
      out[key] = { d: r.effectiveDate, mid: r.mid, no: r.no };
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
  return { changed: await writeJsonIfChanged('eur-month-end.json', sorted), map: sorted };
}

await mkdir(DATA, { recursive: true });
const today = C.todayWarsaw();
const ref = await updateRefRates();
const eur = await updateEur(today);
const keys = Object.keys(eur.map);
if (ref.changed || eur.changed || !(await readJson('meta.json', null))) {
  await writeJsonIfChanged('meta.json', { updated: today });
}
console.log(`Stopa referencyjna NBP: ${ref.list[ref.list.length - 1].rate}% od ${ref.list[ref.list.length - 1].from} (${ref.list.length} zmian od 2015 r.)${ref.changed ? ' [ZMIANA]' : ''}`);
console.log(`Kursy EUR na koniec miesiąca: ${keys.length} miesięcy, ostatni ${keys[keys.length - 1]} = ${eur.map[keys[keys.length - 1]].mid}${eur.changed ? ' [ZMIANA]' : ''}`);
