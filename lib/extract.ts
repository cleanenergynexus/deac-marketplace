import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { EXTRACTION_PROMPT, EXTRACTION_SCHEMA, type Extraction } from "@/lib/importer";

export const importerEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

export type SourceDoc =
  | { kind: "pdf"; base64: string; name: string }
  | { kind: "image"; base64: string; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; name: string }
  | { kind: "text"; text: string; name: string };

/** Sends the document(s) to Claude and returns the listing fields it found. */
export async function extractListing(docs: SourceDoc[]): Promise<Extraction> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const content: Anthropic.Beta.BetaContentBlockParam[] = docs.map((d) => {
    if (d.kind === "pdf") return { type: "document", title: d.name, source: { type: "base64", media_type: "application/pdf", data: d.base64 } };
    if (d.kind === "image") return { type: "image", source: { type: "base64", media_type: d.mediaType, data: d.base64 } };
    return { type: "document", title: d.name, source: { type: "text", media_type: "text/plain", data: d.text } };
  });
  content.push({ type: "text", text: "Extract the listing fields from the document above." });

  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // if the model declines, the API retries on a fallback model in the same call
    system: EXTRACTION_PROMPT,
    output_config: { effort: "medium", format: { type: "json_schema", schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") throw new Error("Claude declined to read this document.");
  if (response.stop_reason === "max_tokens") throw new Error("The document produced too much output. Try a shorter document.");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return JSON.parse(text) as Extraction;
}
