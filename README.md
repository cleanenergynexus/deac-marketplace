# DEAC Marketplace

Private, curated marketplace for data center opportunities (lease, financing, sale), with investor and developer CRMs, LOI-gated data rooms, outreach, and a valuation calculator ported from `Interactive_Powered_Asset_Bid_Calculator_DEAC_v2.xlsx`.

## Run locally

```bash
npm install
cp .env.example .env
npx prisma db push
npm run db:seed     # demo data
npm run dev         # http://localhost:3000
npm test            # calculator matches the Excel workbook
```

Demo logins (password `deac-demo-2026`): `admin@deacna.com`, `investor@deacna.com` (approved), `applicant@deacna.com` (pending).

## How it works

| Who | What they can do |
| --- | --- |
| Public | Landing page, apply for investor membership, developers submit projects, teaser grid at `/embed/listings` (MW, type, state, funding only) |
| Pending investor | Sees "application received" only |
| Approved investor | Listing tiles + filters, full project pages (sponsor, team bios, economics, status, summary docs), submit LOI, submit analysis intake, portal |
| Investor with approved LOI | That project's data room |
| DEAC admin | Dashboard, investor CRM (stages, activity log, CSV import, matching listings), developer CRM (board + table, team bios), listings + documents, lead scoring, LOI approval, intake requests, outreach campaigns |

Listing visibility: `DRAFT` (team only) → `PRIVATE` (approved members) → `TEASER` (also shown, anonymized, on the public embed).

## Valuation calculator

`lib/valuation.ts` mirrors the workbook formula by formula (cell refs in comments). `lib/valuation.test.ts` checks it against the workbook's saved results. Two quirks are kept on purpose to match Excel: the value score can exceed 100, and infrastructure "None" still earns 8 points in the score.

## deacna.com integration

Recommended: deploy this app at `marketplace.deacna.com` and on deacna.com embed:

```html
<iframe src="https://marketplace.deacna.com/embed/listings" style="width:100%;height:700px;border:0"></iframe>
```

Only `/embed/*` may be framed (by deacna.com); everything else sends `X-Frame-Options: SAMEORIGIN`.

## Production checklist

- Switch `prisma/schema.prisma` provider to `postgresql` and set `DATABASE_URL` (Neon, Supabase, RDS…).
- Set a long random `SESSION_SECRET`.
- Set `RESEND_API_KEY` to actually send outreach and LOI-approval emails (otherwise they are logged to the CRM only).
- Documents are links today (Drive / SharePoint / S3). Signed-URL uploads with view tracking are a natural next step.
- Deploy on Vercel (or any Node host): `npm run build && npm start`.
