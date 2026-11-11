#!/usr/bin/env node
// Zgłasza adresy z dist/sitemap.xml do IndexNow (Bing, Seznam, Yandex i wyszukiwarki z nich korzystające).
// Uruchamiane przez GitHub Actions po wdrożeniu. Błąd nie przerywa wdrożenia.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  const cfg = JSON.parse(await readFile(path.join(ROOT, 'site.config.json'), 'utf8'));
  const site = String(process.env.SITE_URL || cfg.siteUrl || '').replace(/\/+$/, '');
  const key = cfg.indexNowKey;
  if (!site || !key) { console.log('IndexNow: brak adresu strony lub klucza - pomijam.'); process.exit(0); }
  const xml = await readFile(path.join(ROOT, 'dist/sitemap.xml'), 'utf8');
  const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((x) => x.startsWith(site));
  if (!urlList.length) { console.log('IndexNow: pusta mapa strony - pomijam.'); process.exit(0); }
  const r = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(site).host, key, keyLocation: `${site}/${key}.txt`, urlList }),
    signal: AbortSignal.timeout(20000)
  });
  console.log(`IndexNow: zgłoszono ${urlList.length} adresów, odpowiedź HTTP ${r.status}.`);
} catch (e) {
  console.log('IndexNow: nie udało się zgłosić adresów -', e.message);
}
