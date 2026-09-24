/*
 * Recap Email Generator — email builder.
 *
 * buildEmail(input, config) -> { subject, html, text, warnings }
 *
 * Pure function (no DOM access) so it runs in the browser and in Node tests.
 * The email is first assembled as a list of blocks, then rendered twice:
 * once as inline-styled HTML (for pasting into Gmail / Outlook) and once as
 * plain text (clipboard fallback).
 */
(function (root) {
  'use strict';

  // ---------- small helpers ----------

  // Missing values are wrapped in these markers and rendered as a highlighted
  // "[label]" so the agent sees exactly what still needs filling in.
  var PH_OPEN = '\u0001';
  var PH_CLOSE = '\u0002';
  function placeholder(label) { return PH_OPEN + label + PH_CLOSE; }

  function str(v) { return v === null || v === undefined ? '' : String(v).trim(); }

  function num(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).replace(/[$,\s]/g, '');
    if (s === '') return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  function money(n, forceCents) {
    var cents = forceCents || Math.round(n * 100) % 100 !== 0;
    return '$' + n.toLocaleString('en-US', {
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0
    });
  }
  // Premiums always show cents ($62.00) except a true $0.
  function premiumText(n) { return n === 0 ? '$0' : money(n, true); }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fill(template, tokens) {
    return template.replace(/\{(\w+)\}/g, function (_, key) {
      return tokens[key] !== undefined ? tokens[key] : placeholder(key);
    });
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  // ---------- input normalisation ----------

  function normalize(input) {
    var d = input || {};
    var anc = d.anc || {};
    function p(o) { return o || {}; }
    return {
      agent: p(d.agent),
      prospect: p(d.prospect),
      situation: {
        status: str(p(d.situation).status),
        concerns: Array.isArray(p(d.situation).concerns) ? p(d.situation).concerns : [],
        notes: str(p(d.situation).notes)
      },
      main: ['mapd', 'medsupp', 'ancillary'].indexOf(d.main) >= 0 ? d.main : 'ancillary',
      partBPremium: d.partBPremium,
      mapd: p(d.mapd),
      medsupp: p(d.medsupp),
      anc: {
        cancer: p(anc.cancer),
        heart: p(anc.heart),
        recovery: p(anc.recovery),
        home: p(anc.home),
        hospital: p(anc.hospital),
        dvh: p(anc.dvh)
      }
    };
  }

  // ---------- builder ----------

  function buildEmail(input, config) {
    var cfg = config;
    var d = normalize(input);
    var warnings = [];
    var concernSet = {};
    d.situation.concerns.forEach(function (k) { concernSet[k] = true; });

    // Returns the formatted value, or a placeholder + a warning if missing.
    function need(value, format, label, warning) {
      var n = num(value);
      if (n === null) {
        warnings.push(warning);
        return { n: null, text: placeholder(label) };
      }
      return { n: n, text: format(n) };
    }
    function needPremium(value, productName) {
      return need(value, premiumText, 'premium', productName + ': enter the monthly premium.');
    }

    var first = str(d.prospect.firstName);
    if (!first) warnings.push('Enter the prospect’s first name.');
    if (!str(d.agent.name)) warnings.push('Enter your name for the signature.');

    var main = d.main;
    var anc = d.anc;
    var ancOn = {
      cancer: !!anc.cancer.on, heart: !!anc.heart.on, recovery: !!anc.recovery.on,
      home: !!anc.home.on, hospital: !!anc.hospital.on, dvh: !!anc.dvh.on
    };
    var anyAnc = Object.keys(ancOn).some(function (k) { return ancOn[k]; });
    if (main === 'ancillary' && !anyAnc) {
      warnings.push('Ancillary email: tick at least one ancillary product.');
    }

    var deductibleText = money(cfg.partBDeductible);
    var tokens = { partBDeductible: deductibleText, medsuppCopays: '' };
    var glance = [];          // { label, amount (number|null), text }
    var sections = [];        // numbered product sections

    // Which "Why this fits you" lines apply to a product.
    function whyFor(productKey, note, extra, allowedConcerns) {
      var lines = [];
      if (str(note)) lines.push(str(note));
      (extra || []).forEach(function (l) { lines.push(l); });
      cfg.concerns.forEach(function (c) {
        if (!concernSet[c.key] || !c.ties || !c.ties[productKey]) return;
        if (allowedConcerns && allowedConcerns.indexOf(c.key) < 0) return;
        lines.push(fill(c.ties[productKey], tokens));
      });
      return lines.slice(0, 3);
    }

    // ----- Medicare Parts A & B -----
    var partB = null;
    if (main !== 'ancillary') {
      partB = need(d.partBPremium, premiumText, 'Part B premium', 'Enter the Part B premium.');
      var gapPlan = main === 'mapd' ? 'a Medicare Advantage plan' : 'a Medicare Supplement plan';
      sections.push({
        title: 'Medicare Parts A & B',
        bullets: [
          '**Part A (hospital):** premium-free for most people',
          '**Part B (doctors & outpatient care):** covers 80% of Medicare-approved costs',
          '**Your Part B premium: ' + partB.text + '/month**, based on your income from two years ago. It comes directly out of your Social Security check.'
        ],
        after: 'That leaves the other 20% on you, with no yearly limit. To cover that gap you can choose a Medicare Supplement (Medigap) plan or a Medicare Advantage plan. We focused on ' + gapPlan + ' in our discussion.'
      });
    }

    // ----- Medicare Advantage -----
    if (main === 'mapd') {
      var m = d.mapd;
      var mPrem = needPremium(m.premium, 'Medicare Advantage');
      tokens.mapdPremium = mPrem.text;
      var planLabel = [str(m.carrier), str(m.planName)].filter(Boolean).join(' – ');
      if (!planLabel) warnings.push('Medicare Advantage: enter the carrier or plan name.');
      var mb = [
        'Replaces Original Medicare as how you receive your benefits. You keep Parts A & B and continue paying your Part B premium.',
        mPrem.n === 0 ? '**$0 monthly plan premium**' : '**Monthly plan premium: ' + mPrem.text + '**'
      ];
      var moop = num(m.moop);
      mb.push(moop !== null
        ? '**Maximum out-of-pocket: ' + money(moop) + ' per year.** Your copays and coinsurance can never add up to more than this.'
        : 'Copays and coinsurance, capped by a yearly maximum out-of-pocket limit');
      var pcp = num(m.pcpCopay), spec = num(m.specialistCopay);
      if (pcp !== null || spec !== null) {
        var visits = [];
        if (pcp !== null) visits.push(money(pcp) + ' primary care');
        if (spec !== null) visits.push(money(spec) + ' specialist');
        mb.push('**Doctor visit copays:** ' + visits.join(' / '));
      }
      var includes = [];
      if (m.includesRx) includes.push('prescription drug coverage');
      if (m.includesDvh) includes.push('dental, vision and hearing benefits');
      if (includes.length) mb.push('**Includes** ' + includes.join(', plus ') + ' (details in your brochure)');
      mb.push('Uses a provider network; some services need prior authorization');
      glance.push({ label: 'Medicare Advantage' + (planLabel ? ' (' + planLabel + ')' : ''), amount: mPrem.n, text: mPrem.text });
      sections.push({
        title: 'Your Medicare Advantage Plan',
        subtitle: planLabel || placeholder('carrier / plan name'),
        bullets: mb,
        why: whyFor('mapd', m.note)
      });
    }

    // ----- Medicare Supplement -----
    var medsuppPlan = '';
    if (main === 'medsupp') {
      var s = d.medsupp;
      var letter = str(s.plan) || 'G';
      medsuppPlan = letter === 'other' ? (str(s.otherName) || placeholder('plan name')) : 'Plan ' + letter;
      if (letter === 'other' && !str(s.otherName)) warnings.push('Medicare Supplement: enter the plan name.');
      var sPrem = needPremium(s.premium, 'Medicare Supplement');
      var carrier = str(s.carrier);
      if (!carrier) warnings.push('Medicare Supplement: enter the carrier.');
      var sb;
      if (letter === 'G') {
        sb = [
          'After the ' + deductibleText + ' yearly Part B deductible, Plan G pays the rest of your Medicare-approved costs',
          'No copays for doctor visits, hospital stays or surgeries'
        ];
      } else if (letter === 'N') {
        tokens.medsuppCopays = ', and small copays for some office and ER visits';
        sb = [
          { text: 'After the ' + deductibleText + ' yearly Part B deductible, Plan N covers your Medicare-approved costs, except:', sub: [
            'Up to a $20 copay for some office visits',
            'Up to a $50 copay for ER visits (waived if you are admitted)',
            'Part B excess charges (up to 15%) if a doctor bills above Medicare’s rate, which is uncommon'
          ] }
        ];
      } else {
        sb = str(s.otherBenefits).split('\n').map(str).filter(Boolean);
        if (!sb.length) warnings.push('Medicare Supplement: list the plan’s key benefits (one per line).');
      }
      sb.push('See any doctor in the U.S. who accepts Medicare. No networks, no referrals.');
      sb.push('Benefits are standardized by Medicare, so every carrier’s ' + medsuppPlan + ' covers the same things. Only the price differs.');
      var fee = num(s.appFee);
      var premLine = '**Premium: ' + sPrem.text + '/month**' + (fee ? ' (one-time ' + money(fee) + ' application fee)' : '');
      glance.push({ label: 'Medicare Supplement ' + medsuppPlan + (carrier ? ' (' + carrier + ')' : ''), amount: sPrem.n, text: sPrem.text });
      // Plans outside G/N: only claims that hold for every Medigap plan.
      var allowed = (letter === 'G' || letter === 'N') ? null : ['doctors', 'rx', 'travel'];
      sections.push({
        title: 'Your Medicare Supplement: ' + medsuppPlan,
        subtitle: carrier || placeholder('carrier'),
        bullets: sb,
        premium: premLine,
        why: whyFor('medsupp', s.note, null, allowed)
      });

      // Part D
      var partdName = str(s.partdPlan);
      var partdPrem = num(s.partdPremium);
      var db = ["Medicare Supplements don't include prescription coverage, so your plan is paired with a stand-alone Part D drug plan."];
      if (partdName) db.push('**Your drug plan:** ' + partdName);
      db.push('We review drug plans every fall to keep you in the most cost-effective option.');
      if (partdPrem !== null) glance.push({ label: 'Part D drug plan' + (partdName ? ' (' + partdName + ')' : ''), amount: partdPrem, text: premiumText(partdPrem) });
      sections.push({
        title: 'Prescription Drug Coverage (Part D)',
        bullets: db,
        premium: partdPrem !== null ? '**Premium: ' + premiumText(partdPrem) + '/month**' : null
      });
    }

    // ----- Cancer / Heart Attack & Stroke (one combined section) -----
    if (ancOn.cancer || ancOn.heart) {
      var cb = [];
      var ciPrem = [];
      if (ancOn.cancer) {
        var cBen = need(anc.cancer.benefit, money, 'benefit', 'Cancer: enter the benefit amount.');
        var cPrem = needPremium(anc.cancer.premium, 'Cancer');
        tokens.cancerBenefit = cBen.text;
        cb.push('**' + cBen.text + ' Cancer benefit:** ' + cPrem.text + '/month');
        glance.push({ label: 'Cancer (' + cBen.text + ')', amount: cPrem.n, text: cPrem.text });
        ciPrem.push(cPrem);
      }
      if (ancOn.heart) {
        var hBen = need(anc.heart.benefit, money, 'benefit', 'Heart Attack & Stroke: enter the benefit amount.');
        var hPrem = needPremium(anc.heart.premium, 'Heart Attack & Stroke');
        tokens.heartBenefit = hBen.text;
        cb.push('**' + hBen.text + ' Heart Attack & Stroke benefit:** ' + hPrem.text + '/month');
        glance.push({ label: 'Heart Attack & Stroke (' + hBen.text + ')', amount: hPrem.n, text: hPrem.text });
        ciPrem.push(hPrem);
      }
      cb.push('Pays a **lump-sum cash benefit upon diagnosis**, paid directly to you');
      cb.push('Use it however you need: treatment, medications, travel for care, or everyday bills');
      var title = ancOn.cancer && ancOn.heart ? 'Cancer, Heart Attack & Stroke Coverage'
        : ancOn.cancer ? 'Cancer Coverage' : 'Heart Attack & Stroke Coverage';
      var why = [];
      if (ancOn.cancer) why = why.concat(whyFor('cancer', anc.cancer.note));
      if (ancOn.heart) why = why.concat(whyFor('heart', anc.heart.note));
      // de-duplicate (the "savings" line can apply to both)
      why = why.filter(function (l, i) { return why.indexOf(l) === i; }).slice(0, 3);
      var ciTotal = ciPrem.every(function (x) { return x.n !== null; })
        ? '**Total premium: ' + premiumText(round2(ciPrem.reduce(function (a, x) { return a + x.n; }, 0))) + '/month**'
        : null;
      sections.push({
        title: title,
        intro: 'Even with great medical coverage, a serious diagnosis brings costs Medicare doesn’t touch: expensive medications, non-covered treatments, travel and lodging for care, and changes to daily life.',
        bullets: cb,
        premium: ciPrem.length > 1 ? ciTotal : null,
        why: why
      });
    }

    // ----- Recovery Care -----
    if (ancOn.recovery) {
      var rc = cfg.recoveryCare;
      var rDaily = need(anc.recovery.daily, money, 'daily benefit', 'Recovery Care: enter the daily benefit.');
      var rPrem = needPremium(anc.recovery.premium, 'Recovery Care');
      var rMin = rDaily.n !== null ? money(rDaily.n * rc.consecutiveDays) : placeholder('total');
      var rMax = rDaily.n !== null ? money(rDaily.n * rc.lifetimeDays) : placeholder('total');
      tokens.recoveryDaily = rDaily.text;
      tokens.recoveryMax = rMax;
      glance.push({ label: 'Recovery Care (' + rDaily.text + '/day)', amount: rPrem.n, text: rPrem.text });
      sections.push({
        title: 'Recovery Care: Skilled Nursing & Assisted Living',
        intro: 'Medicare stops paying for skilled nursing after Day 100 and pays nothing toward assisted living. This coverage picks up where Medicare leaves off.',
        bullets: [
          '**' + rDaily.text + '/day benefit**',
          'Begins Day ' + rc.startDay + ', after Medicare stops paying',
          'Lasts up to ' + rc.consecutiveDays + ' consecutive days or ' + rc.lifetimeDays + ' lifetime days',
          '**Total coverage: ' + rMin + ' minimum, up to ' + rMax + '**'
        ],
        premium: '**Premium: ' + rPrem.text + '/month**',
        why: whyFor('recovery', anc.recovery.note)
      });
    }

    // ----- Home Healthcare -----
    if (ancOn.home) {
      var hh = anc.home;
      var hDaily = need(hh.daily, money, 'daily benefit', 'Home Healthcare: enter the daily benefit.');
      var hhPrem = needPremium(hh.premium, 'Home Healthcare');
      tokens.homeDaily = hDaily.text;
      var hb = ['**' + hDaily.text + ' per day of home care**'];
      var hDays = num(hh.days);
      if (hDays !== null) {
        hb.push('Up to ' + hDays.toLocaleString('en-US') + ' days' + (hDaily.n !== null ? ' (' + money(hDaily.n * hDays) + ' total)' : ''));
      }
      if (str(hh.waiting)) hb.push('Benefits begin: ' + str(hh.waiting));
      hb.push('Helps pay for nursing visits, therapy and home health aides');
      glance.push({ label: 'Home Healthcare (' + hDaily.text + '/day)', amount: hhPrem.n, text: hhPrem.text });
      sections.push({
        title: 'Home Healthcare: Recover in the Comfort of Your Own Home',
        intro: 'After a hospital stay, surgery or illness, most people heal faster and feel better at home. This coverage pays you a cash benefit for care at home, so you can recover in your own bed, around your family, without worrying about the bill.',
        bullets: hb,
        premium: '**Premium: ' + hhPrem.text + '/month**',
        why: whyFor('home', hh.note)
      });
    }

    // ----- Hospital Indemnity (+ SNF rider) -----
    if (ancOn.hospital) {
      var hi = anc.hospital;
      var hiDaily = need(hi.daily, money, 'daily benefit', 'Hospital Indemnity: enter the daily hospital benefit.');
      var hiPrem = needPremium(hi.premium, 'Hospital Indemnity');
      tokens.hospitalDaily = hiDaily.text;
      var hiDays = num(hi.days);
      var hib = ['**' + hiDaily.text + '/day** for each day you are in the hospital' + (hiDays !== null ? ' (up to ' + hiDays + ' days)' : '')];
      var snfOn = !!hi.snf;
      var snfPrem = null;
      if (snfOn) {
        var snfDaily = need(hi.snfDaily, money, 'SNF daily benefit', 'Hospital Indemnity: enter the SNF rider daily benefit.');
        var sStart = num(hi.snfStart) || cfg.hospitalSnf.startDay;
        var sEnd = num(hi.snfEnd) || cfg.hospitalSnf.endDay;
        hib.push('**' + snfDaily.text + '/day in a skilled nursing facility, Days ' + sStart + '–' + sEnd + '.** Those are the days Medicare charges you a daily copay.');
        snfPrem = num(hi.snfPremium);
        if (main === 'medsupp') {
          warnings.push('Heads up: Medicare Supplement plans G and N already pay the skilled nursing copay for Days 21–100, so the SNF rider overlaps. The email still includes it.');
        }
      }
      var hiTotal = hiPrem.n !== null ? round2(hiPrem.n + (snfPrem || 0)) : null;
      var hiTotalText = hiTotal !== null ? premiumText(hiTotal) : hiPrem.text;
      var hiPremLine = '**Premium: ' + hiTotalText + '/month**' +
        (snfPrem ? ' (includes ' + premiumText(snfPrem) + ' for the skilled nursing rider)' : '');
      glance.push({
        label: 'Hospital Indemnity (' + hiDaily.text + '/day)' + (snfOn ? ' + Skilled Nursing rider' : ''),
        amount: hiTotal, text: hiTotalText
      });
      var extra = main === 'mapd'
        ? ['This pairs with your Medicare Advantage plan to help cover its hospital' + (snfOn ? ' and skilled nursing' : '') + ' copays.']
        : [];
      sections.push({
        title: 'Hospital Indemnity' + (snfOn ? ' with Skilled Nursing Rider' : ''),
        intro: 'Pays you cash when you are admitted to the hospital, to help with the copays and costs that come with a stay.',
        bullets: hib,
        premium: hiPremLine,
        why: whyFor('hospital', hi.note, extra)
      });
    }

    // ----- Dental, Vision & Hearing -----
    if (ancOn.dvh) {
      var dv = anc.dvh;
      var dMax = need(dv.annualMax, money, 'annual max', 'Dental/Vision/Hearing: enter the annual maximum.');
      var dPrem = needPremium(dv.premium, 'Dental/Vision/Hearing');
      tokens.dvhMax = dMax.text;
      var dvb = [
        '**Annual maximum: ' + dMax.text + ' per person**',
        'No deductible',
        'Preventive care covered at 100%',
        'Covers preventive, basic and major services',
        'Same coverage in or out of network'
      ];
      if (str(dv.link)) dvb.push({ link: str(dv.link), text: 'Find providers near you' });
      glance.push({ label: 'Dental, Vision & Hearing', amount: dPrem.n, text: dPrem.text });
      sections.push({
        title: 'Dental, Vision & Hearing',
        subtitle: str(dv.carrier) || null,
        bullets: dvb,
        premium: '**Premium: ' + dPrem.text + '/month**',
        why: whyFor('dvh', dv.note)
      });
    }

    // ----- Where You Are Today -----
    var today = [];
    var status = cfg.situations.filter(function (x) { return x.key === d.situation.status; })[0];
    if (status && status.today) today.push(status.today);
    cfg.concerns.forEach(function (c) { if (concernSet[c.key]) today.push(c.today); });
    if (d.situation.notes) today.push(d.situation.notes);

    // ----- At a glance totals -----
    var allKnown = glance.every(function (g) { return g.amount !== null; });
    var total = allKnown ? round2(glance.reduce(function (a, g) { return a + g.amount; }, 0)) : null;
    var glanceBlock = null;
    if (glance.length) {
      glanceBlock = {
        rows: glance,
        totalText: total !== null ? premiumText(total) : placeholder('total'),
        partBText: partB ? partB.text : null,
        allInText: partB ? (total !== null && partB.n !== null ? premiumText(round2(total + partB.n)) : placeholder('total')) : null,
        footnote: main === 'medsupp' && num(d.medsupp.appFee) ? 'Plus a one-time ' + money(num(d.medsupp.appFee)) + ' application fee for your Medicare Supplement.' : null
      };
    }

    // ----- Disclaimer -----
    var disclaimer = null;
    if (cfg.disclaimer && cfg.disclaimer.showFor.indexOf(main) >= 0) {
      var orgs = str(cfg.disclaimer.organizations), plans = str(cfg.disclaimer.plans);
      if (!orgs || !plans) warnings.push('Disclaimer: set the number of organizations and products you represent in js/config.js.');
      disclaimer = fill(cfg.disclaimer.text, {
        organizations: orgs || placeholder('#'),
        plans: plans || placeholder('#')
      });
    }

    // ----- Subject -----
    var kind = main === 'mapd' ? 'Medicare Advantage' : main === 'medsupp' ? 'Medicare Supplement' : '';
    var subject = (first ? first + ', your ' : 'Your ') +
      (kind ? kind + (anyAnc ? ' & coverage' : '') + ' recap' : 'coverage recap');

    var model = {
      greeting: 'Hi ' + (first || placeholder('first name')) + ',',
      intro: 'It was a pleasure speaking with you! Here’s a summary of everything we went over and how each piece fits your situation, so you can review it anytime.',
      glance: glanceBlock,
      today: today,
      sections: sections,
      closing: main === 'ancillary'
        ? 'My goal is to make sure the costs Medicare leaves behind never catch you off guard. Let me know if you have any questions. I’m always happy to help!'
        : 'I know Medicare can feel overwhelming at first, but my goal is to make it simple, clear and tailored to you. Let me know if you have any questions. I’m always happy to help!',
      agent: {
        name: str(d.agent.name) || placeholder('your name'),
        phone: str(d.agent.phone),
        email: str(d.agent.email)
      },
      disclaimer: disclaimer
    };

    return {
      subject: subject.replace(new RegExp(PH_OPEN + '|' + PH_CLOSE, 'g'), ''),
      html: renderHtml(model),
      text: renderText(model),
      warnings: warnings
    };
  }

  // ---------- HTML renderer (inline styles for email clients) ----------

  var C = {
    text: '#1f2933', muted: '#52606d', navy: '#1d3557', line: '#dbe4ec',
    soft: '#eef4f8', whyBg: '#eef7f1', whyLine: '#2e7d5b', ph: '#fff3b0'
  };
  var FONT = 'font-family:Arial,Helvetica,sans-serif;';

  function inline(s) {
    return escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\u0001(.*?)\u0002/g, '<span style="background:' + C.ph + ';padding:0 4px;border-radius:3px;">[$1]</span>');
  }

  function bulletHtml(b) {
    if (typeof b === 'string') return '<li style="margin:0 0 6px;">' + inline(b) + '</li>';
    if (b.link) {
      return '<li style="margin:0 0 6px;"><a href="' + escapeHtml(b.link) + '" style="color:' + C.navy + ';font-weight:bold;">' + inline(b.text) + '</a></li>';
    }
    return '<li style="margin:0 0 6px;">' + inline(b.text) +
      '<ul style="margin:6px 0 0;padding-left:22px;">' + b.sub.map(bulletHtml).join('') + '</ul></li>';
  }

  function headingHtml(title, number) {
    var badge = number
      ? '<td width="36" valign="middle" style="width:36px;padding:0;">' +
          '<div style="' + FONT + 'width:30px;height:30px;line-height:30px;border-radius:15px;background:' + C.navy + ';color:#ffffff;text-align:center;font-weight:bold;font-size:16px;">' + number + '</div></td>'
      : '';
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:30px 0 6px;"><tr>' +
      badge +
      '<td valign="middle" style="' + FONT + 'padding:0;font-size:20px;font-weight:bold;color:' + C.navy + ';">' + inline(title) + '</td>' +
      '</tr></table>';
  }

  function renderHtml(m) {
    var P = 'style="' + FONT + 'margin:0 0 14px;"';
    var out = [];
    out.push('<div style="' + FONT + 'font-size:16px;line-height:1.55;color:' + C.text + ';max-width:640px;">');
    out.push('<p ' + P + '>' + inline(m.greeting) + '</p>');
    out.push('<p ' + P + '>' + inline(m.intro) + '</p>');

    if (m.glance) {
      var g = m.glance;
      var cell = FONT + 'padding:10px 16px;border-top:1px solid ' + C.line + ';';
      var rows = g.rows.map(function (r) {
        return '<tr><td style="' + cell + '">' + inline(r.label) + '</td>' +
          '<td align="right" style="' + cell + 'white-space:nowrap;text-align:right;">' + inline(r.text) + '/mo</td></tr>';
      }).join('');
      var totalRow = function (label, value, strong) {
        var st = cell + 'background:' + C.soft + ';' + (strong ? 'font-weight:bold;font-size:17px;' : '');
        return '<tr><td style="' + st + '">' + inline(label) + '</td><td align="right" style="' + st + 'white-space:nowrap;text-align:right;">' + inline(value) + '/mo</td></tr>';
      };
      var tbl = '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:22px 0 8px;border:1px solid ' + C.line + ';">' +
        '<tr><td colspan="2" style="' + FONT + 'background:' + C.navy + ';color:#ffffff;padding:12px 16px;font-size:18px;font-weight:bold;">Your Coverage at a Glance</td></tr>' +
        rows +
        totalRow(g.partBText ? 'Total for the plans above' : 'Your total monthly premium', g.totalText, !g.partBText);
      if (g.partBText) {
        tbl += '<tr><td style="' + cell + 'color:' + C.muted + ';">Part B premium (comes out of your Social Security)</td>' +
          '<td align="right" style="' + cell + 'white-space:nowrap;text-align:right;color:' + C.muted + ';">' + inline(g.partBText) + '/mo</td></tr>' +
          totalRow('All-in monthly cost', g.allInText, true);
      }
      tbl += '</table>';
      out.push(tbl);
      if (g.footnote) out.push('<p style="' + FONT + 'margin:0 0 14px;font-size:14px;color:' + C.muted + ';">' + inline(g.footnote) + '</p>');
    }

    if (m.today.length) {
      out.push(headingHtml('Where You Are Today'));
      out.push('<ul style="' + FONT + 'margin:8px 0 14px;padding-left:22px;">' + m.today.map(bulletHtml).join('') + '</ul>');
    }

    m.sections.forEach(function (s, i) {
      out.push(headingHtml(s.title, i + 1));
      if (s.subtitle) out.push('<p style="' + FONT + 'margin:0 0 10px;color:' + C.muted + ';font-weight:bold;">' + inline(s.subtitle) + '</p>');
      if (s.intro) out.push('<p ' + P + '>' + inline(s.intro) + '</p>');
      out.push('<ul style="' + FONT + 'margin:8px 0 12px;padding-left:22px;">' + s.bullets.map(bulletHtml).join('') + '</ul>');
      if (s.after) out.push('<p ' + P + '>' + inline(s.after) + '</p>');
      if (s.premium) out.push('<p style="' + FONT + 'margin:0 0 14px;font-size:17px;">' + inline(s.premium) + '</p>');
      if (s.why && s.why.length) {
        out.push('<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:4px 0 14px;"><tr>' +
          '<td style="' + FONT + 'background:' + C.whyBg + ';border-left:4px solid ' + C.whyLine + ';padding:12px 16px;">' +
          '<div style="font-size:13px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;color:' + C.whyLine + ';margin:0 0 4px;">Why this fits you</div>' +
          s.why.map(function (w) { return '<div style="margin:4px 0 0;">' + inline(w) + '</div>'; }).join('') +
          '</td></tr></table>');
      }
    });

    out.push('<p style="' + FONT + 'margin:30px 0 14px;">' + inline(m.closing) + '</p>');
    var sig = ['Best regards,', '**' + m.agent.name + '**'];
    if (m.agent.phone) sig.push(m.agent.phone);
    if (m.agent.email) sig.push(m.agent.email);
    out.push('<p ' + P + '>' + sig.map(inline).join('<br>') + '</p>');
    if (m.disclaimer) {
      out.push('<p style="' + FONT + 'margin:24px 0 0;font-size:12px;line-height:1.45;color:' + C.muted + ';">' + inline(m.disclaimer) + '</p>');
    }
    out.push('</div>');
    return out.join('\n');
  }

  // ---------- plain-text renderer ----------

  function plain(s) {
    return String(s).replace(/\*\*(.+?)\*\*/g, '$1').replace(/\u0001(.*?)\u0002/g, '[$1]');
  }

  function bulletText(b, indent) {
    var pad = indent || '';
    if (typeof b === 'string') return pad + '- ' + plain(b);
    if (b.link) return pad + '- ' + plain(b.text) + ': ' + b.link;
    return [pad + '- ' + plain(b.text)].concat(b.sub.map(function (x) { return bulletText(x, pad + '    '); })).join('\n');
  }

  function renderText(m) {
    var out = [plain(m.greeting), '', plain(m.intro), ''];
    if (m.glance) {
      var g = m.glance;
      out.push('YOUR COVERAGE AT A GLANCE');
      g.rows.forEach(function (r) { out.push('- ' + plain(r.label) + ': ' + plain(r.text) + '/mo'); });
      out.push((g.partBText ? 'Total for the plans above: ' : 'Your total monthly premium: ') + plain(g.totalText) + '/mo');
      if (g.partBText) {
        out.push('Part B premium (comes out of your Social Security): ' + plain(g.partBText) + '/mo');
        out.push('All-in monthly cost: ' + plain(g.allInText) + '/mo');
      }
      if (g.footnote) out.push(plain(g.footnote));
      out.push('');
    }
    if (m.today.length) {
      out.push('WHERE YOU ARE TODAY');
      m.today.forEach(function (t) { out.push(bulletText(t)); });
      out.push('');
    }
    m.sections.forEach(function (s, i) {
      out.push((i + 1) + '. ' + plain(s.title).toUpperCase());
      if (s.subtitle) out.push(plain(s.subtitle));
      if (s.intro) out.push(plain(s.intro));
      s.bullets.forEach(function (b) { out.push(bulletText(b)); });
      if (s.after) out.push(plain(s.after));
      if (s.premium) out.push(plain(s.premium));
      if (s.why && s.why.length) {
        out.push('Why this fits you:');
        s.why.forEach(function (w) { out.push('  ' + plain(w)); });
      }
      out.push('');
    });
    out.push(plain(m.closing), '', 'Best regards,', plain(m.agent.name));
    if (m.agent.phone) out.push(m.agent.phone);
    if (m.agent.email) out.push(m.agent.email);
    if (m.disclaimer) out.push('', plain(m.disclaimer));
    return out.join('\n');
  }

  var api = { buildEmail: buildEmail, _num: num, _money: money };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RecapEmail = api;
})(this);
