import "server-only";
import { headers } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { currentUser } from "./auth";
import { sendEmail } from "./email";
import { touchInterest } from "./investor-crm-db";
import { saveGenerated, readStored } from "./storage";
import { cleanName, uniqueName } from "./dataroom";
import { isOpen, kindLabel, SIGNED_FOLDER, SIGNER_LABEL, SIGN_LINK_DAYS, signUrl, type SignerType, type SignValues } from "./esign";

export const appUrl = () => process.env.PUBLIC_APP_URL || "https://marketplace.deacna.com";
export const hashSignToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function newSignToken(now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashSignToken(token), expiresAt: new Date(now.getTime() + SIGN_LINK_DAYS * 86_400_000) };
}

/** IP and browser of the person making this request, for the audit trail. */
export async function requestMeta() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

export async function logEvent(requestId: string, action: string, detail?: string | null, by?: string | null, meta?: { ip: string | null; userAgent: string | null }) {
  await db.signatureEvent.create({ data: { requestId, action, detail: detail ?? null, by: by ?? null, ip: meta?.ip ?? null, userAgent: meta?.userAgent ?? null } });
}

export type SignerProfile = {
  type: SignerType; id: string; name: string; email: string | null; company: string | null; title: string | null; phone: string | null;
  street: string | null; city: string | null; region: string | null; postalCode: string | null; country: string | null;
};

/** "INVESTOR:<id>" -> the signer's details from their CRM record (or agent login). */
export async function loadSigner(ref: string): Promise<SignerProfile | null> {
  const [type, id] = ref.split(":");
  if (!id) return null;
  if (type === "INVESTOR") {
    const i = await db.investor.findUnique({ where: { id } });
    return i && { type, id, name: i.name, email: i.email, company: i.firm, title: i.title, phone: i.phone ?? i.mobile, street: i.street, city: i.city, region: i.region, postalCode: i.postalCode, country: i.country };
  }
  if (type === "CONTACT") {
    const c = await db.contact.findUnique({ where: { id }, include: { developer: { select: { company: true } } } });
    return c && { type, id, name: c.name, email: c.email, company: c.developer.company, title: c.title, phone: c.phone ?? c.mobile, street: c.street, city: c.city, region: c.region, postalCode: c.postalCode, country: c.country };
  }
  if (type === "AGENT") {
    const a = await db.user.findFirst({ where: { id, role: "AGENT" } });
    return a && { type, id, name: a.name, email: a.email, company: a.company, title: null, phone: a.phone, street: null, city: null, region: null, postalCode: null, country: null };
  }
  return null;
}

/** Columns that link a request to its signer. */
export const signerLink = (s: SignerProfile) => ({
  signerType: s.type, investorId: s.type === "INVESTOR" ? s.id : null, contactId: s.type === "CONTACT" ? s.id : null, agentId: s.type === "AGENT" ? s.id : null,
  signerName: s.name, signerEmail: s.email, signerCompany: s.company,
});

export const signerRef = (r: { signerType: string | null; investorId: string | null; contactId: string | null; agentId: string | null }) =>
  r.signerType === "INVESTOR" ? `INVESTOR:${r.investorId}` : r.signerType === "CONTACT" ? `CONTACT:${r.contactId}` : r.signerType === "AGENT" ? `AGENT:${r.agentId}` : "";

/** Notes the document on the signer's CRM timeline (investors and developer contacts have one). */
export async function logOnRecord(r: { investorId: string | null; contactId: string | null; projectId: string | null }, body: string, by?: string | null) {
  if (r.investorId) await db.activity.create({ data: { investorId: r.investorId, projectId: r.projectId, kind: "SYSTEM", by: by ?? null, body } });
  else if (r.contactId) {
    const c = await db.contact.findUnique({ where: { id: r.contactId }, select: { developerId: true } });
    if (c) await db.activity.create({ data: { developerId: c.developerId, contactId: r.contactId, projectId: r.projectId, kind: "SYSTEM", by: by ?? null, body } });
  }
}

/** Saves a copy of the signed file into the listing's data room, under "Signed Documents". Returns the file id. */
export async function fileInDataRoom(projectId: string, name: string, bytes: Uint8Array, contentType: string, by: string) {
  let folder = await db.dataRoomFolder.findFirst({ where: { projectId, parentId: null, name: SIGNED_FOLDER } });
  if (!folder) folder = await db.dataRoomFolder.create({ data: { projectId, parentId: null, name: SIGNED_FOLDER } });
  const taken = await db.dataRoomFile.findMany({ where: { projectId, folderId: folder.id }, select: { name: true } });
  const fileName = uniqueName(cleanName(name) || "Signed document.pdf", taken.map((t) => t.name));
  const key = await saveGenerated(projectId, fileName, bytes, contentType);
  const file = await db.dataRoomFile.create({ data: { projectId, folderId: folder.id, name: fileName, size: bytes.byteLength, contentType, storageKey: key, uploadedBy: by } });
  return file.id;
}

type Signed = { id: string; kind: string; title: string; projectId: string | null; investorId: string | null; contactId: string | null; autoApprove: boolean; signerName: string | null; values: string };

/**
 * What a signed NDA or LOI does on the marketplace. On a listing it fills the investor's NDA / LOI step (confirmed
 * right away when autoApprove, otherwise waiting in NDAs & LOIs). An NDA with no listing is the investor's master NDA.
 * Returns a line for the audit trail.
 */
export async function applySignedEffects(r: Signed, by: string): Promise<string | null> {
  if (!r.investorId || (r.kind !== "NDA" && r.kind !== "LOI")) return null;
  const status = r.autoApprove ? "APPROVED" : "PENDING";
  const reviewedAt = r.autoApprove ? new Date() : null;
  const v = (() => { try { return JSON.parse(r.values) as SignValues; } catch { return {} as SignValues; } })();
  if (r.kind === "NDA" && !r.projectId) {
    if (!r.autoApprove) return null;
    await db.investor.update({ where: { id: r.investorId }, data: { ndaSigned: true } });
    await logOnRecord(r, `Master NDA on file (signed "${r.title}"). Counts as the NDA for every listing.`, by);
    return "Master NDA recorded on the investor";
  }
  if (!r.projectId) return null;
  const p = await db.project.findUnique({ where: { id: r.projectId }, select: { code: true } });
  if (r.kind === "NDA") {
    const where = { projectId_investorId_step: { projectId: r.projectId, investorId: r.investorId, step: "NDA" } };
    const existing = await db.dealStep.findUnique({ where });
    if (existing?.status === "APPROVED") return null;
    const data = { status, reviewedAt, signerName: v.name ?? r.signerName, signerTitle: v.title ?? null, message: `E-signed: ${r.title}` };
    await db.dealStep.upsert({ where, create: { projectId: r.projectId, investorId: r.investorId, step: "NDA", ...data }, update: data });
    await touchInterest(r.investorId, r.projectId, "NDA", by);
    await logOnRecord(r, `NDA for ${p?.code} ${r.autoApprove ? "confirmed" : "awaiting confirmation"} (e-signed "${r.title}").`, by);
    return r.autoApprove ? `NDA step for ${p?.code} confirmed` : `NDA step for ${p?.code} waiting for review`;
  }
  const where = { projectId_investorId: { projectId: r.projectId, investorId: r.investorId } };
  const existing = await db.loi.findUnique({ where });
  if (existing?.status === "APPROVED") return null;
  const message = `E-signed: ${r.title}`;
  await db.loi.upsert({ where, create: { projectId: r.projectId, investorId: r.investorId, status, reviewedAt, message }, update: { status, reviewedAt, message: existing?.message ? `${existing.message}\n${message}` : message } });
  await touchInterest(r.investorId, r.projectId, r.autoApprove ? "LOI_APPROVED" : "LOI", by);
  await logOnRecord(r, `Letter of interest for ${p?.code} ${r.autoApprove ? "accepted" : "submitted for review"} (e-signed "${r.title}").`, by);
  return r.autoApprove ? `LOI for ${p?.code} accepted` : `LOI for ${p?.code} waiting for review`;
}

/** Emails the signing link. Returns whether it actually went out (without RESEND_API_KEY it's only logged). */
export async function emailSignLink(r: { title: string; kind: string; message: string | null; signerName: string | null; signerEmail: string | null }, link: string, from: string) {
  if (!r.signerEmail) return false;
  const first = (r.signerName ?? "").split(" ")[0] || "there";
  const mail = await sendEmail({
    to: r.signerEmail,
    subject: `Please sign: ${r.title}`,
    text: `Hi ${first},\n\n${from} at DEAC sent you a ${kindLabel(r.kind)} to review and sign: ${r.title}.${r.message ? `\n\n${r.message}` : ""}\n\nReview and sign here (the link is personal to you and works for ${SIGN_LINK_DAYS} days):\n${link}\n\n— DEAC Team`,
  });
  return mail.status === "SENT";
}

/** Sets a fresh signing link on a request and returns it (only the hash is stored). */
export async function issueLink(id: string) {
  const { token, hash, expiresAt } = newSignToken();
  await db.signatureRequest.update({ where: { id }, data: { tokenHash: hash, tokenExpiresAt: expiresAt } });
  return signUrl(appUrl(), token);
}

export const signerKindLabel = (t: string | null) => (t && t in SIGNER_LABEL ? SIGNER_LABEL[t as SignerType] : "Signer");

export async function readPdf(key: string) {
  const buf = await readStored(key);
  return buf ? new Uint8Array(buf) : null;
}

type Ref = { token?: string | null; id?: string | null };

/**
 * The request a signer may act on: by the emailed link's token, or by id for the signed-in investor or agent it
 * was sent to. Returns null when neither matches.
 */
export async function findForSigner(ref: Ref) {
  if (ref.token) {
    const r = await db.signatureRequest.findFirst({ where: { tokenHash: hashSignToken(ref.token), isTemplate: false } });
    if (!r) return null;
    if (isOpen(r.status) && r.tokenExpiresAt && r.tokenExpiresAt < new Date()) return { request: r, expired: true as const, viaLogin: false };
    return { request: r, expired: false as const, viaLogin: false };
  }
  if (!ref.id) return null;
  const u = await currentUser();
  if (!u) return null;
  const r = await db.signatureRequest.findFirst({ where: { id: ref.id, isTemplate: false } });
  if (!r) return null;
  const mine = (u.investorId && r.investorId === u.investorId) || (u.role === "AGENT" && r.agentId === u.id);
  return mine ? { request: r, expired: false as const, viaLogin: true } : null;
}

/** First open of the signing page (called while rendering it, so no cache refresh here). */
export async function markViewed(ref: Ref) {
  const found = await findForSigner(ref);
  if (!found || found.expired || found.request.status !== "SENT") return;
  await db.signatureRequest.update({ where: { id: found.request.id }, data: { status: "VIEWED", viewedAt: new Date() } });
  await logEvent(found.request.id, "VIEWED", found.viaLogin ? "Opened from their portal" : "Opened from the signing link", found.request.signerName, await requestMeta());
}


/** The NDA template investors sign from a listing: the listing's own, else a default one with no listing. */
export async function listingNdaTemplate(projectId: string) {
  return (
    (await db.signatureRequest.findFirst({ where: { isTemplate: true, listingNda: true, projectId }, orderBy: { updatedAt: "desc" } })) ??
    (await db.signatureRequest.findFirst({ where: { isTemplate: true, listingNda: true, projectId: null }, orderBy: { updatedAt: "desc" } }))
  );
}

/** Everyone the team can send a document to, for the signer picker. */
export async function loadSignerOptions() {
  const [investors, contacts, agents] = await Promise.all([
    db.investor.findMany({ select: { id: true, name: true, email: true, firm: true }, orderBy: { name: "asc" } }),
    db.contact.findMany({ select: { id: true, name: true, email: true, developer: { select: { company: true } } }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { role: "AGENT" }, select: { id: true, name: true, email: true, company: true }, orderBy: { name: "asc" } }),
  ]);
  return [
    ...investors.map((i) => ({ ref: `INVESTOR:${i.id}`, name: i.name, email: i.email, company: i.firm, kind: SIGNER_LABEL.INVESTOR })),
    ...contacts.map((c) => ({ ref: `CONTACT:${c.id}`, name: c.name, email: c.email, company: c.developer.company, kind: SIGNER_LABEL.CONTACT })),
    ...agents.map((a) => ({ ref: `AGENT:${a.id}`, name: a.name, email: a.email, company: a.company, kind: SIGNER_LABEL.AGENT })),
  ];
}

/** Listings for pickers: "DEAC-TX-001 · Title". */
export async function listingOptions() {
  const ps = await db.project.findMany({ select: { id: true, code: true, title: true }, orderBy: { code: "asc" } });
  return ps.map((p) => ({ id: p.id, label: `${p.code} · ${p.title}` }));
}

/** Where a signer's record lives in the admin. */
export function signerHref(r: { signerType: string | null; investorId: string | null; contactId: string | null; agentId: string | null }) {
  if (r.investorId) return `/admin/investors/${r.investorId}`;
  if (r.contactId) return `/admin/developers/contacts/${r.contactId}`;
  if (r.agentId) return "/admin/agents";
  return null;
}

/**
 * Tells the team a signer acted: a task for whoever sent the document (unassigned, so every Admin sees it, when
 * an investor signed a listing NDA on their own), plus an email to the same people.
 */
export async function notifyTeam(r: { id: string; createdById: string | null; investorId: string | null; contactId: string | null; projectId: string | null }, subject: string, body: string) {
  const sender = r.createdById ? await db.user.findFirst({ where: { id: r.createdById, role: "ADMIN" }, select: { id: true, email: true } }) : null;
  const developerId = r.contactId ? (await db.contact.findUnique({ where: { id: r.contactId }, select: { developerId: true } }))?.developerId ?? null : null;
  const link = `${appUrl()}/admin/signatures/${r.id}`;
  await db.activity.create({
    data: { kind: "TASK", subject, body: `${body}\n\nOpen the document: /admin/signatures/${r.id}`, investorId: r.investorId, contactId: r.contactId, developerId, projectId: r.projectId, assigneeId: sender?.id ?? null, by: "E-signature", dueAt: new Date() },
  });
  const to = sender ? [sender.email] : (await db.user.findMany({ where: { role: "ADMIN", staffLevel: "ADMIN" }, select: { email: true } })).map((u) => u.email);
  for (const email of to) await sendEmail({ to: email, subject, text: `${body}\n\n${link}\n\n— DEAC Marketplace` });
}
