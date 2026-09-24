const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEmail } = require('../js/email.js');
const baseConfig = require('../js/config.js');

// Config with the disclaimer counts filled in, so tests can check for zero warnings.
const config = {
  ...baseConfig,
  disclaimer: { ...baseConfig.disclaimer, organizations: '8', plans: '40' }
};

const agent = { name: 'Conor McCormick', phone: '(555) 123-4567', email: 'conor@example.com' };

const allAncillary = {
  cancer: { on: true, benefit: '15000', premium: '41.85' },
  heart: { on: true, benefit: '15,000', premium: '$42.65' },
  recovery: { on: true, daily: '400', premium: '107.63' },
  home: { on: true, daily: '150', days: '365', premium: '38.20' },
  hospital: { on: true, daily: '300', premium: '61.15', snf: true, snfDaily: '150', snfStart: '21', snfEnd: '100' },
  dvh: { on: true, carrier: 'Aetna through the Careington network', annualMax: '5000', premium: '62.13', link: 'https://example.com/providers' }
};

function medSupp(overrides = {}) {
  return {
    agent,
    prospect: { firstName: 'Mary' },
    situation: { status: 'turning65', concerns: ['cancer', 'nursing', 'doctors'], notes: '' },
    main: 'medsupp',
    partBPremium: '202.90',
    medsupp: { plan: 'N', carrier: 'AFLAC', premium: '116.16', appFee: '20' },
    anc: {},
    ...overrides
  };
}

const hasPlaceholder = (s) => /\[[^\]]+\]/.test(s);

test('Med Supp Plan N matches the template totals', () => {
  const r = buildEmail(medSupp({
    anc: {
      cancer: allAncillary.cancer,
      heart: allAncillary.heart,
      recovery: allAncillary.recovery,
      dvh: allAncillary.dvh
    }
  }), config);
  // 116.16 + 41.85 + 42.65 + 107.63 + 62.13 = 370.42 (the template's total)
  assert.match(r.text, /Total for the plans above: \$370\.42\/mo/);
  assert.match(r.text, /All-in monthly cost: \$573\.32\/mo/);
  assert.match(r.text, /Total coverage: \$144,000 minimum, up to \$288,000/);
  assert.match(r.text, /Up to a \$20 copay for some office visits/);
  assert.match(r.text, /one-time \$20 application fee/);
  assert.match(r.text, /We focused on a Medicare Supplement plan/);
  assert.match(r.text, /PRESCRIPTION DRUG COVERAGE \(PART D\)/);
  assert.match(r.text, /We do not offer every plan available/);
  assert.equal(r.subject, 'Mary, your Medicare Supplement & coverage recap');
  assert.deepEqual(r.warnings, []);
  assert.ok(!hasPlaceholder(r.text), 'no unfilled placeholders');
});

test('situation and concerns are written back and tied to products', () => {
  const r = buildEmail(medSupp({
    situation: { status: 'turning65', concerns: ['cancer', 'nursing'], notes: 'You want to keep seeing Dr. Patel.' },
    anc: { cancer: allAncillary.cancer, recovery: allAncillary.recovery }
  }), config);
  assert.match(r.text, /WHERE YOU ARE TODAY/);
  assert.match(r.text, /turning 65/);
  assert.match(r.text, /You want to keep seeing Dr\. Patel\./);
  assert.match(r.text, /With cancer in your family history, this puts \$15,000 cash in your hands/);
  assert.match(r.text, /This pays \$400 a day once Medicare stops paying, up to \$288,000 in total/);
});

test('MAPD only: Parts A & B + MAPD, no ancillary, disclaimer shown', () => {
  const r = buildEmail({
    agent, prospect: { firstName: 'Bob' },
    situation: { status: 'leavingEmployer', concerns: ['budget', 'rx'] },
    main: 'mapd', partBPremium: '202.90',
    mapd: { carrier: 'Humana', planName: 'Gold Plus HMO', premium: '0', moop: '4900', includesRx: true, includesDvh: true }
  }, config);
  assert.match(r.text, /1\. MEDICARE PARTS A & B/);
  assert.match(r.text, /2\. YOUR MEDICARE ADVANTAGE PLAN/);
  assert.match(r.text, /\$0 monthly plan premium/);
  assert.match(r.text, /continue paying your Part B premium/);
  assert.match(r.text, /Maximum out-of-pocket: \$4,900 per year/);
  assert.match(r.text, /With a \$0 monthly plan premium, this keeps your costs manageable/);
  assert.match(r.text, /Your prescription drug coverage is built right into this plan/);
  assert.match(r.text, /We do not offer every plan available/);
  assert.doesNotMatch(r.text, /CANCER/);
  assert.equal(r.subject, 'Bob, your Medicare Advantage recap');
  assert.deepEqual(r.warnings, []);
});

test('MAPD + Hospital Indemnity ties to the plan copays', () => {
  const r = buildEmail({
    agent, prospect: { firstName: 'Bob' }, main: 'mapd', partBPremium: '202.90',
    mapd: { carrier: 'Humana', premium: '0' },
    anc: { hospital: allAncillary.hospital }
  }, config);
  assert.match(r.text, /HOSPITAL INDEMNITY WITH SKILLED NURSING RIDER/);
  assert.match(r.text, /\$150\/day in a skilled nursing facility, Days 21–100/);
  assert.match(r.text, /pairs with your Medicare Advantage plan to help cover its hospital and skilled nursing copays/);
  assert.doesNotMatch(r.text, /ambulance|outpatient surgical/i);
  assert.match(r.text, /Total for the plans above: \$61\.15\/mo/);
});

test('SNF rider premium is added to the hospital premium', () => {
  const r = buildEmail({
    agent, prospect: { firstName: 'Bob' }, main: 'ancillary',
    anc: { hospital: { ...allAncillary.hospital, snfPremium: '9.50' } }
  }, config);
  assert.match(r.text, /Premium: \$70\.65\/month \(includes \$9\.50 for the skilled nursing rider\)/);
  assert.match(r.text, /Your total monthly premium: \$70\.65\/mo/);
});

test('SNF rider can be turned off', () => {
  const r = buildEmail({
    agent, prospect: { firstName: 'Bob' }, main: 'ancillary',
    anc: { hospital: { on: true, daily: '300', premium: '50', snf: false } }
  }, config);
  assert.match(r.text, /1\. HOSPITAL INDEMNITY\n/);
  assert.doesNotMatch(r.text, /skilled nursing facility/);
});

test('Ancillary only: no Medicare sections, no Part B, no disclaimer', () => {
  const r = buildEmail({
    agent, prospect: { firstName: 'Linda' },
    situation: { status: 'hasMA', concerns: ['home'] },
    main: 'ancillary', partBPremium: '202.90',
    anc: { home: allAncillary.home, cancer: allAncillary.cancer }
  }, config);
  assert.doesNotMatch(r.text, /MEDICARE PARTS A & B/);
  assert.doesNotMatch(r.text, /Part B premium/);
  assert.doesNotMatch(r.text, /We do not offer every plan/);
  assert.match(r.text, /1\. CANCER COVERAGE/);
  assert.match(r.text, /2\. HOME HEALTHCARE: RECOVER IN THE COMFORT OF YOUR OWN HOME/);
  assert.match(r.text, /Up to 365 days \(\$54,750 total\)/);
  assert.match(r.text, /you'd rather recover at home\. This pays \$150 a day/);
  assert.match(r.text, /Your total monthly premium: \$80\.05\/mo/);
  assert.equal(r.subject, 'Linda, your coverage recap');
  assert.deepEqual(r.warnings, []);
});

test('Ancillary with nothing ticked warns', () => {
  const r = buildEmail({ agent, prospect: { firstName: 'Linda' }, main: 'ancillary', anc: {} }, config);
  assert.ok(r.warnings.some((w) => /tick at least one/.test(w)));
});

test('missing numbers become highlighted placeholders and warnings', () => {
  const r = buildEmail(medSupp({ medsupp: { plan: 'G', carrier: '' }, anc: { cancer: { on: true } } }), config);
  assert.ok(r.warnings.some((w) => /Medicare Supplement: enter the monthly premium/.test(w)));
  assert.ok(r.warnings.some((w) => /Medicare Supplement: enter the carrier/.test(w)));
  assert.ok(r.warnings.some((w) => /Cancer: enter the benefit amount/.test(w)));
  assert.match(r.text, /\[premium\]/);
  assert.match(r.text, /Total for the plans above: \[total\]/);
  assert.match(r.html, /background:#fff3b0/);
});

test('Med Supp + SNF rider warns about overlap', () => {
  const r = buildEmail(medSupp({ anc: { hospital: allAncillary.hospital } }), config);
  assert.ok(r.warnings.some((w) => /overlaps/.test(w)));
});

test('Plan G wording and ties', () => {
  const r = buildEmail(medSupp({
    medsupp: { plan: 'G', carrier: 'Mutual of Omaha', premium: '150' },
    situation: { concerns: ['predictable', 'travel'] }
  }), config);
  assert.match(r.text, /Plan G pays the rest of your Medicare-approved costs/);
  assert.match(r.text, /monthly premium plus the \$283 yearly Part B deductible\./);
  assert.match(r.text, /Your coverage goes with you/);
});

test('user text is HTML-escaped', () => {
  const r = buildEmail(medSupp({
    prospect: { firstName: '<b>Mary</b>' },
    situation: { notes: '<script>alert(1)</script>' }
  }), config);
  assert.doesNotMatch(r.html, /<script>/);
  assert.match(r.html, /&lt;script&gt;/);
});

test('disclaimer counts left blank produce a warning', () => {
  const r = buildEmail(medSupp(), baseConfig);
  assert.ok(r.warnings.some((w) => /Disclaimer/.test(w)));
});
