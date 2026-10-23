// Demo data. Run: npm run db:seed
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { evaluate, DEFAULT_INPUTS, type ValuationInputs } from "../lib/valuation";

const db = new PrismaClient();

async function main() {
  await db.$transaction([
    db.campaignRecipient.deleteMany(), db.campaign.deleteMany(), db.activity.deleteMany(), db.analysisRequest.deleteMany(),
    db.loi.deleteMany(), db.document.deleteMany(), db.project.deleteMany(), db.teamMember.deleteMany(), db.user.deleteMany(),
    db.developer.deleteMany(), db.investor.deleteMany(),
  ]);
  const pw = await bcrypt.hash("deac-demo-2026", 10);

  await db.user.create({ data: { email: "admin@deacna.com", name: "DEAC Admin", passwordHash: pw, role: "ADMIN", status: "APPROVED" } });

  const devs = await Promise.all([
    db.developer.create({ data: { company: "Lone Star Digital Infrastructure", contactName: "Maria Alvarez", email: "maria@lonestardi.example", hq: "Dallas, TX", mwDelivered: 340, stage: "LISTED", source: "Referral", experience: "Developer of 6 data center campuses across ERCOT since 2014, totaling 340 MW delivered. Self-performs site acquisition, interconnection and entitlement.", team: { create: [
      { name: "Maria Alvarez", title: "CEO & Founder", bio: "20 years in power and digital infrastructure. Previously led development at a top-5 colocation provider; delivered 200+ MW.", sortOrder: 0 },
      { name: "David Chen", title: "VP Power & Interconnection", bio: "Former ERCOT transmission planner. Secured 1.2 GW of large-load interconnection agreements.", sortOrder: 1 },
    ] } } }),
    db.developer.create({ data: { company: "Caribe Data Parks", contactName: "Luis Rivera", email: "luis@caribedp.example", hq: "San Juan, PR", mwDelivered: 45, stage: "LISTED", source: "DEAC network", experience: "Puerto Rico–focused developer of resilient, renewable-backed data centers with on-site microgrids.", team: { create: [
      { name: "Luis Rivera", title: "Managing Partner", bio: "Energy developer with 15 years of utility-scale solar and storage across the Caribbean.", sortOrder: 0 },
    ] } } }),
    db.developer.create({ data: { company: "Appalachian Power Sites LLC", contactName: "Tom Becker", email: "tom@apsites.example", hq: "Charleston, WV", stage: "SCORED", source: "Website submission", experience: "Repurposing former industrial and coal sites with existing transmission." } }),
    db.developer.create({ data: { company: "Desert Compute Partners", contactName: "Aisha Khan", email: "aisha@desertcompute.example", hq: "Phoenix, AZ", stage: "LEAD", source: "Conference" } }),
  ]);

  type Seed = Parameters<typeof db.project.create>[0]["data"] & { v?: Partial<ValuationInputs> };
  const projects: Seed[] = [
    { code: "DEAC-TX-001", title: "Abilene 120 MW Hyperscale-Ready Campus", developerId: devs[0].id, state: "TX", city: "Abilene", mw: 120, facilityType: "Powered Land", dealType: "FINANCING", fundingNeeded: 85_000_000, projectStatus: "Power Secured", summary: "240-acre fully entitled campus with a signed 120 MW ERCOT interconnection agreement and on-site 345 kV substation. Seeking development equity to fund long-lead electrical equipment and shell construction.", highlights: "Signed interconnection agreement (120 MW, expandable to 300 MW)\nOn-site 345 kV substation\nTwo long-haul fiber routes on the property line", totalCapex: 960_000_000, targetIrr: 22, equityMultiple: 2.6, powerRateCents: 4.2, powerStatus: "Signed", monthsToPower: 14, codDate: "Q2 2028", capitalStack: "Seeking $85M development equity; construction debt to follow at NTP", visibility: "TEASER",
      v: { assetType: "Powered Land", mw: 120, powerStatus: "Signed", monthsToPower: 14, powerRateCents: 4.2, marketTier: "Secondary", expansionMw: 180, fiber: "Excellent" } },
    { code: "DEAC-TX-002", title: "San Antonio 36 MW Powered Shell", developerId: devs[0].id, state: "TX", city: "San Antonio", mw: 36, facilityType: "Powered Shell", dealType: "LEASE", fundingNeeded: 0, projectStatus: "Under Construction", summary: "Two-story powered shell delivering Q3 2027 with 36 MW of utility power. Available for single-tenant triple-net lease.", leaseRateKwMo: 115, powerRateCents: 5.1, powerStatus: "Live", monthsToPower: 4, codDate: "Q3 2027", visibility: "PRIVATE",
      v: { assetType: "Powered Shell", mw: 36, powerStatus: "Live", monthsToPower: 4, powerRateCents: 5.1, marketTier: "Primary", expansionMw: 0, density: "Air Only" } },
    { code: "DEAC-PR-003", title: "Caguas 18 MW Resilient Data Center", developerId: devs[1].id, state: "PR", city: "Caguas", mw: 18, facilityType: "Turnkey Data Center", dealType: "FINANCING", fundingNeeded: 140_000_000, projectStatus: "Shovel Ready", summary: "Tier III data center with 30 MW solar + 60 MWh storage microgrid, serving Caribbean and LatAm demand. Opportunity Zone and Act 60 incentives.", highlights: "Opportunity Zone + Act 60 tax incentives\nSubsea cable landing 12 km away\nIslanding-capable microgrid", totalCapex: 210_000_000, targetIrr: 18.5, equityMultiple: 2.2, leaseRateKwMo: 165, powerRateCents: 9.5, powerStatus: "Queued", monthsToPower: 20, codDate: "Q4 2028", capitalStack: "$70M senior debt LOI in hand; seeking $140M equity / mezz", visibility: "TEASER",
      v: { assetType: "Powered Shell", mw: 18, powerStatus: "Queued", monthsToPower: 20, powerRateCents: 9.5, marketTier: "Tertiary", expansionMw: 12, water: "Excellent" } },
    { code: "DEAC-WV-004", title: "Kanawha 60 MW Industrial Conversion", developerId: devs[2].id, state: "WV", city: "Charleston", mw: 60, facilityType: "Industrial Conversion", dealType: "SALE", fundingNeeded: 32_000_000, projectStatus: "Site Control", summary: "Former aluminum plant with existing 138 kV service and 400k sq ft of high-bay structures, offered for sale.", powerRateCents: 5.8, powerStatus: "Live", monthsToPower: 8, visibility: "PRIVATE",
      v: { assetType: "Industrial Conversion", mw: 60, askingPrice: 32_000_000, powerStatus: "Live", monthsToPower: 8, powerRateCents: 5.8, marketTier: "Tertiary", expansionMw: 40, environmentalRisk: "Moderate", sellerMotivation: "High", entitlements: "Partial", density: "Air Only" } },
    { code: "DEAC-AZ-005", title: "Buckeye 200 MW Powered Land", developerId: devs[3].id, state: "AZ", city: "Buckeye", mw: 200, facilityType: "Powered Land", dealType: "SALE", fundingNeeded: 70_000_000, projectStatus: "Site Control", summary: "Large-load site in the Phoenix West Valley, interconnection study underway.", powerStatus: "Speculative", monthsToPower: 48, powerRateCents: 6.5, visibility: "DRAFT",
      v: { assetType: "Powered Land", mw: 200, askingPrice: 70_000_000, powerStatus: "Speculative", monthsToPower: 48, powerRateCents: 6.5, marketTier: "Primary", infrastructure: "Roads Only", expansionMw: 0, entitlements: "None", backupPower: "None", substation: "Distant", water: "Fair" } },
  ];
  const created = [];
  for (const { v, ...data } of projects) {
    const inputs = { ...DEFAULT_INPUTS, ...v };
    const r = evaluate(inputs);
    created.push(await db.project.create({ data: { ...data, valuationInputs: JSON.stringify(inputs), valueScore: r.score, adjustedValueMw: r.adjustedValueMw,
      documents: { create: [
        { name: "Investment Teaser", category: "Teaser", url: "https://example.com/teaser.pdf", access: "SUMMARY" },
        { name: "Financial Model", category: "Financial Model", url: "https://example.com/model.xlsx", access: "DATAROOM" },
        { name: "Interconnection Agreement", category: "Interconnection", url: "https://example.com/ia.pdf", access: "DATAROOM" },
        { name: "Phase I ESA", category: "Environmental", url: "https://example.com/esa.pdf", access: "DATAROOM" },
        { name: "Site Plan", category: "Site Plan", url: "https://example.com/siteplan.pdf", access: "DATAROOM" },
      ] } } }));
  }

  const inv = await Promise.all([
    db.investor.create({ data: { name: "Jennifer Walsh", firm: "Meridian Infrastructure Partners", email: "jwalsh@meridian.example", investorType: "Infrastructure Fund", checkMin: 25e6, checkMax: 150e6, preferredStates: "TX,VA,AZ,GA", dealTypes: "FINANCING,SALE", facilityTypes: "Powered Land,Powered Shell,Hyperscale Campus", mwMin: 50, stage: "ACTIVE", accredited: true, ndaSigned: true, source: "Referral", tags: "tier-1,hyperscale", owner: "Joaquin" } }),
    db.investor.create({ data: { name: "Roberto Méndez", firm: "Méndez Family Office", email: "rm@mendezfo.example", investorType: "Family Office", checkMin: 5e6, checkMax: 40e6, preferredStates: "PR,FL", dealTypes: "FINANCING", stage: "APPROVED", accredited: true, ndaSigned: true, source: "DEAC network", tags: "PR,act60" } }),
    db.investor.create({ data: { name: "Sarah Kim", firm: "Northgate Real Estate Fund IV", email: "skim@northgate.example", investorType: "Real Estate Fund", checkMin: 10e6, checkMax: 75e6, dealTypes: "LEASE,SALE", stage: "VETTING", source: "Conference" } }),
    db.investor.create({ data: { name: "Michael Osei", firm: "Bluewater Credit", email: "mosei@bluewater.example", investorType: "Lender", checkMin: 20e6, checkMax: 300e6, dealTypes: "FINANCING", stage: "CONTACTED", source: "LinkedIn", tags: "debt" } }),
    db.investor.create({ data: { name: "Priya Natarajan", firm: "Atlas Strategic Capital", email: "priya@atlas.example", investorType: "Private Equity", checkMin: 50e6, checkMax: 250e6, preferredStates: "TX,AZ,OH", dealTypes: "FINANCING,SALE", stage: "APPLIED", source: "Website application", accredited: true } }),
    db.investor.create({ data: { name: "Chris Dunn", firm: "Dunn Holdings", email: "chris@dunn.example", investorType: "HNWI", stage: "PROSPECT", source: "CSV import" } }),
  ]);

  await db.user.create({ data: { email: "investor@deacna.com", name: "Jennifer Walsh (demo)", passwordHash: pw, role: "INVESTOR", status: "APPROVED", investorId: inv[0].id } });
  await db.user.create({ data: { email: "applicant@deacna.com", name: "Priya Natarajan", passwordHash: pw, role: "INVESTOR", status: "PENDING", investorId: inv[4].id } });

  await db.loi.create({ data: { projectId: created[0].id, investorId: inv[0].id, amount: 60e6, structure: "Equity", timeline: "Close Q1 2027", message: "Strong interest; would like to see the interconnection agreement and capex budget.", status: "APPROVED", reviewedAt: new Date() } });
  await db.loi.create({ data: { projectId: created[2].id, investorId: inv[1].id, amount: 15e6, structure: "Equity", message: "Interested in a co-invest alongside the senior lender.", status: "PENDING" } });
  await db.analysisRequest.create({ data: { projectId: created[0].id, investorId: inv[0].id, focusAreas: "Power & interconnection,Returns / cash flows,Construction budget", returnMetric: "Levered IRR", holdPeriod: "5–7 years", format: "Excel model", questions: "Sensitivity of IRR to 6-month COD delay and to +10% capex?" } });

  for (const [i, body] of [[0, "Intro call — focused on ERCOT large-load sites"], [0, "Sent Abilene teaser"], [1, "Met at PR Investment Summit"], [3, "Connected on LinkedIn, sent overview deck"]] as const)
    await db.activity.create({ data: { investorId: inv[i].id, kind: "NOTE", body, by: "Joaquin" } });
  await db.activity.create({ data: { developerId: devs[2].id, kind: "CALL", body: "Site walk scheduled; asked for utility will-serve letter", by: "Joaquin" } });

  console.log("Seeded. Logins (password deac-demo-2026): admin@deacna.com, investor@deacna.com, applicant@deacna.com");
}

main().finally(() => db.$disconnect());
