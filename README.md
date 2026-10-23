# DEAC Marketplace

Private, curated marketplace for data center opportunities (lease, financing, sale), with investor and developer CRMs, LOI-gated data rooms, outreach, and a valuation calculator ported from `Interactive_Powered_Asset_Bid_Calculator_DEAC_v2.xlsx`.

## Run locally

Needs a Postgres database (local Docker, or a free Neon/Supabase dev database).

```bash
npm install
cp .env.example .env   # set DATABASE_URL
npx prisma db push
npm run db:seed        # demo data — never run against production
npm run dev            # http://localhost:3000
npm test               # calculator matches the Excel workbook
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

## Going live (Vercel + Neon)

1. **Vercel:** Add New → Project → import `cleanenergynexus/deac-marketplace`.
2. **Database:** in the Vercel project, Storage → add a Neon Postgres database. This sets `DATABASE_URL`.
3. **Environment variables:** `SESSION_SECRET` (long random string), `PUBLIC_APP_URL=https://marketplace.deacna.com`, `SETUP_TOKEN` (one-time code), and optionally `RESEND_API_KEY` + `OUTREACH_FROM`.
4. **Deploy.** The build creates the database tables automatically.
5. **First admin:** open `/setup` on the live site, enter the `SETUP_TOKEN`, and create your login (the page shuts off once an admin exists; then delete `SETUP_TOKEN`). Alternative from a terminal: `npm run create-admin -- you@deacna.com "Your Name" "strong-password"`.
6. **Domain:** Vercel → Settings → Domains → add `marketplace.deacna.com`, then add the CNAME record Vercel shows at your DNS provider for deacna.com.
7. **Embed on deacna.com (optional):** paste the iframe snippet above into any page.

Documents are links today (Drive / SharePoint / S3). Signed-URL uploads with view tracking are a natural next step.
