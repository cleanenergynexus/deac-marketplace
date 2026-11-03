"use server";
// E-signatures: the team prepares PDFs with signing fields and sends them; signers sign from an emailed link or My Portal.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser, requireAdmin } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { saveGenerated } from "@/lib/storage";
import { inspectPdf, sha256, buildSignedPdf } from "@/lib/esign-pdf";
import { cleanName } from "@/lib/dataroom";
import { appUrl, applySignedEffects, copyCosigners, cosignerLink, emailSignLink, notifyTeam, fileInDataRoom, findForSigner, issueLink, listingNdaTemplate, loadParties, loadSigner, logEvent, logOnRecord, newSignToken, readPdf, requestMeta, sendDueLinks, signerLink, type Party, type SentLink } from "@/lib/esign-db";
import { CONSENT_TEXT, MAX_SIGNERS, allSigned, cleanValues, dueSlots, fieldsFor, isDocKind, isOpen, kindLabel, missingValues, normalizeFields, parseFields, signedFileName, signUrl, type SignValues } from "@/lib/esign";

const s = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() || null;
const MAX_PDF = 4_400_000;

function refresh(id?: string) {
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/signatures", "layout");
  if (id) revalidatePath(`/admin/signatures/${id}`);
}

// ---------- Team: create, place fields, send ----------

export type CreateState = { error?: string } | undefined;

/**
 * New request or template from a PDF: a saved template, a file in a listing's data room, or an upload.
 * The request keeps its own copy of the PDF, so later data room changes don't affect what was sent.
 */
export async function createEnvelope(_: CreateState, f: FormData): Promise<CreateState> {
  const admin = await requireAdmin();
  const asTemplate = f.get("asTemplate") === "on";
  const kind = s(f, "kind") ?? "NDA";
  if (!isDocKind(kind)) return { error: "Pick a document type." };
  const projectId = s(f, "projectId");
  const templateId = s(f, "templateId");
  const fileId = s(f, "fileId");
  const upload = f.get("file");
  const signer = s(f, "signer");

  let bytes: Uint8Array | null = null, sourceName = "", fields = "[]", from: { kind: string; message: string | null; autoApprove: boolean; projectId: string | null; title: string; signOrder: number } | null = null;
  if (templateId) {
    const t = await db.signatureRequest.findFirst({ where: { id: templateId, isTemplate: true } });
    if (!t) return { error: "That template no longer exists." };
    bytes = await readPdf(t.sourceKey);
    sourceName = t.sourceName;
    fields = t.fields;
    from = t;
  } else if (upload instanceof File && upload.size > 0) {
    if (upload.size > MAX_PDF) return { error: "That PDF is over 4.4 MB. Compress it, or put it in the listing's data room and pick it from there." };
    bytes = new Uint8Array(await upload.arrayBuffer());
    sourceName = cleanName(upload.name) || "Document.pdf";
  } else if (fileId) {
    const file = await db.dataRoomFile.findUnique({ where: { id: fileId } });
    if (!file) return { error: "That data room file no longer exists." };
    bytes = await readPdf(file.storageKey);
    sourceName = file.name;
  } else return { error: "Choose a template, a data room PDF, or upload a PDF." };
  if (!bytes) return { error: "The PDF couldn't be read from storage." };
  const info = await inspectPdf(bytes);
  if ("error" in info) return { error: info.error };

  let sourceKey: string;
  try { sourceKey = await saveGenerated("esign", sourceName, bytes, "application/pdf"); } catch (e) { return { error: (e as Error).message }; }
  const title = s(f, "title") ?? from?.title ?? sourceName.replace(/\.pdf$/i, "");
  const signerProfile = signer && !asTemplate ? await loadSigner(signer) : null;
  const r = await db.signatureRequest.create({
    data: {
      isTemplate: asTemplate, templateId: templateId ?? null, title, kind: from?.kind ?? kind, projectId: projectId ?? from?.projectId ?? null,
      sourceName, sourceKey, sourceHash: sha256(bytes), pageCount: info.pageCount, fields, message: from?.message ?? null, autoApprove: from?.autoApprove ?? true,
      signOrder: from?.signOrder ?? 1, status: asTemplate ? "TEMPLATE" : "DRAFT", createdBy: admin.name, createdById: admin.id,
      ...(signerProfile && signerProfile.type !== "TEAM" ? signerLink(signerProfile) : {}),
    },
  });
  if (templateId) await copyCosigners(templateId, r.id);
  await logEvent(r.id, "CREATED", `${asTemplate ? "Template" : "Request"} created from ${sourceName}${templateId ? " (template)" : ""}`, admin.name);
  refresh();
  redirect(`/admin/signatures/${r.id}`);
}

/** Saves the fields placed in the editor, plus the request settings. */
export async function saveEnvelope(f: FormData): Promise<{ error?: string; ok?: boolean }> {
  const admin = await requireAdmin();
  const r = await db.signatureRequest.findUnique({ where: { id: String(f.get("id")) } });
  if (!r) return { error: "This document no longer exists." };
  if (!r.isTemplate && r.status !== "DRAFT") return { error: "This request was already sent; its fields can't change. Void it and send a new one." };
  let fields, rawSigners: unknown;
  try {
    fields = normalizeFields(JSON.parse(String(f.get("fields") ?? "[]")), r.pageCount);
    rawSigners = JSON.parse(String(f.get("signers") ?? "[]"));
  } catch { return { error: "The fields couldn't be read." }; }
  const slots = await saveCosigners(r.id, rawSigners);
  // A field for a signer that was removed goes back to the recipient.
  fields = fields.map(({ signer, ...x }) => (signer && slots.has(signer) ? { ...x, signer } : x));
  const kind = s(f, "kind") ?? r.kind;
  const order = Math.trunc(Number(f.get("signOrder")));
  await db.signatureRequest.update({
    where: { id: r.id },
    data: {
      signOrder: order >= 1 && order <= 10 ? order : r.signOrder,
      fields: JSON.stringify(fields),
      title: s(f, "title") ?? r.title,
      kind: isDocKind(kind) ? kind : r.kind,
      projectId: s(f, "projectId"),
      message: s(f, "message"),
      autoApprove: f.get("autoApprove") === "on",
      listingNda: r.isTemplate && f.get("listingNda") === "on",
    },
  });
  void admin;
  refresh(r.id);
  return { ok: true };
}

/** Saves the additional signers from the editor (slot, role, who, signing order). Returns the slots kept. */
async function saveCosigners(requestId: string, raw: unknown) {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_SIGNERS) : [];
  const slots = new Set<number>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const slot = Math.trunc(Number(o.slot));
    if (!(slot >= 1 && slot <= MAX_SIGNERS) || slots.has(slot)) continue;
    slots.add(slot);
    const order = Math.trunc(Number(o.order));
    const role = (typeof o.role === "string" ? o.role.trim().slice(0, 60) : "") || "Countersignature";
    const p = typeof o.ref === "string" && o.ref ? await loadSigner(o.ref) : null;
    const who = p ? cosignerLink(p) : { signerType: null, userId: null, investorId: null, contactId: null, name: null, email: null, company: null };
    const data = { role, signOrder: order >= 1 && order <= 10 ? order : 2, ...who };
    const existing = await db.signatureSigner.findFirst({ where: { requestId, slot } });
    if (existing) await db.signatureSigner.update({ where: { id: existing.id }, data });
    else await db.signatureSigner.create({ data: { requestId, slot, ...data } });
  }
  await db.signatureSigner.deleteMany({ where: { requestId, slot: { notIn: [...slots] } } });
  return slots;
}

export type SendState = { error?: string; sent?: SentLink[] } | undefined;

/**
 * Sends a draft or a template to one or more signers. Each signer gets their own request (own copy, own link).
 * A draft becomes the first signer's request.
 */
export async function sendEnvelope(_: SendState, f: FormData): Promise<SendState> {
  const admin = await requireAdmin();
  const src = await db.signatureRequest.findUnique({ where: { id: String(f.get("id")) } });
  if (!src) return { error: "This document no longer exists." };
  if (!src.isTemplate && src.status !== "DRAFT") return { error: "This request was already sent." };
  const refs = [...new Set(f.getAll("signer").map(String).filter(Boolean))];
  if (!refs.length) return { error: "Choose who signs." };
  if (refs.length > 50) return { error: "Send to at most 50 signers at a time." };
  const fields = parseFields(src.fields, src.pageCount);
  if (!fields.length) return { error: "Place at least one field on the document (a signature, or the signer's name) before sending." };
  const cosigners = await db.signatureSigner.findMany({ where: { requestId: src.id }, orderBy: { slot: "asc" } });
  for (const c of cosigners) {
    if (!c.signerType || !c.name) return { error: `Choose who signs as "${c.role}" (in Signers, next to the document).` };
    if (!c.email) return { error: `${c.name} (${c.role}) has no email address on their record. Add one first.` };
    if (!fieldsFor(fields, c.slot).length) return { error: `Place at least one field for ${c.name} (${c.role}), such as their signature.` };
  }
  const signers = [];
  for (const ref of refs) {
    const p = await loadSigner(ref);
    if (!p || p.type === "TEAM") return { error: "One of the signers no longer exists." };
    if (!p.email) return { error: `${p.name} has no email address on their record. Add one first.` };
    signers.push(p);
  }
  const sent: SentLink[] = [];
  for (const [i, p] of signers.entries()) {
    let id = src.id;
    if (src.isTemplate || i > 0) {
      const bytes = await readPdf(src.sourceKey);
      if (!bytes) return { error: "The PDF couldn't be read from storage.", sent };
      const sourceKey = await saveGenerated("esign", src.sourceName, bytes, "application/pdf");
      const copy = await db.signatureRequest.create({
        data: {
          templateId: src.isTemplate ? src.id : src.templateId, title: src.title, kind: src.kind, projectId: src.projectId, sourceName: src.sourceName, sourceKey, sourceHash: src.sourceHash,
          pageCount: src.pageCount, fields: src.fields, message: src.message, autoApprove: src.autoApprove, signOrder: src.signOrder, createdBy: admin.name, createdById: admin.id, status: "DRAFT",
        },
      });
      await copyCosigners(src.id, copy.id);
      await logEvent(copy.id, "CREATED", src.isTemplate ? `From template "${src.title}"` : "Copy for an additional recipient", admin.name);
      id = copy.id;
    }
    const r = await db.signatureRequest.update({ where: { id }, data: { ...signerLink(p), status: "SENT", sentAt: new Date() } });
    const links = await sendDueLinks(id, { from: admin });
    if (!links.some((l) => l.slot === 0)) await logEvent(id, "QUEUED", `${p.name} gets their link after the earlier signer${cosigners.length > 1 ? "s" : ""}`, admin.name);
    await logOnRecord(r, `${kindLabel(r.kind)} "${r.title}" sent for e-signature by ${admin.name}.`, admin.name);
    sent.push(...links);
  }
  refresh(src.id);
  return { sent };
}

/** A new signing link for an open request (the old one stops working). */
export async function renewLink(_: SendState, f: FormData): Promise<SendState> {
  const admin = await requireAdmin();
  const r = await db.signatureRequest.findUnique({ where: { id: String(f.get("id")) } });
  if (!r || !isOpen(r.status)) return { error: "Only a request waiting for a signature can get a new link." };
  const slot = Math.trunc(Number(f.get("slot") ?? 0)) || 0;
  const p = (await loadParties(r)).find((x) => x.slot === slot);
  if (!p || p.signed || !p.issued) return { error: "That signer isn't waiting to sign." };
  let link: string, emailed = false;
  if (p.cosigner) {
    const t = newSignToken();
    await db.signatureSigner.update({ where: { id: p.cosigner.id }, data: { tokenHash: t.hash, tokenExpiresAt: t.expiresAt } });
    link = signUrl(appUrl(), t.token);
    if (f.get("email") === "on") emailed = await emailSignLink({ title: r.title, kind: r.kind, message: r.message, signerName: p.name, signerEmail: p.email, investorId: p.cosigner.investorId, contactId: p.cosigner.contactId, agentId: null, projectId: r.projectId }, link, admin);
  } else {
    link = await issueLink(r.id);
    if (f.get("email") === "on") emailed = await emailSignLink(r, link, admin);
  }
  await logEvent(r.id, "LINK_RENEWED", `${emailed ? "New link emailed" : "New link created"} for ${p.name}`, admin.name, await requestMeta());
  refresh(r.id);
  return { sent: [{ id: r.id, slot, name: p.name, email: p.email, link, emailed }] };
}

export async function voidRequest(f: FormData) {
  const admin = await requireAdmin();
  const r = await db.signatureRequest.findUnique({ where: { id: String(f.get("id")) } });
  if (!r || !isOpen(r.status)) return;
  await db.signatureRequest.update({ where: { id: r.id }, data: { status: "VOIDED", tokenHash: null } });
  await db.signatureSigner.updateMany({ where: { requestId: r.id }, data: { tokenHash: null } });
  await logEvent(r.id, "VOIDED", s(f, "reason"), admin.name, await requestMeta());
  await logOnRecord(r, `${kindLabel(r.kind)} "${r.title}" voided by ${admin.name}.`, admin.name);
  refresh(r.id);
}

/** Deletes a draft, a template, or a voided/declined request. Signed documents are kept. */
export async function deleteEnvelope(f: FormData) {
  await requireAdmin();
  const r = await db.signatureRequest.findUnique({ where: { id: String(f.get("id")) } });
  if (!r) redirect("/admin/signatures");
  if (r.status === "SIGNED" || isOpen(r.status)) return;
  await db.signatureRequest.delete({ where: { id: r.id } });
  refresh();
  redirect(r.isTemplate ? "/admin/signatures?tab=templates" : "/admin/signatures");
}

// ---------- Team: file a document that was already signed ----------

export async function uploadSigned(_: CreateState, f: FormData): Promise<CreateState> {
  const admin = await requireAdmin();
  const kind = s(f, "kind") ?? "NDA";
  if (!isDocKind(kind)) return { error: "Pick a document type." };
  const signer = await loadSigner(s(f, "signer") ?? "");
  if (!signer) return { error: "Choose whose document this is." };
  const upload = f.get("file");
  if (!(upload instanceof File) || !upload.size) return { error: "Choose the signed file." };
  if (upload.size > MAX_PDF) return { error: "That file is over 4.4 MB. Compress it, or upload it to the listing's data room." };
  const bytes = new Uint8Array(await upload.arrayBuffer());
  const name = cleanName(upload.name) || "Signed document.pdf";
  const contentType = upload.type || "application/octet-stream";
  const projectId = s(f, "projectId");
  const signedOn = s(f, "signedAt");
  const signedAt = signedOn && !Number.isNaN(Date.parse(signedOn)) ? new Date(`${signedOn}T12:00:00Z`) : new Date();
  let key: string;
  try { key = await saveGenerated("esign", name, bytes, contentType); } catch (e) { return { error: (e as Error).message }; }
  const hash = sha256(bytes);
  const r = await db.signatureRequest.create({
    data: {
      title: s(f, "title") ?? name.replace(/\.[^.]+$/, ""), kind, projectId, source: "UPLOADED", status: "SIGNED", sourceName: name, sourceKey: key, sourceHash: hash,
      signedKey: key, signedName: name, signedType: contentType, signedHash: hash, signedAt, message: s(f, "notes"),
      autoApprove: f.get("autoApprove") === "on", createdBy: admin.name, createdById: admin.id, ...signerLink(signer),
    },
  });
  await logEvent(r.id, "UPLOADED", `Signed copy filed by ${admin.name} (signed ${signedAt.toISOString().slice(0, 10)})`, admin.name, await requestMeta());
  if (projectId) {
    const fileId = await fileInDataRoom(projectId, name, bytes, contentType, admin.name);
    await db.signatureRequest.update({ where: { id: r.id }, data: { signedFileId: fileId } });
    await logEvent(r.id, "DATA_ROOM", "Copy saved to the listing's data room (Signed Documents)", admin.name);
  }
  await logOnRecord(r, `Signed ${kindLabel(kind)} "${r.title}" filed by ${admin.name}.`, admin.name);
  const effect = await applySignedEffects(r, admin.name);
  if (effect) await logEvent(r.id, "UNLOCKED", effect, admin.name);
  refresh();
  revalidatePath("/admin/lois");
  redirect(`/admin/signatures/${r.id}`);
}

// ---------- Signer ----------

export type SignState = { error?: string; missing?: string[]; ok?: boolean } | undefined;

export async function signRequest(_: SignState, f: FormData): Promise<SignState> {
  const found = await findForSigner({ token: s(f, "token"), id: s(f, "id") });
  if (!found) return { error: "This signing link isn't valid any more." };
  if (found.expired) return { error: "This signing link has expired. Ask the DEAC team for a new one." };
  const r = found.request;
  if (!isOpen(r.status)) return { error: r.status === "SIGNED" ? "This document is already signed." : "This document is no longer available to sign." };
  const parties = await loadParties(r);
  const me = parties.find((p) => p.slot === found.slot);
  if (!me) return { error: "This signing link isn't valid any more." };
  if (me.signed) return { ok: true };
  if (!dueSlots(parties).includes(me.slot)) return { error: "It isn't your turn to sign yet. We'll email you when it is." };
  if (f.get("consent") !== "on") return { error: "Please confirm you agree to sign electronically." };
  const allFields = parseFields(r.fields, r.pageCount);
  const fields = fieldsFor(allFields, me.slot);
  let raw: SignValues;
  try { raw = JSON.parse(String(f.get("values") ?? "{}")); } catch { return { error: "Your details couldn't be read. Reload the page and try again." }; }
  const values = cleanValues(fields, raw);
  const missing = missingValues(fields, values);
  if (missing.length) return { error: `Please complete: ${missing.join(", ")}.`, missing };

  const signedAt = new Date();
  const meta = await requestMeta();
  const signerName = values.name ?? me.name ?? "Signer";
  const asRole = parties.length > 1 ? ` (${me.role})` : "";
  const after = parties.map((p) => (p.slot === me.slot ? { ...p, signed: true, values, signedAt, name: signerName } : p));
  const last = allSigned(after);
  await logEvent(r.id, "SIGNED", `Signed as ${signerName}${values.title ? `, ${values.title}` : ""}${asRole}`, signerName, meta);

  // The last signature completes the document: build the final PDF first, so a failure leaves nothing half-done.
  let pdf: Uint8Array | null = null;
  if (last) {
    pdf = await finalPdf(r, allFields, after, signedAt);
    if (!pdf) {
      await db.signatureEvent.deleteMany({ where: { requestId: r.id, action: "SIGNED", createdAt: { gte: signedAt } } });
      return { error: "We couldn't produce the signed document. Please try again, or contact the DEAC team." };
    }
  }

  // Record this signature (only one submit wins if the signer double-clicks).
  const json = JSON.stringify(values);
  const recorded = me.cosigner
    ? await db.signatureSigner.updateMany({ where: { id: me.cosigner.id, status: { in: ["SENT", "VIEWED"] } }, data: { status: "SIGNED", signedAt, values: json } })
    : await db.signatureRequest.updateMany({ where: { id: r.id, recipientSignedAt: null, status: { in: ["SENT", "VIEWED"] } }, data: { recipientSignedAt: signedAt, values: json } });
  if (!recorded.count) return { ok: true };
  if (f.get("saveProfile") === "on") {
    if (me.cosigner) await saveProfile({ investorId: me.cosigner.investorId, contactId: me.cosigner.contactId, agentId: me.cosigner.signerType === "AGENT" ? me.cosigner.userId : null }, values);
    else await saveProfile(r, values);
  }
  if (me.cosigner) {
    if (me.cosigner.investorId || me.cosigner.contactId) await logOnRecord({ investorId: me.cosigner.investorId, contactId: me.cosigner.contactId, projectId: r.projectId }, `E-signed ${kindLabel(r.kind)} "${r.title}" as ${signerName}${asRole}.`, signerName);
  } else await logOnRecord(r, `E-signed ${kindLabel(r.kind)} "${r.title}" as ${signerName}${asRole}.`, signerName);

  if (last && pdf) await complete(r, after, pdf, signedAt);
  else await sendDueLinks(r.id);
  refresh(r.id);
  revalidatePath("/admin/lois");
  revalidatePath("/portal");
  if (r.projectId) revalidatePath(`/marketplace/${r.projectId}`);
  return { ok: true };
}

type Req = NonNullable<Awaited<ReturnType<typeof db.signatureRequest.findUnique>>>;

/** The final PDF: every signer's fields stamped, plus a certificate listing all signers and the audit trail. */
async function finalPdf(r: Req, fields: ReturnType<typeof parseFields>, parties: Party[], completedAt: Date) {
  const original = await readPdf(r.sourceKey);
  if (!original) return null;
  const events = await db.signatureEvent.findMany({ where: { requestId: r.id }, orderBy: { createdAt: "asc" } });
  try {
    return await buildSignedPdf(original, fields, parties.map((p) => ({ slot: p.slot, values: p.values, signedAt: p.signedAt ?? completedAt })), completedAt, {
      requestId: r.id, title: r.title, sourceName: r.sourceName, sourceHash: r.sourceHash, consent: CONSENT_TEXT, sentBy: r.createdBy,
      signers: parties.map((p) => ({ name: p.values.name ?? p.name, email: p.email ?? p.values.email ?? "", company: p.values.company ?? p.company, kind: p.kind, role: parties.length > 1 ? p.role : null, signedAt: p.signedAt ?? completedAt })),
      events: events.map((e) => ({ at: e.createdAt, action: e.action, detail: e.detail, ip: e.ip, userAgent: e.userAgent })),
    });
  } catch (e) {
    console.error("Signed PDF failed", e);
    return null;
  }
}

/** Everyone has signed: store the final PDF, file it, apply the NDA/LOI effects and tell the team and the signers. */
async function complete(r: Req, parties: Party[], pdf: Uint8Array, signedAt: Date) {
  const recipient = parties.find((p) => p.slot === 0)!;
  const recipientName = recipient.values.name ?? recipient.name;
  const name = signedFileName(r.title, recipientName);
  const signedKey = await saveGenerated("esign", name, pdf, "application/pdf");
  const keep = new Date(Date.now() + 30 * 86_400_000);
  const done = await db.signatureRequest.updateMany({
    where: { id: r.id, status: { in: ["SENT", "VIEWED"] } },
    data: { status: "SIGNED", signedAt, signedKey, signedName: name, signedType: "application/pdf", signedHash: sha256(pdf), tokenExpiresAt: keep },
  });
  if (!done.count) return;
  // Every signer can download the final copy from their link for 30 more days.
  await db.signatureSigner.updateMany({ where: { requestId: r.id, tokenHash: { not: null } }, data: { tokenExpiresAt: keep } });
  if (parties.length > 1) await logEvent(r.id, "COMPLETED", `All ${parties.length} signers signed`);
  if (r.projectId) {
    const fileId = await fileInDataRoom(r.projectId, name, pdf, "application/pdf", "E-signature");
    await db.signatureRequest.update({ where: { id: r.id }, data: { signedFileId: fileId } });
    await logEvent(r.id, "DATA_ROOM", "Signed copy saved to the listing's data room (Signed Documents)");
  }
  const effect = await applySignedEffects({ ...r, values: JSON.stringify(recipient.values) }, "E-signature");
  if (effect) await logEvent(r.id, "UNLOCKED", effect);

  const who = parties.map((p) => `${p.values.name ?? p.name}${p.company ? ` (${p.company})` : ""}`).join(" and ");
  await notifyTeam(r, `Signed: ${r.title} — ${recipientName}`, `${who} ${parties.length > 1 ? "have all signed" : "signed"} "${r.title}".${effect ? ` ${effect}.` : ""}`);
  for (const p of parties) {
    if (!p.email || p.cosigner?.signerType === "TEAM") continue;
    const first = (p.values.name ?? p.name).split(" ")[0];
    const investorId = p.cosigner ? p.cosigner.investorId : r.investorId;
    const unlocked = p.slot === 0 && effect && r.autoApprove && r.projectId;
    await sendEmail({
      to: p.email, toName: p.name, investorId, subject: `Signed: ${r.title}`,
      text: `Hi ${first},\n\n${parties.length > 1 ? `Everyone has now signed "${r.title}".` : `Thank you for signing "${r.title}".`} You can download your signed copy from the same link for 30 days${investorId ? ", and any time from My Portal" : ""}.${unlocked ? "\n\nThe confidential details of the listing are now open to you in the DEAC Marketplace." : ""}\n\n— DEAC Team`,
    });
  }
}

/** Saves the address and phone the signer confirmed back onto their CRM record (empty answers never erase anything). */
async function saveProfile(r: { investorId: string | null; contactId: string | null; agentId: string | null }, v: SignValues) {
  const data = Object.fromEntries(Object.entries({ title: v.title, street: v.street, city: v.city, region: v.region, postalCode: v.postalCode, country: v.country, phone: v.phone }).filter(([, x]) => x)) as Record<string, string>;
  if (r.investorId) await db.investor.update({ where: { id: r.investorId }, data });
  else if (r.contactId) await db.contact.update({ where: { id: r.contactId }, data });
  else if (r.agentId && data.phone) await db.user.update({ where: { id: r.agentId }, data: { phone: data.phone } });
}

export async function declineRequest(_: SignState, f: FormData): Promise<SignState> {
  const found = await findForSigner({ token: s(f, "token"), id: s(f, "id") });
  if (!found || found.expired) return { error: "This signing link isn't valid any more." };
  const r = found.request;
  if (!isOpen(r.status)) return { error: "This document is no longer open." };
  const reason = s(f, "reason");
  const c = found.cosigner;
  const name = c ? (c.name ?? c.role) : r.signerName;
  await db.signatureRequest.update({ where: { id: r.id }, data: { status: "DECLINED", declineReason: reason } });
  if (c) await db.signatureSigner.update({ where: { id: c.id }, data: { status: "DECLINED" } });
  await logEvent(r.id, "DECLINED", `${c ? `${c.role}: ` : ""}${reason ?? ""}`.trim() || null, name, await requestMeta());
  await logOnRecord(r, `${c ? `${name} (${c.role}) declined` : "Declined"} to sign ${kindLabel(r.kind)} "${r.title}"${reason ? `: ${reason}` : "."}`, name);
  await notifyTeam(r, `Declined: ${r.title} — ${name}`, `${name}${c ? ` (${c.role})` : ""} declined to sign "${r.title}".${reason ? ` Reason: ${reason}` : ""}`);
  refresh(r.id);
  return { ok: true };
}

/**
 * Listing NDA step: the investor opens the listing's NDA template (or the default NDA template) to sign it themselves.
 * Reuses their open request for this listing if there is one.
 */
export async function startListingNda(f: FormData) {
  const u = await currentUser();
  if (!u?.investorId || u.status !== "APPROVED") redirect("/login");
  const projectId = String(f.get("projectId"));
  const open = await db.signatureRequest.findFirst({ where: { investorId: u.investorId, projectId, kind: "NDA", status: { in: ["SENT", "VIEWED"] }, isTemplate: false }, orderBy: { createdAt: "desc" } });
  if (open) redirect(`/portal/sign/${open.id}`);
  const t = await listingNdaTemplate(projectId);
  if (!t) redirect(`/marketplace/${projectId}?tab=loi`);
  const bytes = await readPdf(t.sourceKey);
  if (!bytes) redirect(`/marketplace/${projectId}?tab=loi`);
  const signer = await loadSigner(`INVESTOR:${u.investorId}`);
  if (!signer) redirect("/login");
  const sourceKey = await saveGenerated("esign", t.sourceName, bytes, "application/pdf");
  const r = await db.signatureRequest.create({
    data: {
      templateId: t.id, title: t.title, kind: "NDA", projectId, sourceName: t.sourceName, sourceKey, sourceHash: t.sourceHash, pageCount: t.pageCount, fields: t.fields,
      message: t.message, autoApprove: t.autoApprove, signOrder: t.signOrder, status: "SENT", sentAt: new Date(), createdBy: "Listing NDA (self-serve)", ...signerLink(signer),
    },
  });
  await copyCosigners(t.id, r.id);
  await logEvent(r.id, "CREATED", `Opened from the listing's NDA step (template "${t.title}")`, signer.name, await requestMeta());
  await sendDueLinks(r.id, { skipRecipient: true });
  refresh();
  redirect(`/portal/sign/${r.id}`);
}

/**
 * Saves a document (draft, sent or signed) or a template as a new template: same PDF, fields, additional signers
 * (e.g. the DEAC countersigner) and settings, ready to send again. What anyone typed or signed is not copied.
 */
export async function saveAsTemplate(f: FormData) {
  const admin = await requireAdmin();
  const src = await db.signatureRequest.findUnique({ where: { id: String(f.get("id")) } });
  if (!src || src.source !== "ESIGN") return;
  const bytes = await readPdf(src.sourceKey);
  if (!bytes) return;
  const sourceKey = await saveGenerated("esign", src.sourceName, bytes, "application/pdf");
  const title = s(f, "title")?.slice(0, 200) ?? (src.isTemplate ? `${src.title} (copy)` : src.title);
  const t = await db.signatureRequest.create({
    data: {
      isTemplate: true, status: "TEMPLATE", title, kind: src.kind, projectId: src.projectId, sourceName: src.sourceName, sourceKey, sourceHash: src.sourceHash,
      pageCount: src.pageCount, fields: src.fields, message: src.message, autoApprove: src.autoApprove, signOrder: src.signOrder, createdBy: admin.name, createdById: admin.id,
    },
  });
  await copyCosigners(src.id, t.id);
  await logEvent(t.id, "CREATED", `Template saved from ${src.isTemplate ? "template" : "document"} "${src.title}"`, admin.name);
  refresh();
  redirect(`/admin/signatures/${t.id}?saved=1`);
}
