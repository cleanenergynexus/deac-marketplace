import "server-only";
import { db } from "./db";
import { DEFAULT_SUPPORT, mergeTemplate, renderTemplate, type EmailSettings, type EmailVars, type TemplateKey } from "./email-templates";
import { COMPANY_URL } from "./site";

export const appUrl = () => (process.env.PUBLIC_APP_URL || "https://marketplace.deacna.com").replace(/\/+$/, "");

export const emailSettings = (): EmailSettings => ({ appUrl: appUrl(), companyUrl: COMPANY_URL, support: process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT });

/** The template's current wording (saved edits over the defaults). */
export async function loadTemplate(key: TemplateKey) {
  const row = await db.emailTemplate.findUnique({ where: { key } });
  return mergeTemplate(key, row);
}

/** Subject, text and branded HTML for one person, ready for sendEmail. */
export async function welcomeEmail(key: TemplateKey, v: Omit<EmailVars, "link"> & { link?: string }) {
  const tpl = await loadTemplate(key);
  return renderTemplate(key, tpl, { ...v, link: v.link ?? `${appUrl()}/login` }, emailSettings());
}
