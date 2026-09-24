# Recap Email Generator

A one-page tool that turns a sales call into a clean, scannable recap email.
The agent enters the prospect's name, their current situation, and the plans
pitched with benefit amounts. Out comes an email that ties each product back to
what the prospect said matters to them. Copy it into Gmail or Outlook, send it,
and walk through it line by line with the prospect on the phone.

## How to use it

1. Open the Railway link (see below), or open `index.html` directly in a browser.
2. Enter the **prospect's first name** and pick their **situation**:
   Turning 65, Leaving employer coverage, Staying on employer coverage, Already on Medicare,
   or Too early for Medicare.
3. Optionally add a line **in their words** (it appears in the email).
4. Pick the **main coverage** (Medicare Advantage, Medicare Supplement or Ancillary)
   and tick the **products** pitched, with benefit amounts and premiums.
5. Check the yellow warnings, click **Copy Email**, and paste it into a new message
   above your signature. **Copy Subject** copies the subject line.
6. Click **New Prospect** to clear the form.

The form autosaves on the device, so a page refresh mid-call won't lose anything.
The email ends with "Best regards," so your own email signature follows it.

## What each situation produces

| Situation | Form shows | Email |
|---|---|---|
| Turning 65 | Main coverage + all products | Parts A & B, main plan, products |
| Leaving employer coverage | Main coverage + all products | Same, written for coming off an employer plan |
| Staying on employer coverage | Cancer and Heart Attack & Stroke only | "Delaying Medicare" steps (Form CMS-L564 → HR → submit with the Part A & B application), then critical illness coverage framed around protecting income |
| Already on Medicare | Current plan + premium, main coverage + products | Adds a "What You Have Now vs. What We Recommend" table |
| Too early for Medicare | All ancillary products (no main coverage) | "Getting Ready for Medicare" (enrollment window, Part B penalty), a "Why now" box (qualify while young and healthy, lock in the price), then the products |

Every email has **Your Coverage at a Glance** (premiums and totals), **Where You Are Today**,
and numbered product sections with a **Why this fits you** box. The Medicare disclaimer is
added when a Medicare Advantage or Medicare Supplement plan is included.

## Updating figures and wording

Everything an admin is likely to change lives in **`js/config.js`**:

- `partBPremium`, `partBDeductible`: update each year
- `recoveryCare`: benefit start day and consecutive/lifetime days
- `hospitalSnf`: SNF rider days (21–100)
- `cmsL564Url`: link to Form CMS-L564
- `disclaimer`: **fill in `organizations` and `plans`** (the page warns until you do);
  have your compliance contact confirm the wording
- `situations`: the "Where You Are Today" paragraph and situation-specific
  "Why this fits you" lines
- `defaultWhy`: the standard "Why this fits you" line for each product

Product wording (bullets, section intros) lives in `js/email.js`.

## Deploying on Railway

1. In Railway: **New Project → Deploy from GitHub repo →** `seansmohr/salesemailrecap`, branch `main`.
2. No settings needed: Railway detects Node and runs `npm start` (`server.js`), which serves the page on `$PORT`.
3. Under **Settings → Networking**, click **Generate Domain** to get the link for your agents.
4. Optional: set the healthcheck path to `/health`.

Every push to `main` redeploys automatically. The server has no dependencies and serves only
`index.html`, `css/` and `js/`.

## Development

No build step and no dependencies. Run locally with `npm start` (http://localhost:3000).
Tests use Node's built-in runner:

```
npm test
```
