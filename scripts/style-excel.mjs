/**
 * Silo Mate – Feed Program Styler
 * Strategy: keep the original file's structure (merges, widths, heights)
 * and ONLY re-paint colours + fonts to match the app theme.
 */
import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "../../attached_assets/feed_program_batch_120_1775355933095.xlsx");
const OUT = path.join(__dirname, "public/silo-mate-feed-program.xlsx");

// ─── App Colours ──────────────────────────────────────────────────────────────
const C = {
  headerBg:   "FF1F6B3D",  // dark green – title banner
  primaryBg:  "FF217346",  // Silo Mate green – column headers / sub-banner
  rowAlt:     "FFD6EAD6",  // light green – even data rows
  rowBase:    "FFF4FAF4",  // pale green – odd data rows
  panelBg:    "FFE8F5E8",  // very pale – info panel
  white:      "FFFFFFFF",
  darkText:   "FF1A2E1A",
  mutedText:  "FF5A6E5A",
  labelText:  "FF217346",
  amberBg:    "FFFFC000",
  amberRow:   "FFFFF2CC",
  amberBase:  "FFFEF8E0",
  amberText:  "FF7D5000",
  amberBdr:   "FFD4A000",
  blueBg:     "FFD6E4F0",
  blueText:   "FF1A4A7A",
  bdrGreen:   "FF9EC89E",
  bdrHair:    "FFCCE0CC",
};

const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const bdr   = (style, argb) => ({ style, color: { argb } });

function setFont(cell, opts = {}) {
  const { bold=false, size=10, argb=C.darkText, italic=false } = opts;
  cell.font = { name: "Calibri", size, bold, italic, color: { argb } };
}

function setAlign(cell, h="left", v="middle", wrap=false) {
  cell.alignment = { ...cell.alignment, horizontal: h, vertical: v, wrapText: wrap };
}

// ─── Detect whether a cell is a non-anchor of a merge ────────────────────────
// In ExcelJS, non-anchor merged cells have type === 8 (Merge)
function isMergeOverflow(cell) {
  return cell.type === ExcelJS.ValueType.Merge;
}

// ─── Style a shed sheet in-place (preserving all structure) ──────────────────
function styleShedInPlace(ws, isBig) {
  const COLS  = isBig ? 34 : 23;
  const siloA = isBig ? 22 : 11;
  const siloC = isBig ? 24 : 13;
  const lastR = ws.rowCount;

  ws.views = [{ state: "frozen", ySplit: 9, showGridLines: true }];

  ws.eachRow((row, rn) => {
    const isEven = rn % 2 === 0;
    const isLast = rn === lastR;

    for (let cn = 1; cn <= COLS; cn++) {
      const cell = row.getCell(cn);
      if (isMergeOverflow(cell)) continue; // skip non-anchor merged cells

      const raw = cell.value;
      const v   = (raw && typeof raw === "object" && "result" in raw) ? raw.result : raw;
      const isL = cn === 1;
      const isR = cn === COLS;

      // ── Row 1: Title banner ──────────────────────────────────────────────
      if (rn === 1) {
        row.height = 38;
        cell.fill = solid(C.headerBg);
        setFont(cell, { bold: true, argb: C.white, size: 16 });
        setAlign(cell, "left", "middle");
        cell.border = {
          top: bdr("medium", C.headerBg), bottom: bdr("medium", C.primaryBg),
          left: bdr("medium", C.headerBg), right: bdr("medium", C.headerBg),
        };
        continue;
      }

      // ── Row 2: Sub-banner ────────────────────────────────────────────────
      if (rn === 2) {
        row.height = 26;
        cell.fill = solid(C.primaryBg);
        setFont(cell, { bold: true, argb: C.white, size: 11 });
        setAlign(cell, "left", "middle");
        cell.border = {
          top: bdr("medium", C.primaryBg), bottom: bdr("thin", C.bdrGreen),
          left: bdr("medium", C.primaryBg), right: bdr("medium", C.primaryBg),
        };
        continue;
      }

      // ── Rows 3-5: Info panel ─────────────────────────────────────────────
      if (rn >= 3 && rn <= 5) {
        row.height = 22;
        if (typeof v === "string" && /STR|GWR|FIN|WDW/i.test(v)) {
          cell.fill = solid(C.amberBg);
          setFont(cell, { bold: true, argb: C.amberText });
          cell.border = {
            top: bdr("thin", C.amberBdr), bottom: bdr("thin", C.amberBdr),
            left: bdr("thin", C.amberBdr), right: bdr("thin", C.amberBdr),
          };
        } else {
          cell.fill = solid(C.panelBg);
          const isLabel = typeof v === "string" && v.length > 0;
          setFont(cell, { bold: isLabel, argb: isLabel ? C.labelText : C.darkText });
          cell.border = {
            top: bdr("hair", C.bdrHair),
            bottom: bdr("hair", C.bdrHair),
            left: isL ? bdr("medium", C.headerBg) : bdr("hair", C.bdrHair),
            right: isR ? bdr("medium", C.headerBg) : bdr("hair", C.bdrHair),
          };
        }
        setAlign(cell, cell.alignment?.horizontal || "left", "middle");
        continue;
      }

      // ── Rows 6-9: Column headers ─────────────────────────────────────────
      if (rn >= 6 && rn <= 9) {
        row.height = Math.max(row.height || 0, 24);
        const isSilo = cn >= siloA && cn <= siloC;
        const isTop  = rn === 6;
        const isBot  = rn === 9;

        if (isSilo) {
          cell.fill = solid(C.amberBg);
          setFont(cell, { bold: true, argb: C.amberText, size: 10 });
          cell.border = {
            top:    isTop ? bdr("medium", C.amberBdr) : bdr("thin", C.amberBdr),
            bottom: isBot ? bdr("medium", C.amberBdr) : bdr("thin", C.amberBdr),
            left: bdr("thin", C.amberBdr), right: bdr("thin", C.amberBdr),
          };
        } else {
          cell.fill = solid(C.primaryBg);
          setFont(cell, { bold: true, argb: C.white, size: 10 });
          cell.border = {
            top:    isTop ? bdr("medium", C.headerBg) : bdr("thin", C.bdrGreen),
            bottom: isBot ? bdr("medium", C.primaryBg) : bdr("thin", C.bdrGreen),
            left:   isL   ? bdr("medium", C.headerBg) : bdr("thin", C.bdrGreen),
            right:  isR   ? bdr("medium", C.headerBg) : bdr("thin", C.bdrGreen),
          };
        }
        setAlign(cell, "center", "middle", true);
        continue;
      }

      // ── Data rows 10+ ────────────────────────────────────────────────────
      if (rn >= 10) {
        const isSilo = cn >= siloA && cn <= siloC;

        if (isSilo) {
          cell.fill = solid(isEven ? C.amberRow : C.amberBase);
          setFont(cell, {
            bold: typeof v === "number" && v > 0,
            argb: typeof v === "number" && v > 0 ? C.amberText : C.mutedText,
          });
          cell.border = {
            top:    bdr("hair", C.amberBdr),
            bottom: isLast ? bdr("medium", C.amberBdr) : bdr("hair", C.amberBdr),
            left:   bdr("thin", C.amberBdr),
            right:  bdr("thin", C.amberBdr),
          };
          if (typeof v === "number") setAlign(cell, "right", "middle");

        } else {
          const bg = isEven ? C.rowAlt : C.rowBase;
          cell.fill = solid(bg);
          cell.border = {
            top:    bdr("hair", C.bdrHair),
            bottom: isLast ? bdr("medium", C.headerBg) : bdr("hair", C.bdrHair),
            left:   isL    ? bdr("medium", C.headerBg) : bdr("hair", C.bdrHair),
            right:  isR    ? bdr("medium", C.headerBg) : bdr("hair", C.bdrHair),
          };

          if (typeof v === "number") {
            setFont(cell, { argb: C.darkText });
            setAlign(cell, "right", "middle");
          } else if (typeof v === "string") {
            const isBold = /TOTAL|CATCH|MORT|SUMM/i.test(v);
            setFont(cell, { bold: isBold, argb: isBold ? C.labelText : C.darkText });
            setAlign(cell, cell.alignment?.horizontal || "left", "middle");
          } else if (v instanceof Date || (raw && typeof raw === "object" && raw?.formula)) {
            setFont(cell, { argb: C.mutedText, size: 9 });
            setAlign(cell, "center", "middle");
          } else {
            setFont(cell, { argb: C.darkText });
          }
        }
      }
    }
  });
}

// ─── Style EOB in-place ───────────────────────────────────────────────────────
function styleEOBInPlace(ws) {
  const COLS = 25;
  const lastR = ws.rowCount;
  ws.views = [{ state: "frozen", ySplit: 6, showGridLines: true }];

  ws.eachRow((row, rn) => {
    const isEven = rn % 2 === 0;
    const isLast = rn === lastR;

    for (let cn = 1; cn <= COLS; cn++) {
      const cell = row.getCell(cn);
      if (isMergeOverflow(cell)) continue;
      const raw = cell.value;
      const v   = (raw && typeof raw === "object" && "result" in raw) ? raw.result : raw;
      const isL = cn === 1; const isR = cn === COLS;

      if (rn === 1) {
        row.height = 38;
        cell.fill = solid(C.headerBg);
        setFont(cell, { bold: true, argb: C.white, size: 15 });
        setAlign(cell, "left", "middle");
      } else if (rn === 2) {
        row.height = 26;
        cell.fill = solid(C.primaryBg);
        setFont(cell, { bold: true, argb: C.white, size: 11 });
        setAlign(cell, "left", "middle");
      } else if (rn >= 3 && rn <= 6) {
        row.height = Math.max(row.height || 0, 22);
        if (typeof v === "string" && /STARTER|GROWER|FINISHER|WITHDRAW/i.test(v)) {
          cell.fill = solid(C.amberBg); setFont(cell, { bold: true, argb: C.amberText });
        } else if (typeof v === "string" && v.length > 0) {
          cell.fill = solid(C.primaryBg); setFont(cell, { bold: true, argb: C.white });
        } else {
          cell.fill = solid(C.panelBg); setFont(cell, { argb: C.darkText });
        }
        setAlign(cell, cell.alignment?.horizontal || "center", "middle", true);
      } else if (rn >= 7) {
        if (typeof v === "string" && /TOTAL|FEED|HAND|PURCHASE|USED|LEFT|WEIGHT/i.test(v)) {
          cell.fill = solid(C.blueBg); setFont(cell, { bold: true, argb: C.blueText });
        } else {
          cell.fill = solid(isEven ? C.rowAlt : C.rowBase);
          if (typeof v === "number") { setFont(cell, { argb: C.darkText }); setAlign(cell, "right", "middle"); }
          else { setFont(cell, { argb: C.darkText }); }
        }
        cell.border = {
          top:    bdr("hair", C.bdrHair),
          bottom: isLast ? bdr("medium", C.headerBg) : bdr("hair", C.bdrHair),
          left:   isL    ? bdr("medium", C.headerBg) : bdr("hair", C.bdrHair),
          right:  isR    ? bdr("medium", C.headerBg) : bdr("hair", C.bdrHair),
        };
      }
    }
  });
}

// ─── Main ──────────────────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SRC);

for (const ws of wb.worksheets) {
  const n = ws.name.trim().toUpperCase();

  // Remove Weekly Stock Take
  if (n.includes("STOCK")) {
    ws.state = "hidden";
    console.log(`⊘ Hidden:  ${ws.name.trim()}`);
    continue;
  }

  // Hide Consumption Guide
  if (n.includes("CONSUMPTION") || n.includes("GUIDE")) {
    ws.state = "hidden";
    console.log(`⊘ Hidden:  ${ws.name.trim()}`);
    continue;
  }

  // Style shed sheets
  if (n.includes("SHED")) {
    const isBig = !!n.match(/SHED\s*1\s*&\s*2/);
    styleShedInPlace(ws, isBig);
    ws.properties = { ...ws.properties, tabColor: { argb: C.primaryBg } };
    console.log(`✓ Shed:    ${ws.name.trim()}`);
    continue;
  }

  // Style EOB
  if (n.includes("END") || n.includes("BATCH")) {
    styleEOBInPlace(ws);
    ws.properties = { ...ws.properties, tabColor: { argb: C.primaryBg } };
    console.log(`✓ EOB:     ${ws.name.trim()}`);
    continue;
  }

  console.log(`  Skipped: ${ws.name.trim()}`);
}

await wb.xlsx.writeFile(OUT);
console.log("Done →", OUT);
