/*
 * Recap Email Generator — page wiring.
 * Reads the form, calls RecapEmail.buildEmail, updates the live preview,
 * and handles copy / autosave. All email wording lives in email.js + config.js.
 */
(function () {
  'use strict';

  var cfg = window.RECAP_CONFIG;
  var DRAFT_KEY = 'recapDraft.v1';
  var AGENT_KEY = 'recapAgent.v1';

  var form = document.getElementById('recapForm');
  var previewEl = document.getElementById('preview');
  var subjectEl = document.getElementById('subject');
  var warningsEl = document.getElementById('warnings');
  var copyStatus = document.getElementById('copyStatus');
  var current = { subject: '', html: '', text: '', warnings: [] };

  // ---------- build config-driven controls ----------

  var statusSelect = document.getElementById('situationStatus');
  cfg.situations.forEach(function (s) {
    var o = document.createElement('option');
    o.value = s.key;
    o.textContent = s.label;
    statusSelect.appendChild(o);
  });

  var concernList = document.getElementById('concernList');
  cfg.concerns.forEach(function (c) {
    var label = document.createElement('label');
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.name = 'situation.concerns';
    box.value = c.key;
    box.setAttribute('data-array', '');
    label.appendChild(box);
    label.appendChild(document.createTextNode(' ' + c.label));
    concernList.appendChild(label);
  });

  // Defaults from config (defaultValue so form.reset() restores them).
  document.getElementById('partBPremium').defaultValue = cfg.partBPremium.toFixed(2);
  document.getElementById('snfStart').defaultValue = cfg.hospitalSnf.startDay;
  document.getElementById('snfEnd').defaultValue = cfg.hospitalSnf.endDay;

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
      var name = el.name;
      if (el.hasAttribute('data-array')) {
        var arr = getPath(data, name) || [];
        if (el.checked) arr.push(el.value);
        setPath(data, name, arr);
      } else if (el.type === 'checkbox') {
        setPath(data, name, el.checked);
      } else if (el.type === 'radio') {
        if (el.checked) setPath(data, name, el.value);
      } else {
        setPath(data, name, el.value);
      }
    });
    return data;
  }

  function writeForm(data, onlyPrefix) {
    Array.prototype.forEach.call(form.querySelectorAll('[name]'), function (el) {
      if (onlyPrefix && el.name.indexOf(onlyPrefix) !== 0) return;
      var v = getPath(data, el.name);
      if (v === undefined) return;
      if (el.hasAttribute('data-array')) el.checked = Array.isArray(v) && v.indexOf(el.value) >= 0;
      else if (el.type === 'checkbox') el.checked = !!v;
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

  function updateVisibility(data) {
    var main = data.main;
    Array.prototype.forEach.call(document.querySelectorAll('[data-main]'), function (p) {
      p.hidden = p.getAttribute('data-main').split(' ').indexOf(main) < 0;
    });
    document.querySelector('[data-medsupp-other]').hidden = getPath(data, 'medsupp.plan') !== 'other';
    document.querySelector('[data-snf]').hidden = !getPath(data, 'anc.hospital.snf');
    Array.prototype.forEach.call(document.querySelectorAll('.product'), function (p) {
      p.querySelector('.product-body').hidden = !p.querySelector('.product-toggle input').checked;
    });
    document.getElementById('ancHint').textContent =
      main === 'ancillary' ? 'tick at least one' : 'optional, adds to the main plan';

    // Helper totals shown to the agent
    var money = window.RecapEmail._money;
    var num = window.RecapEmail._num;
    var rDaily = num(getPath(data, 'anc.recovery.daily'));
    document.querySelector('[data-calc="recovery"]').textContent = rDaily
      ? 'Total coverage: ' + money(rDaily * cfg.recoveryCare.consecutiveDays) + ' minimum, up to ' + money(rDaily * cfg.recoveryCare.lifetimeDays)
      : '';
    var hDaily = num(getPath(data, 'anc.home.daily'));
    var hDays = num(getPath(data, 'anc.home.days'));
    document.querySelector('[data-calc="home"]').textContent = hDaily && hDays
      ? 'Total benefit: ' + money(hDaily * hDays)
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
    save(AGENT_KEY, data.agent);
    copyStatus.textContent = '';
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
      flash(ok ? 'Copied! Paste it into your email.' : 'Copy failed. Select the preview and copy manually.');
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
    if (!window.confirm('Clear this prospect and start a new recap? Your agent info is kept.')) return;
    var agent = readForm().agent;
    form.reset();
    writeForm({ agent: agent }, 'agent.');
    remove(DRAFT_KEY);
    render();
    window.scrollTo(0, 0);
  });

  form.addEventListener('input', render);
  form.addEventListener('change', render);

  // ---------- start ----------

  var draft = load(DRAFT_KEY);
  if (draft) writeForm(draft);
  var agent = load(AGENT_KEY);
  if (agent) writeForm({ agent: agent }, 'agent.');
  render();
})();
