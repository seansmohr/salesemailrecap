/*
 * Recap Email Generator — email builder.
 *
 * buildEmail(input, config) -> { subject, html, text, warnings }
 *
 * Pure function (no DOM access) so it runs in the browser and in Node tests.
 * The email is first assembled as a model (glance table, comparison,
 * numbered sections), then rendered twice: inline-styled HTML for pasting
 * into Gmail / Outlook, and plain text as a clipboard fallback.
 *
 * The agent's own email signature follows the pasted text, so the email ends
 * with "Best regards," and no name.
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

  function round2(n) { return Math.round(n * 100) / 100; }

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

  var SITUATIONS = ['t65', 'leavingEmployer', 'stayingEmployer', 'tooEarly', 'onMedicare'];
  var PRODUCTS = ['cancer', 'heart', 'recovery', 'home', 'hospital', 'dvh'];

  // ---------- builder ----------

  function buildEmail(input, cfg) {
    var d = input || {};
    var anc = d.anc || {};
    var warnings = [];

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

    var first = str(d.prospect && d.prospect.firstName);
    if (!first) warnings.push('Enter the prospect’s first name.');

    var situation = SITUATIONS.indexOf(d.situation) >= 0 ? d.situation : null;
    if (!situation) warnings.push('Pick the prospect’s situation.');
    var sit = situation ? cfg.situations[situation] : { today: '', why: {} };
    var staying = situation === 'stayingEmployer';
    var early = situation === 'tooEarly';

    // Not on Medicare yet (staying on employer / too early): no Medicare plan.
    // Staying on employer coverage: cancer / heart attack & stroke only.
    var main = staying || early ? 'none'
      : (['mapd', 'medsupp', 'ancillary'].indexOf(d.main) >= 0 ? d.main : 'ancillary');
    var on = {};
    PRODUCTS.forEach(function (k) {
      on[k] = !!(anc[k] && anc[k].on) && (!staying || k === 'cancer' || k === 'heart');
    });
    var anyAnc = PRODUCTS.some(function (k) { return on[k]; });
    if ((main === 'ancillary' || main === 'none') && !anyAnc) {
      warnings.push(staying
        ? 'Tick Cancer and/or Heart Attack & Stroke.'
        : 'Ancillary: tick at least one product.');
    }

    var deductibleText = money(cfg.partBDeductible);
    var tokens = { partBDeductible: deductibleText };
    var glance = [];      // { label, detail, amount (number|null), text }
    var sections = [];    // numbered sections
    var mainLabel = '';

    // One "Why this fits you" line: situation-specific first, then any
    // pairing line, then the product's default line.
    function whyFor(key, extra) {
      var candidates = [];
      if (sit.why && sit.why[key]) candidates.push(sit.why[key]);
      (extra || []).forEach(function (l) { candidates.push(l); });
      if (cfg.defaultWhy[key]) candidates.push(cfg.defaultWhy[key]);
      return candidates.length ? fill(candidates[0], tokens) : null;
    }

    // Every section has the same short shape:
    //   heading (+ monthly price) / optional subtitle / bold lead line /
    //   up to 3 bullets / one "Why this fits you" line.
    var ANC_PREFACE = 'Your health insurance only pays for what it approves. The coverage below pays you cash for what it won’t, so a diagnosis, hospital stay or recovery doesn’t come out of your savings.';
    function pushAncillary(section) {
      if (!sections.some(function (x) { return x.ancillary; })) {
        section.preface = ANC_PREFACE;
        if (sit.whyNow) section.whyNow = sit.whyNow;
      }
      section.ancillary = true;
      sections.push(section);
    }

    // ----- Delaying Medicare (staying on employer coverage) -----
    if (staying) {
      sections.push({
        title: 'Delaying Medicare: When Your Employer Coverage Ends',
        lead: 'You have creditable coverage through work, so you can delay Part B without a penalty. When that coverage is ending:',
        bullets: [
          { link: cfg.cmsL564Url, text: 'Get Form CMS-L564 (Request for Employment Information)' },
          '**Take it to your HR department.** They’ll help you fill it out.',
          '**Submit it with your Medicare Part A & B application** through Social Security. This protects you from late enrollment penalties.',
          'You have **8 months** after your coverage ends; start 2–3 months early so there’s no gap. Call me and I’ll walk you through it.'
        ]
      });
    }

    // ----- Getting ready for Medicare (too early for Medicare) -----
    if (early) {
      sections.push({
        title: 'Getting Ready for Medicare',
        bullets: [
          'Your **Initial Enrollment Period** is 7 months: the 3 months before your 65th birthday month, that month, and the 3 months after.',
          'Signing up late can mean a **lifelong Part B penalty**.',
          'I’ll reach out about 3 months before your window opens, so we can review your options together.'
        ]
      });
    }

    // ----- Medicare Parts A & B -----
    var partB = null;
    if (main === 'mapd' || main === 'medsupp') {
      partB = need(d.partBPremium, premiumText, 'Part B premium', 'Enter the Part B premium.');
      sections.push({
        title: 'Medicare Parts A & B',
        bullets: [
          '**Part A (hospital)** is premium-free. **Part B (doctors)** covers 80% of approved costs, for ' + partB.text + '/month from your Social Security.',
          'The other 20% has no yearly limit. That’s the gap your ' +
            (main === 'mapd' ? 'Medicare Advantage plan' : 'Medicare Supplement') + ' covers.'
        ]
      });
    }

    // ----- Medicare Advantage -----
    if (main === 'mapd') {
      var m = d.mapd || {};
      var mPrem = needPremium(m.premium, 'Medicare Advantage');
      var planLabel = [str(m.carrier), str(m.planName)].filter(Boolean).join(' – ');
      if (!planLabel) warnings.push('Medicare Advantage: enter the carrier or plan name.');
      mainLabel = 'Medicare Advantage' + (planLabel ? ' (' + planLabel + ')' : '');
      glance.push({ label: mainLabel, detail: 'Your doctor and hospital coverage', amount: mPrem.n, text: mPrem.text });
      sections.push({
        title: 'Your Medicare Advantage Plan',
        price: mPrem.text,
        subtitle: planLabel || placeholder('carrier / plan name'),
        bullets: [
          'Replaces Original Medicare as how you get your benefits; you keep paying your Part B premium',
          'Copays with a yearly out-of-pocket cap; plan details are in your brochure',
          'Uses a provider network; some services need prior authorization'
        ],
        why: whyFor('mapd')
      });
    }

    // ----- Medicare Supplement -----
    if (main === 'medsupp') {
      var s = d.medsupp || {};
      var letter = s.plan === 'N' ? 'N' : 'G';
      var sPrem = needPremium(s.premium, 'Medicare Supplement');
      var carrier = str(s.carrier);
      if (!carrier) warnings.push('Medicare Supplement: enter the carrier.');
      tokens.medsuppCoverage = letter === 'G'
        ? 'Plan G pays the rest of your approved costs'
        : 'Plan N covers your approved costs aside from small copays';
      mainLabel = 'Medicare Supplement Plan ' + letter + (carrier ? ' (' + carrier + ')' : '');
      glance.push({
        label: mainLabel,
        detail: letter === 'G'
          ? 'Pays the rest of your approved costs after the ' + deductibleText + ' deductible'
          : 'Pays your approved costs after the ' + deductibleText + ' deductible, minus small copays',
        amount: sPrem.n, text: sPrem.text
      });
      sections.push({
        title: 'Your Medicare Supplement: Plan ' + letter,
        price: sPrem.text,
        subtitle: carrier || placeholder('carrier'),
        bullets: [
          letter === 'G'
            ? 'After the ' + deductibleText + ' Part B deductible, pays the rest of your Medicare-approved costs'
            : 'After the ' + deductibleText + ' Part B deductible, covers your Medicare-approved costs except up to $20 office copays, $50 ER copays and rare Part B excess charges',
          'See any doctor in the U.S. who accepts Medicare. No networks, no referrals.',
          'Prescriptions aren’t included, so it’s paired with a Part D drug plan'
        ],
        why: whyFor('medsupp')
      });
    }

    // ----- Cancer / Heart Attack & Stroke (one combined section) -----
    if (on.cancer || on.heart) {
      var ciPrem = [];
      var cBen = null, hBen = null;
      if (on.cancer) {
        cBen = need(anc.cancer.benefit, money, 'benefit', 'Cancer: enter the benefit amount.');
        var cPrem = needPremium(anc.cancer.premium, 'Cancer');
        glance.push({ label: 'Cancer', detail: cBen.text + ' cash if diagnosed', amount: cPrem.n, text: cPrem.text });
        ciPrem.push(cPrem);
      }
      if (on.heart) {
        hBen = need(anc.heart.benefit, money, 'benefit', 'Heart Attack & Stroke: enter the benefit amount.');
        var hPrem = needPremium(anc.heart.premium, 'Heart Attack & Stroke');
        glance.push({ label: 'Heart Attack & Stroke', detail: hBen.text + ' cash if diagnosed', amount: hPrem.n, text: hPrem.text });
        ciPrem.push(hPrem);
      }
      var lead;
      if (cBen && hBen && cBen.text !== hBen.text) {
        tokens.ciCash = 'a cash benefit (' + cBen.text + ' for cancer, ' + hBen.text + ' for a heart attack or stroke)';
        lead = '**' + cBen.text + ' cash** for cancer and **' + hBen.text + ' cash** for a heart attack or stroke, paid directly to you upon diagnosis';
      } else {
        var ben = (cBen || hBen).text;
        tokens.ciCash = 'a ' + ben + ' cash benefit';
        lead = '**' + ben + ' cash** paid directly to you upon a ' +
          (cBen && hBen ? 'cancer, heart attack or stroke' : cBen ? 'cancer' : 'heart attack or stroke') + ' diagnosis';
      }
      // Two strongest examples of costs health insurance won't approve.
      var ciBullets = [];
      if (on.cancer) ciBullets.push('Pays for **travel and lodging** at a top cancer center like MD Anderson or Mayo Clinic');
      if (on.heart) ciBullets.push('Pays for **home changes after a stroke**, like a ramp, stair lift or walk-in shower');
      if (!on.heart) ciBullets.push('Pays for **treatments your plan won’t approve**, like experimental or out-of-network care');
      if (!on.cancer) ciBullets.push('Pays for **in-home help and caregiving** while you recover');
      if (staying) ciBullets.push('Or use it to **replace lost income** and keep the bills paid while you recover');
      var ciPrice = ciPrem.every(function (x) { return x.n !== null; })
        ? premiumText(round2(ciPrem.reduce(function (a, x) { return a + x.n; }, 0)))
        : placeholder('premium');
      pushAncillary({
        title: on.cancer && on.heart ? 'Cancer, Heart Attack & Stroke'
          : on.cancer ? 'Cancer Coverage' : 'Heart Attack & Stroke Coverage',
        price: ciPrice,
        lead: lead,
        bullets: ciBullets,
        why: whyFor('critical')
      });
    }

    // ----- Recovery Care -----
    if (on.recovery) {
      var rc = cfg.recoveryCare;
      var rDaily = need(anc.recovery.daily, money, 'daily benefit', 'Recovery Care: enter the daily benefit.');
      var rPrem = needPremium(anc.recovery.premium, 'Recovery Care');
      var rMax = rDaily.n !== null ? money(rDaily.n * rc.lifetimeDays) : placeholder('total');
      glance.push({ label: 'Recovery Care', detail: rDaily.text + '/day once Medicare stops paying', amount: rPrem.n, text: rPrem.text });
      pushAncillary({
        title: 'Recovery Care',
        price: rPrem.text,
        lead: '**' + rDaily.text + '/day** once Medicare stops paying, up to ' + rMax,
        bullets: [
          'Pays for **assisted living**, which Medicare pays nothing toward',
          'Pays for **skilled nursing after Day ' + (rc.startDay - 1) + '**, when Medicare stops'
        ],
        why: whyFor('recovery')
      });
    }

    // ----- Home Healthcare -----
    if (on.home) {
      var hDaily = need(anc.home.daily, money, 'daily benefit', 'Home Healthcare: enter the daily benefit.');
      var hhPrem = needPremium(anc.home.premium, 'Home Healthcare');
      glance.push({ label: 'Home Healthcare', detail: hDaily.text + '/day for care at home', amount: hhPrem.n, text: hhPrem.text });
      pushAncillary({
        title: 'Home Healthcare',
        price: hhPrem.text,
        lead: '**' + hDaily.text + '/day** so you can recover in the comfort of your own home',
        bullets: [
          'Pays for **help with bathing, dressing, meals and housekeeping**',
          'Pays for **care beyond the limited visits** Medicare approves'
        ],
        why: whyFor('home')
      });
    }

    // ----- Hospital Indemnity (+ SNF rider when a SNF benefit is entered) -----
    if (on.hospital) {
      var hi = anc.hospital;
      var hiDaily = need(hi.daily, money, 'daily benefit', 'Hospital Indemnity: enter the daily hospital benefit.');
      var hiPrem = needPremium(hi.premium, 'Hospital Indemnity');
      var snfDaily = num(hi.snfDaily);
      var hib = [];
      if (snfDaily !== null) {
        hib.push('**' + money(snfDaily) + '/day in a skilled nursing facility**, Days ' + cfg.hospitalSnf.startDay + '–' + cfg.hospitalSnf.endDay + ', when Medicare charges a daily copay');
        if (main === 'medsupp') {
          warnings.push('Heads up: Medicare Supplement plans G and N already pay the skilled nursing copay for Days 21–100, so the SNF rider overlaps. The email still includes it.');
        }
      }
      // Med Supp G/N already pay the hospital deductible and copays.
      hib.push(main === 'medsupp'
        ? 'Pays for **bills at home** that keep coming while you’re in the hospital'
        : 'Pays for your plan’s **hospital deductible and daily copays**');
      glance.push({
        label: 'Hospital Indemnity',
        detail: hiDaily.text + '/day in the hospital' + (snfDaily !== null ? ', ' + money(snfDaily) + '/day in skilled nursing' : ''),
        amount: hiPrem.n, text: hiPrem.text
      });
      pushAncillary({
        title: 'Hospital Indemnity' + (snfDaily !== null ? ' + Skilled Nursing' : ''),
        price: hiPrem.text,
        lead: '**' + hiDaily.text + '/day** cash for every day you’re in the hospital',
        bullets: hib,
        why: whyFor('hospital', main === 'mapd'
          ? ['Pairs with your Medicare Advantage plan to cover its hospital' + (snfDaily !== null ? ' and skilled nursing' : '') + ' copays.']
          : [])
      });
    }

    // ----- Dental, Vision & Hearing -----
    if (on.dvh) {
      var dMax = need(anc.dvh.annualMax, money, 'annual max', 'Dental/Vision/Hearing: enter the annual maximum.');
      var dPrem = needPremium(anc.dvh.premium, 'Dental/Vision/Hearing');
      glance.push({ label: 'Dental, Vision & Hearing', detail: 'Up to ' + dMax.text + '/year, no deductible', amount: dPrem.n, text: dPrem.text });
      pushAncillary({
        title: 'Dental, Vision & Hearing',
        price: dPrem.text,
        lead: '**' + dMax.text + '/year** per person, no deductible, preventive care covered at 100%',
        bullets: [
          'Pays for **dental work** like fillings, crowns and dentures',
          'Pays for **eye exams, glasses and hearing aids**, which Medicare doesn’t cover'
        ],
        why: whyFor('dvh')
      });
    }

    // ----- At a glance -----
    // One total. Part B is listed as a normal row (first).
    var allKnown = glance.every(function (g) { return g.amount !== null; });
    var total = allKnown ? round2(glance.reduce(function (a, g) { return a + g.amount; }, 0)) : null;
    var glanceBlock = null;
    if (glance.length) {
      var rows = glance.slice();
      var grand = total;
      if (partB) {
        rows.unshift({ label: 'Medicare Part B', detail: 'Covers 80% of doctor costs', text: partB.text });
        grand = total !== null && partB.n !== null ? round2(total + partB.n) : null;
      }
      glanceBlock = {
        rows: rows,
        totalText: grand !== null ? premiumText(grand) : placeholder('total')
      };
    }

    // ----- What you have now vs. what we recommend (already on Medicare) -----
    var compare = null;
    if (situation === 'onMedicare') {
      var cur = d.current || {};
      var curPlan = str(cur.plan);
      var curPrem = num(cur.premium);
      if (!curPlan) warnings.push('Already on Medicare: enter their current plan.');
      if (curPrem === null) warnings.push('Already on Medicare: enter their current monthly premium.');
      var keeping = main === 'ancillary';
      var added = glance.slice(keeping ? 0 : 1).map(function (g) { return g.label; });
      var recTotal = total === null ? null
        : keeping ? (curPrem === null ? null : round2(curPrem + total)) : total;
      compare = {
        rows: [
          ['Medical plan', curPlan || placeholder('current plan'), keeping ? 'Keep your current plan' : (mainLabel || placeholder('plan'))],
          ['Added protection', 'None', added.length ? added.join(', ') : 'None'],
          ['Monthly premium', curPrem !== null ? premiumText(curPrem) + '/mo' : placeholder('current premium'),
            recTotal !== null ? premiumText(recTotal) + '/mo' : placeholder('total')]
        ],
        note: 'Part B premium not included; it’s the same either way.'
      };
    }

    // ----- Disclaimer -----
    var disclaimer = null;
    if (main === 'mapd' || main === 'medsupp') {
      var orgs = str(cfg.disclaimer.organizations), plans = str(cfg.disclaimer.plans);
      if (!orgs || !plans) warnings.push('Disclaimer: set the number of organizations and products you represent in js/config.js.');
      disclaimer = fill(cfg.disclaimer.text, {
        organizations: orgs || placeholder('#'),
        plans: plans || placeholder('#')
      });
    }

    // ----- Subject -----
    var topic = situation === 'onMedicare' ? 'Medicare coverage review'
      : main === 'mapd' ? 'Medicare Advantage recap'
      : main === 'medsupp' ? 'Medicare Supplement recap'
      : 'coverage recap';
    var subject = (first ? first + ', your ' : 'Your ') + topic;

    var today = [];
    if (sit.today) today.push(sit.today);
    if (str(d.notes)) today.push(str(d.notes));

    var model = {
      greeting: 'Hi ' + (first || placeholder('first name')) + ',',
      intro: 'It was a pleasure speaking with you! Here’s a summary of everything we went over and how each piece fits your situation, so you can review it anytime.',
      glance: glanceBlock,
      compare: compare,
      today: today,
      sections: sections,
      closing: (main === 'mapd' || main === 'medsupp')
        ? 'I know Medicare can feel overwhelming at first, but my goal is to make it simple, clear and tailored to you. Let me know if you have any questions. I’m always happy to help!'
        : 'My goal is to make sure you’re protected from the costs that can catch people off guard. Let me know if you have any questions. I’m always happy to help!',
      disclaimer: disclaimer
    };

    return {
      subject: subject,
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

  function headingHtml(title, number, price) {
    var badge = number
      ? '<td width="36" valign="middle" style="width:36px;padding:0;">' +
          '<div style="' + FONT + 'width:30px;height:30px;line-height:30px;border-radius:15px;background:' + C.navy + ';color:#ffffff;text-align:center;font-weight:bold;font-size:16px;">' + number + '</div></td>'
      : '';
    var priceCell = price
      ? '<td valign="middle" align="right" style="' + FONT + 'padding:0 0 0 12px;white-space:nowrap;text-align:right;font-size:17px;font-weight:bold;color:' + C.navy + ';">' + inline(price) + '/mo</td>'
      : '';
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:28px 0 6px;"><tr>' +
      badge +
      '<td valign="middle" style="' + FONT + 'padding:0;font-size:20px;font-weight:bold;color:' + C.navy + ';">' + inline(title) + '</td>' +
      priceCell +
      '</tr></table>';
  }

  function tableOpen(margin) {
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:' + margin + ';border:1px solid ' + C.line + ';">';
  }
  function titleRow(title, cols) {
    return '<tr><td colspan="' + cols + '" style="' + FONT + 'background:' + C.navy + ';color:#ffffff;padding:12px 16px;font-size:18px;font-weight:bold;">' + inline(title) + '</td></tr>';
  }

  function renderHtml(m) {
    var P = 'style="' + FONT + 'margin:0 0 14px;"';
    var cell = FONT + 'padding:10px 16px;border-top:1px solid ' + C.line + ';';
    var out = [];
    out.push('<div style="' + FONT + 'font-size:16px;line-height:1.55;color:' + C.text + ';max-width:640px;">');
    out.push('<p ' + P + '>' + inline(m.greeting) + '</p>');
    out.push('<p ' + P + '>' + inline(m.intro) + '</p>');

    if (m.glance) {
      var g = m.glance;
      var amt = 'white-space:nowrap;text-align:right;vertical-align:top;';
      var tbl = tableOpen('22px 0 14px') + titleRow('Your Coverage at a Glance', 2) +
        g.rows.map(function (r) {
          return '<tr><td style="' + cell + '">' +
            '<div style="font-weight:bold;">' + inline(r.label) + '</div>' +
            (r.detail ? '<div style="font-size:14px;color:' + C.muted + ';">' + inline(r.detail) + '</div>' : '') +
            '</td><td align="right" style="' + cell + amt + 'font-weight:bold;">' + inline(r.text) + '/mo</td></tr>';
        }).join('') +
        '<tr><td style="' + cell + 'background:' + C.navy + ';color:#ffffff;font-weight:bold;font-size:18px;">Total monthly cost</td>' +
        '<td align="right" style="' + cell + amt + 'background:' + C.navy + ';color:#ffffff;font-weight:bold;font-size:18px;">' + inline(g.totalText) + '/mo</td></tr>' +
        '</table>';
      out.push(tbl);
    }

    if (m.today.length) {
      out.push(headingHtml('Where You Are Today'));
      m.today.forEach(function (t) { out.push('<p ' + P + '>' + inline(t) + '</p>'); });
    }

    if (m.compare) {
      var head = FONT + 'padding:10px 16px;background:' + C.soft + ';font-weight:bold;border-top:1px solid ' + C.line + ';';
      var ct = tableOpen('14px 0 6px') + titleRow('What You Have Now vs. What We Recommend', 3) +
        '<tr><td style="' + head + '"></td><td style="' + head + '">You have now</td><td style="' + head + 'color:' + C.whyLine + ';">We recommend</td></tr>' +
        m.compare.rows.map(function (r) {
          return '<tr><td style="' + cell + 'font-weight:bold;width:28%;">' + inline(r[0]) + '</td>' +
            '<td style="' + cell + '">' + inline(r[1]) + '</td>' +
            '<td style="' + cell + 'font-weight:bold;">' + inline(r[2]) + '</td></tr>';
        }).join('') + '</table>';
      out.push(ct);
      out.push('<p style="' + FONT + 'margin:0 0 14px;font-size:13px;color:' + C.muted + ';">' + inline(m.compare.note) + '</p>');
    }

    m.sections.forEach(function (s, i) {
      if (s.preface) out.push('<p style="' + FONT + 'margin:30px 0 0;font-size:17px;font-weight:bold;color:' + C.navy + ';">' + inline(s.preface) + '</p>');
      if (s.whyNow) {
        out.push('<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:12px 0 0;"><tr>' +
          '<td style="' + FONT + 'background:' + C.whyBg + ';border-left:4px solid ' + C.whyLine + ';padding:10px 14px;">' +
          '<strong style="color:' + C.whyLine + ';">Why now:</strong> ' + inline(s.whyNow) +
          '</td></tr></table>');
      }
      out.push(headingHtml(s.title, i + 1, s.price));
      if (s.subtitle) out.push('<p style="' + FONT + 'margin:0 0 6px;color:' + C.muted + ';font-weight:bold;">' + inline(s.subtitle) + '</p>');
      if (s.lead) out.push('<p style="' + FONT + 'margin:0 0 6px;font-size:17px;">' + inline(s.lead) + '</p>');
      out.push('<ul style="' + FONT + 'margin:6px 0 10px;padding-left:22px;">' + s.bullets.map(bulletHtml).join('') + '</ul>');
      if (s.why) {
        out.push('<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:4px 0 10px;"><tr>' +
          '<td style="' + FONT + 'background:' + C.whyBg + ';border-left:4px solid ' + C.whyLine + ';padding:10px 14px;">' +
          '<strong style="color:' + C.whyLine + ';">Why this fits you:</strong> ' + inline(s.why) +
          '</td></tr></table>');
      }
    });

    if (m.disclaimer) {
      out.push('<p style="' + FONT + 'margin:24px 0 0;font-size:12px;line-height:1.45;color:' + C.muted + ';">' + inline(m.disclaimer) + '</p>');
    }
    out.push('<p style="' + FONT + 'margin:28px 0 14px;">' + inline(m.closing) + '</p>');
    out.push('<p ' + P + '>Best regards,</p>');
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
      g.rows.forEach(function (r) {
        out.push('- ' + plain(r.label) + ': ' + plain(r.text) + '/mo' + (r.detail ? ' (' + plain(r.detail) + ')' : ''));
      });
      out.push('Total monthly cost: ' + plain(g.totalText) + '/mo');
      out.push('');
    }
    if (m.today.length) {
      out.push('WHERE YOU ARE TODAY');
      m.today.forEach(function (t) { out.push(plain(t)); });
      out.push('');
    }
    if (m.compare) {
      out.push('WHAT YOU HAVE NOW VS. WHAT WE RECOMMEND');
      m.compare.rows.forEach(function (r) {
        out.push('- ' + plain(r[0]) + ': now ' + plain(r[1]) + ' | recommended ' + plain(r[2]));
      });
      out.push(plain(m.compare.note), '');
    }
    m.sections.forEach(function (s, i) {
      if (s.preface) out.push(plain(s.preface), '');
      if (s.whyNow) out.push('Why now: ' + plain(s.whyNow), '');
      out.push((i + 1) + '. ' + plain(s.title).toUpperCase() + (s.price ? ' (' + plain(s.price) + '/mo)' : ''));
      if (s.subtitle) out.push(plain(s.subtitle));
      if (s.lead) out.push(plain(s.lead));
      s.bullets.forEach(function (b) { out.push(bulletText(b)); });
      if (s.why) out.push('Why this fits you: ' + plain(s.why));
      out.push('');
    });
    if (m.disclaimer) out.push(plain(m.disclaimer), '');
    out.push(plain(m.closing), '', 'Best regards,');
    return out.join('\n');
  }

  var api = { buildEmail: buildEmail, _num: num, _money: money };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RecapEmail = api;
})(this);
