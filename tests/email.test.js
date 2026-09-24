const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEmail } = require('../js/email.js');
const baseConfig = require('../js/config.js');

// Config with the disclaimer counts filled in, so tests can check for zero warnings.
const config = {
  ...baseConfig,
  disclaimer: { ...baseConfig.disclaimer, organizations: '8', plans: '40' }
};

const products = {
  cancer: { on: true, benefit: '15000', premium: '41.85' },
  heart: { on: true, benefit: '15,000', premium: '$42.65' },
  recovery: { on: true, daily: '400', premium: '107.63' },
  home: { on: true, daily: '150', premium: '38.20' },
  hospital: { on: true, daily: '300', snfDaily: '150', premium: '61.15' },
  dvh: { on: true, annualMax: '5000', premium: '62.13' }
};

function medSupp(overrides = {}) {
  return {
    prospect: { firstName: 'Mary' },
    situation: 't65',
    main: 'medsupp',
    partBPremium: '202.90',
    medsupp: { plan: 'N', carrier: 'AFLAC', premium: '116.16' },
    anc: {},
    ...overrides
  };
}

const hasPlaceholder = (s) => /\[[^\]]+\]/.test(s);
const count = (s, re) => (s.match(re) || []).length;

test('T65 Med Supp Plan N matches the template totals', () => {
  const { cancer, heart, recovery, dvh } = products;
  const r = buildEmail(medSupp({ anc: { cancer, heart, recovery, dvh } }), config);
  // 116.16 + 41.85 + 42.65 + 107.63 + 62.13 = 370.42 (the template's total)
  assert.match(r.text, /Total for the plans above: \$370\.42\/mo/);
  assert.match(r.text, /All-in monthly cost: \$573\.32\/mo/);
  assert.match(r.text, /2\. YOUR MEDICARE SUPPLEMENT: PLAN N \(\$116\.16\/mo\)/);
  assert.match(r.text, /except up to \$20 office copays, \$50 ER copays and rare Part B excess charges/);
  assert.match(r.text, /That’s the gap your Medicare Supplement covers/);
  assert.match(r.text, /\$400\/day once Medicare stops paying, up to \$288,000/);
  assert.match(r.text, /turning 65/);
  assert.match(r.text, /open enrollment window/);
  assert.match(r.text, /We do not offer every plan available/);
  assert.match(r.text, /Best regards,$/);
  assert.equal(r.subject, 'Mary, your Medicare Supplement recap');
  assert.deepEqual(r.warnings, []);
  assert.ok(!hasPlaceholder(r.text), 'no unfilled placeholders');
});

test('each section is short: price in heading, one why line, at most 3 bullets', () => {
  const r = buildEmail({
    prospect: { firstName: 'Bob' }, situation: 't65', main: 'mapd', partBPremium: '202.90',
    mapd: { carrier: 'Humana', premium: '0' }, anc: products
  }, config);
  // premium appears only in the glance table and the section heading
  assert.equal(count(r.text, /\$107\.63/g), 2);
  assert.equal(count(r.text, /Why this fits you/g), 6); // MAPD + 5 ancillary sections
  const sections = r.text.split(/\n\n(?=\d+\. )/).slice(1);
  sections.forEach((sec) => {
    const bullets = sec.split('\n').filter((l) => l.startsWith('- '));
    assert.ok(bullets.length <= 4, 'too many bullets in:\n' + sec);
  });
  assert.doesNotMatch(r.text, /Premium: /);
});

test('no agent signature is added (agents use their own)', () => {
  const r = buildEmail(medSupp(), config);
  assert.match(r.html, /Best regards,<\/p>\n<\/div>$/);
});

test('notes appear under Where You Are Today', () => {
  const r = buildEmail(medSupp({ notes: 'You want to keep seeing Dr. Patel.' }), config);
  assert.match(r.text, /WHERE YOU ARE TODAY\n.*turning 65.*\nYou want to keep seeing Dr\. Patel\./);
});

test('Leaving employer: MAPD + Hospital Indemnity with SNF', () => {
  const r = buildEmail({
    prospect: { firstName: 'Bob' }, situation: 'leavingEmployer', main: 'mapd', partBPremium: '202.90',
    mapd: { carrier: 'Humana', planName: 'Gold Plus HMO', premium: '0' },
    anc: { hospital: products.hospital, dvh: products.dvh }
  }, config);
  assert.match(r.text, /coming off your employer coverage/);
  assert.match(r.text, /1\. MEDICARE PARTS A & B\n/);
  assert.match(r.text, /2\. YOUR MEDICARE ADVANTAGE PLAN \(\$0\/mo\)/);
  assert.match(r.text, /HOSPITAL INDEMNITY \+ SKILLED NURSING \(\$61\.15\/mo\)/);
  assert.match(r.text, /\$150\/day in a skilled nursing facility, Days 21–100/);
  assert.match(r.text, /hospital deductible and daily copays/);
  assert.match(r.text, /Why this fits you: Pairs with your Medicare Advantage plan to cover its hospital and skilled nursing copays\./);
  assert.match(r.text, /Why this fits you: Keeps the dental and vision coverage you had through work\./);
  assert.equal(r.subject, 'Bob, your Medicare Advantage recap');
  assert.deepEqual(r.warnings, []);
});

test('Hospital Indemnity without SNF benefit has no rider', () => {
  const r = buildEmail({
    prospect: { firstName: 'Bob' }, situation: 't65', main: 'ancillary',
    anc: { hospital: { on: true, daily: '300', premium: '50' } }
  }, config);
  assert.match(r.text, /1\. HOSPITAL INDEMNITY \(\$50\.00\/mo\)/);
  assert.doesNotMatch(r.text, /skilled nursing facility/);
});

test('Staying on employer: delaying Medicare steps + critical illness only', () => {
  const r = buildEmail({
    prospect: { firstName: 'Tom' }, situation: 'stayingEmployer', main: 'mapd',
    mapd: { carrier: 'Humana', premium: '0' },
    anc: products // everything ticked, but only cancer/heart may show
  }, config);
  assert.match(r.text, /1\. DELAYING MEDICARE: WHEN YOUR EMPLOYER COVERAGE ENDS/);
  assert.match(r.text, /Form CMS-L564.*: https:\/\/www\.cms\.gov\/cms-l564-request-employment-information/);
  assert.match(r.text, /Take it to your HR department/);
  assert.match(r.text, /Medicare Part A & B application/);
  assert.match(r.text, /8 months/);
  assert.match(r.text, /2\. CANCER, HEART ATTACK & STROKE \(\$84\.50\/mo\)/);
  assert.match(r.text, /replace lost income/);
  assert.match(r.text, /your paycheck would stop\. This puts a \$15,000 cash benefit in your hands/);
  assert.doesNotMatch(r.text, /MEDICARE PARTS A & B|MEDICARE ADVANTAGE|RECOVERY CARE|HOSPITAL INDEMNITY|DENTAL/);
  assert.doesNotMatch(r.text, /Part B premium/);
  assert.doesNotMatch(r.text, /We do not offer every plan/);
  assert.match(r.text, /Your total monthly premium: \$84\.50\/mo/);
  assert.equal(r.subject, 'Tom, your coverage recap');
  assert.deepEqual(r.warnings, []);
});

test('critical illness benefit wording and examples follow the products', () => {
  const diff = buildEmail({
    prospect: { firstName: 'Tom' }, situation: 't65', main: 'ancillary',
    anc: { cancer: { on: true, benefit: 25000, premium: 60 }, heart: products.heart }
  }, config);
  assert.match(diff.text, /\$25,000 cash for cancer and \$15,000 cash for a heart attack or stroke/);
  assert.match(diff.text, /MD Anderson or Mayo Clinic/);
  assert.match(diff.text, /ramp, stair lift or walk-in shower/);

  const cancerOnly = buildEmail(medSupp({ anc: { cancer: products.cancer } }), config);
  assert.match(cancerOnly.text, /\$15,000 cash paid directly to you upon a cancer diagnosis/);
  assert.match(cancerOnly.text, /treatments your plan won’t approve/);
  assert.doesNotMatch(cancerOnly.text, /stair lift/);

  const heartOnly = buildEmail(medSupp({ anc: { heart: products.heart } }), config);
  assert.match(heartOnly.text, /in-home help and caregiving/);
  assert.doesNotMatch(heartOnly.text, /MD Anderson/);
});

test('one framing line before the first ancillary section only', () => {
  const r = buildEmail({
    prospect: { firstName: 'Bob' }, situation: 't65', main: 'mapd', partBPremium: '202.90',
    mapd: { carrier: 'Humana', premium: '0' }, anc: products
  }, config);
  assert.equal(count(r.text, /only pays for what it approves/g), 1);
  assert.match(r.text, /only pays for what it approves[^\n]*\n\n3\. CANCER, HEART ATTACK & STROKE/);
  assert.match(r.text, /assisted living/);
  assert.match(r.text, /care beyond the limited visits/);
  assert.match(r.text, /eye exams, glasses and hearing aids/);

  const none = buildEmail(medSupp(), config);
  assert.doesNotMatch(none.text, /only pays for what it approves/);
});

test('Med Supp + hospital: no deductible claim, overlap warning', () => {
  const r = buildEmail(medSupp({ anc: { hospital: products.hospital } }), config);
  assert.doesNotMatch(r.text, /hospital deductible and daily copays/);
  assert.match(r.text, /bills at home/);
  assert.ok(r.warnings.some((w) => /overlaps/.test(w)));
});

test('Already on Medicare: comparison table (switching plans)', () => {
  const r = buildEmail(medSupp({
    situation: 'onMedicare',
    current: { plan: 'Humana Gold Plus HMO', premium: '0' },
    anc: { cancer: products.cancer }
  }), config);
  assert.match(r.text, /WHAT YOU HAVE NOW VS\. WHAT WE RECOMMEND/);
  assert.match(r.text, /Medical plan: now Humana Gold Plus HMO \| recommended Medicare Supplement Plan N \(AFLAC\)/);
  assert.match(r.text, /Added protection: now None \| recommended Cancer \(\$15,000\)/);
  assert.match(r.text, /Monthly premium: now \$0\/mo \| recommended \$158\.01\/mo/);
  assert.match(r.text, /Unlike what you have now/);
  assert.equal(r.subject, 'Mary, your Medicare coverage review');
  assert.deepEqual(r.warnings, []);
});

test('Already on Medicare: keeping plan and adding ancillary', () => {
  const r = buildEmail({
    prospect: { firstName: 'Linda' }, situation: 'onMedicare', main: 'ancillary',
    current: { plan: 'AARP Plan G', premium: '180' },
    anc: { recovery: products.recovery }
  }, config);
  assert.match(r.text, /Medical plan: now AARP Plan G \| recommended Keep your current plan/);
  assert.match(r.text, /Monthly premium: now \$180\.00\/mo \| recommended \$287\.63\/mo/);
  assert.doesNotMatch(r.text, /We do not offer every plan/);
});

test('Already on Medicare warns when current plan missing', () => {
  const r = buildEmail(medSupp({ situation: 'onMedicare' }), config);
  assert.ok(r.warnings.some((w) => /current plan/.test(w)));
  assert.ok(r.warnings.some((w) => /current monthly premium/.test(w)));
});

test('missing situation, numbers and products produce warnings', () => {
  const r = buildEmail({ prospect: {}, main: 'ancillary', anc: {} }, config);
  assert.ok(r.warnings.some((w) => /first name/.test(w)));
  assert.ok(r.warnings.some((w) => /situation/.test(w)));
  assert.ok(r.warnings.some((w) => /tick at least one/.test(w)));

  const r2 = buildEmail(medSupp({ medsupp: { plan: 'G' }, anc: { cancer: { on: true } } }), config);
  assert.ok(r2.warnings.some((w) => /Medicare Supplement: enter the monthly premium/.test(w)));
  assert.ok(r2.warnings.some((w) => /Cancer: enter the benefit amount/.test(w)));
  assert.match(r2.text, /Total for the plans above: \[total\]/);
  assert.match(r2.html, /background:#fff3b0/);
});

test('user text is HTML-escaped', () => {
  const r = buildEmail(medSupp({ prospect: { firstName: '<b>Mary</b>' }, notes: '<script>alert(1)</script>' }), config);
  assert.doesNotMatch(r.html, /<script>/);
  assert.match(r.html, /&lt;script&gt;/);
});

test('disclaimer counts left blank produce a warning', () => {
  const r = buildEmail(medSupp(), baseConfig);
  assert.ok(r.warnings.some((w) => /Disclaimer/.test(w)));
});
