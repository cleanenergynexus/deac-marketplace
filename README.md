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

## Import a project from a document

**Admin → Listings → Import from document**: upload a teaser, offering memo or broker flyer (PDF up to 4.4 MB, an image, or text, or paste an email). Claude (`claude-opus-5-5`) reads it and prefills the listing, the developer/sponsor and the valuation calculator inputs. You review and edit everything before the listing is created as a Draft. Needs `ANTHROPIC_API_KEY`. Extraction rules and the output schema live in `lib/importer.ts`.

## deacna.com company website

The DEAC company website is a single static page at `public/site/index.html`. This app serves it:

- on `deacna.com` and `www.deacna.com` at `/` (`middleware.ts` checks the host). Any other path on those hosts redirects to the marketplace, so `deacna.com/apply` and `deacna.com/login` work too.
- on any host at `/site`, for previewing before the domain moves.

It shows the live teaser tiles by framing `https://marketplace.deacna.com/embed/listings`. The embed posts its height to the parent so the frame fits the grid. Edit the copy straight in the HTML file.

To move deacna.com off Squarespace:

1. Vercel → Project → Settings → Domains: add `deacna.com` and `www.deacna.com` (redirect www to the apex or the other way round).
2. In the DNS for deacna.com (Squarespace → Domains → DNS settings): delete the Squarespace Defaults records for `@` and `www`, then add the records Vercel shows (usually `A @ 76.76.21.21` and `CNAME www cname.vercel-dns.com`). Keep the `marketplace` CNAME and any email records (MX, TXT/SPF, DKIM) as they are.
3. Once the site loads from Vercel, the Squarespace website plan can be cancelled. Keep the domain registration if it is with Squarespace.

The teaser grid can also be embedded on other sites:

```html
<iframe src="https://marketplace.deacna.com/embed/listings" style="width:100%;height:700px;border:0"></iframe>
```

Only `/embed/*` may be framed (by deacna.com); everything else sends `X-Frame-Options: SAMEORIGIN`.

## Going live (Vercel + Neon)

1. **Vercel:** Add New → Project → import `cleanenergynexus/deac-marketplace`.
2. **Database:** in the Vercel project, Storage → add a Neon Postgres database. This sets `DATABASE_URL`.
3. **Data room file storage:** Storage → Create → **Blob**, choose **Private** access, connect it to the project. This sets `BLOB_READ_WRITE_TOKEN`.
4. **Environment variables:** `SESSION_SECRET` (long random string), `PUBLIC_APP_URL=https://marketplace.deacna.com`, `SETUP_TOKEN` (one-time code), `ANTHROPIC_API_KEY` (for the project import wizard and the Document Wizard), and optionally `RESEND_API_KEY` + `OUTREACH_FROM`.
5. **Deploy.** The build creates the database tables automatically.
6. **First admin:** open `/setup` on the live site, enter the `SETUP_TOKEN`, and create your login (the page shuts off once an admin exists; then delete `SETUP_TOKEN`). Add the rest of your staff under **Admin → Team**. Alternative from a terminal: `npm run create-admin -- you@deacna.com "Your Name" "strong-password"`.
7. **Domain:** Vercel → Settings → Domains → add `marketplace.deacna.com`, then add the CNAME record Vercel shows at your DNS provider for deacna.com.
8. **Embed on deacna.com (optional):** paste the iframe snippet above into any page.

## Project data rooms

Each project has an internal data room (**Listing → 📁 Data room**, or **Data room** on its Developer CRM tile) that works like Windows Explorer: folder tree, address bar with back/forward/up, details or icons view, sort, search, multi-select (Ctrl/Shift), right-click menu, rename (F2), cut/paste (Ctrl+X / Ctrl+V), Move to…, drag to move, and upload of files or whole folders (button or drag from the desktop). A name clash on upload keeps both ("Report (2).pdf"). An empty data room offers a standard folder set, which admins edit under **Admin → Listings → Data room template** (folders and subfolders; changes apply to data rooms set up afterwards, and the right-click menu at the top level can add the template to an existing one).

Files are stored in a **private** Vercel Blob store (`BLOB_READ_WRITE_TOKEN`); browsers upload straight to Blob, so there is no 4.5 MB limit. Without a token, local development saves files in `./.data-room`.

Listing documents can point at data room files: **Share on listing** in the data room (pick a tier: Public, After NDA, After LOI, Full data room), or **Add from data room** in the listing editor. Investors open these through `/api/data-room/files/<id>`, which checks their stage on that listing every time; the Blob URL is never exposed. Nothing in the data room is visible to investors until it is shared. Documents can still be plain links (Drive / SharePoint).

### Document Wizard

**Data room → ✨ Document Wizard** has Claude (`claude-opus-5-5`) write a first draft from the files you tick in that data room: a **Project Teaser** (optionally blind: no sponsor, address or city), a **Project Report** (full analysis with risks, gaps and DEAC's internal valuation), a **Pitch Deck** (10 to 14 slides), or a **Custom report** from your own brief (summarize documents, compare options, answer a question). It reads PDFs, images, text, Word (.docx), Excel (.xlsx, cached values) and PowerPoint (.pptx); older Office formats and drawings are skipped with a reason. **Research the internet too** adds Claude web search and web fetch, with every web fact linked. Files are read server-side from storage, so the 4.4 MB upload limit doesn't apply; PDFs and images are capped at 22 MB per run (Claude's 32 MB request limit).

Claude writes in the background (`after()`, within the page's 300 s limit); the draft page refreshes itself. Drafts are Markdown, edited side by side with a live preview, then **Save to data room** files a branded PDF (decks: 16:9 PDF and an editable .pptx) in "08 Marketing & Teaser" or "09 Reports & Analysis" (an existing matching folder is reused). Saving again replaces the same file, so listing shares keep working. Code: `lib/wizard.ts` (prompts, limits), `lib/wizard-run.ts` (Claude call), `lib/office.ts` (Office text), `lib/wizard-export.ts` (PDF / PowerPoint). Needs `ANTHROPIC_API_KEY`.

## Developer CRM funnels

The Developer CRM board has one funnel per deal type (For Lease, Investment / Financing, For Sale), picked with the tabs above the board. A project shows in the funnel for its deal type; a company with no project yet shows in every funnel. Wide boards scroll sideways with the bar above the columns, the bar below them (it stays pinned to the bottom of the window), the ← → buttons, or the trackpad.

**Developer CRM → Funnels** (or **Edit funnels** on the board) renames, adds, reorders and removes columns for each funnel, or copies another funnel's columns. Settings are saved in the `PipelineSettings` table. Renaming keeps every tile in place; tiles in a removed column move to that funnel's first column when you save. Changing a listing's deal type moves its tile to the new funnel, keeping its column if that funnel has it.

## Investor CRM

Works like the Developer CRM. **Investor CRM → Companies** are investor firms (funds, family offices, lenders); **Contacts** are the people at them, each with a contact record (notes, emails, calls, meetings, tasks, profile and mandate); **Listings** shows every listing with the investors working it.

The board has one tile per investor per listing (contact and company first, listing second), with one funnel per deal type. Pick a listing in the menu above the board to see only that listing's investors, add investors to it, and see who else fits its mandate. **Investor CRM → Funnels** edits the columns (saved in `PipelineSettings` row `investor`).

Tiles are created and moved forward on their own when an investor signs a listing's NDA, sends an LOI, has an LOI approved, gets diligence access or sends an intake request (never backwards). Existing NDAs, LOIs and intake requests become tiles the first time a CRM page loads, and investors' free-text firm names become companies.

## Referral agents

Outside agents who bring developers and investors to DEAC. **Team → Referral agents** adds an agent login and assigns their **DEAC partner** (a team member who supports their deals and meetings). Agents sign in at `/login` and land on their own portal at `/agent`; they can't open the admin area or the investor marketplace.

- **What they see:** contacts marked **Referred by agent** on the contact (Developer CRM contact or company, Investor CRM contact). A referred developer company shows all its contacts; a referred developer contact shows its company's projects. Everything is view only, including the activity timeline the team logs on those contacts.
- **What they can do:** refer new developers and investors (added to the CRM with the agent as referrer, and a task for their partner), import a listing with the import wizard (always saved as a Draft for the team to review), upload files into their projects' data rooms, and request meetings (a task for their partner on that contact's timeline).
- **Opportunities marketplace:** agents browse every live listing at the **Teaser** level. On listings they originated (projects of a developer company they brought in) they see everything, like an investor with full diligence access.
- **Data room:** upload only. Agents never open the internal data room; they see the files they uploaded. Like investors, they can open only documents shared on a live listing, at their level (Teaser documents everywhere, all documents on listings they originated).
- **View as agent** (on Team → Referral agents) opens an agent's portal exactly as they see it, without their password and without signing you out. It's read-only (forms and uploads don't save) and ends with **Exit preview** or after 2 hours.
- Partners add a phone number and a meeting booking link under **My account**; agents see them on their portal. Rules live in `lib/agents.ts`.
