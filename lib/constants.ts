export const FACILITY_TYPES = [
  "Powered Land",
  "Powered Shell",
  "Turnkey Data Center",
  "Hyperscale Campus",
  "Edge / Modular",
  "Mining Facility",
  "Industrial Conversion",
  "Old Data Center",
] as const;

export const DEAL_TYPES = [
  { value: "LEASE", label: "For Lease" },
  { value: "FINANCING", label: "Investment / Financing" },
  { value: "SALE", label: "For Sale" },
] as const;

export const dealTypeLabel = (v: string) => DEAL_TYPES.find((d) => d.value === v)?.label ?? v;

export const PROJECT_STATUSES = ["Site Control", "Power Secured", "Permitting", "Shovel Ready", "Under Construction", "Operating"] as const;

export const INVESTOR_TYPES = [
  "Family Office",
  "Infrastructure Fund",
  "Private Equity",
  "Real Estate Fund",
  "Strategic / Operator",
  "Hyperscaler / Tenant",
  "Lender",
  "HNWI",
] as const;

export const INVESTOR_STAGES = [
  { value: "PROSPECT", label: "Prospect" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "APPLIED", label: "Applied" },
  { value: "VETTING", label: "Vetting" },
  { value: "APPROVED", label: "Approved Member" },
  { value: "ACTIVE", label: "Active in Deal" },
  { value: "DORMANT", label: "Dormant" },
  { value: "DECLINED", label: "Declined" },
] as const;

/** Starting Developer CRM columns for every funnel. Admins rename and add columns per deal type (lib/pipeline.ts). */
export const DEVELOPER_STAGES = [
  { value: "LEAD", label: "Lead" },
  { value: "SCREENING", label: "Screening" },
  { value: "SCORED", label: "Scored" },
  { value: "ENGAGED", label: "Engagement Signed" },
  { value: "LISTED", label: "Listed" },
  { value: "IN_DILIGENCE", label: "In Diligence" },
  { value: "CLOSED", label: "Closed" },
  { value: "PASSED", label: "Passed" },
] as const;


export const stageLabel = (list: readonly { value: string; label: string }[], v: string) =>
  list.find((s) => s.value === v)?.label ?? v;

export const DOC_CATEGORIES = ["Teaser", "Financial Model", "Interconnection", "Site Plan", "Environmental", "Legal", "Permits", "Other"] as const;

export const FOCUS_AREAS = ["Power & interconnection", "Returns / cash flows", "Tenant & lease", "Construction budget", "Sponsor track record", "Legal & title", "Environmental", "Exit strategy"] as const;

export const US_STATES = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR".split(" ");

/** Deal pipeline shown on the listing. `status` is the headline status investors see. */
export const DEAL_STAGES = [
  { value: "ORIGINATION", label: "Origination", status: "Coming soon" },
  { value: "UNDERWRITING", label: "Underwriting", status: "Coming soon" },
  { value: "MARKETING", label: "Marketing / LOI", status: "Accepting LOIs" },
  { value: "DILIGENCE", label: "Diligence", status: "In diligence" },
  { value: "TERM_SHEET", label: "Term Sheet", status: "Term sheet" },
  { value: "CLOSING", label: "Closing", status: "Closing" },
] as const;
export const dealStageIndex = (v: string) => Math.max(0, DEAL_STAGES.findIndex((s) => s.value === v));

/** "Equipment & EPC: $3.1M" lines -> [label, value] pairs. Lines without a colon are skipped. */
export function parseUseOfFunds(text: string): [string, string][] {
  return text.split("\n").map((l) => l.trim()).filter((l) => l.includes(":")).map((l) => {
    const i = l.indexOf(":");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()] as [string, string];
  }).filter(([k, v]) => k && v);
}
