/* Kalkulator ulgi na złe długi - korzysta z PTCalc.badDebt (src/calc.js). */
(function () {
  var C = window.PTCalc, root = document.getElementById('zd-tool');
  if (!C || !root) return;
  var $ = function (id) { return document.getElementById(id); };
  var zl = function (gr) { return C.fmtMoney(gr) + ' zł'; };
  var Q = ['I', 'II', 'III', 'IV'];

  function monthName(ym) { return C.M_NOM[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4); }

  function render() {
    var issue = $('zd-issue').value, due = $('zd-due').value, out = $('zd-out');
    var gross = C.parseAmount($('zd-gross').value), paid = C.parseAmount($('zd-paid').value) || 0;
    if (!issue || !due || !gross) {
      out.innerHTML = '<p class="result-empty">Podaj datę wystawienia, termin płatności i kwotę brutto - wynik pojawi się od razu.</p>';
      return;
    }
    var r = C.badDebt({ issue: issue, due: due, grossGr: gross, paidGr: paid, vatRate: +$('zd-rate').value, shift: $('zd-115').checked });
    var today = C.todayWarsaw(), q = +r.vatQuarter.slice(-1);
    var state;
    if (r.unpaidGr <= 0) state = '<p class="zd-badge zd-no">Faktura jest zapłacona - ulga nie przysługuje.</p>';
    else if (today > r.vatDeadline) state = '<p class="zd-badge zd-no">Termin minął - na korektę VAT było czas do ' + C.fmtDate(r.vatDeadline) + '.</p>';
    else if (today > r.day90) state = '<p class="zd-badge zd-ok">90 dni już minęło - możesz skorzystać z ulgi (jeśli spełniasz pozostałe warunki).</p>';
    else state = '<p class="zd-badge">Jeszcze ' + C.diff(today, r.day90) + ' ' + C.plural(C.diff(today, r.day90), ['dzień', 'dni', 'dni']) + ' do upływu 90 dni.</p>';
    out.innerHTML = state +
      '<table class="zd-table"><tbody>' +
      '<tr><th>Termin płatności' + (r.shifted ? ' <small>(przesunięty, art. 115 KC)</small>' : '') + '</th><td>' + C.fmtDate(r.due) + '</td></tr>' +
      '<tr><th>90. dzień od terminu</th><td><strong>' + C.fmtDate(r.day90) + '</strong></td></tr>' +
      '<tr><th>Korekta VAT najwcześniej w JPK_V7 za</th><td><strong>' + monthName(r.vatMonth) + '</strong><br><small>rozliczenie kwartalne: ' + Q[q - 1] + ' kwartał ' + r.vatQuarter.slice(0, 4) + '</small></td></tr>' +
      '<tr><th>Kwota VAT do odzyskania</th><td><strong>' + zl(r.vatGr) + '</strong></td></tr>' +
      '<tr><th>Zmniejszenie podstawy w PIT/CIT</th><td>' + zl(r.netGr) + ' <small>(netto)</small></td></tr>' +
      '<tr><th>Ostatni moment na korektę VAT</th><td>' + C.fmtDate(r.vatDeadline) + '</td></tr>' +
      '<tr><th>Ostatni moment na ulgę w PIT/CIT</th><td>' + C.fmtDate(r.pitDeadline) + '</td></tr>' +
      '</tbody></table>' +
      '<p class="small muted">Dłużnik w tym samym okresie (' + monthName(r.vatMonth) + ') ma obowiązek skorygować odliczony VAT i zwiększyć podstawę opodatkowania w PIT/CIT, jeśli do tego czasu nie zapłaci.</p>';
  }

  ['zd-issue', 'zd-due', 'zd-gross', 'zd-paid', 'zd-rate', 'zd-115'].forEach(function (id) {
    $(id).addEventListener('input', render);
    $(id).addEventListener('change', render);
  });
  render();
})();
