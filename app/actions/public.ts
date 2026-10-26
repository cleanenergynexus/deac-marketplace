"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { checkPassword, endSession, hashPassword, startSession } from "@/lib/auth";

const s = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() || null;
const n = (f: FormData, k: string) => { const v = s(f, k); return v ? Number(v.replace(/[$,]/g, "")) : null; };
const list = (f: FormData, k: string) => f.getAll(k).map(String).filter(Boolean).join(",");

export async function login(_: unknown, f: FormData) {
  const email = s(f, "email")?.toLowerCase();
  const user = email ? await db.user.findUnique({ where: { email } }) : null;
  if (!user || !(await checkPassword(String(f.get("password") ?? ""), user.passwordHash))) return { error: "Email or password is incorrect." };
  await startSession({ uid: user.id, role: user.role as "ADMIN", status: user.status, name: user.name });
  const next = s(f, "next");
  if (user.role === "ADMIN") redirect(next?.startsWith("/") ? next : "/admin");
  if (user.status !== "APPROVED") redirect("/pending");
  redirect(next?.startsWith("/") ? next : "/marketplace");
}

export async function logout() {
  await endSession();
  redirect("/");
}

/** Investor membership application. Creates a CRM record (stage APPLIED) and a pending login. */
export async function applyForAccess(_: unknown, f: FormData) {
  const email = s(f, "email")?.toLowerCase();
  const password = String(f.get("password") ?? "");
  if (!email || password.length < 8) return { error: "Email and a password of at least 8 characters are required." };
  if (await db.user.findUnique({ where: { email } })) return { error: "An account with this email already exists. Please sign in." };

  const data = {
    name: s(f, "name") ?? email,
    firm: s(f, "firm"),
    title: s(f, "title"),
    phone: s(f, "phone"),
    investorType: s(f, "investorType"),
    checkMin: n(f, "checkMin"),
    checkMax: n(f, "checkMax"),
    mwMin: n(f, "mwMin"),
    mwMax: n(f, "mwMax"),
    preferredStates: list(f, "states"),
    dealTypes: list(f, "dealTypes"),
    facilityTypes: list(f, "facilityTypes"),
    accredited: f.get("accredited") === "on",
    source: s(f, "source") ?? "Website application",
    notes: s(f, "notes"),
    stage: "APPLIED",
  };
  const investor = await db.investor.upsert({ where: { email }, create: { email, ...data }, update: data });
  const user = await db.user.create({ data: { email, name: data.name, passwordHash: await hashPassword(password), role: "INVESTOR", status: "PENDING", investorId: investor.id } });
  await db.activity.create({ data: { investorId: investor.id, kind: "SYSTEM", body: "Submitted membership application via website." } });
  await startSession({ uid: user.id, role: "INVESTOR", status: "PENDING", name: user.name });
  redirect("/pending");
}

/** Developer project submission → Developer CRM lead + draft listing for the team to score. */
export async function submitProject(_: unknown, f: FormData) {
  const email = s(f, "email")?.toLowerCase();
  const company = s(f, "company");
  if (!email || !company || !s(f, "state") || !n(f, "mw")) return { error: "Company, email, state and MW are required." };

  let dev = await db.developer.findFirst({ where: { email } });
  if (!dev) dev = await db.developer.create({ data: { company, contactName: s(f, "contactName") ?? "", email, phone: s(f, "phone"), website: s(f, "website"), experience: s(f, "experience"), source: "Website submission" } });

  const count = await db.project.count();
  const state = s(f, "state")!.toUpperCase();
  await db.project.create({
    data: {
      code: `DEAC-${state}-${String(count + 1).padStart(3, "0")}`,
      title: s(f, "title") ?? `${n(f, "mw")} MW ${s(f, "facilityType") ?? "Data Center"} – ${state}`,
      developerId: dev.id,
      state,
      city: s(f, "city"),
      mw: n(f, "mw")!,
      facilityType: s(f, "facilityType") ?? "Powered Land",
      dealType: s(f, "dealType") ?? "FINANCING",
      fundingNeeded: n(f, "fundingNeeded") ?? 0,
      projectStatus: s(f, "projectStatus") ?? "Site Control",
      summary: s(f, "summary") ?? "",
      powerStatus: s(f, "powerStatus"),
      monthsToPower: n(f, "monthsToPower") ?? undefined,
      powerRateCents: n(f, "powerRateCents"),
      visibility: "DRAFT",
    },
  });
  await db.activity.create({ data: { developerId: dev.id, kind: "SYSTEM", body: `Submitted project "${s(f, "title") ?? state}" via website.` } });
  redirect("/developers/thanks");
}

/** First-run admin creation; refuses once any admin exists or if the token is wrong. */
export async function createFirstAdmin(_: unknown, f: FormData) {
  const token = process.env.SETUP_TOKEN;
  if (!token || String(f.get("token")) !== token) return { error: "Setup token is incorrect." };
  if ((await db.user.count({ where: { role: "ADMIN" } })) > 0) return { error: "An admin already exists. Please sign in." };
  const email = s(f, "email")?.toLowerCase();
  const password = String(f.get("password") ?? "");
  if (!email || password.length < 10) return { error: "Email and a password of at least 10 characters are required." };
  const user = await db.user.create({ data: { email, name: s(f, "name") ?? email, passwordHash: await hashPassword(password), role: "ADMIN", status: "APPROVED" } });
  await startSession({ uid: user.id, role: "ADMIN", status: "APPROVED", name: user.name });
  redirect("/admin");
}
