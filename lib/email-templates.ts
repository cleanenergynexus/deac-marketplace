// Branded DEAC emails (Admin → Outreach → Email Templates). No database access here, so the editor can preview live.

/** The welcome emails that bring people onto the marketplace. Each one can be reworded under Email Templates. */
export const TEMPLATE_KEYS = ["INVESTOR_INVITE", "INVESTOR_APPROVED", "TEAM_LOGIN", "AGENT_LOGIN", "AGENT_APPROVED"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/** The parts of an email the team can edit. Text fields take {{placeholders}}; `steps` is one step per line. */
export type EmailTemplate = { subject: string; heading: string; intro: string; buttonLabel: string; steps: string; closing: string; footerNote: string };

/** The page each email's button and screenshot show. */
export type Screen = "SET_PASSWORD" | "SIGN_IN";

const WELCOME =
  "Welcome to the DEAC Marketplace, the private network where DEAC (Distributed Energy and Compute) presents vetted data center, powered land and energy infrastructure opportunities to qualified investors and partners.";

export const TEMPLATE_INFO: Record<TemplateKey, { name: string; when: string; screen: Screen; placeholders: string[]; defaults: EmailTemplate }> = {
  INVESTOR_INVITE: {
    name: "Investor Invite",
    when: "Sent from an Investor CRM contact with Invite to Marketplace. The button is their one-time link to set a password.",
    screen: "SET_PASSWORD",
    placeholders: ["firstName", "sender", "email", "days"],
    defaults: {
      subject: "You're invited to the DEAC Marketplace",
      heading: "Welcome to the DEAC Marketplace",
      intro: `Hi {{firstName}},\n\n${WELCOME}\n\n{{sender}} has invited you to join, and your membership is already approved. Use the button below to set your password and sign in.`,
      buttonLabel: "Set Your Password",
      steps: "Click Set Your Password. The link is personal to you and works once, for {{days}} days.\nYour email address ({{email}}) is already filled in. Choose a password of at least 8 characters and enter it twice.\nClick Set password and sign in. You'll land on the marketplace with the full portfolio open.\nNext time, sign in at marketplace.deacna.com with your email and password.",
      closing: "If the link has expired or you have any questions, contact us at {{support}} and we'll send you a new one.",
      footerNote: "You received this email because DEAC invited you to the DEAC Marketplace.",
    },
  },
  INVESTOR_APPROVED: {
    name: "Investor Membership Approved",
    when: "Sent when an investor who requested access is approved (Access Requests, or CRM stage set to Approved Member).",
    screen: "SIGN_IN",
    placeholders: ["firstName", "sender", "email"],
    defaults: {
      subject: "Your DEAC Marketplace membership is approved",
      heading: "Your Membership Is Approved",
      intro: `Hi {{firstName}},\n\n${WELCOME}\n\nYour membership is approved and the full portfolio is now open to you.`,
      buttonLabel: "Sign In to the Marketplace",
      steps: "Click Sign In to the Marketplace.\nEnter your email address ({{email}}) and the password you chose when you requested access.\nBrowse the listings, star the ones you like, and request NDAs or data room access from each listing.",
      closing: "If you have any issues or questions, contact us at {{support}}.",
      footerNote: "You received this email because you requested access to the DEAC Marketplace.",
    },
  },
  TEAM_LOGIN: {
    name: "Team Member Login",
    when: "Sent when a team member is added under Team. Their temporary password is shared separately.",
    screen: "SIGN_IN",
    placeholders: ["firstName", "sender", "email"],
    defaults: {
      subject: "Your DEAC Marketplace team login",
      heading: "Welcome to the DEAC Team",
      intro: "Hi {{firstName}},\n\n{{sender}} added you to the DEAC Marketplace team. The marketplace is where DEAC lists data center and energy opportunities, tracks project leads and investors, and shares data rooms.",
      buttonLabel: "Sign In",
      steps: "Click Sign In.\nEnter your email address ({{email}}) and the temporary password {{sender}} shares with you.\nGo to My Account and change your password. You can also link Gmail and add your email signature there.",
      closing: "If you have any issues or questions, contact us at {{support}}.",
      footerNote: "You received this email because you were added to the DEAC Marketplace team.",
    },
  },
  AGENT_LOGIN: {
    name: "Referral Agent Login",
    when: "Sent when the team adds a referral agent under Referral Agents. Their temporary password is shared separately.",
    screen: "SIGN_IN",
    placeholders: ["firstName", "sender", "email"],
    defaults: {
      subject: "Your DEAC referral agent login",
      heading: "Welcome, DEAC Referral Agent",
      intro: `Hi {{firstName}},\n\n${WELCOME}\n\n{{sender}} set up your referral agent account. From your agent portal you can submit projects, upload documents and follow your referrals.`,
      buttonLabel: "Sign In",
      steps: "Click Sign In.\nEnter your email address ({{email}}) and the temporary password {{sender}} shares with you.\nGo to My Account and change your password. You'll land on your referral agent portal.",
      closing: "If you have any issues or questions, contact us at {{support}}.",
      footerNote: "You received this email because DEAC set up a referral agent account for you.",
    },
  },
  AGENT_APPROVED: {
    name: "Referral Agent Application Approved",
    when: "Sent when a Become a Referral Agent application is approved under Access Requests.",
    screen: "SIGN_IN",
    placeholders: ["firstName", "sender", "email"],
    defaults: {
      subject: "Welcome to DEAC: your referral agent login is ready",
      heading: "Your Referral Agent Login Is Ready",
      intro: `Hi {{firstName}},\n\n${WELCOME}\n\nYour referral agent application is approved. From your agent portal you can submit projects, upload documents and follow your referrals.`,
      buttonLabel: "Sign In",
      steps: "Click Sign In.\nEnter your email address ({{email}}) and the password you chose when you applied.\nYou'll land on your referral agent portal.",
      closing: "If you have any issues or questions, contact us at {{support}}.",
      footerNote: "You received this email because you applied to become a DEAC referral agent.",
    },
  },
};

export const isTemplateKey = (k: string): k is TemplateKey => (TEMPLATE_KEYS as readonly string[]).includes(k);

/** Saved wording over the defaults; a blank field falls back to the default. */
export function mergeTemplate(key: TemplateKey, saved?: Partial<EmailTemplate> | null): EmailTemplate {
  const d = TEMPLATE_INFO[key].defaults;
  const out = { ...d };
  for (const f of Object.keys(d) as (keyof EmailTemplate)[]) {
    const v = saved?.[f];
    if (typeof v === "string" && v.trim()) out[f] = v.replace(/\r\n/g, "\n").trim();
  }
  return out;
}

export type EmailVars = {
  firstName: string;
  email: string;
  /** Who is sending: the team member's name, or "the DEAC team". */
  sender: string;
  /** Where the button goes (the one-time invite link, or the sign-in page). */
  link: string;
  days?: number;
  partner?: { name: string; email: string } | null;
};

export type EmailSettings = { appUrl: string; companyUrl: string; support: string; year?: number };

export const DEFAULT_SUPPORT = "invest@deacna.com";

export const fillPlaceholders = (t: string, v: Record<string, string>) => t.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in v ? v[k] : m));

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const BLUE = "#1F6BFF";
const NAVY = "#0A1C42";
const FONT = "font-family:Arial,Helvetica,sans-serif;";

/** Escapes text and turns email addresses into links. */
function linkify(s: string) {
  return esc(s).replace(/[\w.+-]+@[\w-]+\.[\w.-]+\w/g, (m) => `<a href="mailto:${m}" style="color:${BLUE};">${m}</a>`);
}

/** Marks the sign-off so the sender's own signature (My Account) can replace it. */
export const SIGNOFF_START = "<!--signoff-->";
export const SIGNOFF_END = "<!--/signoff-->";

export const signoffHtml = (lines: string[]) =>
  `${SIGNOFF_START}<p style="margin:0 0 16px;${FONT}font-size:15px;line-height:1.6;color:#1e293b;">${lines.map(linkify).join("<br>")}</p>${SIGNOFF_END}`;

/** Swaps the sign-off for the sender's signature. */
export function applyHtmlSignature(html: string, signature: string | null | undefined): string {
  const sig = signature?.replace(/\r\n/g, "\n").trim();
  if (!sig) return html;
  const a = html.indexOf(SIGNOFF_START);
  const b = html.indexOf(SIGNOFF_END);
  if (a < 0 || b < a) return html;
  return html.slice(0, a) + signoffHtml(sig.split("\n")) + html.slice(b + SIGNOFF_END.length);
}

export type Layout = {
  preheader?: string;
  heading?: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  image?: { src: string; alt: string; width: number; height: number };
  steps?: string[];
  callout?: string;
  closing?: string;
  signoff: string[];
  footerNote: string;
};

/** The DEAC email frame: logo header, body, and the navy footer used on the website. Table layout for email clients. */
export function brandedHtml(l: Layout, s: EmailSettings): string {
  const app = s.appUrl.replace(/\/+$/, "");
  const p = (t: string) => `<p style="margin:0 0 16px;${FONT}font-size:15px;line-height:1.6;color:#1e293b;">${linkify(t).replace(/\n/g, "<br>")}</p>`;
  const body = [
    l.heading ? `<h1 style="margin:0 0 20px;${FONT}font-size:22px;line-height:1.3;color:${NAVY};">${esc(l.heading)}</h1>` : "",
    ...l.paragraphs.map(p),
    l.button
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td bgcolor="${BLUE}" style="border-radius:6px;"><a href="${esc(l.button.url)}" target="_blank" style="display:inline-block;padding:13px 28px;${FONT}font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">${esc(l.button.label)}</a></td></tr></table>`
      : "",
    l.image
      ? `<div style="margin:0 0 24px;text-align:center;"><img src="${esc(l.image.src)}" alt="${esc(l.image.alt)}" width="${l.image.width}" height="${l.image.height}" style="display:inline-block;max-width:100%;height:auto;border:1px solid #cbd5e1;border-radius:6px;"></div>`
      : "",
    l.steps?.length
      ? `<p style="margin:0 0 8px;${FONT}font-size:15px;font-weight:bold;color:${NAVY};">How to get started</p><ol style="margin:0 0 20px;padding-left:22px;${FONT}font-size:15px;line-height:1.6;color:#1e293b;">${l.steps.map((t) => `<li style="margin:0 0 8px;">${linkify(t)}</li>`).join("")}</ol>`
      : "",
    l.callout ? `<div style="margin:0 0 20px;padding:14px 16px;background:#eef6ff;border-left:4px solid ${BLUE};${FONT}font-size:14px;line-height:1.6;color:#1e293b;">${linkify(l.callout)}</div>` : "",
    l.button ? p(`If the button doesn't work, copy this link into your browser: ${l.button.url}`).replace("font-size:15px", "font-size:12px").replace("color:#1e293b", "color:#64748b") : "",
    l.closing ? p(l.closing) : "",
    signoffHtml(l.signoff),
  ].join("");
  const link = (href: string, label: string) => `<a href="${esc(href)}" style="color:#ffffff;text-decoration:underline;">${label}</a>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(l.heading ?? "DEAC")}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
${l.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(l.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="padding:28px 32px 20px;border-bottom:4px solid ${BLUE};"><a href="${esc(s.companyUrl)}"><img src="${app}/brand/deac-logo.png" alt="DEAC: Distributed Energy and Compute" width="190" height="56" style="display:block;border:0;width:190px;height:auto;"></a></td></tr>
<tr><td style="padding:28px 32px 12px;">${body}</td></tr>
<tr><td bgcolor="${NAVY}" style="padding:24px 32px;text-align:center;${FONT}font-size:12px;line-height:1.7;color:#A9B6D3;">
<p style="margin:0 0 10px;">${esc(l.footerNote)}</p>
<p style="margin:0 0 10px;">© ${s.year ?? new Date().getFullYear()} DEAC. Distributed Energy and Compute.</p>
<p style="margin:0;">${link(s.companyUrl, "deacna.com")} &nbsp;|&nbsp; ${link(`${app}/login`, "Sign In")} &nbsp;|&nbsp; ${link(`mailto:${s.support}`, "Contact Support")}</p>
</td></tr></table>
</td></tr></table></body></html>`;
}

const partnerLine = (p: EmailVars["partner"]) => (p ? `Your DEAC partner is ${p.name} (${p.email}). They support your transactions and schedule your meetings.` : "");

/** Fills a template for one person and returns the subject, the plain-text version and the branded HTML. */
export function renderTemplate(key: TemplateKey, tpl: EmailTemplate, v: EmailVars, s: EmailSettings) {
  const vars: Record<string, string> = { firstName: v.firstName, sender: v.sender, email: v.email, days: String(v.days ?? 14), support: s.support };
  const fill = (t: string) => fillPlaceholders(t, vars);
  const app = s.appUrl.replace(/\/+$/, "");
  const paragraphs = fill(tpl.intro).split(/\n\s*\n/).map((x) => x.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  const steps = fill(tpl.steps).split("\n").map((x) => x.trim()).filter(Boolean);
  const callout = partnerLine(v.partner);
  const closing = fill(tpl.closing).trim();
  const signoff = ["Sincerely,", v.sender === "the DEAC team" ? "The DEAC Team" : `${v.sender}, DEAC`];
  const screen = TEMPLATE_INFO[key].screen;
  const subject = fill(tpl.subject);
  const html = brandedHtml(
    {
      preheader: paragraphs[1] ?? paragraphs[0],
      heading: fill(tpl.heading),
      paragraphs,
      button: { label: fill(tpl.buttonLabel), url: v.link },
      image: screen === "SET_PASSWORD"
        ? { src: `${app}/brand/email/set-password.png`, alt: "The DEAC Marketplace set password page", width: 300, height: 316 }
        : { src: `${app}/brand/email/sign-in.png`, alt: "The DEAC Marketplace sign in page", width: 300, height: 240 },
      steps,
      callout,
      closing,
      signoff,
      footerNote: fill(tpl.footerNote),
    },
    s,
  );
  const text = [
    ...paragraphs,
    `${fill(tpl.buttonLabel)}: ${v.link}`,
    steps.length ? `How to get started:\n${steps.map((x, i) => `${i + 1}. ${x}`).join("\n")}` : "",
    callout,
    closing,
    `— ${signoff[1]}`,
  ].filter(Boolean).join("\n\n");
  return { subject, text, html };
}

/** Campaigns get the same frame: their text becomes paragraphs, with no button. */
export function campaignHtml(body: string, s: EmailSettings): string {
  const paragraphs = body.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  // A last line like "— Name" becomes the sign-off.
  const last = paragraphs[paragraphs.length - 1];
  const signoff = last && /^—\s*/.test(last) ? [paragraphs.pop()!.replace(/^—\s*/, "")] : ["The DEAC Team"];
  return brandedHtml({ paragraphs, signoff, footerNote: "You received this email as a member or contact of the DEAC investor network." }, s);
}

/** Sample person for previews and test sends. */
export const SAMPLE_VARS: EmailVars = { firstName: "Alex", email: "alex@example.com", sender: "Jordan Lee", link: "https://marketplace.deacna.com/invite/sample-link", days: 14, partner: null };
