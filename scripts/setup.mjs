#!/usr/bin/env node
// Jednorazowa konfiguracja sekretów:
//  - losuje kod aktywacyjny Pro, zapisuje go w private/ (katalog NIE trafia do repozytorium),
//    a do site.config.json wpisuje tylko jego skrót SHA-256,
//  - losuje klucz IndexNow (zgłaszanie zmian do Binga).
// Ponowne uruchomienie niczego nie zmienia, tylko odświeża plik z wiadomością dla kupującego.
// Nowy kod (unieważnia stary):  node scripts/setup.mjs --new-code
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomInt, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CFG = path.join(ROOT, 'site.config.json');
const PRIV = path.join(ROOT, 'private');
const SALT = 'poterminie:';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';        // bez 0/O/1/I/L – łatwiej przepisać

const cfg = JSON.parse(await readFile(CFG, 'utf8'));
cfg.pro ||= {};
await mkdir(PRIV, { recursive: true });

const normalize = (c) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');
const hashOf = (c) => createHash('sha256').update(SALT + normalize(c)).digest('hex');
const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

let code = null;
try { code = (await readFile(path.join(PRIV, 'kod-pro.txt'), 'utf8')).trim(); } catch { /* brak */ }
const forceNew = process.argv.includes('--new-code');
if (forceNew || !code || hashOf(code) !== cfg.pro.codeHash) {
  if (!forceNew && code && cfg.pro.codeHash) console.warn('! Kod w private/kod-pro.txt nie pasuje do skrótu w konfiguracji — generuję nowy.');
  code = `PT-${group()}-${group()}-${group()}`;
  cfg.pro.codeHash = hashOf(code);
  await writeFile(path.join(PRIV, 'kod-pro.txt'), code + '\n');
  console.log('Wygenerowano nowy kod Pro (private/kod-pro.txt).');
} else {
  console.log('Kod Pro już istnieje — bez zmian.');
}
if (!cfg.indexNowKey) { cfg.indexNowKey = randomBytes(16).toString('hex'); console.log('Wygenerowano klucz IndexNow.'); }
await writeFile(CFG, JSON.stringify(cfg, null, 2) + '\n');

const site = (cfg.siteUrl || '').replace(/\/+$/, '') || 'https://TWOJA-DOMENA';
await writeFile(path.join(PRIV, 'wiadomosc-dla-kupujacego.txt'), `Dziękujemy za zakup ${cfg.siteName || 'PoTerminie'} Pro!

Twój kod aktywacyjny:  ${code}

Jak aktywować:
1. Wejdź na ${site}/pro/
2. Wpisz kod i kliknij „Aktywuj”.

Albo po prostu otwórz ten link — aktywuje Pro automatycznie:
${site}/pro/?kod=${code}

Kod działa bezterminowo. Możesz go użyć ponownie na innym swoim urządzeniu
lub po wyczyszczeniu danych przeglądarki. Prosimy nie udostępniać go innym osobom.
`);
console.log(`Wiadomość dla kupującego: private/wiadomosc-dla-kupujacego.txt  (adres strony: ${site})`);
console.log(`Link do przekierowania po płatności: ${site}/pro/?kod=${code.replace(/./g, (ch, i) => (i < 3 ? ch : '•'))}  (pełny w pliku)`);
