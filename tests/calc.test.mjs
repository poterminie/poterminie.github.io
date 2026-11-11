#!/usr/bin/env node
// Testy silnika obliczeń. Uruchamiane lokalnie i w GitHub Actions przed każdym wdrożeniem -
// jeśli dane NBP albo logika się rozjadą, wdrożenie zostaje zatrzymane i działa poprzednia wersja strony.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import '../src/calc.js';

const C = globalThis.PTCalc;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ref = JSON.parse(await readFile(path.join(ROOT, 'data/ref-rates.json'), 'utf8'));
const eur = JSON.parse(await readFile(path.join(ROOT, 'data/eur-month-end.json'), 'utf8'));
const E = C.create({ ref, eur });

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.error(`✗ ${name}\n    jest:      ${JSON.stringify(got)}\n    powinno:   ${JSON.stringify(want)}`); }
}
const one = (inv, opt = {}) => E.compute({ invoices: [{ id: 1, ...inv }], rateType: 'handlowe', calcDate: '2026-11-10', compensation: true, art115: true, ...opt });

/* --- stawki urzędowe (zgodne z obwieszczeniami w Monitorze Polskim) --- */
eq('handlowe 2019', E.commercialRate('2019-08-01', false), 9.5);
eq('handlowe I 2020', E.commercialRate('2020-03-01', false), 11.5);
eq('handlowe II 2020', E.commercialRate('2020-09-01', false), 10.1);
eq('handlowe I 2022', E.commercialRate('2022-02-01', false), 11.75);
eq('handlowe II 2022', E.commercialRate('2022-08-01', false), 16);
eq('handlowe I 2023', E.commercialRate('2023-02-01', false), 16.75);
eq('handlowe II 2024', E.commercialRate('2024-10-01', false), 15.75);
eq('handlowe II 2025', E.commercialRate('2025-10-01', false), 15.25);
eq('handlowe I 2026', E.commercialRate('2026-02-01', false), 14);
eq('handlowe II 2026', E.commercialRate('2026-11-10', false), 13.75);
eq('handlowe leczniczy II 2026', E.commercialRate('2026-11-10', true), 11.75);
eq('ustawowe za opóźnienie 2019', E.statutoryRate('2019-08-01'), 7);
eq('ustawowe za opóźnienie XI 2026', E.statutoryRate('2026-11-10'), 9.25);
eq('maksymalne XI 2026', E.maxRate('2026-11-10'), 18.5);
eq('kapitałowe XI 2026', E.capitalRate('2026-11-10'), 7.25);

/* --- kalendarz --- */
eq('Wielkanoc 2025', C.easter(2025), '2025-04-20');
eq('Wielkanoc 2026', C.easter(2026), '2026-04-05');
eq('Wielkanoc 2027', C.easter(2027), '2027-03-28');
eq('Boże Ciało 2026', C.isHoliday('2026-06-04'), true);
eq('Wigilia 2025 wolna', C.isHoliday('2025-12-24'), true);
eq('Wigilia 2024 robocza', C.isHoliday('2024-12-24'), false);
eq('art. 115: sobota 31.10.2026 -> pon. 2.11', C.adjustDue('2026-10-31'), '2026-11-02');
eq('art. 115: dzień roboczy bez zmian', C.adjustDue('2026-11-10'), '2026-11-10');
eq('ostatni dzień roboczy X 2026', C.lastBusinessDay(2026, 10), '2026-10-30');

// Kalendarz dni roboczych musi się zgadzać z faktycznymi publikacjami tabel NBP
let calMismatch = [];
for (const [key, e] of Object.entries(eur)) {
  const [y, m] = key.split('-').map(Number);
  if (C.lastBusinessDay(y, m) !== e.d) calMismatch.push(`${key}: NBP ${e.d}, kalendarz ${C.lastBusinessDay(y, m)}`);
}
eq('kalendarz zgodny z tabelami NBP (wszystkie miesiące)', calMismatch, []);
eq('dane EUR obejmują co najmniej 130 miesięcy', Object.keys(eur).length >= 130, true);

/* --- odsetki handlowe przez zmianę półrocza --- */
let r = one({ amount: '10000', due: '2026-01-15' }, { calcDate: '2026-10-15', compensation: false });
eq('A: segmenty', r.invoices[0].segments.map((s) => [s.from, s.to, s.days, s.rate, s.interestGr]), [
  ['2026-01-16', '2026-06-30', 166, 14, 63671],
  ['2026-07-01', '2026-10-15', 107, 13.75, 40308]
]);
eq('A: odsetki', r.totals.interestGr, 103979);
eq('A: dni', r.invoices[0].daysLate, 273);
eq('A: razem', r.totals.totalGr, 1000000 + 103979);

/* --- rekompensata: progi i kurs --- */
r = one({ amount: '5000', due: '2026-10-31' });
eq('B: termin przesunięty', [r.invoices[0].dueAdjusted, r.invoices[0].delayStart, r.invoices[0].shifted], ['2026-11-02', '2026-11-03', true]);
eq('B: 40 EUR po kursie z 30.10.2026', [r.invoices[0].comp.eur, r.invoices[0].comp.rateDate, r.invoices[0].comp.mid, r.invoices[0].comp.plnGr], [40, '2026-10-30', 4.3955, 17582]);
eq('B: 5000,01 zł -> 70 EUR', one({ amount: '5000,01', due: '2026-10-31' }).invoices[0].comp.plnGr, 30769);
eq('B: 49999,99 zł -> 70 EUR', one({ amount: '49 999,99', due: '2026-10-31' }).invoices[0].comp.eur, 70);
eq('B: 50000 zł -> 100 EUR', one({ amount: '50000', due: '2026-10-31' }).invoices[0].comp.plnGr, 43955);
r = one({ amount: '1000', due: '2026-10-30' });
eq('C: wymagalne 31.10 -> kurs z 30.09', [r.invoices[0].comp.key, r.invoices[0].comp.rateDate, r.invoices[0].comp.plnGr], ['2026-09', '2026-09-30', 17469]);
eq('C: bez art. 115 termin 31.10 -> wymagalne 1.11', one({ amount: '1000', due: '2026-10-31' }, { art115: false }).invoices[0].comp.key, '2026-10');
eq('C: przed 2020 r. zawsze 40 EUR', one({ amount: '80000', due: '2019-06-10' }, { calcDate: '2019-12-01' }).invoices[0].comp.eur, 40);
eq('C: przy odsetkach z KC brak rekompensaty', one({ amount: '1000', due: '2026-10-01' }, { rateType: 'ustawowe' }).invoices[0].comp, null);
eq('C: brak kursu -> oczekuje', (() => { const x = one({ amount: '1000', due: '2026-12-10' }, { calcDate: '2026-12-20' }); return [x.invoices[0].comp.pending, x.missingEur]; })(), [true, ['2026-11']]);

/* --- zapłata po terminie --- */
r = one({ amount: '1000', due: '2026-09-10', paidOn: '2026-09-20' });
eq('D: 10 dni, zapłacono', [r.invoices[0].daysLate, r.invoices[0].interestGr, r.invoices[0].outstandingGr, r.invoices[0].comp.plnGr], [10, 377, 0, 17306]);
eq('D: razem = odsetki + rekompensata', r.totals.totalGr, 377 + 17306);
r = one({ amount: '1000', due: '2026-09-10', paidOn: '2026-09-10' });
eq('E: zapłata w terminie', [r.invoices[0].delayed, r.invoices[0].interestGr, r.invoices[0].comp, r.totals.totalGr], [false, 0, null, 0]);
r = one({ amount: '1000', due: '2026-10-31', paidOn: '2026-11-02' });
eq('E: zapłata w przesuniętym terminie (art. 115)', [r.invoices[0].delayed, r.totals.totalGr], [false, 0]);
r = one({ amount: '1000', due: '2026-12-01' });
eq('E: termin jeszcze nie minął', [r.invoices[0].delayed, r.totals.interestGr, r.totals.principalGr, r.totals.notDueGr, r.totals.totalGr], [false, 0, 0, 100000, 0]);

/* --- wpłaty częściowe --- */
r = one({ amount: '10000', due: '2026-07-01', payments: [{ date: '2026-07-31', amount: '4000' }] }, { calcDate: '2026-08-30', compensation: false });
eq('F: segmenty', r.invoices[0].segments.map((s) => [s.from, s.to, s.days, s.principalGr, s.interestGr]), [
  ['2026-07-02', '2026-07-31', 30, 1000000, 11301],
  ['2026-08-01', '2026-08-30', 30, 600000, 6781]
]);
eq('F: pozostało', r.invoices[0].outstandingGr, 600000);
r = one({ amount: '10000', due: '2026-07-01', payments: [{ date: '2026-06-20', amount: '4000' }], paidOn: '2026-07-11' }, { compensation: false });
eq('G: wpłata przed terminem + spłata reszty', [r.invoices[0].segments.length, r.invoices[0].segments[0].principalGr, r.invoices[0].segments[0].days, r.invoices[0].outstandingGr], [1, 600000, 10, 0]);

/* --- odsetki z KC przez zmianę stopy NBP --- */
r = one({ amount: '10000', due: '2026-02-27' }, { rateType: 'ustawowe', calcDate: '2026-03-10' });
eq('H: segmenty KC', r.invoices[0].segments.map((s) => [s.from, s.to, s.days, s.rate, s.interestGr]), [
  ['2026-02-28', '2026-03-04', 5, 9.5, 1301],
  ['2026-03-05', '2026-03-10', 6, 9.25, 1521]
]);

/* --- odsetki umowne --- */
r = one({ amount: '10000', due: '2026-10-01' }, { rateType: 'umowne', customRate: '12', calcDate: '2026-10-31', compensation: false });
eq('I: umowne 12%', [r.invoices[0].segments[0].rate, r.invoices[0].interestGr], [12, 9863]);
r = one({ amount: '10000', due: '2026-10-01' }, { rateType: 'umowne', customRate: '30', calcDate: '2026-10-31', compensation: false });
eq('I: umowne ograniczone do maksymalnych', [r.invoices[0].segments[0].rate, r.invoices[0].capped], [18.5, true]);
eq('I: brak stopy umownej -> błąd', one({ amount: '1', due: '2026-10-01' }, { rateType: 'umowne', customRate: '' }).errors.length, 1);

/* --- kilka faktur --- */
r = E.compute({ invoices: [{ id: 1, amount: '1000', due: '2026-09-10' }, { id: 2, amount: '6000', due: '2026-09-10' }, { id: 3, amount: '', due: '' }], rateType: 'handlowe', calcDate: '2026-11-10', compensation: true, art115: true });
eq('J: sumy', [r.totals.count, r.totals.compEur, r.totals.compGr, r.totals.principalGr], [2, { 40: 1, 70: 1 }, 17306 + 30285, 700000]);

/* --- parsowanie i formatowanie --- */
eq('kwota "1 234,56"', C.parseAmount('1 234,56'), 123456);
eq('kwota "1.234,56"', C.parseAmount('1.234,56'), 123456);
eq('kwota "1234.5"', C.parseAmount('1234.5'), 123450);
eq('kwota "abc"', Number.isNaN(C.parseAmount('abc')), true);
eq('format', C.fmtMoney(123456789), '1 234 567,89');
eq('słownie 1234,56', C.amountWords(123456), 'jeden tysiąc dwieście trzydzieści cztery złote 56/100');
eq('słownie 1,00', C.amountWords(100), 'jeden złoty 00/100');
eq('słownie 22,00', C.amountWords(2200), 'dwadzieścia dwa złote 00/100');
eq('słownie 12 000,00', C.amountWords(1200000), 'dwanaście tysięcy złotych 00/100');
eq('słownie 2 000 115,07', C.amountWords(200011507), 'dwa miliony sto piętnaście złotych 07/100');
eq('słownie 0,45', C.amountWords(45), 'zero złotych 45/100');
eq('data', [C.fmtDate('2026-10-30'), C.fmtDateLong('2026-10-30')], ['30.10.2026', '30 października 2026 r.']);
eq('termin sprzed 2016 r.', one({ amount: '100', due: '2015-05-01' }).invoices[0].errors.length, 1);

console.log(`${pass} testów OK${fail ? `, ${fail} BŁĘDÓW` : ''}`);
process.exit(fail ? 1 : 0);
