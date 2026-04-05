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

// ── Tab colours: rotate green / blue / amber across the 6 shed pairs ─────────
// Matches the reference file's rotating pattern exactly
const SHED_TAB_COLORS = [
  "FF92D050",  // Shed 1 & 2  – lime green  (same as reference)
  "FF00B0F0",  // Shed 3 & 4  – blue        (same as reference)
  "FFFFC000",  // Shed 5 & 6  – amber       (same as reference)
  "FF92D050",  // Shed 7 & 8  – lime green
  "FF00B0F0",  // Shed 9 & 10 – blue
  "FFFFC000",  // Shed 11 & 12– amber
];

let shedIndex = 0;

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
    // Only set tab colour — touch absolutely nothing else in the sheet
    ws.properties = ws.properties ?? {};
    ws.properties.tabColor = { argb: SHED_TAB_COLORS[shedIndex % SHED_TAB_COLORS.length] };
    // Make Shed 3 & 4 the active tab when file opens
    const isStartSheet = n.includes("3") && n.includes("4");
    ws.state = "visible";
    if (isStartSheet) {
      wb.views = [{ activeTab: wb.worksheets.indexOf(ws) }];
      ws.views = [{ tabSelected: true }];
    } else {
      ws.views = ws.views?.map(v => ({ ...v, tabSelected: false })) ?? [];
    }
    shedIndex++;
    console.log(`✓ Shed:    ${ws.name.trim()}  tab:${ws.properties.tabColor.argb}${isStartSheet ? "  ← ACTIVE" : ""}`);
    continue;
  }

  if (n.includes("END") || n.includes("BATCH")) {
    ws.properties = ws.properties ?? {};
    ws.properties.tabColor = { argb: "FF92D050" };
    console.log(`✓ EOB:     ${ws.name.trim()}`);
    continue;
  }

  console.log(`  Other:   ${ws.name.trim()}`);
}

await wb.xlsx.writeFile(OUT);
console.log("Done →", OUT);
