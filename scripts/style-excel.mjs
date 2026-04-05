/**
 * Silo Mate – Feed Program Styler
 * Copies the original file exactly (structure, merges, widths, heights, formulas, numFmt)
 * and ONLY replaces colours to match the Silo Mate app theme.
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
  lightGreen: "FFD6EAD6",
  paleGreen:  "FFF0F7F0",
  panelGreen: "FFE8F5E8",
  white:      "FFFFFFFF",
  amber:      "FFFFC000",
  amberLight: "FFFFF2CC",
  amberDark:  "FF7D5000",
  darkText:   "FF1A2E1A",
  mutedText:  "FF5A6E5A",
};

const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const bdr   = (style, argb) => ({ style, color: { argb } });

function font(cell, opts = {}) {
  const { bold = false, size = 10, argb = C.darkText } = opts;
  cell.font = { name: "Calibri", size, bold, color: { argb } };
}

// ─── Detect silo columns by scanning header rows ──────────────────────────────
function findSiloCols(ws) {
  let siloA = -1, siloC = -1;
  for (let r = 1; r <= Math.min(ws.rowCount, 12); r++) {
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

// ─── Detect header row range ──────────────────────────────────────────────────
function findHeaderRows(ws) {
  // Look for the row containing "AGE" and "DATE" — that's the main column header row
  let headerRow = -1;
  for (let r = 1; r <= Math.min(ws.rowCount, 12); r++) {
    let hasAge = false, hasDate = false;
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      const d = v && typeof v === "object" && "result" in v ? v.result : v;
      if (d === "AGE") hasAge = true;
      if (d === "DATE") hasDate = true;
    });
    if (hasAge && hasDate) { headerRow = r; break; }
  }
  return headerRow; // column labels start here, data starts after +1 or +2
}

// ─── Style a shed sheet ───────────────────────────────────────────────────────
function styleShed(ws) {
  const { siloA, siloC } = findSiloCols(ws);
  const headerRow = findHeaderRows(ws);
  const dataStart = headerRow > 0 ? headerRow + 2 : 12; // data rows start after 2 header rows
  const lastR = ws.rowCount;
  const COLS = ws.columnCount;

  ws.properties = ws.properties ?? {};
  ws.properties.tabColor = { argb: C.green };
  ws.views = [{ state: "frozen", ySplit: dataStart - 1, showGridLines: true }];

  ws.eachRow((row, rn) => {
    for (let cn = 1; cn <= COLS; cn++) {
      const cell = row.getCell(cn);
      if (cell.type === ExcelJS.ValueType.Merge) continue;

      // Preserve numFmt across style reset
      const savedNumFmt = cell.numFmt;
      cell.style = {};
      if (savedNumFmt) cell.numFmt = savedNumFmt;

      const raw = cell.value;
      const v = raw && typeof raw === "object" && "result" in raw ? raw.result : raw;
      const isL = cn === 1;
      const isR = cn === COLS;
      const isEven = rn % 2 === 0;
      const isLast = rn === lastR;

      // ── Rows 1-2: Banner ─────────────────────────────────────────────────
      if (rn === 1) {
        row.height = 36;
        cell.fill = solid(C.darkGreen);
        font(cell, { bold: true, argb: C.white, size: 14 });
        cell.alignment = { horizontal: "left", vertical: "middle" };
        cell.border = {
          top: bdr("medium", C.darkGreen), bottom: bdr("medium", C.green),
          left: bdr("medium", C.darkGreen), right: bdr("medium", C.darkGreen),
        };
        continue;
      }

      if (rn === 2) {
        row.height = 24;
        cell.fill = solid(C.green);
        font(cell, { bold: true, argb: C.white, size: 11 });
        cell.alignment = { horizontal: "left", vertical: "middle" };
        cell.border = {
          top: bdr("medium", C.green), bottom: bdr("thin", "FF9EC89E"),
          left: bdr("medium", C.green), right: bdr("medium", C.green),
        };
        continue;
      }

      // ── Rows 3 to (headerRow-1): Info panel ──────────────────────────────
      if (rn >= 3 && rn < headerRow) {
        const isAmt = typeof v === "number";
        const isLabel = typeof v === "string" && v.length > 0 && !/^\d/.test(v);
        const isFeedType = typeof v === "string" && /^(STR|GWR|FIN|WDW)/i.test(v);

        if (isFeedType) {
          cell.fill = solid(C.amber);
          font(cell, { bold: true, argb: C.amberDark });
        } else if (isLabel) {
          cell.fill = solid(C.panelGreen);
          font(cell, { bold: true, argb: C.green });
        } else {
          cell.fill = solid(C.panelGreen);
          font(cell, { argb: C.darkText });
        }
        cell.alignment = { ...(cell.alignment || {}), vertical: "middle" };
        cell.border = {
          top: bdr("hair", "FFCCE0CC"), bottom: bdr("hair", "FFCCE0CC"),
          left: isL ? bdr("medium", C.darkGreen) : bdr("hair", "FFCCE0CC"),
          right: isR ? bdr("medium", C.darkGreen) : bdr("hair", "FFCCE0CC"),
        };
        continue;
      }

      // ── Header rows (headerRow to dataStart-1): Column labels ─────────────
      if (rn >= headerRow && rn < dataStart) {
        const isSilo = siloA > 0 && cn >= siloA && cn <= siloC;
        if (isSilo) {
          cell.fill = solid(C.amber);
          font(cell, { bold: true, argb: C.amberDark, size: 10 });
          cell.border = {
            top: bdr("medium", C.amberDark), bottom: bdr("medium", C.amberDark),
            left: bdr("thin", C.amberDark), right: bdr("thin", C.amberDark),
          };
        } else {
          cell.fill = solid(C.green);
          font(cell, { bold: true, argb: C.white, size: 10 });
          cell.border = {
            top: bdr("medium", C.darkGreen), bottom: bdr("medium", C.green),
            left: isL ? bdr("medium", C.darkGreen) : bdr("thin", "FF9EC89E"),
            right: isR ? bdr("medium", C.darkGreen) : bdr("thin", "FF9EC89E"),
          };
        }
        cell.alignment = { ...(cell.alignment || {}), horizontal: "center", vertical: "middle", wrapText: true };
        row.height = Math.max(row.height || 0, 24);
        continue;
      }

      // ── Data rows ─────────────────────────────────────────────────────────
      if (rn >= dataStart) {
        const isSilo = siloA > 0 && cn >= siloA && cn <= siloC;

        if (isSilo) {
          cell.fill = solid(isEven ? C.amberLight : "FFFEF8E0");
          font(cell, {
            bold: typeof v === "number" && v > 0,
            argb: typeof v === "number" && v > 0 ? C.amberDark : C.mutedText,
          });
          cell.border = {
            top: bdr("hair", C.amber), bottom: isLast ? bdr("medium", C.amberDark) : bdr("hair", C.amber),
            left: bdr("thin", C.amberDark), right: bdr("thin", C.amberDark),
          };
          if (typeof v === "number") cell.alignment = { horizontal: "right", vertical: "middle" };
        } else {
          const bg = isEven ? C.lightGreen : C.paleGreen;
          cell.fill = solid(bg);
          cell.border = {
            top: bdr("hair", "FFCCE0CC"),
            bottom: isLast ? bdr("medium", C.darkGreen) : bdr("hair", "FFCCE0CC"),
            left: isL ? bdr("medium", C.darkGreen) : bdr("hair", "FFCCE0CC"),
            right: isR ? bdr("medium", C.darkGreen) : bdr("hair", "FFCCE0CC"),
          };
          if (typeof v === "number") {
            font(cell, { argb: C.darkText });
            cell.alignment = { horizontal: "right", vertical: "middle" };
          } else if (v instanceof Date || (raw && typeof raw === "object" && raw?.formula && !isNaN(raw.result))) {
            font(cell, { argb: C.mutedText, size: 9 });
            cell.alignment = { horizontal: "center", vertical: "middle" };
          } else {
            font(cell, { argb: C.darkText });
            cell.alignment = { ...(cell.alignment || {}), vertical: "middle" };
          }
        }
      }
    }
  });
}

// ─── Style EOB sheet ──────────────────────────────────────────────────────────
function styleEOB(ws) {
  const COLS = ws.columnCount;
  const lastR = ws.rowCount;
  ws.properties = ws.properties ?? {};
  ws.properties.tabColor = { argb: C.green };
  ws.views = [{ state: "frozen", ySplit: 6, showGridLines: true }];

  ws.eachRow((row, rn) => {
    for (let cn = 1; cn <= COLS; cn++) {
      const cell = row.getCell(cn);
      if (cell.type === ExcelJS.ValueType.Merge) continue;
      const savedNumFmt = cell.numFmt;
      cell.style = {};
      if (savedNumFmt) cell.numFmt = savedNumFmt;

      const raw = cell.value;
      const v = raw && typeof raw === "object" && "result" in raw ? raw.result : raw;
      const isEven = rn % 2 === 0;
      const isL = cn === 1; const isR = cn === COLS;

      if (rn === 1) {
        row.height = 36;
        cell.fill = solid(C.darkGreen); font(cell, { bold: true, argb: C.white, size: 14 });
        cell.alignment = { horizontal: "left", vertical: "middle" };
      } else if (rn === 2) {
        row.height = 24;
        cell.fill = solid(C.green); font(cell, { bold: true, argb: C.white, size: 11 });
        cell.alignment = { horizontal: "left", vertical: "middle" };
      } else if (rn <= 6) {
        const isFeedType = typeof v === "string" && /STARTER|GROWER|FINISHER|WITHDRAW/i.test(v);
        if (isFeedType) { cell.fill = solid(C.amber); font(cell, { bold: true, argb: C.amberDark }); }
        else if (typeof v === "string" && v.length > 0) { cell.fill = solid(C.green); font(cell, { bold: true, argb: C.white }); }
        else { cell.fill = solid(C.panelGreen); font(cell, { argb: C.darkText }); }
        cell.alignment = { ...(cell.alignment || {}), vertical: "middle", wrapText: true };
      } else {
        cell.fill = solid(isEven ? C.lightGreen : C.paleGreen);
        font(cell, { argb: C.darkText });
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

  if (n.includes("STOCK")) {
    ws.state = "hidden";
    console.log(`⊘ Hidden:   ${ws.name.trim()}`);
    continue;
  }
  if (n.includes("CONSUMPTION") || n.includes("GUIDE")) {
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
console.log("Done →", OUT);
