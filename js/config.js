/*
 * Recap Email Generator — settings.
 *
 * This is the one file to update each year (Part B premium, deductible) and
 * where the situation / concern wording lives. Plain text only; {tokens} in
 * the "ties" sentences are filled in with the numbers the agent entered.
 */
(function (root) {
  var RECAP_CONFIG = {
    year: 2026,

    // Medicare figures
    partBPremium: 202.9,
    partBDeductible: 283,

    // Recovery Care / Skilled Nursing policy structure
    recoveryCare: { startDay: 101, consecutiveDays: 360, lifetimeDays: 720 },

    // Hospital Indemnity SNF rider defaults (Medicare's SNF copay days)
    hospitalSnf: { startDay: 21, endDay: 100 },

    // Required TPMO disclaimer (shown on MAPD and Med Supp emails).
    // Fill in the counts below — the page warns the agent until you do.
    // Have your FMO / compliance contact confirm the final wording.
    disclaimer: {
      organizations: '',
      plans: '',
      showFor: ['mapd', 'medsupp'],
      text:
        'We do not offer every plan available in your area. Currently we represent ' +
        '{organizations} organizations which offer {plans} products in your area. ' +
        'Please contact Medicare.gov, 1-800-MEDICARE, or your local State Health ' +
        'Insurance Program (SHIP) to get information on all of your options.'
    },

    // "Where they are now" — one sentence each, written to the prospect.
    situations: [
      { key: 'turning65', label: 'Turning 65',
        today: "You're turning 65 and getting set up with Medicare for the first time." },
      { key: 'leavingEmployer', label: 'Leaving employer coverage',
        today: "You're coming off your employer coverage and moving onto Medicare." },
      { key: 'originalOnly', label: 'On Original Medicare only',
        today: 'Right now you have Original Medicare (Parts A & B) only, which leaves you responsible for 20% of your medical costs with no yearly cap.' },
      { key: 'hasMA', label: 'Has a Medicare Advantage plan',
        today: 'You currently have a Medicare Advantage plan.' },
      { key: 'hasMedSupp', label: 'Has a Medicare Supplement',
        today: 'You currently have a Medicare Supplement plan.' },
      { key: 'other', label: 'Other (use the notes box)', today: '' }
    ],

    // Concerns. "today" appears under "Where You Are Today"; "ties" appear in
    // the matching product's "Why this fits you" box.
    // Product keys: mapd, medsupp, cancer, heart, recovery, home, hospital, dvh
    concerns: [
      { key: 'cancer', label: 'Family or personal history of cancer',
        today: 'Cancer has touched your family, and you want to be prepared if it ever touches you.',
        ties: {
          cancer: 'With cancer in your family history, this puts {cancerBenefit} cash in your hands the day you are diagnosed.'
        } },
      { key: 'heart', label: 'Heart disease or stroke history',
        today: 'Heart disease or stroke is part of your family or personal health history.',
        ties: {
          heart: 'With heart disease or stroke in your history, this pays {heartBenefit} directly to you upon diagnosis, so recovery does not become a financial setback.'
        } },
      { key: 'nursing', label: 'Worried about nursing home / long-term care costs',
        today: 'You are concerned about what a nursing home or assisted living stay could cost.',
        ties: {
          recovery: 'You mentioned worrying about nursing home costs. This pays {recoveryDaily} a day once Medicare stops paying, up to {recoveryMax} in total.'
        } },
      { key: 'home', label: 'Would rather recover at home than in a facility',
        today: "If you ever need care, you'd much rather recover at home than in a facility.",
        ties: {
          home: "You told me you'd rather recover at home. This pays {homeDaily} a day toward care in your own home, so you have that choice."
        } },
      { key: 'savings', label: 'Wants to protect savings / leave money to family',
        today: 'You want to protect your savings and what you plan to leave your family.',
        ties: {
          cancer: 'The cash benefit covers the costs of a diagnosis, so your savings stay untouched.',
          heart: 'The cash benefit covers the costs of recovery, so your savings stay untouched.',
          recovery: 'Extended care is one of the fastest ways retirement savings disappear. This keeps that cost off your nest egg.',
          home: 'Paying for in-home care out of pocket adds up fast. This keeps that cost away from your savings.'
        } },
      { key: 'budget', label: 'On a fixed income / budget',
        today: "You're on a fixed income, so keeping your monthly costs manageable matters.",
        ties: {
          mapd: 'With a {mapdPremium} monthly plan premium, this keeps your costs manageable on a fixed income.',
          hospital: "A hospital stay won't turn into a surprise bill that strains your monthly budget."
        } },
      { key: 'doctors', label: 'Wants to keep current doctors',
        today: 'Keeping your current doctors is important to you.',
        ties: {
          medsupp: 'You can keep seeing any doctor in the country who accepts Medicare. No networks, no referrals.',
          mapd: 'We reviewed this plan with your current doctors in mind.'
        } },
      { key: 'rx', label: 'Takes regular prescriptions',
        today: 'You take regular prescriptions and want them covered affordably.',
        ties: {
          mapd: 'Your prescription drug coverage is built right into this plan.',
          medsupp: "Medicare Supplements don't cover prescriptions, so this is paired with a Part D drug plan for your medications."
        } },
      { key: 'dvh', label: 'Needs dental work, glasses or hearing aids',
        today: 'You have dental, vision or hearing needs coming up.',
        ties: {
          dvh: 'With the dental, vision or hearing needs you mentioned, this gives you up to {dvhMax} a year toward care, with no deductible.',
          mapd: 'Dental, vision and hearing benefits are included in this plan.'
        } },
      { key: 'travel', label: 'Travels / spends time out of state',
        today: 'You travel or spend time out of state.',
        ties: {
          medsupp: 'Your coverage goes with you: any doctor in the U.S. who accepts Medicare, with no network to worry about.'
        } },
      { key: 'hospitalStay', label: 'Recent or upcoming hospital stay / surgery',
        today: 'You have a recent or upcoming hospital stay or surgery on your mind.',
        ties: {
          hospital: 'With a hospital stay on your mind, this pays {hospitalDaily} for every day you are admitted.',
          medsupp: 'Your Medicare-approved hospital and surgery costs are covered after the {partBDeductible} Part B deductible.',
          home: 'After a hospital stay or surgery, this helps you recover in your own home.'
        } },
      { key: 'predictable', label: 'Wants predictable costs / no surprise bills',
        today: 'You want predictable costs and no surprise medical bills.',
        ties: {
          medsupp: 'Your costs are predictable: your monthly premium plus the {partBDeductible} yearly Part B deductible{medsuppCopays}.',
          hospital: 'The cash it pays for hospital days helps cover the copays that come with a stay.'
        } }
    ]
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RECAP_CONFIG;
  else root.RECAP_CONFIG = RECAP_CONFIG;
})(this);
