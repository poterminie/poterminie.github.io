#!/usr/bin/env node
// Materiały do sprzedaży dostępu Pro (np. na naffy.io) -> private/sprzedaz/
//   PoTerminie-Pro-kod-aktywacyjny.pdf   plik, który kupujący dostaje po płatności (zawiera kod!)
//   okladka-pro.png                      grafika produktu 1080x1080 (tylko Windows - rysuje ją PowerShell)
//   opis-produktu.txt                    teksty do wklejenia w formularzu produktu
// PDF powstaje bez żadnych zależności: skrypt sam składa plik i osadza w nim czcionkę Verdana z systemu.
// Uruchom ponownie po zmianie kodu (setup.mjs --new-code), ceny lub adresu strony.
//   --preview   dodatkowo zapisuje podglad-bez-kodu.pdf (ten sam układ, kod zastąpiony X-ami)
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRIV = path.join(ROOT, 'private');
const OUT = path.join(PRIV, 'sprzedaz');
const cfg = JSON.parse(await readFile(path.join(ROOT, 'site.config.json'), 'utf8'));
const site = String(cfg.siteUrl || '').replace(/\/+$/, '');
const name = cfg.siteName || 'PoTerminie';
const price = cfg.pro?.priceLabel || '29 zł';
const freeInv = cfg.pro?.freeInvoices || 3;
const contact = cfg.owner?.email || '';
if (!site) { console.error('Najpierw ustaw "siteUrl" w site.config.json.'); process.exit(1); }
let code;
try { code = (await readFile(path.join(PRIV, 'kod-pro.txt'), 'utf8')).trim(); }
catch { console.error('Brak private/kod-pro.txt - uruchom najpierw: node scripts/setup.mjs'); process.exit(1); }
const host = site.replace(/^https?:\/\//, '');
await mkdir(OUT, { recursive: true });

/* ================= PDF ================= */
const FONT_DIRS = ['C:/Windows/Fonts', '/Library/Fonts', '/System/Library/Fonts/Supplemental', '/usr/share/fonts/truetype/msttcorefonts'];
const findFont = (names) => { for (const d of FONT_DIRS) for (const n of names) { const p = path.join(d, n); if (existsSync(p)) return p; } return null; };

function loadFont(file, tag, psName) {
  const b = readFileSync(file), t = {};
  for (let i = 0, n = b.readUInt16BE(4); i < n; i++) { const o = 12 + i * 16; t[b.toString('latin1', o, o + 4)] = b.readUInt32BE(o + 8); }
  const upm = b.readUInt16BE(t.head + 18);
  const bbox = [36, 38, 40, 42].map((o) => b.readInt16BE(t.head + o));
  const ascent = b.readInt16BE(t.hhea + 4), descent = b.readInt16BE(t.hhea + 6), nHM = b.readUInt16BE(t.hhea + 34);
  const os2 = t['OS/2'];
  const fsType = os2 != null ? b.readUInt16BE(os2 + 8) : 0;
  const capHeight = os2 != null && b.readUInt16BE(os2) >= 2 ? b.readInt16BE(os2 + 88) : ascent;
  if (fsType & 0x0002) throw new Error(`Czcionka ${path.basename(file)} nie pozwala na osadzanie w dokumentach.`);
  let sub = null;
  for (let i = 0, n = b.readUInt16BE(t.cmap + 2); i < n; i++) {
    const o = t.cmap + 4 + i * 8;
    if (b.readUInt16BE(o) === 3 && b.readUInt16BE(o + 2) === 1) sub = t.cmap + b.readUInt32BE(o + 4);
  }
  if (sub == null || b.readUInt16BE(sub) !== 4) throw new Error('Nieobsługiwana tablica znaków w ' + file);
  const segX2 = b.readUInt16BE(sub + 6), endO = sub + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
  const gid = (cp) => {
    for (let i = 0; i < segX2; i += 2) {
      if (cp > b.readUInt16BE(endO + i)) continue;
      const start = b.readUInt16BE(startO + i);
      if (cp < start) return 0;
      const delta = b.readUInt16BE(deltaO + i), ro = b.readUInt16BE(rangeO + i);
      if (ro === 0) return (cp + delta) & 0xffff;
      const g = b.readUInt16BE(rangeO + i + ro + 2 * (cp - start));
      return g === 0 ? 0 : (g + delta) & 0xffff;
    }
    return 0;
  };
  const adv = (g) => b.readUInt16BE(t.hmtx + 4 * Math.min(g, nHM - 1));
  return { buf: b, tag, psName, upm, bbox, ascent, descent, capHeight, gid, adv, used: new Map() };
}

function buildPdf(theCode) {
  const regPath = findFont(['verdana.ttf', 'Verdana.ttf']), boldPath = findFont(['verdanab.ttf', 'Verdana Bold.ttf', 'Verdana_Bold.ttf']);
  if (!regPath || !boldPath) throw new Error('Nie znaleziono czcionki Verdana (verdana.ttf, verdanab.ttf).');
  const R = loadFont(regPath, 'F1', 'Verdana'), B = loadFont(boldPath, 'F2', 'Verdana-Bold');
  const W = 595.28, H = 841.89, M = 57, CW = W - 2 * M;
  const INK = '#16191d', MUTED = '#4a535e', ACC = '#0a6b4d', SOFT = '#eef7f3', LINE = '#d9d5cb', WHITE = '#ffffff';
  const activate = `${site}/pro/?kod=${theCode}`;
  const c = [], links = [];
  const f = (v) => (Math.round(v * 100) / 100).toString();
  const rgb = (hex) => { const v = parseInt(hex.slice(1), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255].map((x) => f(x / 255)).join(' '); };
  const enc = (font, s) => { let hx = ''; for (const ch of s) { const cp = ch.codePointAt(0), g = font.gid(cp); if (!g && cp !== 32) throw new Error(`Brak znaku „${ch}” w czcionce ${font.psName}`); font.used.set(g, cp); hx += g.toString(16).padStart(4, '0'); } return `<${hx}>`; };
  const width = (font, s, size, cs = 0) => { let w = 0, n = 0; for (const ch of s) { w += font.adv(font.gid(ch.codePointAt(0))); n++; } return w * size / font.upm + cs * Math.max(0, n - 1); };
  const text = (x, y, s, font, size, color, o = {}) => {
    const cs = o.cs || 0, w = width(font, s, size, cs);
    if (o.align === 'center') x -= w / 2; else if (o.align === 'right') x -= w;
    c.push(`BT /${font.tag} ${f(size)} Tf ${rgb(color)} rg ${f(cs)} Tc 1 0 0 1 ${f(x)} ${f(H - y)} Tm ${enc(font, s)} Tj ET`);
    return w;
  };
  const wrap = (s, font, size, maxW) => { const out = []; let cur = ''; for (const w of s.split(' ')) { const t = cur ? cur + ' ' + w : w; if (cur && width(font, t, size) > maxW) { out.push(cur); cur = w; } else cur = t; } if (cur) out.push(cur); return out; };
  const para = (x, y, s, font, size, color, maxW, lh) => { for (const l of wrap(s, font, size, maxW)) { text(x, y, l, font, size, color); y += lh; } return y; };
  const rr = (x, yTop, w, h, r, { fill, stroke, lw = 1 } = {}) => {
    const k = 0.5523 * r, y = H - yTop - h, p = (...a) => a.map(f).join(' ');
    c.push('q', fill ? `${rgb(fill)} rg` : '', stroke ? `${rgb(stroke)} RG ${f(lw)} w` : '',
      `${p(x + r, y)} m`, `${p(x + w - r, y)} l`, `${p(x + w - r + k, y, x + w, y + r - k, x + w, y + r)} c`,
      `${p(x + w, y + h - r)} l`, `${p(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h)} c`,
      `${p(x + r, y + h)} l`, `${p(x + r - k, y + h, x, y + h - r + k, x, y + h - r)} c`,
      `${p(x, y + r)} l`, `${p(x, y + r - k, x + r - k, y, x + r, y)} c`, 'h', fill && stroke ? 'B' : fill ? 'f' : 'S', 'Q');
  };
  const link = (x, yTop, w, h, uri) => links.push(`<< /Type /Annot /Subtype /Link /Rect [${f(x)} ${f(H - yTop - h)} ${f(x + w)} ${f(H - yTop)}] /Border [0 0 0] /A << /S /URI /URI (${uri.replace(/[()\\]/g, '\\$&')}) >> >>`);
  const list = (x, y, w, items, numbered) => {
    const size = 9.5, lh = 14.4, ind = 15;
    items.forEach((it, i) => {
      text(x, y, numbered ? `${i + 1}.` : '•', numbered ? R : B, size, numbered ? MUTED : ACC);
      for (const l of wrap(it, R, size, w - ind)) { text(x + ind, y, l, R, size, INK); y += lh; }
      y += 4;
    });
    return y;
  };

  // logo: zielony kwadrat z tarczą zegara
  const lg = 28, lx = M, ly = 48, s = lg / 32, cx = lx + 16 * s, cyP = H - (ly + 16 * s), rad = 9.2 * s, kk = 0.5523 * rad;
  rr(lx, ly, lg, lg, 7, { fill: ACC });
  c.push('q', `${rgb('#91bcaf')} RG ${f(2 * s)} w`,
    `${f(cx + rad)} ${f(cyP)} m`, `${f(cx + rad)} ${f(cyP + kk)} ${f(cx + kk)} ${f(cyP + rad)} ${f(cx)} ${f(cyP + rad)} c`,
    `${f(cx - kk)} ${f(cyP + rad)} ${f(cx - rad)} ${f(cyP + kk)} ${f(cx - rad)} ${f(cyP)} c`,
    `${f(cx - rad)} ${f(cyP - kk)} ${f(cx - kk)} ${f(cyP - rad)} ${f(cx)} ${f(cyP - rad)} c`,
    `${f(cx + kk)} ${f(cyP - rad)} ${f(cx + rad)} ${f(cyP - kk)} ${f(cx + rad)} ${f(cyP)} c`, 'S', 'Q',
    'q', `${rgb(WHITE)} RG ${f(2.6 * s)} w 1 J 1 j`, `${f(cx)} ${f(H - (ly + 9.5 * s))} m`, `${f(cx)} ${f(cyP)} l`, `${f(lx + 20.6 * s)} ${f(H - (ly + 18.7 * s))} l`, 'S', 'Q');
  let bx = lx + lg + 9;
  bx += text(bx, ly + 20, 'Po', B, 15, INK);
  bx += text(bx, ly + 20, 'Terminie', B, 15, ACC);
  text(bx + 5, ly + 20, 'Pro', B, 15, INK);

  text(M, 150, 'Dziękujemy za zakup!', B, 27, INK);
  let y = para(M, 179, `To Twój kod aktywacyjny do pełnej wersji kalkulatora ${name}. Zachowaj ten plik - kod działa bezterminowo.`, R, 11.5, MUTED, 440, 17.5);

  const boxTop = y + 12, boxH = 172;
  rr(M, boxTop, CW, boxH, 10, { fill: SOFT, stroke: ACC, lw: 1.2 });
  text(W / 2, boxTop + 31, 'TWÓJ KOD AKTYWACYJNY', B, 8.5, ACC, { align: 'center', cs: 1.2 });
  text(W / 2, boxTop + 70, theCode, B, 27, INK, { align: 'center', cs: 2 });
  const bw = 256, bh = 34, btnX = (W - bw) / 2, btnTop = boxTop + 92;
  rr(btnX, btnTop, bw, bh, 8, { fill: ACC });
  text(W / 2, btnTop + 22, 'Aktywuj jednym kliknięciem', B, 11.5, WHITE, { align: 'center' });
  link(btnX, btnTop, bw, bh, activate);
  const uw = text(W / 2, btnTop + bh + 19, activate, R, 7.5, MUTED, { align: 'center' });
  link(W / 2 - uw / 2, btnTop + bh + 9, uw, 14, activate);

  const colGap = 28, colW = (CW - colGap) / 2, x2 = M + colW + colGap;
  let cy = boxTop + boxH + 36;
  text(M, cy, 'Jak aktywować', B, 12, INK);
  text(x2, cy, 'Co odblokowuje Pro', B, 12, INK);
  const yL = list(M, cy + 21, colW, [
    'Kliknij zielony przycisk powyżej - Pro włączy się automatycznie.',
    `Albo wejdź na ${host}/pro/, wpisz kod i kliknij „Aktywuj”.`,
    'Gotowe. Funkcje Pro są dostępne od razu w kalkulatorze.'
  ], true);
  const yR = list(x2, cy + 21, colW, [
    'Nota odsetkowa z tabelą okresów i stawek',
    'Nota obciążeniowa na rekompensatę 40/70/100 euro',
    'Dowolna liczba faktur naraz i wklejanie listy z arkusza',
    'Eksport do Worda, dokumenty bez stopki serwisu'
  ], false);
  y = Math.max(yL, yR) + 18;
  text(M, y, 'Dobrze wiedzieć', B, 12, INK);
  list(M, y + 21, CW, [
    'Aktywacja zapisuje się w przeglądarce. Na innym urządzeniu lub po wyczyszczeniu danych przeglądarki wpisz kod ponownie.',
    'Kod jest przeznaczony dla Ciebie i Twojej firmy - prosimy nie udostępniać go dalej.',
    'Dane wpisywane w kalkulatorze nie opuszczają Twojej przeglądarki.'
  ], false);

  c.push('q', `${rgb(LINE)} RG 0.75 w`, `${f(M)} ${f(52)} m ${f(W - M)} ${f(52)} l S`, 'Q');
  text(M, H - 38, `${name} - kalkulator odsetek za opóźnienie i rekompensaty 40 euro`, R, 7.5, MUTED);
  text(W - M, H - 38, contact ? `Kontakt: ${contact}` : host, R, 7.5, MUTED, { align: 'right' });
  if (contact) text(M, H - 27, host, R, 7.5, MUTED);

  /* ---- obiekty PDF ---- */
  const objs = [];
  const add = (dict, stream = null) => { objs.push({ dict, stream }); return objs.length; };
  const fontObj = (font) => {
    const k = 1000 / font.upm, gids = [...font.used.keys()].sort((a, b) => a - b);
    const file = add(`/Length1 ${font.buf.length} /Filter /FlateDecode`, deflateSync(font.buf, { level: 9 }));
    const desc = add(`/Type /FontDescriptor /FontName /${font.psName} /Flags 32 /FontBBox [${font.bbox.map((v) => Math.round(v * k)).join(' ')}] /ItalicAngle 0 /Ascent ${Math.round(font.ascent * k)} /Descent ${Math.round(font.descent * k)} /CapHeight ${Math.round(font.capHeight * k)} /StemV ${font.tag === 'F2' ? 140 : 80} /FontFile2 ${file} 0 R`);
    const cid = add(`/Type /Font /Subtype /CIDFontType2 /BaseFont /${font.psName} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${desc} 0 R /DW 1000 /W [${gids.map((g) => `${g} [${Math.round(font.adv(g) * k)}]`).join(' ')}] /CIDToGIDMap /Identity`);
    const rows = gids.map((g) => `<${g.toString(16).padStart(4, '0')}> <${font.used.get(g).toString(16).padStart(4, '0')}>`);
    let cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
    for (let i = 0; i < rows.length; i += 100) { const part = rows.slice(i, i + 100); cmap += `${part.length} beginbfchar\n${part.join('\n')}\nendbfchar\n`; }
    cmap += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n';
    const tou = add('/Filter /FlateDecode', deflateSync(Buffer.from(cmap, 'latin1')));
    return add(`/Type /Font /Subtype /Type0 /BaseFont /${font.psName} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${tou} 0 R`);
  };
  const f1 = fontObj(R), f2 = fontObj(B);
  const content = add('/Filter /FlateDecode', deflateSync(Buffer.from(c.filter(Boolean).join('\n'), 'latin1')));
  const pagesId = objs.length + 2;                       // strona -> następny obiekt, drzewo stron -> kolejny
  const page = add(`/Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R /Annots [${links.join(' ')}]`);
  add(`/Type /Pages /Kids [${page} 0 R] /Count 1`);
  const catalog = add(`/Type /Catalog /Pages ${pagesId} 0 R /Lang (pl-PL)`);
  const u16 = (s) => { let hx = 'FEFF'; for (const ch of s) hx += ch.codePointAt(0).toString(16).padStart(4, '0'); return `<${hx.toUpperCase()}>`; };
  const info = add(`/Title ${u16(`${name} Pro - kod aktywacyjny`)} /Producer (PoTerminie sales kit)`);

  const chunks = [Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'latin1')], offs = [];
  let pos = chunks[0].length;
  objs.forEach((o, i) => {
    offs.push(pos);
    const buf = o.stream
      ? Buffer.concat([Buffer.from(`${i + 1} 0 obj\n<< ${o.dict} /Length ${o.stream.length} >>\nstream\n`, 'latin1'), o.stream, Buffer.from('\nendstream\nendobj\n', 'latin1')])
      : Buffer.from(`${i + 1} 0 obj\n<< ${o.dict} >>\nendobj\n`, 'latin1');
    chunks.push(buf); pos += buf.length;
  });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n ').join('\n')}\ntrailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(chunks);
}

const kb = async (file) => { try { return Math.round((await stat(file)).size / 1024) + ' kB'; } catch { return 'BRAK'; } };
const pdfPath = path.join(OUT, 'PoTerminie-Pro-kod-aktywacyjny.pdf');
await writeFile(pdfPath, buildPdf(code));
console.log(`PDF dla kupującego:   private/sprzedaz/${path.basename(pdfPath)} (${await kb(pdfPath)})`);
if (process.argv.includes('--preview')) {
  await writeFile(path.join(OUT, 'podglad-bez-kodu.pdf'), buildPdf('PT-XXXX-XXXX-XXXX'));
  console.log('Podgląd układu:       private/sprzedaz/podglad-bez-kodu.pdf');
}

/* ================= okładka (Windows) ================= */
const png = path.join(OUT, 'okladka-pro.png');
if (process.platform === 'win32') {
  const args = ['-NoProfile', '-File', path.join(ROOT, 'scripts', 'cover.ps1'), '-Out', png, '-Name', name, '-Price', price, '-HostName', host,
    '-L1', 'Odzyskaj odsetki', '-L2a', 'i ', '-L2b', 'rekompensatę', '-L3', '40 euro',
    '-Items', 'Nota odsetkowa|Nota na rekompensatę 40 / 70 / 100 €|Bez limitu faktur, eksport do Worda', '-Sub', 'jednorazowo, bez abonamentu'];
  let ok = false;
  for (const exe of ['pwsh', 'powershell']) {
    try { await run(exe, args, { timeout: 60000 }); ok = true; break; } catch { /* spróbuj kolejnego */ }
  }
  console.log(ok ? `Okładka produktu:     private/sprzedaz/${path.basename(png)} (${await kb(png)})` : 'Okładki nie udało się wygenerować (PowerShell niedostępny) - użyj własnej grafiki 1080x1080.');
  // obraz 1200x630 do pola „Social image" (podgląd linku w wyszukiwarce i mediach społecznościowych)
  const social = path.join(OUT, 'social-1200x630.png');
  const sArgs = ['-NoProfile', '-File', path.join(ROOT, 'scripts', 'social.ps1'), '-Out', social, '-Name', name, '-Price', price,
    '-L1', 'Odzyskaj odsetki', '-L2', 'i rekompensatę 40 euro', '-Sub', 'Nota odsetkowa i nota obciążeniowa w 2 minuty', '-Note', 'jednorazowo, bez abonamentu'];
  for (const exe of ['pwsh', 'powershell']) {
    try { await run(exe, sArgs, { timeout: 60000 }); console.log(`Obraz do udostępnień: private/sprzedaz/${path.basename(social)} (${await kb(social)})`); break; } catch { /* spróbuj kolejnego */ }
  }
} else {
  console.log('Okładka produktu: generowana tylko na Windows - użyj własnej grafiki 1080x1080.');
}

/* ================= teksty do formularza produktu ================= */
await writeFile(path.join(OUT, 'opis-produktu.txt'), `MATERIAŁY DO SPRZEDAŻY - ${name} Pro
(wklej do formularza produktu, np. na naffy.io)
=====================================================================

NAZWA PRODUKTU
${name} Pro - nota odsetkowa i nota na rekompensatę 40 euro

CENA
${price} (jednorazowo)

RODZAJ PRODUKTU
Produkt cyfrowy / plik do pobrania

PLIK DLA KUPUJĄCEGO (wgraj jako produkt)
PoTerminie-Pro-kod-aktywacyjny.pdf

GRAFIKA PRODUKTU
okladka-pro.png

KRÓTKI OPIS
Kod odblokowujący pełną wersję kalkulatora ${name}. Komplet dokumentów do odzyskania odsetek i rekompensaty 40, 70 lub 100 euro za faktury zapłacone po terminie.

OPIS
Kontrahent zapłacił fakturę po terminie albo wciąż zalega? Od każdej takiej faktury należą Ci się odsetki za opóźnienie i rekompensata 40, 70 lub 100 euro - z mocy prawa, bez wezwania. ${name} Pro przygotuje dokumenty, którymi odzyskasz te pieniądze.

Co dostajesz:
• Notę odsetkową z tabelą okresów, stawek i dni opóźnienia
• Notę obciążeniową na rekompensatę 40/70/100 euro - z właściwym kursem NBP i numerem tabeli
• Dowolną liczbę faktur w jednej sprawie (w wersji bezpłatnej: ${freeInv}) i wklejanie listy prosto z arkusza
• Eksport dokumentów do Worda (.doc) i dokumenty bez stopki serwisu

Jak to działa:
1. Po płatności od razu otrzymujesz plik PDF z kodem aktywacyjnym.
2. Klikasz link z pliku albo wpisujesz kod na ${host}/pro/
3. Funkcje Pro włączają się natychmiast w kalkulatorze: ${host}/

Ważne:
• Płatność jednorazowa, bez abonamentu. Kod działa bezterminowo.
• Nic nie instalujesz - kalkulator działa w przeglądarce, a wpisane dane nie opuszczają Twojego urządzenia.
• Stawki odsetek i kursy euro aktualizują się automatycznie na podstawie danych NBP.
• Kalkulator i wezwanie do zapłaty są bezpłatne - możesz je sprawdzić przed zakupem.

Dla kogo: przedsiębiorcy, freelancerzy B2B, biura rachunkowe i działy księgowości, które rozliczają opóźnione płatności.

Serwis ma charakter informacyjny i nie stanowi porady prawnej.

KATEGORIA / TAGI (jeśli formularz o nie pyta)
finanse, księgowość, windykacja, faktury, narzędzia dla firm

WIADOMOŚĆ PO ZAKUPIE (jeśli platforma pozwala ustawić własną)
Dziękujemy za zakup ${name} Pro! Kod aktywacyjny i link do aktywacji znajdziesz w załączonym pliku PDF.
`);
console.log('Teksty do formularza: private/sprzedaz/opis-produktu.txt');
