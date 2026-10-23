import "server-only";

/** Sends through Resend when RESEND_API_KEY is set; otherwise logs (status LOGGED) so the flow works in dev. */
export async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }): Promise<{ status: "SENT" | "LOGGED" | "FAILED"; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email:dev] to=${to} subject=${subject}`);
    return { status: "LOGGED" };
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.OUTREACH_FROM ?? "DEAC Marketplace <invest@deacna.com>", to, subject, text }),
    });
    return r.ok ? { status: "SENT" } : { status: "FAILED", error: `${r.status} ${await r.text()}`.slice(0, 300) };
  } catch (e) {
    return { status: "FAILED", error: String(e).slice(0, 300) };
  }
}
