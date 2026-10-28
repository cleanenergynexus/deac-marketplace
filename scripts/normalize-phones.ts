// Rewrites stored phone numbers into E.164 with their country code (lib/phone.ts).
// Numbers saved without a code are taken as being in the record's address country, or the US.
// Text that isn't recognisable as a number is left alone. Safe to run again; it runs on every build.
// Usage: npm run db:normalize-phones
import { PrismaClient } from "@prisma/client";
import { normalizePhone } from "../lib/phone";

async function main() {
  const db = new PrismaClient();
  let changed = 0;
  const fix = (v: string | null, iso?: string | null) => {
    const n = normalizePhone(v, iso ?? "US");
    return n !== v ? n : undefined;
  };
  try {
    for (const r of await db.investor.findMany({ where: { phone: { not: null } }, select: { id: true, phone: true } })) {
      const phone = fix(r.phone);
      if (phone !== undefined) { await db.investor.update({ where: { id: r.id }, data: { phone } }); changed++; }
    }
    for (const r of await db.developer.findMany({ where: { phone: { not: null } }, select: { id: true, phone: true, country: true } })) {
      const phone = fix(r.phone, r.country);
      if (phone !== undefined) { await db.developer.update({ where: { id: r.id }, data: { phone } }); changed++; }
    }
    for (const r of await db.contact.findMany({ where: { OR: [{ phone: { not: null } }, { mobile: { not: null } }] }, select: { id: true, phone: true, mobile: true, country: true } })) {
      const phone = fix(r.phone, r.country);
      const mobile = fix(r.mobile, r.country);
      if (phone !== undefined || mobile !== undefined) { await db.contact.update({ where: { id: r.id }, data: { phone, mobile } }); changed++; }
    }
    console.log(`Phone numbers: ${changed} record${changed === 1 ? "" : "s"} updated.`);
  } finally {
    await db.$disconnect();
  }
}

// Never fail a deploy over this; the screens format old numbers on display anyway.
main().catch((e) => console.warn("Phone normalization skipped:", e instanceof Error ? e.message : e));
