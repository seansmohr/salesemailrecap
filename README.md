# Recap Email Generator

A one-page tool that turns a sales call into a clean, scannable recap email.
The agent enters the prospect's name, their current situation, and the plans
pitched with benefit amounts. Out comes an email that ties each product back to
what the prospect said matters to them. Copy it into Gmail or Outlook, send it,
and walk through it line by line with the prospect on the phone.

## How to use it

1. Open `index.html` in a browser (double-click it, or host the folder on GitHub Pages).
2. Fill in **Your info** once. It's remembered on that computer.
3. Enter the **prospect's first name**, **where they are now**, what they
   **care about**, and anything **in their words**.
4. Pick the **main coverage**: Medicare Advantage, Medicare Supplement, or Ancillary.
5. Tick any **ancillary products** and enter the benefit amounts and premiums:
   Cancer, Heart Attack & Stroke, Recovery Care, Home Healthcare,
   Hospital Indemnity (with Skilled Nursing rider), Dental/Vision/Hearing.
6. Check the yellow warnings, then click **Copy Email** and paste it into a new
   message. **Copy Subject** copies the subject line.
7. Click **New Prospect** to clear the form (your agent info stays).

The form autosaves on the device, so a page refresh mid-call won't lose anything.

## Email combinations

| Main coverage | Ancillary ticked | Email |
|---|---|---|
| Medicare Advantage | none / some | Parts A & B → MAPD → ancillary sections |
| Medicare Supplement | none / some | Parts A & B → Med Supp → Part D → ancillary sections |
| Ancillary | at least one | Ancillary sections only (no Part B, no Medicare disclaimer) |

Every email has: greeting, **Your Coverage at a Glance** (premiums + totals),
**Where You Are Today**, numbered product sections with a **Why this fits you**
box, a closing, and your signature.

## Updating figures and wording

Everything an admin is likely to change lives in **`js/config.js`**:

- `partBPremium`, `partBDeductible`: update each year
- `recoveryCare`: benefit start day and consecutive/lifetime days
- `hospitalSnf`: default SNF rider days (21–100)
- `disclaimer`: **fill in `organizations` and `plans`** (the page warns until you do);
  have your compliance contact confirm the wording
- `situations`: the "Where they are now" options and the sentence each one writes
- `concerns`: the checkboxes, the sentence written under "Where You Are Today",
  and the "Why this fits you" sentence for each product (`ties`)

Product wording (bullets, section intros) lives in `js/email.js`.

## Development

No build step and no dependencies. Tests use Node's built-in runner:

```
npm test
```
