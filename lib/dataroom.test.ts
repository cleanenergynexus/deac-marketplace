import { test } from "node:test";
import assert from "node:assert/strict";
import { canMoveFolder, cleanName, descendantIds, docNameFromFile, fileKind, filePathLabel, folderPath, formatBytes, inlineSafe, storagePath, uniqueName, uploadDirs } from "./dataroom";

const folders = [
  { id: "a", parentId: null, name: "Power" },
  { id: "b", parentId: "a", name: "Interconnection" },
  { id: "c", parentId: "b", name: "Studies" },
  { id: "d", parentId: null, name: "Legal" },
];

test("cleans names", () => {
  assert.equal(cleanName("  Site / Plan\\v2 .pdf "), "Site - Plan-v2 .pdf");
  assert.equal(cleanName(".."), "");
  assert.equal(cleanName("   "), "");
  assert.equal(cleanName("a\u0000b"), "ab");
});

test("keeps both names like Explorer", () => {
  assert.equal(uniqueName("Report.pdf", []), "Report.pdf");
  assert.equal(uniqueName("Report.pdf", ["report.PDF"]), "Report (2).pdf");
  assert.equal(uniqueName("Report.pdf", ["Report.pdf", "Report (2).pdf"]), "Report (3).pdf");
  assert.equal(uniqueName("Legal", ["Legal"]), "Legal (2)");
  assert.equal(uniqueName(".env", [".env"]), ".env (2)");
});

test("folder paths and descendants", () => {
  assert.deepEqual(folderPath(folders, "c").map((f) => f.name), ["Power", "Interconnection", "Studies"]);
  assert.deepEqual(folderPath(folders, null), []);
  assert.equal(filePathLabel(folders, { id: "f", folderId: "b", name: "SIS.pdf" }), "Power / Interconnection / SIS.pdf");
  assert.deepEqual([...descendantIds(folders, "a")].sort(), ["a", "b", "c"]);
  // A broken parent loop doesn't hang.
  assert.equal(folderPath([{ id: "x", parentId: "y", name: "X" }, { id: "y", parentId: "x", name: "Y" }], "x").length, 2);
});

test("blocks moving a folder into itself or its subfolders", () => {
  assert.equal(canMoveFolder(folders, "a", "c"), false);
  assert.equal(canMoveFolder(folders, "a", "a"), false);
  assert.equal(canMoveFolder(folders, "b", "d"), true);
  assert.equal(canMoveFolder(folders, "c", null), true);
});

test("folder upload creates parents first", () => {
  assert.deepEqual(uploadDirs(["Room/Power/SIS.pdf", "Room/Legal/PSA.docx", "Room/Power/Studies/x.pdf", "top.pdf"]), [
    ["Room"], ["Room", "Power"], ["Room", "Legal"], ["Room", "Power", "Studies"],
  ]);
});

test("formatting and file kinds", () => {
  assert.equal(formatBytes(0), "0 KB");
  assert.equal(formatBytes(500), "1 KB");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(5.25 * 1024 * 1024), "5.3 MB");
  assert.equal(fileKind("Model.xlsx").label, "Spreadsheet");
  assert.equal(fileKind("site.KMZ").icon, "cad");
  assert.equal(fileKind("notes.abc").label, "ABC File");
  assert.equal(docNameFromFile("Phase I ESA.pdf"), "Phase I ESA");
  assert.equal(docNameFromFile("README"), "README");
});

test("only safe types open inline", () => {
  assert.equal(inlineSafe("application/pdf"), true);
  assert.equal(inlineSafe("image/png"), true);
  assert.equal(inlineSafe("image/svg+xml"), false);
  assert.equal(inlineSafe("text/html"), false);
});

test("storage paths are safe", () => {
  assert.equal(storagePath("p1", "Phase I ESA (final).pdf"), "data-room/p1/Phase-I-ESA-final.pdf");
  assert.equal(storagePath("p1", "../../etc"), "data-room/p1/etc");
  assert.equal(storagePath("p1", "日本"), "data-room/p1/file");
});
