/**
 * Silo Mate – Feed Program Colour Remap
 *
 * Takes the original source file and produces an app-themed version by:
 *   1. Remapping ONLY the cells that already have a fill colour
 *   2. Setting rotating tab colours per shed (matching the reference file pattern)
 *   3. Touching NOTHING else — fonts, sizes, borders, merges, widths, heights,
 *      alignment, numFmt, formulas are all left exactly as they were
 *
 * Original fill → App fill mapping
 *   FFFFFF00  (bright yellow)  → FFFFC000  (app amber)
 *   FF92D050  (lime green)     → FF217346  (app primary green)
 *   FFFF0000  (red bg)         → FFFFC000  (app amber)
 *   FFC00000  (dark red bg)    → FF1A5C36  (app dark green)
 *   any other existing fill    → kept as-is
 */
import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "../../attached_assets/feed_program_batch_120_1775355933095.xlsx");
const OUT = path.join(__dirname, "public/silo-mate-feed-program.xlsx");

const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

// ── Fill remap table ──────────────────────────────────────────────────────────
const FILL_MAP = {
  "FFFFFF00": "FFFFC000",  // bright yellow  → app amber
  "FF92D050": "FF217346",  // lime green     → app primary green
  "FFFF0000": "FFFFC000",  // red bg         → app amber (Silo A header)
  "FFC00000": "FF1A5C36",  // dark red bg    → app dark green
};

// ── Tab colours: rotate green / blue / amber across the 6 shed pairs ─────────
// (matches the reference file's rotating pattern, but using app palette)
const SHED_TAB_COLORS = [
  "FF217346",  // Shed 1 & 2  – app green
  "FF0070C0",  // Shed 3 & 4  – blue (kept, matches reference)
  "FFFFC000",  // Shed 5 & 6  – app amber
  "FF217346",  // Shed 7 & 8  – app green
  "FF0070C0",  // Shed 9 & 10 – blue
  "FFFFC000",  // Shed 11 & 12– app amber
];

let shedIndex = 0;

function remapSheet(ws) {
  ws.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.type === ExcelJS.ValueType.Merge) return;
      const origArgb = cell.fill?.fgColor?.argb;
      if (origArgb && FILL_MAP[origArgb]) {
        cell.fill = solid(FILL_MAP[origArgb]);
      }
      // If no fill → leave as-is (do NOT add any background)
    });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SRC);

for (const ws of wb.worksheets) {
  const n = ws.name.trim().toUpperCase();

  if (n.includes("STOCK") || n.includes("CONSUMPTION") || n.includes("GUIDE")) {
    ws.state = "hidden";
    console.log(`⊘ Hidden:  ${ws.name.trim()}`);
    continue;
  }

  if (n.includes("SHED")) {
    remapSheet(ws);
    ws.properties = ws.properties ?? {};
    ws.properties.tabColor = { argb: SHED_TAB_COLORS[shedIndex % SHED_TAB_COLORS.length] };
    shedIndex++;
    console.log(`✓ Shed:    ${ws.name.trim()}  tab:${ws.properties.tabColor.argb}`);
    continue;
  }

  if (n.includes("END") || n.includes("BATCH")) {
    remapSheet(ws);
    ws.properties = ws.properties ?? {};
    ws.properties.tabColor = { argb: "FF217346" };
    console.log(`✓ EOB:     ${ws.name.trim()}`);
    continue;
  }

  // Any other visible sheet — just remap fills
  remapSheet(ws);
  console.log(`  Other:   ${ws.name.trim()}`);
}

await wb.xlsx.writeFile(OUT);
console.log("Done →", OUT);
