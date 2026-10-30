/** The DEAC company website (public/site/index.html, served on deacna.com). */
export const COMPANY_URL = process.env.COMPANY_URL || "https://deacna.com";

/** Main menu shared with the company website, so both read as one site. */
export const COMPANY_LINKS: [string, string][] = [
  ["About", `${COMPANY_URL}/#about`],
  ["Approach", `${COMPANY_URL}/#approach`],
  ["Energy + Compute", `${COMPANY_URL}/#deac`],
  ["Investors", `${COMPANY_URL}/#investors`],
];
