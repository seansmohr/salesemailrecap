/*
 * Recap Email Generator — settings.
 *
 * This is the one file to update each year (Part B premium, deductible) and
 * where the situation wording lives. Plain text only; {tokens} are filled in
 * with the numbers the agent entered.
 */
(function (root) {
  var RECAP_CONFIG = {
    year: 2026,

    // Medicare figures
    partBPremium: 202.9,
    partBDeductible: 283,

    // Recovery Care / Skilled Nursing policy structure
    recoveryCare: { startDay: 101, consecutiveDays: 360, lifetimeDays: 720 },

    // Hospital Indemnity SNF rider days (Medicare's SNF copay days)
    hospitalSnf: { startDay: 21, endDay: 100 },

    // Official page for Form CMS-L564 (used in the "staying on employer" email)
    cmsL564Url: 'https://www.cms.gov/cms-l564-request-employment-information',

    // Required TPMO disclaimer (shown on Medicare Advantage and Med Supp emails).
    // Fill in the counts below — the page warns the agent until you do.
    // Have your FMO / compliance contact confirm the final wording.
    disclaimer: {
      organizations: '',
      plans: '',
      text:
        'We do not offer every plan available in your area. Currently we represent ' +
        '{organizations} organizations which offer {plans} products in your area. ' +
        'Please contact Medicare.gov, 1-800-MEDICARE, or your local State Health ' +
        'Insurance Program (SHIP) to get information on all of your options.'
    },

    // The four prospect situations.
    //  today: the "Where You Are Today" paragraph
    //  why:   situation-specific "Why this fits you" lines, by product
    //         (products: mapd, medsupp, critical, recovery, home, hospital, dvh)
    situations: {
      t65: {
        label: 'Turning 65',
        today: "You're turning 65 and getting set up with Medicare for the first time. Our goal is to get you the right coverage from day one and close the gaps Medicare leaves open.",
        why: {
          medsupp: "You're in your Medigap Open Enrollment window: for 6 months after your Part B starts, you can't be turned down or charged more because of your health."
        }
      },
      leavingEmployer: {
        label: 'Leaving employer coverage',
        today: "You're coming off your employer coverage and moving onto Medicare. Our goal is to make sure the switch doesn't leave you with gaps or surprise costs your employer plan used to handle.",
        why: {
          medsupp: "You're in your Medigap Open Enrollment window: for 6 months after your Part B starts, you can't be turned down or charged more because of your health.",
          dvh: 'Your employer plan likely included dental and vision. This keeps that coverage going, with up to {dvhMax} a year.'
        }
      },
      stayingEmployer: {
        label: 'Staying on employer coverage',
        today: "You're staying on your employer coverage for now and delaying Medicare. That makes sense while you're still working, and there's one simple step to take when that coverage ends (see section 1).",
        why: {
          critical: 'Your employer plan covers your medical bills, but if a critical illness kept you from working, God forbid, your paycheck would stop. This puts {ciCash} in your hands to replace lost income and keep the bills paid.'
        }
      },
      onMedicare: {
        label: 'Already on Medicare',
        today: "You're already on Medicare and want to make sure you have the best coverage for your money. Below is how what you have now compares with what we recommend.",
        why: {
          medsupp: 'Compared with what you have now, this gives you the freedom to see any doctor in the U.S. who accepts Medicare, with no networks or referrals.',
          mapd: 'Compared with what you have now, this plan gives you better value for the way you use your coverage.'
        }
      }
    },

    // Default "Why this fits you" lines, used for every situation.
    defaultWhy: {
      mapd: 'One plan for your doctors, hospital stays and prescriptions, with a {mapdPremium} monthly premium and a yearly cap on what you pay.',
      medsupp: 'Predictable costs: after the {partBDeductible} Part B deductible, {medsuppCoverage}.',
      critical: 'Your health plan only pays what it approves. This puts {ciCash} in your hands for everything else that comes with a diagnosis.',
      recovery: "Medicare won't approve assisted living or skilled nursing after Day 100. This pays {recoveryDaily} a day, up to {recoveryMax}, so those costs don't come out of your savings.",
      home: "Medicare approves only limited care at home. This pays {homeDaily} a day so you can recover in your own home without worrying about what isn't approved.",
      hospital: "A hospital stay leaves you with costs your health plan won't pay. This pays {hospitalDaily} for every day you're admitted to cover them.",
      dvh: "Medicare doesn't approve routine dental, vision or hearing care. This gives you up to {dvhMax} a year toward those costs, with no deductible."
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RECAP_CONFIG;
  else root.RECAP_CONFIG = RECAP_CONFIG;
})(this);
