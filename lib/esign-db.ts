import "server-only";
import { headers } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { currentUser } from "./auth";
import { sendEmail } from "./email";
import { recordSentEmail } from "./gmail-db";
import { touchInterest } from "./investor-crm-db";
import { saveGenerated, readStored } from "./storage";
import { cleanName, uniqueName } from "./dataroom";
import type { SignatureRequest, SignatureSigner } from "@prisma/client";
import { dueSlots, isOpen, kindLabel, parseValues, PARTY_LABEL, SIGNED_FOLDER, SIGNER_LABEL, SIGN_LINK_DAYS, signUrl, type PartyState, type SignerType, type SignValues } from "./esign";

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
  type: SignerType | "TEAM"; id: string; name: string; email: string | null; company: string | null; title: string | null; phone: string | null;
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
  if (type === "AGENT" || type === "TEAM") {
    const a = await db.user.findFirst({ where: { id, role: type === "AGENT" ? "AGENT" : "ADMIN" } });
    return a && { type, id, name: a.name, email: a.email, company: a.company ?? (type === "TEAM" ? "DEAC" : null), title: null, phone: a.phone, street: null, city: null, region: null, postalCode: null, country: null };
  }
  return null;
}

/** Columns that link an additional signer to their record. */
export const cosignerLink = (p: SignerProfile) => ({
  signerType: p.type, userId: p.type === "TEAM" || p.type === "AGENT" ? p.id : null, investorId: p.type === "INVESTOR" ? p.id : null, contactId: p.type === "CONTACT" ? p.id : null,
  name: p.name, email: p.email, company: p.company,
});

export const cosignerRef = (c: { signerType: string | null; userId: string | null; investorId: string | null; contactId: string | null }) =>
  c.signerType === "INVESTOR" ? `INVESTOR:${c.investorId}` : c.signerType === "CONTACT" ? `CONTACT:${c.contactId}` : (c.signerType === "TEAM" || c.signerType === "AGENT") && c.userId ? `${c.signerType}:${c.userId}` : "";

/** Everyone who signs a request, in signing order. Slot 0 is the recipient on the request itself. */
export type Party = PartyState & {
  role: string; name: string; email: string | null; company: string | null; kind: string; ref: string;
  status: "WAITING" | "SENT" | "VIEWED" | "SIGNED" | "DECLINED"; issued: boolean; viewedAt: Date | null; signedAt: Date | null; values: SignValues;
  cosigner: SignatureSigner | null;
};

export function partiesOf(r: SignatureRequest, cosigners: SignatureSigner[]): Party[] {
  const recipientSigned = !!r.recipientSignedAt || r.status === "SIGNED";
  const cosignerDeclined = cosigners.some((c) => c.status === "DECLINED");
  const recipientIssued = !!(r.recipientSentAt || r.tokenHash);
  const recipient: Party = {
    slot: 0, order: r.signOrder, signed: recipientSigned, role: cosigners.length ? "Recipient" : "Signer", name: r.signerName ?? "Recipient", email: r.signerEmail, company: r.signerCompany,
    kind: signerKindLabel(r.signerType), ref: signerRef(r), issued: recipientIssued, viewedAt: r.viewedAt, signedAt: r.recipientSignedAt ?? (r.status === "SIGNED" ? r.signedAt : null), values: parseValues(r.values),
    status: recipientSigned ? "SIGNED" : r.status === "DECLINED" && !cosignerDeclined ? "DECLINED" : !recipientIssued ? "WAITING" : r.viewedAt ? "VIEWED" : "SENT", cosigner: null,
  };
  const rest: Party[] = cosigners.map((c) => ({
    slot: c.slot, order: c.signOrder, signed: c.status === "SIGNED", role: c.role, name: c.name ?? `(${c.role})`, email: c.email, company: c.company, kind: c.signerType ? (PARTY_LABEL[c.signerType] ?? "Signer") : "Not chosen yet",
    ref: cosignerRef(c), issued: c.status !== "WAITING", viewedAt: c.viewedAt, signedAt: c.signedAt, values: parseValues(c.values), status: c.status as Party["status"], cosigner: c,
  }));
  return [recipient, ...rest].sort((a, b) => a.order - b.order || a.slot - b.slot);
}

export async function loadParties(r: SignatureRequest) {
  return partiesOf(r, await db.signatureSigner.findMany({ where: { requestId: r.id }, orderBy: { slot: "asc" } }));
}

/** Copies a template's (or draft's) additional signers onto a new request. */
export async function copyCosigners(fromId: string, toId: string) {
  const cs = await db.signatureSigner.findMany({ where: { requestId: fromId } });
  if (!cs.length) return;
  await db.signatureSigner.createMany({
    data: cs.map((c) => ({ requestId: toId, slot: c.slot, role: c.role, signOrder: c.signOrder, signerType: c.signerType, userId: c.userId, investorId: c.investorId, contactId: c.contactId, name: c.name, email: c.email, company: c.company })),
  });
}

export type SentLink = { id: string; slot: number; name: string; email: string | null; link: string; emailed: boolean };

/** Who signing emails come from when nobody on the team pressed a button (e.g. the previous signer just signed). */
async function senderOf(r: { createdById: string | null }) {
  const u = r.createdById ? await db.user.findFirst({ where: { id: r.createdById, role: "ADMIN" }, select: { id: true, name: true } }) : null;
  return u ?? { id: null, name: "The DEAC team" };
}

/**
 * Sends signing links to whoever's turn it is and hasn't had a link yet (everyone with the lowest signing order
 * still unsigned). DEAC team members also get a task. Returns the links, for the team to copy.
 */
export async function sendDueLinks(requestId: string, opts: { from?: { id: string | null; name: string }; skipRecipient?: boolean } = {}): Promise<SentLink[]> {
  const r = await db.signatureRequest.findUnique({ where: { id: requestId } });
  if (!r || !isOpen(r.status)) return [];
  const parties = await loadParties(r);
  const due = new Set(dueSlots(parties));
  const from = opts.from ?? (await senderOf(r));
  // Sent by a team member pressing Send: their IP goes on the audit trail. Otherwise it went out automatically.
  const meta = opts.from ? await requestMeta().catch(() => undefined) : undefined;
  const auto = opts.from ? "" : ", automatically when it was their turn";
  const out: SentLink[] = [];
  for (const p of parties) {
    if (!due.has(p.slot) || p.issued) continue;
    if (p.slot === 0) {
      await db.signatureRequest.update({ where: { id: r.id }, data: { recipientSentAt: new Date() } });
      if (opts.skipRecipient) continue;
      const link = await issueLink(r.id);
      const emailed = await emailSignLink(r, link, from);
      await logEvent(r.id, "SENT", `To ${p.name} <${p.email}>${emailed ? " by email" : " (link shared by the team)"}${auto}`, from.name, meta);
      out.push({ id: r.id, slot: 0, name: p.name, email: p.email, link, emailed });
      continue;
    }
    const c = p.cosigner!;
    const { token, hash, expiresAt } = newSignToken();
    await db.signatureSigner.update({ where: { id: c.id }, data: { status: "SENT", sentAt: new Date(), tokenHash: hash, tokenExpiresAt: expiresAt } });
    const link = signUrl(appUrl(), token);
    const emailed = await emailSignLink(
      { title: r.title, kind: r.kind, message: r.message, signerName: c.name, signerEmail: c.email, investorId: c.investorId, contactId: c.contactId, agentId: c.signerType === "AGENT" ? c.userId : null, projectId: r.projectId },
      link, from,
    );
    if (c.signerType === "TEAM" && c.userId) {
      await db.activity.create({
        data: { kind: "TASK", subject: `Sign: ${r.title}`, body: `Your signature (${c.role}) is needed on "${r.title}"${r.signerName ? ` with ${r.signerName}` : ""}.\n\nSign it here: /admin/signatures/${r.id}/sign`, investorId: r.investorId, contactId: r.contactId, projectId: r.projectId, assigneeId: c.userId, by: "E-signature", dueAt: new Date() },
      });
    }
    await logEvent(r.id, "SENT", `To ${p.name} <${p.email}> (${c.role})${emailed ? " by email" : " (link shared by the team)"}${auto}`, from.name, meta);
    out.push({ id: r.id, slot: c.slot, name: p.name, email: p.email, link, emailed });
  }
  return out;
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

/**
 * Emails the signing link from the sender's own Gmail when they linked it (else through Resend, replies to them), and
 * puts the email on the signer's timeline. Returns whether it actually went out (without Gmail or RESEND_API_KEY it's only logged).
 */
export async function emailSignLink(
  r: { title: string; kind: string; message: string | null; signerName: string | null; signerEmail: string | null; investorId: string | null; contactId: string | null; agentId: string | null; projectId: string | null },
  link: string,
  from: { id: string | null; name: string },
) {
  if (!r.signerEmail) return false;
  const first = (r.signerName ?? "").split(" ")[0] || "there";
  const subject = `Please sign: ${r.title}`;
  const text = `Hi ${first},\n\n${from.name} at DEAC sent you a ${kindLabel(r.kind)} to review and sign: ${r.title}.${r.message ? `\n\n${r.message}` : ""}\n\nReview and sign here (the link is personal to you and works for ${SIGN_LINK_DAYS} days):\n${link}\n\n— ${from.name}, DEAC`;
  const mail = await sendEmail({ to: r.signerEmail, toName: r.signerName, subject, text, fromUserId: from.id, investorId: r.investorId });
  if (mail.status !== "SENT") return false;
  // The signing link is personal, so the timeline keeps the email without it.
  await recordSentEmail(r, { subject, text: text.replace(link, "[signing link]"), by: from.name, projectId: r.projectId, gmail: mail.gmail });
  return true;
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

export type SignerMatch = { request: SignatureRequest; slot: number; cosigner: SignatureSigner | null; expired: boolean; viaLogin: boolean };

/**
 * The request a signer may act on, and which signer they are: by the emailed link's token, or by id for a signed-in
 * investor, agent or team member it was sent to. Returns null when neither matches.
 */
export async function findForSigner(ref: Ref): Promise<SignerMatch | null> {
  const now = new Date();
  if (ref.token) {
    const hash = hashSignToken(ref.token);
    const r = await db.signatureRequest.findFirst({ where: { tokenHash: hash, isTemplate: false } });
    if (r) return { request: r, slot: 0, cosigner: null, expired: isOpen(r.status) && !!r.tokenExpiresAt && r.tokenExpiresAt < now, viaLogin: false };
    const c = await db.signatureSigner.findFirst({ where: { tokenHash: hash }, include: { request: true } });
    if (!c || c.request.isTemplate) return null;
    const { request, ...cosigner } = c;
    return { request, slot: c.slot, cosigner, expired: isOpen(request.status) && !!c.tokenExpiresAt && c.tokenExpiresAt < now, viaLogin: false };
  }
  if (!ref.id) return null;
  const u = await currentUser();
  if (!u) return null;
  const r = await db.signatureRequest.findFirst({ where: { id: ref.id, isTemplate: false } });
  if (!r) return null;
  const cosigners = await db.signatureSigner.findMany({ where: { requestId: r.id } });
  const parties = partiesOf(r, cosigners);
  const mine = parties.filter((p) =>
    p.slot === 0
      ? (u.investorId && r.investorId === u.investorId) || (u.role === "AGENT" && r.agentId === u.id)
      : (p.cosigner!.userId && p.cosigner!.userId === u.id) || (u.investorId && p.cosigner!.investorId === u.investorId),
  );
  if (!mine.length) return null;
  const due = dueSlots(parties);
  const pick = mine.find((p) => due.includes(p.slot)) ?? mine.find((p) => !p.signed) ?? mine[0];
  return { request: r, slot: pick.slot, cosigner: pick.cosigner, expired: false, viaLogin: true };
}

/** First open of the signing page by this signer (called while rendering it, so no cache refresh here). */
export async function markViewed(found: SignerMatch) {
  if (found.expired) return;
  const meta = await requestMeta();
  const how = found.viaLogin ? "Opened while signed in" : "Opened from the signing link";
  if (found.cosigner) {
    const done = await db.signatureSigner.updateMany({ where: { id: found.cosigner.id, status: "SENT" }, data: { status: "VIEWED", viewedAt: new Date() } });
    if (done.count) await logEvent(found.request.id, "VIEWED", `${how} (${found.cosigner.role})`, found.cosigner.name, meta);
    return;
  }
  if (found.request.status !== "SENT") return;
  await db.signatureRequest.update({ where: { id: found.request.id }, data: { status: "VIEWED", viewedAt: new Date() } });
  await logEvent(found.request.id, "VIEWED", how, found.request.signerName, meta);
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

/** DEAC team members, for countersignatures. */
export async function teamOptions() {
  const us = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } });
  return us.map((u) => ({ ref: `TEAM:${u.id}`, name: u.name, email: u.email, company: "DEAC", kind: PARTY_LABEL.TEAM }));
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
