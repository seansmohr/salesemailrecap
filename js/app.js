/*
 * Recap Email Generator — page wiring.
 * Reads the form, calls RecapEmail.buildEmail, updates the live preview,
 * and handles copy / autosave. All email wording lives in email.js + config.js.
 */
(function () {
  'use strict';

  var cfg = window.RECAP_CONFIG;
  var DRAFT_KEY = 'recapDraft.v2';

  var form = document.getElementById('recapForm');
  var previewEl = document.getElementById('preview');
  var subjectEl = document.getElementById('subject');
  var warningsEl = document.getElementById('warnings');
  var copyStatus = document.getElementById('copyStatus');
  var current = { subject: '', html: '', text: '', warnings: [] };

  // Default from config (defaultValue so form.reset() restores it).
  document.getElementById('partBPremium').defaultValue = cfg.partBPremium.toFixed(2);

  // ---------- form <-> object ----------

  function setPath(obj, path, value) {
    var parts = path.split('.');
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      o = o[parts[i]] = o[parts[i]] || {};
    }
    o[parts[parts.length - 1]] = value;
  }
  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }

  function readForm() {
    var data = {};
    Array.prototype.forEach.call(form.querySelectorAll('[name]'), function (el) {
      if (el.type === 'checkbox') setPath(data, el.name, el.checked);
      else if (el.type === 'radio') { if (el.checked) setPath(data, el.name, el.value); }
      else setPath(data, el.name, el.value);
    });
    return data;
  }

  function writeForm(data) {
    Array.prototype.forEach.call(form.querySelectorAll('[name]'), function (el) {
      var v = getPath(data, el.name);
      if (v === undefined) return;
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'radio') el.checked = el.value === v;
      else el.value = v;
    });
  }

  // ---------- storage (best effort; page works without it) ----------

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }
  function remove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  // ---------- visibility ----------

  function each(selector, fn) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), fn);
  }

  function updateVisibility(data) {
    each('[data-situation]', function (p) {
      p.hidden = p.getAttribute('data-situation') !== data.situation;
    });
    each('[data-hide-for]', function (p) {
      p.hidden = p.getAttribute('data-hide-for').split(' ').indexOf(data.situation) >= 0;
    });
    each('[data-main]', function (p) {
      p.hidden = p.getAttribute('data-main').split(' ').indexOf(data.main) < 0;
    });
    each('.product', function (p) {
      p.querySelector('.product-body').hidden = !p.querySelector('.product-toggle input').checked;
    });

    var money = window.RecapEmail._money;
    var rDaily = window.RecapEmail._num(getPath(data, 'anc.recovery.daily'));
    document.querySelector('[data-calc="recovery"]').textContent = rDaily
      ? 'Total coverage: ' + money(rDaily * cfg.recoveryCare.consecutiveDays) + ' minimum, up to ' + money(rDaily * cfg.recoveryCare.lifetimeDays)
      : '';
  }

  // ---------- render ----------

  function render() {
    var data = readForm();
    updateVisibility(data);
    current = window.RecapEmail.buildEmail(data, cfg);
    previewEl.innerHTML = current.html;
    subjectEl.textContent = current.subject;
    warningsEl.innerHTML = '';
    current.warnings.forEach(function (w) {
      var li = document.createElement('li');
      li.textContent = w;
      warningsEl.appendChild(li);
    });
    save(DRAFT_KEY, data);
  }

  // ---------- copy ----------

  function flash(msg) {
    copyStatus.textContent = msg;
    clearTimeout(flash._t);
    flash._t = setTimeout(function () { copyStatus.textContent = ''; }, 4000);
  }

  function copyBySelection(node) {
    var sel = window.getSelection();
    var range = document.createRange();
    range.selectNodeContents(node);
    sel.removeAllRanges();
    sel.addRange(range);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    sel.removeAllRanges();
    return ok;
  }

  function copyRich(html, text, fallbackNode) {
    if (navigator.clipboard && window.ClipboardItem) {
      var item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      });
      return navigator.clipboard.write([item]).then(
        function () { return true; },
        function () { return copyBySelection(fallbackNode); }
      );
    }
    return Promise.resolve(copyBySelection(fallbackNode));
  }

  document.getElementById('copyEmail').addEventListener('click', function () {
    render();
    if (current.warnings.length &&
        !window.confirm('There ' + (current.warnings.length === 1 ? 'is 1 item' : 'are ' + current.warnings.length + ' items') +
          ' still to fill in (highlighted in yellow). Copy anyway?')) {
      return;
    }
    copyRich(current.html, current.text, previewEl).then(function (ok) {
      flash(ok ? 'Copied! Paste it into your email above your signature.' : 'Copy failed. Select the preview and copy manually.');
    });
  });

  document.getElementById('copySubject').addEventListener('click', function () {
    var done = function () { flash('Subject copied.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(current.subject).then(done, function () {
        if (copyBySelection(subjectEl)) done();
      });
    } else if (copyBySelection(subjectEl)) {
      done();
    }
  });

  document.getElementById('newProspect').addEventListener('click', function () {
    if (!window.confirm('Clear this prospect and start a new recap?')) return;
    form.reset();
    remove(DRAFT_KEY);
    render();
    window.scrollTo(0, 0);
  });

  form.addEventListener('input', render);
  form.addEventListener('change', render);

  // ---------- start ----------

  remove('recapDraft.v1');
  remove('recapAgent.v1');
  var draft = load(DRAFT_KEY);
  if (draft) writeForm(draft);
  render();
})();
