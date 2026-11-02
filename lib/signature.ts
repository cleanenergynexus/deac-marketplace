// Team members' email signature (My account → Email signature). No database access here.

/**
 * Puts the sender's own signature at the end of an email. The app's emails end with a "— Name, DEAC" line; that line
 * is replaced. Text without one (e.g. an email written in the Activity box) gets the signature added below it.
 */
export function applySignature(text: string, signature: string | null | undefined): string {
  const sig = signature?.replace(/\r\n/g, "\n").trim();
  if (!sig) return text;
  const body = text.replace(/\n*\s*— [^\n]*\s*$/, "").trimEnd();
  if (body.endsWith(sig)) return body;
  return `${body}\n\n${sig}`;
}
