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
import { applySignedEffects, emailSignLink, notifyTeam, fileInDataRoom, findForSigner, issueLink, listingNdaTemplate, loadSigner, logEvent, logOnRecord, readPdf, requestMeta, signerKindLabel, signerLink } from "@/lib/esign-db";
import { CONSENT_TEXT, cleanValues, isDocKind, isOpen, kindLabel, missingValues, normalizeFields, parseFields, signedFileName, type SignValues } from "@/lib/esign";

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

  let bytes: Uint8Array | null = null, sourceName = "", fields = "[]", from: { kind: string; message: string | null; autoApprove: boolean; projectId: string | null; title: string } | null = null;
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
      status: asTemplate ? "TEMPLATE" : "DRAFT", createdBy: admin.name, createdById: admin.id,
      ...(signerProfile ? signerLink(signerProfile) : {}),
    },
  });
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
  let fields;
  try { fields = normalizeFields(JSON.parse(String(f.get("fields") ?? "[]")), r.pageCount); } catch { return { error: "The fields couldn't be read." }; }
  const kind = s(f, "kind") ?? r.kind;
  await db.signatureRequest.update({
    where: { id: r.id },
    data: {
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

export type SendState = { error?: string; sent?: { name: string; email: string | null; link: string; emailed: boolean; id: string }[] } | undefined;

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
  const signers = [];
  for (const ref of refs) {
    const p = await loadSigner(ref);
    if (!p) return { error: "One of the signers no longer exists." };
    if (!p.email) return { error: `${p.name} has no email address on their record. Add one first.` };
    signers.push(p);
  }
  const meta = await requestMeta();
  const sent: NonNullable<SendState>["sent"] = [];
  for (const [i, p] of signers.entries()) {
    let id = src.id;
    if (src.isTemplate || i > 0) {
      const bytes = await readPdf(src.sourceKey);
      if (!bytes) return { error: "The PDF couldn't be read from storage.", sent };
      const sourceKey = await saveGenerated("esign", src.sourceName, bytes, "application/pdf");
      const copy = await db.signatureRequest.create({
        data: {
          templateId: src.isTemplate ? src.id : src.templateId, title: src.title, kind: src.kind, projectId: src.projectId, sourceName: src.sourceName, sourceKey, sourceHash: src.sourceHash,
          pageCount: src.pageCount, fields: src.fields, message: src.message, autoApprove: src.autoApprove, createdBy: admin.name, createdById: admin.id, status: "DRAFT",
        },
      });
      await logEvent(copy.id, "CREATED", src.isTemplate ? `From template "${src.title}"` : "Copy for an additional signer", admin.name);
      id = copy.id;
    }
    const r = await db.signatureRequest.update({ where: { id }, data: { ...signerLink(p), status: "SENT", sentAt: new Date() } });
    const link = await issueLink(id);
    const emailed = await emailSignLink(r, link, admin);
    await logEvent(id, "SENT", `To ${p.name} <${p.email}>${emailed ? " by email" : " (link shared by the team)"}`, admin.name, meta);
    await logOnRecord(r, `${kindLabel(r.kind)} "${r.title}" sent for e-signature by ${admin.name}.`, admin.name);
    sent.push({ id, name: p.name, email: p.email, link, emailed });
  }
  refresh(src.id);
  return { sent };
}

/** A new signing link for an open request (the old one stops working). */
export async function renewLink(_: SendState, f: FormData): Promise<SendState> {
  const admin = await requireAdmin();
  const r = await db.signatureRequest.findUnique({ where: { id: String(f.get("id")) } });
  if (!r || !isOpen(r.status)) return { error: "Only a request waiting for a signature can get a new link." };
  const link = await issueLink(r.id);
  const emailed = f.get("email") === "on" ? await emailSignLink(r, link, admin) : false;
  await logEvent(r.id, "LINK_RENEWED", emailed ? "New link emailed" : "New link created", admin.name, await requestMeta());
  refresh(r.id);
  return { sent: [{ id: r.id, name: r.signerName ?? "", email: r.signerEmail, link, emailed }] };
}

export async function voidRequest(f: FormData) {
  const admin = await requireAdmin();
  const r = await db.signatureRequest.findUnique({ where: { id: String(f.get("id")) } });
  if (!r || !isOpen(r.status)) return;
  await db.signatureRequest.update({ where: { id: r.id }, data: { status: "VOIDED", tokenHash: null } });
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
  if (f.get("consent") !== "on") return { error: "Please confirm you agree to sign electronically." };
  const fields = parseFields(r.fields, r.pageCount);
  let raw: SignValues;
  try { raw = JSON.parse(String(f.get("values") ?? "{}")); } catch { return { error: "Your details couldn't be read. Reload the page and try again." }; }
  const values = cleanValues(fields, raw);
  const missing = missingValues(fields, values);
  if (missing.length) return { error: `Please complete: ${missing.join(", ")}.`, missing };

  const original = await readPdf(r.sourceKey);
  if (!original) return { error: "The document couldn't be loaded. Please try again in a minute." };
  const signedAt = new Date();
  const meta = await requestMeta();
  const signerName = values.name ?? r.signerName ?? "Signer";
  await logEvent(r.id, "SIGNED", `Signed as ${signerName}${values.title ? `, ${values.title}` : ""}`, signerName, meta);
  const events = await db.signatureEvent.findMany({ where: { requestId: r.id }, orderBy: { createdAt: "asc" } });
  let pdf: Uint8Array;
  try {
    pdf = await buildSignedPdf(original, fields, values, signedAt, {
      requestId: r.id, title: r.title, sourceName: r.sourceName, sourceHash: r.sourceHash, consent: CONSENT_TEXT, sentBy: r.createdBy,
      signer: { name: signerName, email: r.signerEmail ?? values.email ?? "", company: values.company ?? r.signerCompany, kind: signerKindLabel(r.signerType) },
      events: events.map((e) => ({ at: e.createdAt, action: e.action, detail: e.detail, ip: e.ip, userAgent: e.userAgent })),
    });
  } catch (e) {
    console.error("Signed PDF failed", e);
    await db.signatureEvent.deleteMany({ where: { requestId: r.id, action: "SIGNED", createdAt: { gte: signedAt } } });
    return { error: "We couldn't produce the signed document. Please try again, or contact the DEAC team." };
  }
  const name = signedFileName(r.title, signerName);
  const signedKey = await saveGenerated("esign", name, pdf, "application/pdf");
  // Only one submit wins if the signer double-clicks.
  const done = await db.signatureRequest.updateMany({
    where: { id: r.id, status: { in: ["SENT", "VIEWED"] } },
    data: { status: "SIGNED", signedAt, values: JSON.stringify(values), signedKey, signedName: name, signedType: "application/pdf", signedHash: sha256(pdf), tokenExpiresAt: new Date(Date.now() + 30 * 86_400_000) },
  });
  if (!done.count) return { ok: true };

  if (f.get("saveProfile") === "on") await saveProfile(r, values);
  if (r.projectId) {
    const fileId = await fileInDataRoom(r.projectId, name, pdf, "application/pdf", "E-signature");
    await db.signatureRequest.update({ where: { id: r.id }, data: { signedFileId: fileId } });
    await logEvent(r.id, "DATA_ROOM", "Signed copy saved to the listing's data room (Signed Documents)");
  }
  await logOnRecord(r, `E-signed ${kindLabel(r.kind)} "${r.title}" as ${signerName}.`, signerName);
  const effect = await applySignedEffects({ ...r, values: JSON.stringify(values) }, "E-signature");
  if (effect) await logEvent(r.id, "UNLOCKED", effect);

  await notifyTeam(r, `Signed: ${r.title} — ${signerName}`, `${signerName}${r.signerCompany ? ` (${r.signerCompany})` : ""} signed "${r.title}".${effect ? ` ${effect}.` : ""}`);
  if (r.signerEmail) await sendEmail({ to: r.signerEmail, toName: signerName, investorId: r.investorId, subject: `Signed: ${r.title}`, text: `Hi ${signerName.split(" ")[0]},\n\nThank you for signing "${r.title}". You can download your signed copy from the same link for 30 days${r.investorId ? ", and any time from My Portal" : ""}.${effect && r.autoApprove && r.projectId ? "\n\nThe confidential details of the listing are now open to you in the DEAC Marketplace." : ""}\n\n— DEAC Team` });
  refresh(r.id);
  revalidatePath("/admin/lois");
  revalidatePath("/portal");
  if (r.projectId) revalidatePath(`/marketplace/${r.projectId}`);
  return { ok: true };
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
  await db.signatureRequest.update({ where: { id: r.id }, data: { status: "DECLINED", declineReason: reason } });
  await logEvent(r.id, "DECLINED", reason, r.signerName, await requestMeta());
  await logOnRecord(r, `Declined to sign ${kindLabel(r.kind)} "${r.title}"${reason ? `: ${reason}` : "."}`, r.signerName);
  await notifyTeam(r, `Declined: ${r.title} — ${r.signerName}`, `${r.signerName} declined to sign "${r.title}".${reason ? ` Reason: ${reason}` : ""}`);
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
      message: t.message, autoApprove: t.autoApprove, status: "SENT", sentAt: new Date(), createdBy: "Listing NDA (self-serve)", ...signerLink(signer),
    },
  });
  await logEvent(r.id, "CREATED", `Opened from the listing's NDA step (template "${t.title}")`, signer.name, await requestMeta());
  refresh();
  redirect(`/portal/sign/${r.id}`);
}
