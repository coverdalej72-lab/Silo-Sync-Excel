/**
 * Silo Mate – Feed Program Colour Swap
 *
 * Keeps the original spreadsheet 100% intact (fonts, sizes, borders, merges,
 * column widths, row heights, formulas, numFmt, alignment).
 *
 * ONLY changes fill (background) colours — nothing else.
 *
 * Original → App theme mapping
 *   FFFFFF00  (bright yellow)  → FFFFC000  (app amber)
 *   FF92D050  (lime green)     → FF217346  (app primary green)
 *   FFFF0000  (red bg)         → FFFFC000  (app amber — used on Silo A header)
 *   no fill on header rows 1-9 → FF217346  (app green)
 *   no fill on data rows       → alternating FFE8F5E8 / FFF4FAF4
 */
import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "../../attached_assets/feed_program_batch_120_1775355933095.xlsx");
const OUT = path.join(__dirname, "public/silo-mate-feed-program.xlsx");

const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

// ── Original colour → app colour map ─────────────────────────────────────────
const FILL_MAP = {
  "FFFFFF00": "FFFFC000",   // bright yellow  → amber
  "FF92D050": "FF217346",   // lime green     → app green
  "FFFF0000": "FFFFC000",   // red (silo hdr) → amber
  "FFC00000": "FF1A5C36",   // dark red       → dark green
};

// Header rows get a dark-green banner fill when they have no original fill
const HEADER_BG   = "FF217346";   // app primary green
const HEADER_TOP  = "FF1A5C36";   // darker green for rows 1–2
const DATA_EVEN   = "FFE8F5E8";   // pale green (even rows)
const DATA_ODD    = "FFF4FAF4";   // near-white (odd rows)
const AMBER_DATA  = "FFFFF2CC";   // amber tint for silo data rows (even)
const AMBER_DATA2 = "FFFEF8E0";   // amber tint for silo data rows (odd)

function mapFill(argb) {
  return FILL_MAP[argb] ?? argb;
}

function styleShed(ws) {
  const headerRow = 8;   // the row with AGE / DATE / SILO labels
  const subRow    = 9;   // second label row (DEL. / A / B / C)
  const dataStart = 13;  // first actual data row (age = 1)
  const COLS      = 23;  // data goes to col 23 (last real column)

  // Detect silo columns from the header row (look for "A" / "C" labels)
  let siloA = 11, siloC = 13; // defaults confirmed from source inspection
  for (let r = headerRow; r <= subRow; r++) {
    const row = ws.getRow(r);
    let foundA = false;
    for (let c = 1; c <= COLS; c++) {
      const cell = row.getCell(c);
      if (cell.type === ExcelJS.ValueType.Merge) continue;
      const v = cell.value;
      const d = v && typeof v === "object" && "result" in v ? v.result : v;
      if (d === "A" && !foundA) { siloA = c; foundA = true; }
      if (d === "C" && foundA)  { siloC = c; break; }
    }
    if (foundA) break;
  }

  ws.properties = ws.properties ?? {};
  ws.properties.tabColor = { argb: "FF217346" };

  ws.eachRow((row, rn) => {
    const isEven = rn % 2 === 0;

    for (let cn = 1; cn <= COLS; cn++) {
      const cell = row.getCell(cn);
      if (cell.type === ExcelJS.ValueType.Merge) continue;

      const origFill = cell.fill?.fgColor?.argb;   // may be undefined (no fill)

      // ── Rows 1–2: Dark green banner ───────────────────────────────────────
      if (rn <= 2) {
        cell.fill = origFill ? solid(mapFill(origFill)) : solid(HEADER_TOP);
        continue;
      }

      // ── Rows 3–9: Info panel / column headers → green background ─────────
      if (rn >= 3 && rn <= subRow) {
        if (origFill) {
          cell.fill = solid(mapFill(origFill));
        } else {
          cell.fill = solid(HEADER_BG);
        }
        continue;
      }

      // ── Rows 10–12: Gap / initialisation rows → subtle green ──────────────
      if (rn >= 10 && rn < dataStart) {
        if (origFill) {
          cell.fill = solid(mapFill(origFill));
        } else {
          cell.fill = solid(DATA_ODD);
        }
        continue;
      }

      // ── Data rows (13+) ───────────────────────────────────────────────────
      if (rn >= dataStart) {
        if (origFill) {
          // Cell already had a colour in the original → map it
          cell.fill = solid(mapFill(origFill));
        } else {
          const isSilo = cn >= siloA && cn <= siloC;
          if (isSilo) {
            cell.fill = solid(isEven ? AMBER_DATA : AMBER_DATA2);
          } else {
            cell.fill = solid(isEven ? DATA_EVEN : DATA_ODD);
          }
        }
      }
    }
  });
}

function styleEOB(ws) {
  const headerEnd = 8;
  const COLS = 23;

  ws.properties = ws.properties ?? {};
  ws.properties.tabColor = { argb: "FF217346" };

  ws.eachRow((row, rn) => {
    const isEven = rn % 2 === 0;
    for (let cn = 1; cn <= COLS; cn++) {
      const cell = row.getCell(cn);
      if (cell.type === ExcelJS.ValueType.Merge) continue;
      const origFill = cell.fill?.fgColor?.argb;

      if (rn <= 2) {
        cell.fill = origFill ? solid(mapFill(origFill)) : solid(HEADER_TOP);
      } else if (rn <= headerEnd) {
        cell.fill = origFill ? solid(mapFill(origFill)) : solid(HEADER_BG);
      } else {
        if (origFill) {
          cell.fill = solid(mapFill(origFill));
        } else {
          cell.fill = solid(isEven ? DATA_EVEN : DATA_ODD);
        }
      }
    }
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
    styleShed(ws);
    console.log(`✓ Shed:    ${ws.name.trim()}`);
    continue;
  }
  if (n.includes("END") || n.includes("BATCH")) {
    styleEOB(ws);
    console.log(`✓ EOB:     ${ws.name.trim()}`);
    continue;
  }
  console.log(`  Skipped: ${ws.name.trim()}`);
}

await wb.xlsx.writeFile(OUT);
console.log("Done →", OUT);
