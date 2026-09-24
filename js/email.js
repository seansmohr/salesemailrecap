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

  var SITUATIONS = ['t65', 'leavingEmployer', 'stayingEmployer', 'onMedicare'];
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

    // Staying on employer coverage: cancer / heart attack & stroke only.
    var main = staying ? 'none'
      : (['mapd', 'medsupp', 'ancillary'].indexOf(d.main) >= 0 ? d.main : 'ancillary');
    var on = {};
    PRODUCTS.forEach(function (k) {
      on[k] = !!(anc[k] && anc[k].on) && (!staying || k === 'cancer' || k === 'heart');
    });
    var anyAnc = PRODUCTS.some(function (k) { return on[k]; });
    if ((main === 'ancillary' || staying) && !anyAnc) {
      warnings.push(staying
        ? 'Tick Cancer and/or Heart Attack & Stroke.'
        : 'Ancillary: tick at least one product.');
    }

    var deductibleText = money(cfg.partBDeductible);
    var tokens = { partBDeductible: deductibleText };
    var glance = [];      // { label, amount (number|null), text }
    var sections = [];    // numbered sections
    var mainLabel = '';

    // Up to two "Why this fits you" lines: situation-specific, then default.
    function whyFor(key, extra) {
      var lines = [];
      if (sit.why && sit.why[key]) lines.push(fill(sit.why[key], tokens));
      if (!staying && cfg.defaultWhy[key]) lines.push(fill(cfg.defaultWhy[key], tokens));
      (extra || []).forEach(function (l) { lines.push(l); });
      return lines.slice(0, 3);
    }

    // Every ancillary product lists costs health insurance won't approve.
    function notApproved(items, lead) {
      return {
        text: lead || 'Covers the **costs health insurance won’t approve**, such as:',
        sub: items
      };
    }
    var ANC_PREFACE = 'Your health insurance only pays for what it approves. The coverage below is built for everything it won’t, so a diagnosis, hospital stay or recovery doesn’t come out of your savings.';
    function pushAncillary(section) {
      var isFirst = !sections.some(function (x) { return x.ancillary; });
      section.ancillary = true;
      if (isFirst) section.preface = ANC_PREFACE;
      sections.push(section);
    }

    // ----- Delaying Medicare (staying on employer coverage) -----
    if (staying) {
      sections.push({
        title: 'Delaying Medicare: What to Do When Your Employer Coverage Ends',
        intro: 'Because you have creditable coverage through your employer, you can delay Medicare Part B without a penalty. When your employer coverage is ending, here’s what to do:',
        bullets: [
          { link: cfg.cmsL564Url, text: 'Get Form CMS-L564 (Request for Employment Information)' },
          '**Take it to your HR department.** They’ll help you fill it out; it confirms you had employer coverage.',
          '**Submit the completed form along with your Medicare Part A & B application** through Social Security. This protects you from late enrollment penalties.',
          'You have **8 months** after your employer coverage or employment ends to enroll without a penalty. We recommend starting about 2–3 months before your coverage ends, so there’s no gap.',
          'Call me when that time comes and I’ll walk you through it.'
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
          '**Part A (hospital):** premium-free for most people',
          '**Part B (doctors & outpatient care):** covers 80% of Medicare-approved costs',
          '**Your Part B premium: ' + partB.text + '/month**, based on your income from two years ago. It comes directly out of your Social Security check.'
        ],
        after: 'That leaves the other 20% on you, with no yearly limit. We focused on ' +
          (main === 'mapd' ? 'a Medicare Advantage plan' : 'a Medicare Supplement plan') + ' to cover that gap.'
      });
    }

    // ----- Medicare Advantage -----
    if (main === 'mapd') {
      var m = d.mapd || {};
      var mPrem = needPremium(m.premium, 'Medicare Advantage');
      tokens.mapdPremium = mPrem.text;
      var planLabel = [str(m.carrier), str(m.planName)].filter(Boolean).join(' – ');
      if (!planLabel) warnings.push('Medicare Advantage: enter the carrier or plan name.');
      mainLabel = 'Medicare Advantage' + (planLabel ? ' (' + planLabel + ')' : '');
      glance.push({ label: mainLabel, amount: mPrem.n, text: mPrem.text });
      sections.push({
        title: 'Your Medicare Advantage Plan',
        subtitle: planLabel || placeholder('carrier / plan name'),
        bullets: [
          'Replaces Original Medicare as how you receive your benefits. You keep Parts A & B and continue paying your Part B premium.',
          mPrem.n === 0 ? '**$0 monthly plan premium**' : '**Monthly plan premium: ' + mPrem.text + '**',
          'Copays and coinsurance, capped by a yearly maximum out-of-pocket limit',
          'Plan details, including prescription and extra benefits, are in your brochure',
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
      var sb;
      if (letter === 'G') {
        tokens.medsuppCoverage = 'Plan G pays the rest of your Medicare-approved costs';
        sb = [
          'After the ' + deductibleText + ' yearly Part B deductible, Plan G pays the rest of your Medicare-approved costs',
          'No copays for doctor visits, hospital stays or surgeries'
        ];
      } else {
        tokens.medsuppCoverage = 'Plan N covers your Medicare-approved costs aside from small office and ER copays';
        sb = [{
          text: 'After the ' + deductibleText + ' yearly Part B deductible, Plan N covers your Medicare-approved costs, except:',
          sub: [
            'Up to a $20 copay for some office visits',
            'Up to a $50 copay for ER visits (waived if you are admitted)',
            'Part B excess charges (up to 15%) if a doctor bills above Medicare’s rate, which is uncommon'
          ]
        }];
      }
      sb.push('See any doctor in the U.S. who accepts Medicare. No networks, no referrals.');
      sb.push('Benefits are standardized by Medicare, so every carrier’s Plan ' + letter + ' covers the same things. Only the price differs.');
      sb.push("Prescriptions aren't included, so it's paired with a stand-alone Part D drug plan.");
      mainLabel = 'Medicare Supplement Plan ' + letter + (carrier ? ' (' + carrier + ')' : '');
      glance.push({ label: mainLabel, amount: sPrem.n, text: sPrem.text });
      sections.push({
        title: 'Your Medicare Supplement: Plan ' + letter,
        subtitle: carrier || placeholder('carrier'),
        bullets: sb,
        premium: '**Premium: ' + sPrem.text + '/month**',
        why: whyFor('medsupp')
      });
    }

    // ----- Cancer / Heart Attack & Stroke (one combined section) -----
    if (on.cancer || on.heart) {
      var cb = [];
      var ciPrem = [];
      var cBen = null, hBen = null;
      if (on.cancer) {
        cBen = need(anc.cancer.benefit, money, 'benefit', 'Cancer: enter the benefit amount.');
        var cPrem = needPremium(anc.cancer.premium, 'Cancer');
        cb.push('**' + cBen.text + ' Cancer benefit:** ' + cPrem.text + '/month');
        glance.push({ label: 'Cancer (' + cBen.text + ')', amount: cPrem.n, text: cPrem.text });
        ciPrem.push(cPrem);
      }
      if (on.heart) {
        hBen = need(anc.heart.benefit, money, 'benefit', 'Heart Attack & Stroke: enter the benefit amount.');
        var hPrem = needPremium(anc.heart.premium, 'Heart Attack & Stroke');
        cb.push('**' + hBen.text + ' Heart Attack & Stroke benefit:** ' + hPrem.text + '/month');
        glance.push({ label: 'Heart Attack & Stroke (' + hBen.text + ')', amount: hPrem.n, text: hPrem.text });
        ciPrem.push(hPrem);
      }
      if (cBen && hBen && cBen.text !== hBen.text) {
        tokens.ciCash = 'a cash benefit (' + cBen.text + ' for cancer, ' + hBen.text + ' for a heart attack or stroke)';
      } else {
        tokens.ciCash = 'a ' + (cBen || hBen).text + ' cash benefit';
      }
      cb.push('Pays a **lump-sum cash benefit upon diagnosis**, paid directly to you');
      // Costs health insurance won't approve, matched to the products pitched.
      var notCovered = [];
      if (on.cancer) {
        notCovered.push('**Travel and lodging** for treatment at a top cancer center like MD Anderson or Mayo Clinic, often for weeks at a time');
        notCovered.push('**Treatments your plan won’t approve**, such as experimental, clinical-trial or out-of-network care');
      }
      if (on.heart) {
        notCovered.push('**Home changes after a stroke or heart attack**, like a wheelchair ramp, stair lift or walk-in shower, which can run thousands of dollars');
        notCovered.push('**In-home help and caregiving** while you recover, or a family member taking unpaid time off to care for you');
      }
      cb.push(notApproved(notCovered, 'Covers the **costs health insurance won’t approve** that come with a diagnosis, such as:'));
      cb.push(staying
        ? 'Use it however you need: replacing lost income, paying the mortgage and bills, or covering those extra costs'
        : 'Use it however you need, on top of what your health plan pays');
      var total = ciPrem.length > 1 && ciPrem.every(function (x) { return x.n !== null; })
        ? '**Total premium: ' + premiumText(round2(ciPrem[0].n + ciPrem[1].n)) + '/month**'
        : null;
      pushAncillary({
        title: on.cancer && on.heart ? 'Cancer, Heart Attack & Stroke Coverage'
          : on.cancer ? 'Cancer Coverage' : 'Heart Attack & Stroke Coverage',
        intro: staying
          ? 'A critical illness can keep you out of work for months. Your health plan pays the medical bills, but not your mortgage, your utilities or your groceries.'
          : 'Even with great medical coverage, a serious diagnosis brings costs your health plan won’t pay for, and they add up fast.',
        bullets: cb,
        premium: total,
        why: whyFor('critical')
      });
    }

    // ----- Recovery Care -----
    if (on.recovery) {
      var rc = cfg.recoveryCare;
      var rDaily = need(anc.recovery.daily, money, 'daily benefit', 'Recovery Care: enter the daily benefit.');
      var rPrem = needPremium(anc.recovery.premium, 'Recovery Care');
      var rMin = rDaily.n !== null ? money(rDaily.n * rc.consecutiveDays) : placeholder('total');
      var rMax = rDaily.n !== null ? money(rDaily.n * rc.lifetimeDays) : placeholder('total');
      tokens.recoveryDaily = rDaily.text;
      tokens.recoveryMax = rMax;
      glance.push({ label: 'Recovery Care (' + rDaily.text + '/day)', amount: rPrem.n, text: rPrem.text });
      pushAncillary({
        title: 'Recovery Care: Skilled Nursing & Assisted Living',
        intro: 'This coverage picks up where Medicare leaves off, for the long-term care it won’t approve.',
        bullets: [
          '**' + rDaily.text + '/day benefit**',
          'Begins Day ' + rc.startDay + ', after Medicare stops paying',
          'Lasts up to ' + rc.consecutiveDays + ' consecutive days or ' + rc.lifetimeDays + ' lifetime days',
          '**Total coverage: ' + rMin + ' minimum, up to ' + rMax + '**',
          notApproved([
            '**Assisted living**, which Medicare pays nothing toward',
            '**Skilled nursing after Day 100**, when Medicare stops paying',
            '**Help with bathing, dressing and eating** (custodial care)'
          ])
        ],
        premium: '**Premium: ' + rPrem.text + '/month**',
        why: whyFor('recovery')
      });
    }

    // ----- Home Healthcare -----
    if (on.home) {
      var hDaily = need(anc.home.daily, money, 'daily benefit', 'Home Healthcare: enter the daily benefit.');
      var hhPrem = needPremium(anc.home.premium, 'Home Healthcare');
      tokens.homeDaily = hDaily.text;
      glance.push({ label: 'Home Healthcare (' + hDaily.text + '/day)', amount: hhPrem.n, text: hhPrem.text });
      pushAncillary({
        title: 'Home Healthcare: Recover in the Comfort of Your Own Home',
        intro: 'After a hospital stay, surgery or illness, most people heal faster and feel better at home. This coverage pays you a cash benefit for care at home, so you can recover in your own bed, around your family, without worrying about the bill.',
        bullets: [
          '**' + hDaily.text + ' per day of home care**',
          notApproved([
            '**Help with bathing and dressing**, meals and light housekeeping while you recover',
            '**Care beyond the limited, part-time visits** Medicare approves'
          ])
        ],
        premium: '**Premium: ' + hhPrem.text + '/month**',
        why: whyFor('home')
      });
    }

    // ----- Hospital Indemnity (+ SNF rider when a SNF benefit is entered) -----
    if (on.hospital) {
      var hi = anc.hospital;
      var hiDaily = need(hi.daily, money, 'daily benefit', 'Hospital Indemnity: enter the daily hospital benefit.');
      var hiPrem = needPremium(hi.premium, 'Hospital Indemnity');
      tokens.hospitalDaily = hiDaily.text;
      var snfDaily = num(hi.snfDaily);
      var hib = ['**' + hiDaily.text + '/day** for each day you are in the hospital'];
      if (snfDaily !== null) {
        hib.push('**' + money(snfDaily) + '/day in a skilled nursing facility, Days ' + cfg.hospitalSnf.startDay + '–' + cfg.hospitalSnf.endDay + '.** Those are the days Medicare charges you a daily copay.');
        if (main === 'medsupp') {
          warnings.push('Heads up: Medicare Supplement plans G and N already pay the skilled nursing copay for Days 21–100, so the SNF rider overlaps. The email still includes it.');
        }
      }
      var hiCosts = [];
      // Med Supp G/N already pay the hospital deductible and copays.
      if (main !== 'medsupp') hiCosts.push('**Your plan’s hospital deductible and daily copays**');
      hiCosts.push('**Bills at home** that keep coming while you’re in the hospital');
      hiCosts.push('**Family travel and parking** during your stay');
      hib.push(notApproved(hiCosts));
      glance.push({
        label: 'Hospital Indemnity (' + hiDaily.text + '/day)' + (snfDaily !== null ? ' + Skilled Nursing rider' : ''),
        amount: hiPrem.n, text: hiPrem.text
      });
      pushAncillary({
        title: 'Hospital Indemnity' + (snfDaily !== null ? ' with Skilled Nursing Rider' : ''),
        intro: 'Pays you cash when you are admitted to the hospital, for the costs that come with a stay.',
        bullets: hib,
        premium: '**Premium: ' + hiPrem.text + '/month**',
        why: whyFor('hospital', main === 'mapd'
          ? ['This pairs with your Medicare Advantage plan to help cover its hospital' + (snfDaily !== null ? ' and skilled nursing' : '') + ' copays.']
          : [])
      });
    }

    // ----- Dental, Vision & Hearing -----
    if (on.dvh) {
      var dMax = need(anc.dvh.annualMax, money, 'annual max', 'Dental/Vision/Hearing: enter the annual maximum.');
      var dPrem = needPremium(anc.dvh.premium, 'Dental/Vision/Hearing');
      tokens.dvhMax = dMax.text;
      glance.push({ label: 'Dental, Vision & Hearing', amount: dPrem.n, text: dPrem.text });
      pushAncillary({
        title: 'Dental, Vision & Hearing',
        bullets: [
          '**Annual maximum: ' + dMax.text + ' per person**',
          'No deductible',
          'Preventive care covered at 100%',
          notApproved([
            '**Routine dental work**, like cleanings, fillings, crowns and dentures',
            '**Eye exams and glasses**',
            '**Hearing aids**, which Medicare doesn’t cover and which often cost thousands'
          ])
        ],
        premium: '**Premium: ' + dPrem.text + '/month**',
        why: whyFor('dvh')
      });
    }

    // ----- At a glance -----
    var allKnown = glance.every(function (g) { return g.amount !== null; });
    var total = allKnown ? round2(glance.reduce(function (a, g) { return a + g.amount; }, 0)) : null;
    var glanceBlock = glance.length ? {
      rows: glance,
      totalText: total !== null ? premiumText(total) : placeholder('total'),
      partBText: partB ? partB.text : null,
      allInText: partB ? (total !== null && partB.n !== null ? premiumText(round2(total + partB.n)) : placeholder('total')) : null
    } : null;

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
      var money = 'white-space:nowrap;text-align:right;';
      var totalRow = function (label, value, strong) {
        var st = cell + 'background:' + C.soft + ';' + (strong ? 'font-weight:bold;font-size:17px;' : '');
        return '<tr><td style="' + st + '">' + inline(label) + '</td><td align="right" style="' + st + money + '">' + inline(value) + '/mo</td></tr>';
      };
      var tbl = tableOpen('22px 0 8px') + titleRow('Your Coverage at a Glance', 2) +
        g.rows.map(function (r) {
          return '<tr><td style="' + cell + '">' + inline(r.label) + '</td><td align="right" style="' + cell + money + '">' + inline(r.text) + '/mo</td></tr>';
        }).join('') +
        totalRow(g.partBText ? 'Total for the plans above' : 'Your total monthly premium', g.totalText, !g.partBText);
      if (g.partBText) {
        tbl += '<tr><td style="' + cell + 'color:' + C.muted + ';">Part B premium (comes out of your Social Security)</td>' +
          '<td align="right" style="' + cell + money + 'color:' + C.muted + ';">' + inline(g.partBText) + '/mo</td></tr>' +
          totalRow('All-in monthly cost', g.allInText, true);
      }
      out.push(tbl + '</table>');
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
      g.rows.forEach(function (r) { out.push('- ' + plain(r.label) + ': ' + plain(r.text) + '/mo'); });
      out.push((g.partBText ? 'Total for the plans above: ' : 'Your total monthly premium: ') + plain(g.totalText) + '/mo');
      if (g.partBText) {
        out.push('Part B premium (comes out of your Social Security): ' + plain(g.partBText) + '/mo');
        out.push('All-in monthly cost: ' + plain(g.allInText) + '/mo');
      }
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
    if (m.disclaimer) out.push(plain(m.disclaimer), '');
    out.push(plain(m.closing), '', 'Best regards,');
    return out.join('\n');
  }

  var api = { buildEmail: buildEmail, _num: num, _money: money };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RecapEmail = api;
})(this);
