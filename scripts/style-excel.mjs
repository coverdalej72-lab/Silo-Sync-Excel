/**
 * Silo Mate – Feed Program Styler
 * Preserves all original structure (merges, widths, heights, formulas, numFmt)
 * and replaces colours to match the Silo Mate app theme.
 *
 * Column map (Shed 3–12, 22 data cols):
 *  1=AGE  2=DAY  3=DATE  4=FEED DEL  5=FEED ORDERED  6=SILO(ref)
 *  7=FEED ALLOC  8=FEED USAGE  9=FEED ON HAND  10=SILO TOTAL
 *  11=SILO A  12=SILO B  13=SILO C
 *  14=CATCH MORTS  15=BIRDS LEFT  16=SHED #  17=DIFF  18=DISCREPANCY
 *  19=SHED 1  20=Weight(Kg)  21=SHED 2  22=Weight(Kg)
 */
import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "../../attached_assets/feed_program_batch_120_1775355933095.xlsx");
const OUT = path.join(__dirname, "public/silo-mate-feed-program.xlsx");

// ─── App Palette ──────────────────────────────────────────────────────────────
const C = {
  darkGreen:  "FF1A5C36",
  green:      "FF217346",
  midGreen:   "FF2E8B57",
  lightGreen: "FFD6EAD6",
  paleGreen:  "FFF0F7F0",
  panelGreen: "FFE8F5E8",
  white:      "FFFFFFFF",
  offWhite:   "FFF9FDF9",
  amber:      "FFFFC000",
  amberLight: "FFFFF2CC",
  amberPale:  "FFFEF8E0",
  amberDark:  "FF7D5000",
  darkText:   "FF1A2E1A",
  midText:    "FF3A5C3A",
  mutedText:  "FF5A6E5A",
};

const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const bdr   = (style, argb) => ({ style, color: { argb } });

function applyFont(cell, opts = {}) {
  const { bold = false, size = 10, argb = C.darkText } = opts;
  cell.font = { name: "Calibri", size, bold, color: { argb } };
}

// ─── Find the actual last column that has data (ignore trailing empty cols) ────
function findLastDataCol(ws) {
  let maxCol = 1;
  // Scan header rows AND first few data rows to find rightmost real column
  for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
    const row = ws.getRow(r);
    row.eachCell({ includeEmpty: false }, (cell, cn) => {
      if (cell.type !== ExcelJS.ValueType.Merge) {
        maxCol = Math.max(maxCol, cn);
      }
    });
  }
  return maxCol;
}

// ─── Find which row contains "AGE" + "DATE" (main column header row) ──────────
function findHeaderRow(ws) {
  for (let r = 1; r <= Math.min(ws.rowCount, 15); r++) {
    let hasAge = false, hasDate = false;
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      const d = v && typeof v === "object" && "result" in v ? v.result : v;
      if (d === "AGE") hasAge = true;
      if (d === "DATE") hasDate = true;
    });
    if (hasAge && hasDate) return r;
  }
  return 8; // fallback
}

// ─── Find silo A / C column numbers by scanning for "A" and "C" labels ────────
function findSiloCols(ws, headerRow) {
  let siloA = -1, siloC = -1;
  // Check rows from headerRow to headerRow+2 for the A / B / C labels
  for (let r = headerRow; r <= headerRow + 2; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= ws.columnCount; c++) {
      const cell = row.getCell(c);
      if (cell.type === ExcelJS.ValueType.Merge) continue;
      const v = cell.value;
      const d = v && typeof v === "object" && "result" in v ? v.result : v;
      if (d === "A" && siloA === -1) siloA = c;
      if (d === "C" && siloA !== -1 && siloC === -1) siloC = c;
    }
    if (siloA !== -1 && siloC !== -1) break;
  }
  return { siloA, siloB: siloA + 1, siloC };
}

// ─── Style a shed worksheet ───────────────────────────────────────────────────
function styleShed(ws) {
  const headerRow  = findHeaderRow(ws);
  const subHeader  = headerRow + 1;           // second label row (DEL. / A / B / C etc.)
  const dataStart  = headerRow + 2;           // first row that may have data
  const lastR      = ws.rowCount;
  const COLS       = findLastDataCol(ws);      // rightmost real data column
  const { siloA, siloC } = findSiloCols(ws, headerRow);

  // Green tab colour + freeze panes above data
  ws.properties = ws.properties ?? {};
  ws.properties.tabColor = { argb: C.green };
  ws.views = [{ state: "frozen", ySplit: dataStart - 1, showGridLines: true }];

  console.log(`   lastCol=${COLS}  siloA=${siloA}  siloC=${siloC}  headerRow=${headerRow}  dataStart=${dataStart}`);

  ws.eachRow((row, rn) => {
    // Only style up to the last real data column; leave empty trailing columns alone
    for (let cn = 1; cn <= COLS; cn++) {
      const cell = row.getCell(cn);
      if (cell.type === ExcelJS.ValueType.Merge) continue;

      // Save numFmt before reset (resetStyle clears it)
      const savedNumFmt = cell.numFmt;
      cell.style = {};
      if (savedNumFmt) cell.numFmt = savedNumFmt;

      const raw = cell.value;
      const v   = raw && typeof raw === "object" && "result" in raw ? raw.result : raw;
      const isL = cn === 1;
      const isR = cn === COLS;

      // ── Row 1: Grower banner ───────────────────────────────────────────────
      if (rn === 1) {
        row.height = 32;
        cell.fill = solid(C.darkGreen);
        applyFont(cell, { bold: true, argb: C.white, size: 13 });
        cell.alignment = { horizontal: "left", vertical: "middle" };
        cell.border = {
          top: bdr("medium", C.darkGreen), bottom: bdr("thin", C.midGreen),
          left: bdr("medium", C.darkGreen), right: bdr("medium", C.darkGreen),
        };
        continue;
      }

      // ── Row 2: No. of Birds / totals ──────────────────────────────────────
      if (rn === 2) {
        row.height = 22;
        cell.fill = solid(C.green);
        applyFont(cell, { bold: true, argb: C.white, size: 10 });
        cell.alignment = { horizontal: "left", vertical: "middle" };
        cell.border = {
          top: bdr("thin", C.midGreen), bottom: bdr("thin", C.midGreen),
          left: bdr("medium", C.darkGreen), right: bdr("medium", C.darkGreen),
        };
        continue;
      }

      // ── Rows 3 to headerRow-1: Info panel (Placement, feed types, sheds) ──
      if (rn >= 3 && rn < headerRow) {
        const isFeedType = typeof v === "string" && /^(STR|GWR|FIN|WDW)/i.test(v);
        const isKg       = typeof v === "string" && v.trim() === "KG.";
        const isLabel    = typeof v === "string" && v.trim().length > 0;
        const isNum      = typeof v === "number";

        if (isFeedType) {
          // Feed type labels: amber highlight
          cell.fill = solid(C.amber);
          applyFont(cell, { bold: true, argb: C.amberDark, size: 10 });
          cell.alignment = { horizontal: "left", vertical: "middle" };
        } else if (isNum) {
          // Qty values (80000, 26000…)
          cell.fill = solid(C.panelGreen);
          applyFont(cell, { bold: true, argb: C.midText, size: 10 });
          cell.alignment = { horizontal: "right", vertical: "middle" };
        } else if (isKg) {
          cell.fill = solid(C.panelGreen);
          applyFont(cell, { bold: false, argb: C.mutedText, size: 9 });
          cell.alignment = { horizontal: "left", vertical: "middle" };
        } else if (isLabel) {
          cell.fill = solid(C.panelGreen);
          applyFont(cell, { bold: true, argb: C.midText, size: 10 });
          cell.alignment = { horizontal: "left", vertical: "middle" };
        } else {
          cell.fill = solid(C.panelGreen);
        }
        cell.border = {
          top: bdr("hair", "FFCCE0CC"), bottom: bdr("hair", "FFCCE0CC"),
          left: isL ? bdr("medium", C.darkGreen) : bdr("hair", "FFCCE0CC"),
          right: isR ? bdr("medium", C.darkGreen) : bdr("hair", "FFCCE0CC"),
        };
        continue;
      }

      // ── Header rows (headerRow + subHeader): Column label rows ────────────
      if (rn === headerRow || rn === subHeader) {
        const isSilo = siloA > 0 && cn >= siloA && cn <= siloC;
        row.height = Math.max(row.height || 0, 28);

        if (isSilo) {
          cell.fill = solid(C.amber);
          applyFont(cell, { bold: true, argb: C.amberDark, size: 10 });
          cell.border = {
            top: bdr("medium", C.amberDark), bottom: bdr("medium", C.amberDark),
            left: bdr("thin", C.amberDark),  right: bdr("thin", C.amberDark),
          };
        } else {
          cell.fill = solid(C.green);
          applyFont(cell, { bold: true, argb: C.white, size: 10 });
          cell.border = {
            top: bdr("medium", C.darkGreen),    bottom: bdr("medium", C.darkGreen),
            left: isL ? bdr("medium", C.darkGreen) : bdr("thin", "FF9EC89E"),
            right: isR ? bdr("medium", C.darkGreen) : bdr("thin", "FF9EC89E"),
          };
        }
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        continue;
      }

      // ── Data rows (dataStart onward) ──────────────────────────────────────
      if (rn >= dataStart) {
        const isEven  = rn % 2 === 0;
        const isLast  = rn === lastR;
        const isSilo  = siloA > 0 && cn >= siloA && cn <= siloC;
        const isDateC = cn === 3; // DATE column always col 3

        if (isSilo) {
          // Silo A / B / C: amber tones
          const bg = isEven ? C.amberLight : C.amberPale;
          cell.fill = solid(bg);
          applyFont(cell, {
            bold: typeof v === "number" && v > 0,
            argb: typeof v === "number" && v > 0 ? C.amberDark : C.mutedText,
            size: 10,
          });
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.border = {
            top:    bdr("hair", C.amber),
            bottom: isLast ? bdr("medium", C.amberDark) : bdr("hair", C.amber),
            left:   bdr("thin", C.amberDark),
            right:  bdr("thin", C.amberDark),
          };

        } else {
          // All other data columns: alternating pale green
          const bg = isEven ? C.lightGreen : C.offWhite;
          cell.fill = solid(bg);
          cell.border = {
            top:    bdr("hair", "FFCCE0CC"),
            bottom: isLast ? bdr("medium", C.darkGreen) : bdr("hair", "FFCCE0CC"),
            left:   isL ? bdr("medium", C.darkGreen) : bdr("hair", "FFCCE0CC"),
            right:  isR ? bdr("medium", C.darkGreen) : bdr("hair", "FFCCE0CC"),
          };

          if (v instanceof Date) {
            applyFont(cell, { argb: C.midText, size: 9 });
            cell.alignment = { horizontal: "left", vertical: "middle" };
          } else if (typeof v === "number") {
            applyFont(cell, { bold: cn === 1, argb: cn === 1 ? C.darkText : C.midText, size: 10 });
            cell.alignment = { horizontal: cn === 1 ? "center" : "right", vertical: "middle" };
          } else if (typeof v === "string" && v.length > 0) {
            applyFont(cell, { argb: C.darkText, size: 10 });
            cell.alignment = { horizontal: "left", vertical: "middle" };
          } else if (raw && typeof raw === "object" && raw.formula != null) {
            // Formula cell (e.g. #REF! errors or calculated values)
            applyFont(cell, { argb: C.midText, size: 10 });
            cell.alignment = { horizontal: "right", vertical: "middle" };
          } else {
            applyFont(cell, { argb: C.mutedText, size: 10 });
          }
        }
      }
    }
  });
}

// ─── Style End-of-Batch sheet ─────────────────────────────────────────────────
function styleEOB(ws) {
  const COLS = findLastDataCol(ws);
  const lastR = ws.rowCount;

  ws.properties = ws.properties ?? {};
  ws.properties.tabColor = { argb: C.green };
  ws.views = [{ state: "frozen", ySplit: 8, showGridLines: true }];

  ws.eachRow((row, rn) => {
    for (let cn = 1; cn <= COLS; cn++) {
      const cell = row.getCell(cn);
      if (cell.type === ExcelJS.ValueType.Merge) continue;
      const savedNumFmt = cell.numFmt;
      cell.style = {};
      if (savedNumFmt) cell.numFmt = savedNumFmt;

      const raw = cell.value;
      const v   = raw && typeof raw === "object" && "result" in raw ? raw.result : raw;
      const isL = cn === 1, isR = cn === COLS;
      const isEven = rn % 2 === 0;

      if (rn === 1) {
        row.height = 32;
        cell.fill = solid(C.darkGreen);
        applyFont(cell, { bold: true, argb: C.white, size: 13 });
        cell.alignment = { horizontal: "left", vertical: "middle" };
      } else if (rn === 2) {
        row.height = 22;
        cell.fill = solid(C.green);
        applyFont(cell, { bold: true, argb: C.white, size: 10 });
        cell.alignment = { horizontal: "left", vertical: "middle" };
      } else if (rn <= 8) {
        const isFT = typeof v === "string" && /^(STR|GWR|FIN|WDW|STARTER|GROWER|FINISHER|WITHDRAW)/i.test(v);
        if (isFT) {
          cell.fill = solid(C.amber);
          applyFont(cell, { bold: true, argb: C.amberDark });
        } else if (typeof v === "string" && v.length > 0) {
          cell.fill = solid(C.green);
          applyFont(cell, { bold: true, argb: C.white });
        } else {
          cell.fill = solid(C.panelGreen);
          applyFont(cell, { argb: C.darkText });
        }
        cell.alignment = { ...(cell.alignment ?? {}), vertical: "middle", wrapText: true };
      } else {
        cell.fill = solid(isEven ? C.lightGreen : C.offWhite);
        applyFont(cell, { argb: C.darkText });
        cell.border = {
          top: bdr("hair", "FFCCE0CC"), bottom: bdr("hair", "FFCCE0CC"),
          left: isL ? bdr("medium", C.darkGreen) : bdr("hair", "FFCCE0CC"),
          right: isR ? bdr("medium", C.darkGreen) : bdr("hair", "FFCCE0CC"),
        };
        if (typeof v === "number") cell.alignment = { horizontal: "right", vertical: "middle" };
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
    console.log(`⊘ Hidden:   ${ws.name.trim()}`);
    continue;
  }
  if (n.includes("SHED")) {
    styleShed(ws);
    console.log(`✓ Shed:     ${ws.name.trim()}`);
    continue;
  }
  if (n.includes("END") || n.includes("BATCH")) {
    styleEOB(ws);
    console.log(`✓ EOB:      ${ws.name.trim()}`);
    continue;
  }
  console.log(`  Skipped:  ${ws.name.trim()}`);
}

await wb.xlsx.writeFile(OUT);
console.log("\nDone →", OUT);
