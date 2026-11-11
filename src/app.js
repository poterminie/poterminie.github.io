/*! PoTerminie - interfejs kalkulatora i generator dokumentów. Wszystko liczone lokalnie w przeglądarce. */
(function () {
  'use strict';
  var C = window.PTCalc, DATA = window.PT_DATA, CFG = window.PT_CFG || {};
  if (!C || !DATA) return;

  var E = C.create(DATA);
  var PRO = CFG.pro || {};
  var today = C.todayWarsaw();
  var LS_STATE = 'pt_state_v1', LS_PRO = 'pt_pro_v1', SALT = 'poterminie:';
  var ACT = 'ustawy z dnia 8 marca 2013 r. o przeciwdziałaniu nadmiernym opóźnieniom w transakcjach handlowych';

  /* ---------- narzędzia ---------- */
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $all(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* tryb prywatny */ } }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) { /* tryb prywatny */ } }
  function zl(gr) { return C.fmtMoney(gr) + ' zł'; }
  function days(n) { return n + ' ' + C.plural(n, ['dzień', 'dni', 'dni']); }

  var toastTimer = null;
  function toast(msg) {
    var t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3800);
  }

  function sha256Hex(str) {
    if (!(window.crypto && window.crypto.subtle && window.TextEncoder)) return Promise.reject(new Error('brak WebCrypto'));
    return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
    });
  }

  /* ---------- okno modalne ---------- */
  var modalEl = null, lastFocus = null;
  function closeModal() {
    if (!modalEl) return;
    modalEl.remove(); modalEl = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function openModal(html, onReady) {
    closeModal();
    lastFocus = document.activeElement;
    modalEl = document.createElement('div');
    modalEl.className = 'modal'; modalEl.setAttribute('role', 'dialog'); modalEl.setAttribute('aria-modal', 'true');
    modalEl.innerHTML = '<div class="modal-box"><button type="button" class="icon-btn modal-x" aria-label="Zamknij">×</button>' + html + '</div>';
    document.body.appendChild(modalEl);
    modalEl.addEventListener('mousedown', function (e) { if (e.target === modalEl) closeModal(); });
    modalEl.addEventListener('click', function (e) { if (e.target.closest('.modal-x')) closeModal(); });
    var f = $('[data-focus], a.btn, textarea, input', modalEl);
    if (f) f.focus();
    if (onReady) onReady(modalEl);
  }

  /* ---------- Pro ---------- */
  var proListeners = [];
  function isPro() { return !PRO.enabled || (!!PRO.codeHash && lsGet(LS_PRO) === PRO.codeHash); }
  function activate(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code || !PRO.codeHash) return Promise.resolve(false);
    return sha256Hex(SALT + code).then(function (h) {
      if (h !== PRO.codeHash) return false;
      lsSet(LS_PRO, h);
      proListeners.forEach(function (fn) { fn(); });
      return true;
    }).catch(function () { return false; });
  }
  function benefitsHtml() {
    return '<ul class="ticks">' +
      '<li>Nota odsetkowa i nota obciążeniowa na rekompensatę 40/70/100 euro</li>' +
      '<li>Dowolna liczba faktur w jednej sprawie i wklejanie listy z arkusza</li>' +
      '<li>Dokumenty bez stopki serwisu i eksport do Worda (.doc)</li></ul>';
  }
  function codeFormHtml() {
    return '<form class="code-form"><label class="field" style="margin:0"><span>Masz już kod? Wpisz go tutaj</span>' +
      '<span class="code-row"><input type="text" name="code" placeholder="PT-XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false" maxlength="40">' +
      '<button class="btn" type="submit">Aktywuj</button></span></label><p class="form-msg" aria-live="polite"></p></form>';
  }
  function bindCodeForm(scope, onOk) {
    var form = $('.code-form', scope);
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = $('.form-msg', form);
      activate(form.elements.code.value).then(function (ok) {
        msg.className = 'form-msg ' + (ok ? 'ok' : 'err');
        msg.textContent = ok ? 'Pro jest aktywne w tej przeglądarce. Dziękujemy!' : 'Ten kod nie pasuje. Sprawdź, czy został wpisany w całości.';
        if (ok && onOk) onOk();
      });
    });
  }
  function openPro(reason) {
    var buy = PRO.checkoutUrl
      ? '<a class="btn btn-primary btn-lg" data-focus href="' + esc(PRO.checkoutUrl) + '" target="_blank" rel="noopener">Kup dostęp Pro - ' + esc(PRO.priceLabel) + '</a>' +
        '<p class="muted small" style="margin:8px 0 0">Płatność jednorazowa, bez abonamentu. Kod aktywacyjny dostajesz od razu po zapłacie.</p>'
      : '';
    openModal('<h2>' + esc(CFG.siteName) + ' Pro</h2>' + (reason ? '<p>' + esc(reason) + '</p>' : '') + benefitsHtml() + buy + '<hr class="divider">' + codeFormHtml(),
      function (m) { bindCodeForm(m, function () { setTimeout(closeModal, 1000); }); });
  }

  // aktywacja z linku: /pro/?kod=PT-XXXX-XXXX-XXXX (np. przekierowanie po płatności)
  (function () {
    var m = /[?&]kod=([^&#]+)/.exec(window.location.search);
    if (!m) return;
    var code = decodeURIComponent(m[1]);
    try { window.history.replaceState(null, '', window.location.pathname); } catch (e) { /* nic */ }
    activate(code).then(function (ok) { toast(ok ? 'Pro jest aktywne w tej przeglądarce. Dziękujemy!' : 'Kod z linku jest nieprawidłowy.'); });
  })();

  /* ---------- strona /pro/ ---------- */
  (function () {
    var page = $('#pt-pro-page');
    if (!page) return;
    var status = $('[data-pro-status]', page), holder = $('[data-pro-form]', page);
    function paint() {
      if (!PRO.enabled) { status.textContent = 'Wszystkie funkcje są obecnie dostępne bezpłatnie - kod nie jest potrzebny.'; holder.innerHTML = ''; return; }
      if (isPro()) { status.textContent = 'Pro jest aktywne w tej przeglądarce.'; status.className = 'form-msg ok'; holder.innerHTML = ''; return; }
      status.textContent = '';
      holder.innerHTML = codeFormHtml();
      bindCodeForm(holder, paint);
    }
    proListeners.push(paint);
    paint();
  })();

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-open-pro]');
    if (b) { e.preventDefault(); openPro(''); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (modalEl) closeModal(); else closeDoc();
  });

  /* ---------- podgląd dokumentu ---------- */
  var docEl = null, docName = 'dokument', docFocus = null;
  function ensureDoc() {
    if (docEl) return docEl;
    docEl = document.createElement('div');
    docEl.className = 'doc-overlay'; docEl.hidden = true;
    docEl.setAttribute('role', 'dialog'); docEl.setAttribute('aria-modal', 'true'); docEl.setAttribute('aria-label', 'Podgląd dokumentu');
    docEl.innerHTML =
      '<div class="doc-bar"><div><strong data-doc-title></strong><span class="doc-hint">Kliknij w treść, aby ją poprawić przed wydrukiem. Żółte pola wymagają uzupełnienia.</span></div>' +
      '<div class="doc-bar-actions">' +
      '<button type="button" class="btn btn-primary" data-doc-act="print">Drukuj / zapisz PDF</button>' +
      '<button type="button" class="btn" data-doc-act="word">Pobierz .doc <span class="lock" data-lock>PRO</span></button>' +
      '<button type="button" class="btn" data-doc-act="copy">Kopiuj tekst</button>' +
      '<button type="button" class="btn btn-ghost" data-doc-act="close">Zamknij</button>' +
      '</div></div><div class="doc-scroll"><div class="paper" contenteditable="true" spellcheck="false"></div></div>';
    document.body.appendChild(docEl);
    docEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-doc-act]');
      if (!b) return;
      var act = b.getAttribute('data-doc-act'), paper = $('.paper', docEl);
      if (act === 'close') closeDoc();
      if (act === 'print') window.print();
      if (act === 'copy') copyText(paper.innerText, 'Skopiowano treść dokumentu.');
      if (act === 'word') {
        if (!isPro()) { openPro('Eksport do Worda jest częścią wersji Pro. Bezpłatnie możesz dokument wydrukować, zapisać jako PDF albo skopiować.'); return; }
        var css = 'body{font-family:"Times New Roman",serif;font-size:12pt;line-height:1.4}h1{font-size:15pt;text-align:center}p{text-align:justify}.doc-right{text-align:right}' +
          '.doc-sub{text-align:center}table{border-collapse:collapse;width:100%}table.t td,table.t th{border:1px solid #000;padding:3pt 5pt;font-size:9.5pt;font-family:Arial,sans-serif}' +
          'table.t th{background:#eee}.num{text-align:right}.doc-label{font-size:9pt;color:#555;text-transform:uppercase}.ph{background:#ffff00}.sign{text-align:right;margin-top:30pt}.doc-foot{font-size:8pt;color:#888;text-align:center}table.doc-parties td{width:50%;vertical-align:top}';
        var html = '﻿<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>' +
          esc(docName) + '</title><style>@page{margin:2cm}' + css + '</style></head><body>' + paper.innerHTML + '</body></html>';
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([html], { type: 'application/msword' }));
        a.download = docName + '.doc';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      }
    });
    return docEl;
  }
  function showDoc(title, name, html) {
    ensureDoc();
    docFocus = document.activeElement;
    docName = name;
    $('[data-doc-title]', docEl).textContent = title;
    $('.paper', docEl).innerHTML = html;
    $all('[data-lock]', docEl).forEach(function (l) { l.hidden = isPro(); });
    docEl.hidden = false;
    document.documentElement.classList.add('doc-open');
    $('.doc-scroll', docEl).scrollTop = 0;
    $('[data-doc-act="print"]', docEl).focus();
  }
  function closeDoc() {
    if (!docEl || docEl.hidden) return;
    docEl.hidden = true;
    document.documentElement.classList.remove('doc-open');
    if (docFocus && docFocus.focus) docFocus.focus();
  }
  function copyText(text, okMsg) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(okMsg); } catch (e) { toast('Nie udało się skopiować - zaznacz tekst ręcznie.'); }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
    else fallback();
  }

  /* ================= KALKULATOR ================= */
  var root = $('#pt-tool');
  if (!root) return;

  var els = {
    inv: $('#pt-invoices', root), add: $('#pt-add', root), csv: $('#pt-csv', root), type: $('#pt-type', root),
    customWrap: $('#pt-custom-wrap', root), custom: $('#pt-custom', root), calc: $('#pt-calcdate', root),
    comp: $('#pt-comp', root), a115: $('#pt-115', root), result: $('#pt-result', root), upsell: $('#pt-upsell', root),
    docs: $('#pt-docs', root), reset: $('#pt-reset', root)
  };

  var uid = 1;
  function newInvoice() { return { id: uid++, number: '', amount: '', due: '', paidOn: '', payments: [] }; }
  var state = {
    invoices: [newInvoice()], rateType: 'handlowe', customRate: '', calcDate: today, comp: true, art115: true,
    creditor: { name: '', addr1: '', addr2: '', nip: '', account: '', city: '', sign: '' },
    debtor: { name: '', addr1: '', addr2: '', nip: '' }, payDays: '7', docNo: ''
  };
  (function load() {
    var raw = lsGet(LS_STATE);
    if (!raw) return;
    try {
      var s = JSON.parse(raw);
      if (Array.isArray(s.invoices) && s.invoices.length) {
        state.invoices = s.invoices.slice(0, 200).map(function (x) {
          var inv = newInvoice();
          ['number', 'amount', 'due', 'paidOn'].forEach(function (k) { if (typeof x[k] === 'string') inv[k] = x[k]; });
          if (Array.isArray(x.payments)) inv.payments = x.payments.slice(0, 20).map(function (p) { return { date: String(p.date || ''), amount: String(p.amount || '') }; });
          return inv;
        });
      }
      if (C.TYPES[s.rateType]) state.rateType = s.rateType;
      if (typeof s.customRate === 'string') state.customRate = s.customRate;
      if (typeof s.comp === 'boolean') state.comp = s.comp;
      if (typeof s.art115 === 'boolean') state.art115 = s.art115;
      ['creditor', 'debtor'].forEach(function (k) { if (s[k]) Object.keys(state[k]).forEach(function (f) { if (typeof s[k][f] === 'string') state[k][f] = s[k][f]; }); });
      if (typeof s.payDays === 'string') state.payDays = s.payDays;
      if (typeof s.docNo === 'string') state.docNo = s.docNo;
    } catch (e) { /* uszkodzony zapis - start od zera */ }
  })();

  var saveTimer = null, calcTimer = null, lastRes = null, eurTried = {};
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var s = JSON.parse(JSON.stringify(state)); delete s.calcDate;
      lsSet(LS_STATE, JSON.stringify(s));
    }, 400);
  }
  function schedule() { clearTimeout(calcTimer); calcTimer = setTimeout(recalc, 90); save(); }
  function byId(id) { for (var i = 0; i < state.invoices.length; i++) if (state.invoices[i].id === id) return state.invoices[i]; return null; }

  /* ----- formularz ----- */
  function field(label, control) { return '<label class="field"><span>' + label + '</span>' + control + '</label>'; }
  function renderInvoices() {
    els.inv.innerHTML = state.invoices.map(function (inv, i) {
      var pays = inv.payments.map(function (p, pi) {
        return '<div class="pay" data-pi="' + pi + '">' +
          '<input type="date" data-pf="date" value="' + esc(p.date) + '" aria-label="Data wpłaty częściowej" min="2016-01-01" max="2099-12-31">' +
          '<input type="text" inputmode="decimal" data-pf="amount" value="' + esc(p.amount) + '" placeholder="kwota wpłaty" aria-label="Kwota wpłaty częściowej">' +
          '<button type="button" class="icon-btn" data-act="rm-pay" aria-label="Usuń wpłatę">×</button></div>';
      }).join('');
      return '<div class="inv" data-id="' + inv.id + '">' +
        '<div class="inv-head"><span class="inv-no">Faktura ' + (i + 1) + '</span>' +
        (state.invoices.length > 1 ? '<button type="button" class="link-btn danger" data-act="remove">Usuń</button>' : '') + '</div>' +
        '<div class="inv-grid">' +
        field('Numer dokumentu', '<input type="text" data-f="number" value="' + esc(inv.number) + '" placeholder="np. FV 12/2026" maxlength="60">') +
        field('Kwota brutto (zł)', '<input type="text" inputmode="decimal" data-f="amount" value="' + esc(inv.amount) + '" placeholder="0,00" maxlength="20">') +
        field('Termin płatności', '<input type="date" data-f="due" value="' + esc(inv.due) + '" min="2016-01-01" max="2099-12-31">') +
        field('Zapłacono dnia <small>puste = niezapłacona</small>', '<input type="date" data-f="paidOn" value="' + esc(inv.paidOn) + '" min="2016-01-01" max="2099-12-31">') +
        '</div>' + (pays ? '<p class="pay-label">Wpłaty częściowe (data i kwota)</p>' + pays : '') +
        '<button type="button" class="link-btn" data-act="add-pay">+ wpłata częściowa</button></div>';
    }).join('');
    paintLocks();
  }
  function paintLocks() {
    var pro = isPro();
    $all('[data-lock]', root).forEach(function (l) { l.hidden = pro; });
    if (els.add) {
      var over = !pro && state.invoices.length >= (PRO.freeInvoices || 3);
      var lock = $('[data-lock-add]', els.add);
      if (lock) lock.hidden = !over;
    }
  }
  function paintRateLabels() {
    var r = E.currentRates(state.calcDate && C.D(state.calcDate) ? state.calcDate : today);
    var labels = {
      handlowe: 'Transakcje handlowe (firma - firma) - ' + C.fmtRate(r.handlowe) + '%',
      handlowe_leczniczy: 'Transakcje handlowe, dłużnik: publiczny podmiot leczniczy - ' + C.fmtRate(r.leczniczy) + '%',
      ustawowe: 'Odsetki ustawowe za opóźnienie (Kodeks cywilny) - ' + C.fmtRate(r.ustawowe) + '%',
      umowne: 'Odsetki umowne - własna stopa'
    };
    $all('option', els.type).forEach(function (o) { if (labels[o.value] && r.handlowe != null) o.textContent = labels[o.value]; });
  }
  function syncControls() {
    els.type.value = state.rateType;
    els.custom.value = state.customRate;
    els.calc.value = state.calcDate;
    els.customWrap.hidden = state.rateType !== 'umowne';
    var compAllowed = C.TYPES[state.rateType].commercial;
    els.comp.checked = state.comp && compAllowed;
    els.comp.disabled = !compAllowed;
    var hint = $('#pt-comp-hint', root);
    if (hint) hint.hidden = compAllowed;
    els.a115.checked = state.art115;
    $all('[data-p]', root).forEach(function (inp) { var k = inp.getAttribute('data-p').split('.'); inp.value = state[k[0]][k[1]] || ''; });
    $all('[data-s]', root).forEach(function (inp) { inp.value = state[inp.getAttribute('data-s')] || ''; });
    paintRateLabels();
  }

  els.inv.addEventListener('input', function (e) {
    var t = e.target, row = t.closest('.inv');
    if (!row) return;
    var inv = byId(+row.getAttribute('data-id'));
    if (!inv) return;
    if (t.hasAttribute('data-f')) inv[t.getAttribute('data-f')] = t.value;
    else if (t.hasAttribute('data-pf')) inv.payments[+t.closest('.pay').getAttribute('data-pi')][t.getAttribute('data-pf')] = t.value;
    schedule();
  });
  els.inv.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var inv = byId(+b.closest('.inv').getAttribute('data-id')), act = b.getAttribute('data-act');
    if (!inv) return;
    if (act === 'remove') { state.invoices = state.invoices.filter(function (x) { return x !== inv; }); if (!state.invoices.length) state.invoices.push(newInvoice()); }
    if (act === 'add-pay') inv.payments.push({ date: '', amount: '' });
    if (act === 'rm-pay') inv.payments.splice(+b.closest('.pay').getAttribute('data-pi'), 1);
    renderInvoices(); schedule();
    if (act === 'add-pay') { var rows = $all('.inv[data-id="' + inv.id + '"] .pay input[type="date"]', els.inv); if (rows.length) rows[rows.length - 1].focus(); }
  });
  els.add.addEventListener('click', function () {
    if (!isPro() && state.invoices.length >= (PRO.freeInvoices || 3)) {
      openPro('W wersji bezpłatnej policzysz do ' + (PRO.freeInvoices || 3) + ' faktur naraz. Pro zdejmuje limit - rekompensata należy się od każdej zaległej faktury osobno.');
      return;
    }
    var inv = newInvoice();
    state.invoices.push(inv); renderInvoices(); schedule();
    var f = $('.inv[data-id="' + inv.id + '"] input', els.inv); if (f) f.focus();
  });
  els.csv.addEventListener('click', function () {
    if (!isPro()) { openPro('Wklejanie całej listy faktur z arkusza jest częścią wersji Pro.'); return; }
    openModal('<h2>Wklej listę faktur</h2><p class="small muted">Jedna faktura w wierszu: <strong>numer; kwota; termin płatności; data zapłaty</strong> (ostatnie pole opcjonalne). Możesz wkleić komórki prosto z Excela. Daty: 2026-10-31 lub 31.10.2026.</p>' +
      '<textarea data-focus placeholder="FV 12/2026; 1 230,00; 15.09.2026&#10;FV 15/2026; 6 150,00; 30.09.2026; 20.10.2026"></textarea>' +
      '<p class="form-msg err" aria-live="polite"></p><div class="row-actions"><button type="button" class="btn btn-primary" data-import>Dodaj faktury</button></div>',
      function (m) {
        $('[data-import]', m).addEventListener('click', function () {
          var out = parseList($('textarea', m).value);
          if (!out.length) { $('.form-msg', m).textContent = 'Nie rozpoznano żadnego wiersza. Sprawdź kolejność: numer; kwota; termin.'; return; }
          var keep = state.invoices.filter(function (x) { return x.amount || x.due || x.number; });
          state.invoices = keep.concat(out);
          renderInvoices(); schedule(); closeModal();
          toast('Dodano faktury: ' + out.length + '.');
        });
      });
  });
  function parseDateLoose(s) {
    s = String(s || '').trim();
    if (C.D(s)) return s;
    var m = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/.exec(s);
    if (!m) return '';
    var isoStr = m[3] + '-' + C.pad(+m[2]) + '-' + C.pad(+m[1]);
    return C.D(isoStr) ? isoStr : '';
  }
  function parseList(text) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      var p = line.split(line.indexOf('\t') > -1 ? '\t' : ';').map(function (x) { return x.trim(); });
      if (p.length < 3) return;
      var due = parseDateLoose(p[2]);
      if (!(C.parseAmount(p[1]) > 0) || !due) return;
      var inv = newInvoice();
      inv.number = p[0].slice(0, 60); inv.amount = p[1]; inv.due = due; inv.paidOn = parseDateLoose(p[3]);
      out.push(inv);
    });
    return out;
  }

  els.type.addEventListener('change', function () { state.rateType = els.type.value; syncControls(); schedule(); });
  els.custom.addEventListener('input', function () { state.customRate = els.custom.value; schedule(); });
  els.calc.addEventListener('input', function () { state.calcDate = C.D(els.calc.value) ? els.calc.value : today; paintRateLabels(); schedule(); });
  els.comp.addEventListener('change', function () { state.comp = els.comp.checked; schedule(); });
  els.a115.addEventListener('change', function () { state.art115 = els.a115.checked; schedule(); });
  root.addEventListener('input', function (e) {
    var t = e.target;
    if (t.hasAttribute && t.hasAttribute('data-p')) { var k = t.getAttribute('data-p').split('.'); state[k[0]][k[1]] = t.value; save(); }
    if (t.hasAttribute && t.hasAttribute('data-s')) { state[t.getAttribute('data-s')] = t.value; save(); }
  });
  if (els.reset) els.reset.addEventListener('click', function () {
    lsDel(LS_STATE);
    state.invoices = [newInvoice()];
    state.creditor = { name: '', addr1: '', addr2: '', nip: '', account: '', city: '', sign: '' };
    state.debtor = { name: '', addr1: '', addr2: '', nip: '' };
    state.docNo = ''; state.payDays = '7'; state.customRate = ''; state.rateType = 'handlowe'; state.comp = true; state.art115 = true; state.calcDate = today;
    renderInvoices(); syncControls(); recalc();
    toast('Wyczyszczono wszystkie dane zapisane w tej przeglądarce.');
  });

  /* ----- wynik ----- */
  function compute() {
    return E.compute({
      invoices: state.invoices, rateType: state.rateType, customRate: state.customRate,
      calcDate: state.calcDate, compensation: state.comp && C.TYPES[state.rateType].commercial, art115: state.art115
    });
  }
  function eurCountsText(t) {
    return [40, 70, 100].filter(function (k) { return t.compEur[k]; }).map(function (k) { return t.compEur[k] + ' × ' + k + ' €'; }).join(' + ');
  }
  function invTitle(r, i) { return r.number ? esc(r.number) : 'Faktura ' + (i + 1); }
  function compLine(c) {
    if (c.pending) {
      var y = +c.key.slice(0, 4), m = +c.key.slice(5, 7), lbd = C.lastBusinessDay(y, m);
      return '<p class="note">Rekompensata: <strong>' + c.eur + ' EUR</strong> - ' + (lbd > today
        ? 'kurs NBP zostanie ogłoszony ' + C.fmtDate(lbd) + '.'
        : 'pobieram kurs NBP z ' + C.fmtDate(lbd) + '…') + '</p>';
    }
    return '<p class="note">Rekompensata: <strong>' + c.eur + ' EUR × ' + C.fmtMid(c.mid) + ' = ' + zl(c.plnGr) + '</strong><br>kurs średni NBP z ' + C.fmtDate(c.rateDate) +
      ' (tabela ' + esc(c.tableNo) + ') - ostatni dzień roboczy miesiąca przed wymagalnością (' + C.fmtDate(c.wym) + ').</p>';
  }
  function renderResult(res) {
    var t = res.totals, html = '';
    // podświetl błędne kwoty
    $all('.inv', els.inv).forEach(function (row) {
      var inv = byId(+row.getAttribute('data-id')), a = $('[data-f="amount"]', row);
      if (inv && a) a.classList.toggle('bad', !!inv.amount.trim() && !(C.parseAmount(inv.amount) > 0));
    });
    if (res.errors.length) { els.result.innerHTML = '<p class="alert err">' + esc(res.errors[0]) + '</p>'; renderUpsell(null); return; }
    if (!t.count) {
      var anyErr = res.invoices.filter(function (r) { return r.errors && r.errors.length; })[0];
      els.result.innerHTML = anyErr ? '<p class="alert err">' + esc(anyErr.errors[0]) + '</p>'
        : '<p class="result-empty">Wpisz kwotę faktury i termin płatności - wynik pojawi się tutaj od razu, bez klikania.</p>';
      renderUpsell(null); return;
    }
    var allPaid = t.delayed > 0 && t.principalGr === 0;
    html += '<p class="result-label">' + (allPaid ? 'Dłużnik jest Ci jeszcze winien' : 'Łącznie do zapłaty przez dłużnika') + '</p>';
    html += '<p class="result-total">' + C.fmtMoney(t.totalGr) + ' <span>zł</span></p>';
    html += '<dl class="result-parts">';
    if (t.principalGr > 0) html += '<div><dt>Należność główna po terminie</dt><dd>' + zl(t.principalGr) + '</dd></div>';
    html += '<div class="plus"><dt>Odsetki za opóźnienie<small class="muted">' + (t.principalGr > 0 ? 'naliczone do ' + C.fmtDate(res.opt.calcDate) : 'za okres opóźnienia') + '</small></dt><dd>+ ' + zl(t.interestGr) + '</dd></div>';
    if (t.compCount) html += '<div class="plus"><dt>Rekompensata za koszty odzyskiwania<small class="muted">' + eurCountsText(t) + '</small></dt><dd>+ ' + zl(t.compGr) + '</dd></div>';
    html += '</dl>';
    if (t.notDueGr > 0) html += '<p class="note">Nie wliczono ' + zl(t.notDueGr) + ' z faktur, których termin jeszcze nie minął.</p>';

    res.invoices.forEach(function (r, i) {
      if (r.incomplete) return;
      if (r.errors.length) { html += '<p class="alert err"><strong>' + invTitle(r, i) + ':</strong> ' + esc(r.errors[0]) + '</p>'; return; }
      var gain = r.interestGr + (r.comp && !r.comp.pending ? r.comp.plnGr : 0);
      var status = r.delayed ? days(r.daysLate) + ' po terminie' + (r.paidInFull ? ', zapłacona' : '') : (r.paidOnTime ? 'zapłacona w terminie' : 'termin jeszcze nie minął');
      html += '<details class="inv-res"' + (t.count <= 2 && r.delayed ? ' open' : '') + '><summary><b>' + invTitle(r, i) + '</b><span class="muted">' + status + '</span>' +
        (r.delayed ? '<span class="gain">+ ' + zl(gain) + '</span>' : '') + '</summary><div class="inner">';
      if (r.delayed) {
        html += '<table class="mini"><thead><tr><th>Okres</th><th class="num">Dni</th><th class="num">Kwota</th><th class="num">Stopa</th><th class="num">Odsetki</th></tr></thead><tbody>' +
          r.segments.map(function (s) {
            return '<tr><td>' + C.fmtDate(s.from) + ' - ' + C.fmtDate(s.to) + '</td><td class="num">' + s.days + '</td><td class="num">' + C.fmtMoney(s.principalGr) +
              '</td><td class="num">' + C.fmtRate(s.rate) + '%</td><td class="num">' + C.fmtMoney(s.interestGr) + '</td></tr>';
          }).join('') + '</tbody></table>';
        if (r.comp) html += compLine(r.comp);
      } else {
        html += '<p class="note">' + (r.paidOnTime ? 'Zapłata wpłynęła w terminie - odsetki i rekompensata nie przysługują.' : 'Termin płatności upływa ' + C.fmtDate(r.dueAdjusted) + '. Odsetki zaczną biec od ' + C.fmtDate(r.delayStart) + '.') + '</p>';
      }
      r.notes.forEach(function (n) { html += '<p class="note">' + esc(n) + '</p>'; });
      html += '</div></details>';
    });
    html += '<div class="result-foot"><span>Stopy i kursy NBP: stan na ' + C.fmtDate(DATA.updated || today) + '</span><button type="button" class="link-btn" id="pt-copy">Kopiuj podsumowanie</button></div>';
    els.result.innerHTML = html;
    renderUpsell(res);
  }
  els.result.addEventListener('click', function (e) {
    if (!e.target.closest('#pt-copy') || !lastRes) return;
    var t = lastRes.totals, lines = [];
    lastRes.invoices.forEach(function (r, i) {
      if (r.incomplete || r.errors.length || !r.delayed) return;
      lines.push((r.number || 'Faktura ' + (i + 1)) + ': ' + C.fmtMoney(r.amountGr) + ' zł, termin ' + C.fmtDate(r.dueAdjusted) + ', ' + r.daysLate + ' dni po terminie, odsetki ' + C.fmtMoney(r.interestGr) + ' zł' +
        (r.comp && !r.comp.pending ? ', rekompensata ' + r.comp.eur + ' EUR = ' + C.fmtMoney(r.comp.plnGr) + ' zł (kurs NBP ' + C.fmtMid(r.comp.mid) + ' z ' + C.fmtDate(r.comp.rateDate) + ')' : ''));
    });
    lines.push('Należność główna: ' + C.fmtMoney(t.principalGr) + ' zł');
    lines.push('Odsetki za opóźnienie: ' + C.fmtMoney(t.interestGr) + ' zł');
    if (t.compCount) lines.push('Rekompensata: ' + C.fmtMoney(t.compGr) + ' zł');
    lines.push('RAZEM: ' + C.fmtMoney(t.totalGr) + ' zł (stan na ' + C.fmtDate(lastRes.opt.calcDate) + ')');
    copyText(lines.join('\n').replace(/ /g, ' '), 'Skopiowano podsumowanie.');
  });

  function fetchMissingEur(res) {
    res.missingEur.forEach(function (key) {
      if (eurTried[key]) return;
      var y = +key.slice(0, 4), m = +key.slice(5, 7), lbd = C.lastBusinessDay(y, m);
      if (lbd > today) return;                       // kurs jeszcze nieogłoszony
      eurTried[key] = 1;
      fetch('https://api.nbp.pl/api/exchangerates/rates/a/eur/' + key + '-20/' + C.monthEnd(y, m) + '/?format=json')
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) {
          var last = j.rates[j.rates.length - 1];
          if (!last || (last.effectiveDate !== lbd && today <= C.monthEnd(y, m))) return;
          E.setEur(key, { d: last.effectiveDate, mid: last.mid, no: last.no });
          recalc();
        })
        .catch(function () { /* brak sieci - zostaje komunikat o braku kursu */ });
    });
  }
  function recalc() {
    lastRes = compute();
    renderResult(lastRes);
    paintLocks();
    if (lastRes.missingEur.length) fetchMissingEur(lastRes);
  }

  /* ----- monetyzacja: Pro, linki partnerskie, wsparcie ----- */
  function renderUpsell(res) {
    var html = '', show = !!(res && res.totals && res.totals.delayed > 0);
    if (show && PRO.enabled && !isPro()) {
      html += '<div class="promo pro"><h3>Komplet dokumentów dla tej sprawy</h3><p>Wezwanie do zapłaty masz za darmo. Pro dodaje notę odsetkową i notę obciążeniową na rekompensatę, zdejmuje limit faktur i stopkę serwisu.</p>' +
        '<button type="button" class="btn btn-primary" data-open-pro>Odblokuj Pro - ' + esc(PRO.priceLabel) + ' jednorazowo</button></div>';
    }
    if (show) (CFG.affiliates || []).forEach(function (a) {
      if (!a || !a.url || !a.title) return;
      html += '<div class="promo"><span class="tag">Link partnerski</span><h3>' + esc(a.title) + '</h3><p>' + esc(a.text || '') + '</p>' +
        '<a class="btn" href="' + esc(a.url) + '" target="_blank" rel="sponsored nofollow noopener">' + esc(a.cta || 'Sprawdź') + '</a></div>';
    });
    if (show && CFG.support && CFG.support.url) {
      html += '<div class="promo"><h3>Kalkulator się przydał?</h3><p>Narzędzie jest bezpłatne i nie śledzi użytkowników. Jeśli zaoszczędziło Ci czas albo pomogło odzyskać pieniądze, możesz podziękować autorowi.</p>' +
        '<a class="btn" href="' + esc(CFG.support.url) + '" target="_blank" rel="noopener">' + esc(CFG.support.label || 'Postaw kawę') + '</a></div>';
    }
    els.upsell.innerHTML = html;
  }
  proListeners.push(function () { paintLocks(); renderUpsell(lastRes); });

  /* ----- dokumenty ----- */
  var INT_NAME = {
    handlowe: 'odsetki ustawowe za opóźnienie w transakcjach handlowych',
    handlowe_leczniczy: 'odsetki ustawowe za opóźnienie w transakcjach handlowych',
    ustawowe: 'odsetki ustawowe za opóźnienie',
    umowne: 'odsetki umowne za opóźnienie'
  };
  var INT_INSTR = {
    handlowe: 'odsetkami ustawowymi za opóźnienie w transakcjach handlowych',
    handlowe_leczniczy: 'odsetkami ustawowymi za opóźnienie w transakcjach handlowych',
    ustawowe: 'odsetkami ustawowymi za opóźnienie',
    umowne: 'odsetkami umownymi za opóźnienie'
  };
  var INT_BASIS = {
    handlowe: 'art. 7 ust. 1 ' + ACT,
    handlowe_leczniczy: 'art. 8 ust. 1 ' + ACT,
    ustawowe: 'art. 481 § 1 i 2 Kodeksu cywilnego',
    umowne: 'art. 481 § 1 i 2 Kodeksu cywilnego oraz postanowienia umowy łączącej strony'
  };
  function ph(v, label) { v = String(v || '').trim(); return v ? esc(v) : '<span class="ph">[' + esc(label) + ']</span>'; }
  function party(title, p, creditor) {
    return '<td><div class="doc-label">' + title + '</div><strong>' + ph(p.name, creditor ? 'nazwa wierzyciela' : 'nazwa dłużnika') + '</strong><br>' +
      ph(p.addr1, 'ulica i numer') + '<br>' + ph(p.addr2, 'kod pocztowy i miejscowość') + '<br>NIP: ' + ph(p.nip, 'NIP') + '</td>';
  }
  function docHead() {
    return '<p class="doc-right">' + ph(state.creditor.city, 'miejscowość') + ', dnia ' + C.fmtDateLong(today) + '</p>' +
      '<table class="doc-parties"><tr>' + party('Wierzyciel', state.creditor, true) + party('Dłużnik', state.debtor, false) + '</tr></table>';
  }
  function docSign() {
    var who = (state.creditor.sign || state.creditor.name || '').trim();
    return '<p class="sign"><span>' + (who ? esc(who) : 'podpis wierzyciela') + '</span></p>';
  }
  function docFoot() {
    if (isPro() && PRO.enabled) return '';
    var host = (CFG.siteUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    return '<p class="doc-foot" contenteditable="false">Dokument przygotowano w bezpłatnym kalkulatorze ' + esc(CFG.siteName || '') + (host ? ' - ' + esc(host) : '') + '</p>';
  }
  function payTerms() {
    var n = parseInt(state.payDays, 10); if (!(n > 0 && n < 366)) n = 7;
    return { n: n, text: days(n) };
  }
  function docTitle(r, i) { return r.number ? esc(r.number) : '<span class="ph">[nr dokumentu ' + (i + 1) + ']</span>'; }
  function eurWords(list) {
    var c = {}; list.forEach(function (r) { c[r.comp.eur] = (c[r.comp.eur] || 0) + 1; });
    var parts = [40, 70, 100].filter(function (k) { return c[k]; }).map(function (k) { return (list.length > 1 ? c[k] + ' × ' : '') + k + ' euro'; });
    return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' i ' + parts[parts.length - 1] : parts[0];
  }

  function buildDoc(kind, res) {
    var o = res.opt, type = o.rateType, rows = [];
    res.invoices.forEach(function (r, i) { if (!r.incomplete && !r.errors.length && r.delayed) rows.push({ r: r, i: i }); });
    var sumP = 0, sumI = 0, sumC = 0, withComp = [];
    rows.forEach(function (x) {
      sumP += x.r.outstandingGr; sumI += x.r.interestGr;
      if (x.r.comp && !x.r.comp.pending) { sumC += x.r.comp.plnGr; withComp.push(x.r); }
    });
    var term = payTerms(), account = ph(state.creditor.account, 'numer rachunku bankowego'), html = docHead();
    var commercial = type === 'handlowe' || type === 'handlowe_leczniczy';

    if (kind === 'wezwanie') {
      var total = sumP + sumI + sumC, items = [];
      if (sumP > 0) items.push('należność główna w kwocie <strong>' + zl(sumP) + '</strong>, wynikająca z dokumentów wymienionych w tabeli poniżej');
      if (sumI > 0) items.push(INT_NAME[type] + (type === 'umowne' ? ' (' + C.fmtRate(o.customRate) + '% w skali roku)' : '') + ' w kwocie <strong>' + zl(sumI) + '</strong>, naliczone ' +
        (sumP > 0 ? 'do dnia ' + C.fmtDateLong(o.calcDate) : 'za okres opóźnienia w zapłacie') + ' (' + INT_BASIS[type] + ')');
      if (sumC > 0) items.push('rekompensata za koszty odzyskiwania należności w kwocie <strong>' + zl(sumC) + '</strong>, stanowiąca równowartość ' + eurWords(withComp) +
        ' (art. 10 ust. 1 ' + (commercial ? 'tej samej ustawy' : ACT) + '), przeliczona według średniego kursu euro ogłoszonego przez Narodowy Bank Polski ostatniego dnia roboczego miesiąca poprzedzającego miesiąc, w którym świadczenie pieniężne stało się wymagalne');
      html += '<h1>PRZEDSĄDOWE WEZWANIE DO ZAPŁATY</h1>' +
        '<p>Działając jako wierzyciel, wzywam do zapłaty kwoty <strong>' + zl(total) + '</strong> (słownie: ' + C.amountWords(total) + ') w terminie <strong>' + term.text +
        '</strong> od dnia doręczenia niniejszego wezwania.</p><p>Na powyższą kwotę składają się:</p><ol>' +
        items.map(function (t, k) { return '<li>' + t + (k < items.length - 1 ? ';' : '.') + '</li>'; }).join('') + '</ol>';
      html += '<table class="t"><thead><tr><th>Lp.</th><th>Dokument</th><th class="num">Kwota brutto</th><th>Termin płatności</th><th class="num">Pozostało do zapłaty</th><th class="num">Dni opóźn.</th><th class="num">Odsetki</th>' +
        (sumC > 0 ? '<th class="num">Rekompensata</th>' : '') + '</tr></thead><tbody>' +
        rows.map(function (x, k) {
          var r = x.r;
          return '<tr><td>' + (k + 1) + '</td><td>' + docTitle(r, x.i) + '</td><td class="num">' + C.fmtMoney(r.amountGr) + '</td><td>' + C.fmtDate(r.dueAdjusted) + '</td><td class="num">' + C.fmtMoney(r.outstandingGr) +
            '</td><td class="num">' + r.daysLate + '</td><td class="num">' + C.fmtMoney(r.interestGr) + '</td>' +
            (sumC > 0 ? '<td class="num">' + (r.comp && !r.comp.pending ? C.fmtMoney(r.comp.plnGr) + '<br>(' + r.comp.eur + ' EUR × ' + C.fmtMid(r.comp.mid) + ')' : '-') + '</td>' : '') + '</tr>';
        }).join('') +
        '<tr class="sum"><td colspan="4">Razem</td><td class="num">' + C.fmtMoney(sumP) + '</td><td></td><td class="num">' + C.fmtMoney(sumI) + '</td>' + (sumC > 0 ? '<td class="num">' + C.fmtMoney(sumC) + '</td>' : '') + '</tr></tbody></table>';
      html += '<p>Wpłaty proszę dokonać na rachunek bankowy nr <strong>' + account + '</strong>, podając w tytule przelewu numery dokumentów, których dotyczy płatność.</p>';
      if (sumP > 0) html += '<p>Odsetki zostały naliczone do dnia ' + C.fmtDateLong(o.calcDate) + ' Za każdy kolejny dzień opóźnienia, aż do dnia zapłaty, należne będą dalsze odsetki.</p>';
      html += '<p>W razie braku zapłaty w wyznaczonym terminie sprawa zostanie skierowana na drogę postępowania sądowego, co narazi Państwa na dodatkowe koszty: opłatę sądową, koszty zastępstwa procesowego oraz koszty postępowania egzekucyjnego.</p>' +
        '<p>Niniejsze wezwanie stanowi próbę pozasądowego rozwiązania sporu w rozumieniu art. 187 § 1 pkt 3 Kodeksu postępowania cywilnego.</p>';
      return { title: 'Wezwanie do zapłaty', name: 'wezwanie-do-zaplaty', html: html + docSign() + docFoot() };
    }

    if (kind === 'nota-odsetkowa') {
      var n = 0, body = '';
      rows.forEach(function (x) {
        x.r.segments.forEach(function (s) {
          n++;
          body += '<tr><td>' + n + '</td><td>' + docTitle(x.r, x.i) + '</td><td>' + C.fmtDate(x.r.dueAdjusted) + '</td><td class="num">' + C.fmtMoney(s.principalGr) + '</td><td>' + C.fmtDate(s.from) + ' - ' + C.fmtDate(s.to) +
            '</td><td class="num">' + s.days + '</td><td class="num">' + C.fmtRate(s.rate) + '%</td><td class="num">' + C.fmtMoney(s.interestGr) + '</td></tr>';
        });
      });
      html += '<h1>NOTA ODSETKOWA nr ' + ph(state.docNo, 'numer') + '</h1><p class="doc-sub">z dnia ' + C.fmtDateLong(today) + '</p>' +
        '<p>W związku z opóźnieniem w zapłacie należności obciążamy Państwa ' + INT_INSTR[type] + (type === 'umowne' ? ' (' + C.fmtRate(o.customRate) + '% w skali roku)' : '') + ', wyliczonymi poniżej.</p>' +
        '<table class="t"><thead><tr><th>Lp.</th><th>Dokument</th><th>Termin płatności</th><th class="num">Kwota zaległości</th><th>Okres opóźnienia</th><th class="num">Dni</th><th class="num">Stopa</th><th class="num">Odsetki</th></tr></thead><tbody>' +
        body + '<tr class="sum"><td colspan="7">Razem do zapłaty</td><td class="num">' + C.fmtMoney(sumI) + '</td></tr></tbody></table>' +
        '<p>Do zapłaty: <strong>' + zl(sumI) + '</strong> (słownie: ' + C.amountWords(sumI) + ').</p>' +
        '<p>Kwotę prosimy wpłacić w terminie ' + term.text + ' od dnia otrzymania noty na rachunek bankowy nr <strong>' + account + '</strong>.</p>' +
        '<p>Podstawa prawna: ' + INT_BASIS[type] + '. Odsetki naliczono za każdy dzień opóźnienia według wzoru: kwota zaległości × stopa × liczba dni / 365.</p>' +
        '<p>Nota odsetkowa nie jest fakturą. Odsetki za opóźnienie nie podlegają opodatkowaniu podatkiem VAT.</p>';
      return { title: 'Nota odsetkowa', name: 'nota-odsetkowa', html: html + docSign() + docFoot() };
    }

    // nota obciążeniowa - rekompensata
    html += '<h1>NOTA OBCIĄŻENIOWA nr ' + ph(state.docNo, 'numer') + '</h1><p class="doc-sub">z dnia ' + C.fmtDateLong(today) + '</p>' +
      '<p>Obciążamy Państwa kwotą <strong>' + zl(sumC) + '</strong> (słownie: ' + C.amountWords(sumC) + ') tytułem rekompensaty za koszty odzyskiwania należności, o której mowa w art. 10 ust. 1 ' + ACT +
      ', w związku z opóźnieniem w zapłacie następujących należności:</p>' +
      '<table class="t"><thead><tr><th>Lp.</th><th>Dokument</th><th class="num">Wartość świadczenia</th><th>Termin płatności</th><th>Wymagalne od</th><th class="num">Rekompensata</th><th>Kurs EUR (NBP)</th><th class="num">Kwota (zł)</th></tr></thead><tbody>' +
      rows.filter(function (x) { return x.r.comp && !x.r.comp.pending; }).map(function (x, k) {
        var c = x.r.comp;
        return '<tr><td>' + (k + 1) + '</td><td>' + docTitle(x.r, x.i) + '</td><td class="num">' + C.fmtMoney(x.r.amountGr) + '</td><td>' + C.fmtDate(x.r.dueAdjusted) + '</td><td>' + C.fmtDate(c.wym) +
          '</td><td class="num">' + c.eur + ' EUR</td><td>' + C.fmtMid(c.mid) + ' - tabela ' + esc(c.tableNo) + ' z ' + C.fmtDate(c.rateDate) + '</td><td class="num">' + C.fmtMoney(c.plnGr) + '</td></tr>';
      }).join('') + '<tr class="sum"><td colspan="7">Razem do zapłaty</td><td class="num">' + C.fmtMoney(sumC) + '</td></tr></tbody></table>' +
      '<p>Rekompensata przysługuje wierzycielowi bez wezwania, od dnia nabycia uprawnienia do odsetek za opóźnienie. Jej równowartość w złotych ustalono według średniego kursu euro ogłoszonego przez Narodowy Bank Polski ostatniego dnia roboczego miesiąca poprzedzającego miesiąc, w którym świadczenie pieniężne stało się wymagalne (art. 10 ust. 1a ustawy).</p>' +
      '<p>Kwotę prosimy wpłacić w terminie ' + term.text + ' od dnia otrzymania noty na rachunek bankowy nr <strong>' + account + '</strong>.</p>' +
      '<p>Nota obciążeniowa nie jest fakturą. Rekompensata nie stanowi wynagrodzenia za dostawę towarów ani świadczenie usług i nie podlega opodatkowaniu podatkiem VAT.</p>';
    return { title: 'Nota obciążeniowa - rekompensata', name: 'nota-obciazeniowa-rekompensata', html: html + docSign() + docFoot() };
  }

  els.docs.addEventListener('click', function (e) {
    var b = e.target.closest('[data-doc]');
    if (!b) return;
    var kind = b.getAttribute('data-doc');
    recalc();
    var res = lastRes, t = res.totals;
    if (!t || !t.delayed) { toast('Najpierw wpisz co najmniej jedną fakturę, której termin płatności już minął.'); return; }
    if (kind !== 'wezwanie' && !isPro()) {
      openPro(kind === 'nota-odsetkowa' ? 'Nota odsetkowa jest częścią wersji Pro. Wezwanie do zapłaty z tymi samymi kwotami wygenerujesz bezpłatnie.'
        : 'Nota obciążeniowa na rekompensatę jest częścią wersji Pro. Wezwanie do zapłaty z tymi samymi kwotami wygenerujesz bezpłatnie.');
      return;
    }
    if (kind === 'nota-odsetkowa' && !(t.interestGr > 0)) { toast('Brak odsetek do naliczenia - nota odsetkowa byłaby pusta.'); return; }
    if (kind === 'nota-rekompensata' && !(t.compGr > 0)) {
      toast(C.TYPES[res.opt.rateType].commercial ? 'Zaznacz opcję doliczania rekompensaty, aby wystawić notę.' : 'Rekompensata przysługuje tylko w transakcjach handlowych (między firmami).');
      return;
    }
    var d = buildDoc(kind, res);
    showDoc(d.title, d.name, d.html);
  });

  /* ----- start ----- */
  renderInvoices();
  syncControls();
  recalc();
  window.PTApp = { openPro: openPro, isPro: isPro };
})();
