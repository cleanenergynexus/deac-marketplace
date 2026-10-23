// Create or reset a DEAC admin login in production.
// Usage: npm run create-admin -- you@deacna.com "Your Name" "a-strong-password"
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [email, name, password] = process.argv.slice(2);
if (!email || !name || !password || password.length < 10) {
  console.error('Usage: npm run create-admin -- email "Name" "password (10+ chars)"');
  process.exit(1);
}
async function main() {
const db = new PrismaClient();
const passwordHash = await bcrypt.hash(password, 10);
await db.user.upsert({
  where: { email: email.toLowerCase() },
  create: { email: email.toLowerCase(), name, passwordHash, role: "ADMIN", status: "APPROVED" },
  update: { name, passwordHash, role: "ADMIN", status: "APPROVED" },
});
console.log(`Admin ready: ${email}`);
await db.$disconnect();
}

main();
