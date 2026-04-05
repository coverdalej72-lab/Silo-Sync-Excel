/**
 * Adds 4 more shed pair sheets to feed-program.xlsx by duplicating SHED 11 & 12.
 * New sheets: SHED 13 & 14, SHED 15 & 16, SHED 17 & 18, SHED 19 & 20.
 * Run: node scripts/add-shed-sheets.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import JSZip from "jszip";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const xlsxPath = join(__dir, "../public/feed-program.xlsx");

const buf = readFileSync(xlsxPath);
const zip = await JSZip.loadAsync(buf);

// --- Read workbook XMLs ---
let wbXml = await zip.file("xl/workbook.xml").async("string");
let relsXml = await zip.file("xl/_rels/workbook.xml.rels").async("string");

// Find SHED 11 & 12's rId from workbook.xml (it's rId7 -> sheet7.xml)
// We'll copy sheet7.xml for all new sheets.
const sourceSheetFile = "xl/worksheets/sheet7.xml";
const sourceSheetXml = await zip.file(sourceSheetFile).async("string");

// New sheets to add
const newSheets = [
  { name: "SHED 13 & 14", xmlName: "SHED 13 &amp; 14", rId: "rId18", file: "sheet10.xml", sheetId: "60" },
  { name: "SHED 15 & 16", xmlName: "SHED 15 &amp; 16", rId: "rId19", file: "sheet11.xml", sheetId: "61" },
  { name: "SHED 17 & 18", xmlName: "SHED 17 &amp; 18", rId: "rId20", file: "sheet12.xml", sheetId: "62" },
  { name: "SHED 19 & 20", xmlName: "SHED 19 &amp; 20", rId: "rId21", file: "sheet13.xml", sheetId: "63" },
];

// Add new worksheet files (copies of sheet7.xml)
for (const s of newSheets) {
  zip.file(`xl/worksheets/${s.file}`, sourceSheetXml);
  console.log(`Created xl/worksheets/${s.file} (${s.name})`);
}

// Insert new <sheet> entries into workbook.xml before </sheets>
const newSheetEntries = newSheets
  .map(s => `<sheet name="${s.xmlName}" sheetId="${s.sheetId}" r:id="${s.rId}"/>`)
  .join("");
wbXml = wbXml.replace("</sheets>", `${newSheetEntries}</sheets>`);
zip.file("xl/workbook.xml", wbXml);
console.log("Updated xl/workbook.xml");

// Insert new <Relationship> entries into _rels before </Relationships>
const WS_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
const newRelEntries = newSheets
  .map(s => `<Relationship Id="${s.rId}" Type="${WS_TYPE}" Target="worksheets/${s.file}"/>`)
  .join("");
relsXml = relsXml.replace("</Relationships>", `${newRelEntries}</Relationships>`);
zip.file("xl/_rels/workbook.xml.rels", relsXml);
console.log("Updated xl/_rels/workbook.xml.rels");

// Save
const out = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 6 },
});
writeFileSync(xlsxPath, out);
console.log(`\nSaved updated XLSX to ${xlsxPath}`);
console.log("New tabs added: SHED 13 & 14, SHED 15 & 16, SHED 17 & 18, SHED 19 & 20");
