/*! PoTerminie - silnik obliczeń: odsetki za opóźnienie i rekompensata 40/70/100 EUR.
 *  Jeden plik dla przeglądarki (window.PTCalc) i Node (globalThis.PTCalc). Daty jako 'RRRR-MM-DD'. */
(function (root) {
  'use strict';

  var DAY = 86400000;
  var MIN_DATE = '2016-01-01';
  var FAR = '9999-12-31';

  var M_NOM = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
  var M_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  var M_LOC = ['styczniu', 'lutym', 'marcu', 'kwietniu', 'maju', 'czerwcu', 'lipcu', 'sierpniu', 'wrześniu', 'październiku', 'listopadzie', 'grudniu'];
  var M_SLUG = ['styczen', 'luty', 'marzec', 'kwiecien', 'maj', 'czerwiec', 'lipiec', 'sierpien', 'wrzesien', 'pazdziernik', 'listopad', 'grudzien'];
  var WD = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

  /* ---------- daty ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function D(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s == null ? '' : s));
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
    return d;
  }
  function iso(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function addDays(s, n) { return iso(new Date(D(s).getTime() + n * DAY)); }
  function diff(a, b) { return Math.round((D(b).getTime() - D(a).getTime()) / DAY); }
  function weekday(s) { return D(s).getUTCDay(); }
  function monthEnd(y, m) { return iso(new Date(Date.UTC(y, m, 0))); }
  function prevMonthKey(s) {
    var y = +s.slice(0, 4), m = +s.slice(5, 7) - 1;
    if (m === 0) { m = 12; y--; }
    return y + '-' + pad(m);
  }
  function nextMonthKey(key) {
    var y = +key.slice(0, 4), m = +key.slice(5, 7) + 1;
    if (m === 13) { m = 1; y++; }
    return y + '-' + pad(m);
  }
  function todayWarsaw() {
    try {
      var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      if (D(p)) return p;
    } catch (e) { /* fallback niżej */ }
    var n = new Date();
    return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate());
  }

  /* ---------- dni wolne (art. 115 KC, kalendarz NBP) ---------- */
  function easterDate(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(y, month - 1, day));
  }
  var holCache = {};
  function holidays(y) {
    if (holCache[y]) return holCache[y];
    var set = {}, e = easterDate(y);
    function add(m, d) { set[y + '-' + pad(m) + '-' + pad(d)] = 1; }
    add(1, 1); add(1, 6); add(5, 1); add(5, 3); add(8, 15); add(11, 1); add(11, 11); add(12, 25); add(12, 26);
    if (y >= 2025) add(12, 24);          // Wigilia - dzień wolny od 2025 r.
    if (y === 2018) add(11, 12);         // jednorazowe święto 12.11.2018
    [0, 1, 49, 60].forEach(function (off) { set[iso(new Date(e.getTime() + off * DAY))] = 1; }); // Wielkanoc, pon. wielkanocny, Zielone Świątki, Boże Ciało
    holCache[y] = set;
    return set;
  }
  function isHoliday(s) { return !!holidays(+s.slice(0, 4))[s]; }
  function isFreeDay(s) { var w = weekday(s); return w === 0 || w === 6 || isHoliday(s); }
  function isBusinessDay(s) { return !isFreeDay(s); }
  /** art. 115 KC: termin przypadający w sobotę lub dzień ustawowo wolny upływa następnego dnia roboczego. */
  function adjustDue(s) { var c = s, n = 0; while (isFreeDay(c) && n < 20) { c = addDays(c, 1); n++; } return c; }
  function lastBusinessDay(y, m) { var c = monthEnd(y, m); while (!isBusinessDay(c)) c = addDays(c, -1); return c; }

  /* ---------- kwoty ---------- */
  function parseAmount(v) {
    if (typeof v === 'number') return isFinite(v) ? Math.round(v * 100) : NaN;
    var s = String(v == null ? '' : v).replace(/[\s  ]/g, '').replace(/zł|pln/gi, '');
    if (!s) return NaN;
    var lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc > -1 && ld > -1) {
      s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (lc > -1) {
      s = s.replace(',', '.');
    }
    if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
    return Math.round(parseFloat(s) * 100);
  }
  function parseRate(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    var s = String(v == null ? '' : v).replace(/[\s% ]/g, '').replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
    return parseFloat(s);
  }
  function fmtMoney(gr) {
    var neg = gr < 0; gr = Math.abs(Math.round(gr));
    var zl = Math.floor(gr / 100), g = gr % 100;
    return (neg ? '-' : '') + String(zl).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + pad(g);
  }
  function fmtRate(r) { return (Math.round(r * 100) / 100).toFixed(2).replace('.', ','); }
  function fmtMid(m) { return Number(m).toFixed(4).replace('.', ','); }
  function fmtDate(s) { return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : ''; }
  function fmtDateLong(s) { return s ? (+s.slice(8, 10)) + ' ' + M_GEN[+s.slice(5, 7) - 1] + ' ' + s.slice(0, 4) + ' r.' : ''; }

  /* ---------- kwota słownie ---------- */
  var W1 = ['', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć'];
  var W11 = ['dziesięć', 'jedenaście', 'dwanaście', 'trzynaście', 'czternaście', 'piętnaście', 'szesnaście', 'siedemnaście', 'osiemnaście', 'dziewiętnaście'];
  var W10 = ['', '', 'dwadzieścia', 'trzydzieści', 'czterdzieści', 'pięćdziesiąt', 'sześćdziesiąt', 'siedemdziesiąt', 'osiemdziesiąt', 'dziewięćdziesiąt'];
  var W100 = ['', 'sto', 'dwieście', 'trzysta', 'czterysta', 'pięćset', 'sześćset', 'siedemset', 'osiemset', 'dziewięćset'];
  var WG = [null, ['tysiąc', 'tysiące', 'tysięcy'], ['milion', 'miliony', 'milionów'], ['miliard', 'miliardy', 'miliardów']];
  function plural(n, f) {
    if (n === 1) return f[0];
    var a = n % 10, b = n % 100;
    return (a >= 2 && a <= 4 && !(b >= 12 && b <= 14)) ? f[1] : f[2];
  }
  function triple(n) {
    var out = [], h = Math.floor(n / 100), r = n % 100;
    if (h) out.push(W100[h]);
    if (r >= 10 && r < 20) out.push(W11[r - 10]);
    else { if (r >= 20) out.push(W10[Math.floor(r / 10)]); if (r % 10) out.push(W1[r % 10]); }
    return out.join(' ');
  }
  function words(n) {
    n = Math.floor(n);
    if (n === 0) return 'zero';
    var parts = [], g = 0;
    while (n > 0 && g < 4) {
      var t = n % 1000;
      if (t) parts.unshift(triple(t) + (g ? ' ' + plural(t, WG[g]) : ''));
      n = Math.floor(n / 1000); g++;
    }
    return parts.join(' ');
  }
  function amountWords(gr) {
    gr = Math.round(gr);
    var zl = Math.floor(gr / 100), g = gr % 100;
    return words(zl) + ' ' + plural(zl, ['złoty', 'złote', 'złotych']) + ' ' + pad(g) + '/100';
  }

  /* ---------- silnik ---------- */
  var TYPES = {
    handlowe: { label: 'odsetki ustawowe za opóźnienie w transakcjach handlowych', commercial: true },
    handlowe_leczniczy: { label: 'odsetki ustawowe za opóźnienie w transakcjach handlowych (dłużnik: publiczny podmiot leczniczy)', commercial: true },
    ustawowe: { label: 'odsetki ustawowe za opóźnienie (art. 481 § 2 Kodeksu cywilnego)', commercial: false },
    umowne: { label: 'odsetki umowne za opóźnienie', commercial: true }
  };

  function compTier(amountGr, wymDate) {
    if (wymDate < '2020-01-01') return 40;                 // do końca 2019 r. zawsze 40 euro
    if (amountGr <= 500000) return 40;                      // do 5 000 zł
    if (amountGr < 5000000) return 70;                      // powyżej 5 000 zł i poniżej 50 000 zł
    return 100;                                             // 50 000 zł i więcej
  }

  function create(data) {
    data = data || {};
    var ref = (data.ref || []).slice().sort(function (a, b) { return a.from < b.from ? -1 : 1; });
    var eur = data.eur || {};

    function refOn(s) {
      var r = null;
      for (var i = 0; i < ref.length; i++) { if (ref[i].from <= s) r = ref[i].rate; else break; }
      return r;
    }
    function refUntil(s) { // ostatni dzień obowiązywania stopy z dnia s
      for (var i = 0; i < ref.length; i++) if (ref[i].from > s) return addDays(ref[i].from, -1);
      return FAR;
    }
    function halfStart(s) { return s.slice(0, 4) + (+s.slice(5, 7) <= 6 ? '-01-01' : '-07-01'); }
    function halfEnd(s) { return s.slice(0, 4) + (+s.slice(5, 7) <= 6 ? '-06-30' : '-12-31'); }
    function r2(x) { return Math.round(x * 100) / 100; }

    function commercialRate(s, healthcare) {
      var base = refOn(halfStart(s));
      if (base == null) return null;
      var margin = s >= '2020-01-01' ? (healthcare ? 8 : 10) : 8;
      return r2(base + margin);
    }
    function statutoryRate(s) { var b = refOn(s); return b == null ? null : r2(b + 5.5); }
    function maxRate(s) { var b = statutoryRate(s); return b == null ? null : r2(b * 2); }
    function capitalRate(s) { var b = refOn(s); return b == null ? null : r2(b + 3.5); }

    function rateInfo(type, s, custom) {
      if (type === 'handlowe') return { rate: commercialRate(s, false), until: halfEnd(s) };
      if (type === 'handlowe_leczniczy') return { rate: commercialRate(s, true), until: halfEnd(s) };
      if (type === 'umowne') {
        var cap = maxRate(s), capped = cap != null && custom > cap;
        return { rate: capped ? cap : r2(custom), until: refUntil(s), capped: capped };
      }
      return { rate: statutoryRate(s), until: refUntil(s) };
    }

    function compFor(amountGr, wymDate) {
      var eurAmt = compTier(amountGr, wymDate), key = prevMonthKey(wymDate), e = eur[key];
      var out = { eur: eurAmt, key: key, wym: wymDate, pending: !e };
      if (e) {
        out.mid = e.mid; out.rateDate = e.d; out.tableNo = e.no;
        out.plnGr = Math.round(eurAmt * Math.round(e.mid * 10000) / 100);
      } else { out.plnGr = 0; }
      return out;
    }

    function computeInvoice(inv, opt) {
      var out = { id: inv.id, number: String(inv.number || '').trim(), errors: [], notes: [], segments: [], interestGr: 0, comp: null, daysLate: 0, delayed: false, outstandingGr: 0 };
      var amountGr = parseAmount(inv.amount);
      var due = D(inv.due) ? inv.due : null;
      if (!(amountGr > 0) || !due) { out.incomplete = true; return out; }
      out.amountGr = amountGr; out.due = due; out.outstandingGr = amountGr;
      if (due < MIN_DATE) { out.errors.push('Kalkulator obsługuje terminy płatności od 1 stycznia 2016 r.'); return out; }

      var dueAdj = opt.art115 ? adjustDue(due) : due;
      out.dueAdjusted = dueAdj; out.shifted = dueAdj !== due;
      var start = addDays(dueAdj, 1), calc = opt.calcDate;
      out.delayStart = start;

      var pays = [];
      (inv.payments || []).forEach(function (p) {
        var g = parseAmount(p.amount);
        if (g > 0 && D(p.date)) pays.push({ date: p.date, gr: g });
      });
      if (inv.paidOn && D(inv.paidOn)) pays.push({ date: inv.paidOn, gr: Infinity, full: true });
      pays.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.full ? 1 : 0) - (b.full ? 1 : 0); });

      function segs(a, b, bal) {
        var cur = a, guard = 0;
        while (cur <= b && guard++ < 500) {
          var ri = rateInfo(opt.rateType, cur, opt.customRate);
          if (ri.rate == null) { out.errors.push('Brak danych o stopie procentowej dla dnia ' + fmtDate(cur) + '.'); return; }
          var to = ri.until < b ? ri.until : b;
          var days = diff(cur, to) + 1;
          var last = out.segments[out.segments.length - 1];
          if (last && last.rate === ri.rate && last.principalGr === bal && addDays(last.to, 1) === cur) { last.to = to; last.days += days; }
          else out.segments.push({ from: cur, to: to, days: days, principalGr: bal, rate: ri.rate, capped: !!ri.capped });
          cur = addDays(to, 1);
        }
      }

      var bal = amountGr, cursor = start, end = null, ignored = 0;
      for (var i = 0; i < pays.length && bal > 0; i++) {
        var p = pays[i];
        if (p.date > calc) { ignored++; continue; }
        var take = Math.min(bal, p.gr);
        if (p.date > dueAdj && p.date >= cursor) { segs(cursor, p.date, bal); cursor = addDays(p.date, 1); }
        bal -= take;
        if (bal === 0) end = p.date;
      }
      if (bal > 0 && calc >= cursor) segs(cursor, calc, bal);
      if (ignored) out.notes.push('Pominięto wpłaty z datą późniejszą niż dzień, na który liczone są odsetki.');

      out.outstandingGr = bal;
      out.paidInFull = bal === 0;
      out.paidOnTime = bal === 0 && out.segments.length === 0;
      out.delayed = out.segments.length > 0;
      for (var j = 0; j < out.segments.length; j++) {
        var sg = out.segments[j];
        sg.interestGr = Math.round(sg.principalGr * Math.round(sg.rate * 100) * sg.days / 3650000);
        out.interestGr += sg.interestGr;
        if (sg.capped) out.capped = true;
      }
      if (out.delayed) {
        out.delayEnd = out.segments[out.segments.length - 1].to;
        out.daysLate = diff(dueAdj, out.delayEnd);
      } else {
        out.delayEnd = end;
      }
      if (out.shifted) out.notes.push('Termin płatności ' + fmtDate(due) + ' (' + WD[weekday(due)] + (isHoliday(due) && weekday(due) % 6 !== 0 ? ', dzień wolny' : '') + ') przesunięto na ' + fmtDate(dueAdj) + ' - art. 115 KC.');
      if (out.capped) out.notes.push('Stopę umowną ograniczono do odsetek maksymalnych za opóźnienie (art. 481 § 2¹ KC).');

      var typeDef = TYPES[opt.rateType] || TYPES.handlowe;
      if (opt.compensation && typeDef.commercial && out.delayed) out.comp = compFor(amountGr, start);
      return out;
    }

    function compute(input) {
      var opt = {
        rateType: TYPES[input.rateType] ? input.rateType : 'handlowe',
        customRate: parseRate(input.customRate),
        calcDate: D(input.calcDate) ? input.calcDate : todayWarsaw(),
        compensation: !!input.compensation,
        art115: input.art115 !== false
      };
      var res = { opt: opt, invoices: [], missingEur: [], errors: [] };
      if (opt.rateType === 'umowne' && !(opt.customRate >= 0)) res.errors.push('Podaj stopę odsetek umownych w procentach, np. 12.');
      var t = { amountGr: 0, principalGr: 0, notDueGr: 0, interestGr: 0, compGr: 0, totalGr: 0, count: 0, delayed: 0, compEur: {}, compCount: 0, maxDays: 0 };
      (input.invoices || []).forEach(function (inv) {
        var r = res.errors.length ? { id: inv.id, incomplete: true, errors: [], notes: [], segments: [] } : computeInvoice(inv, opt);
        res.invoices.push(r);
        if (r.incomplete || r.errors.length) return;
        t.count++; t.amountGr += r.amountGr; t.interestGr += r.interestGr;
        if (r.delayed) t.principalGr += r.outstandingGr; else t.notDueGr += r.outstandingGr;   // do sumy wchodzą tylko należności po terminie
        if (r.delayed) { t.delayed++; if (r.daysLate > t.maxDays) t.maxDays = r.daysLate; }
        if (r.comp) {
          t.compCount++; t.compEur[r.comp.eur] = (t.compEur[r.comp.eur] || 0) + 1;
          if (r.comp.pending) { if (res.missingEur.indexOf(r.comp.key) < 0) res.missingEur.push(r.comp.key); }
          else t.compGr += r.comp.plnGr;
        }
      });
      t.totalGr = t.principalGr + t.interestGr + t.compGr;
      res.totals = t;
      return res;
    }

    function currentRates(s) {
      return {
        date: s, ref: refOn(s), handlowe: commercialRate(s, false), leczniczy: commercialRate(s, true),
        ustawowe: statutoryRate(s), maks: maxRate(s), kapitalowe: capitalRate(s)
      };
    }

    return {
      compute: compute, compFor: compFor, refOn: refOn, commercialRate: commercialRate, statutoryRate: statutoryRate,
      maxRate: maxRate, capitalRate: capitalRate, currentRates: currentRates, rateInfo: rateInfo,
      setEur: function (key, entry) { eur[key] = entry; }, hasEur: function (key) { return !!eur[key]; },
      refList: function () { return ref.slice(); }, eurMap: function () { return eur; }
    };
  }

  root.PTCalc = {
    create: create, TYPES: TYPES, compTier: compTier, MIN_DATE: MIN_DATE,
    D: D, iso: iso, addDays: addDays, diff: diff, weekday: weekday, monthEnd: monthEnd, prevMonthKey: prevMonthKey, nextMonthKey: nextMonthKey,
    todayWarsaw: todayWarsaw, isHoliday: isHoliday, isFreeDay: isFreeDay, isBusinessDay: isBusinessDay, adjustDue: adjustDue,
    lastBusinessDay: lastBusinessDay, easter: function (y) { return iso(easterDate(y)); },
    parseAmount: parseAmount, parseRate: parseRate, fmtMoney: fmtMoney, fmtRate: fmtRate, fmtMid: fmtMid, fmtDate: fmtDate, fmtDateLong: fmtDateLong,
    words: words, amountWords: amountWords, plural: plural, pad: pad,
    M_NOM: M_NOM, M_GEN: M_GEN, M_LOC: M_LOC, M_SLUG: M_SLUG, WD: WD
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
