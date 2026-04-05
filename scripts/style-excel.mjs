/**
 * Silo Mate – Feed Program Styler
 * Builds a fresh workbook from the original data, styled to match the app exactly.
 */
import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "../../attached_assets/feed_program_batch_120_1775355933095.xlsx");
const OUT = path.join(__dirname, "public/silo-mate-feed-program.xlsx");

// ─── App Colours (exact match to screenshot) ──────────────────────────────────
// ExcelJS uses ARGB: "FF" prefix = fully opaque, then RRGGBB
const C = {
  // Greens
  headerBg:    "FF1F6B3D",   // dark green – app top banner
  primaryBg:   "FF217346",   // Silo Mate green – card sub-headers / badges
  rowAlt:      "FFD6EAD6",   // light green – even rows
  rowBase:     "FFF4FAF4",   // near-white green – odd rows
  panelBg:     "FFE8F5E8",   // very pale green – info sections
  // Text
  white:       "FFFFFFFF",
  headerText:  "FFFFFFFF",
  primaryText: "FFFFFFFF",
  darkText:    "FF1A2E1A",   // near-black with green tint
  mutedText:   "FF5A6E5A",   // muted green-grey
  labelText:   "FF217346",   // green text for labels in panels
  // Amber – silo A/B/C
  amberBg:     "FFFFC000",   // amber for silo header cells
  amberRow:    "FFFFF2CC",   // light amber for silo data (even)
  amberBase:   "FFFEF8E0",   // lighter amber for silo data (odd)
  amberText:   "FF7D5000",   // dark amber text
  amberBdr:    "FFD4A000",
  // Blue – totals/summary rows
  blueBg:      "FFD6E4F0",
  blueText:    "FF1A4A7A",
  // Borders
  bdrGreen:    "FF9EC89E",
  bdrHair:     "FFCCE0CC",
  bdrAmber:    "FFD4A000",
};

// ─── Style helpers ────────────────────────────────────────────────────────────
const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const b = (style, argb) => ({ style, color: { argb } });

function applyFont(cell, { bold=false, size=10, argb=C.darkText, italic=false } = {}) {
  cell.font = { name: "Calibri", size, bold, italic, color: { argb } };
}

function applyAlign(cell, h="left", v="middle", wrap=false) {
  cell.alignment = { horizontal: h, vertical: v, wrapText: wrap };
}

function applyBorder(cell, t, l, bo, r) {
  cell.border = { top: t, left: l, bottom: bo, right: r };
}

// Paint ALL cells in a row range (including merged/empty)
function paintRow(ws, rn, colCount, painter) {
  for (let cn = 1; cn <= colCount; cn++) {
    painter(ws.getRow(rn).getCell(cn), cn);
  }
}

// ─── Copy raw values from source sheet ───────────────────────────────────────
function getLastCol(ws) {
  let max = 0;
  ws.eachRow((row) => row.eachCell({ includeEmpty: false }, (_, cn) => { if (cn > max) max = cn; }));
  return max;
}

function copyData(src, dst, colLimit) {
  // Copy row data only – no styles from original
  src.eachRow((srcRow, rn) => {
    const dstRow = dst.getRow(rn);
    for (let cn = 1; cn <= colLimit; cn++) {
      const sc = srcRow.getCell(cn);
      const dc = dstRow.getCell(cn);
      if (sc.formula)            dc.value = { formula: sc.formula, result: sc.result };
      else if (sc.value != null) dc.value = sc.value;
      if (sc.numFmt)             dc.numFmt = sc.numFmt;
    }
  });
}

// ─── SHED sheet styler ────────────────────────────────────────────────────────
function styleShed(ws, isBig) {
  const COLS   = isBig ? 34 : 23;
  const siloA  = isBig ? 22 : 11;
  const siloC  = isBig ? 24 : 13;
  const dateC  = isBig ? 14 : 3;
  const lastR  = ws.rowCount;

  ws.views = [{ state: "frozen", ySplit: 9, showGridLines: false }];

  // Widths
  const widths = isBig
    ? [0,5,5,5,5,5,5,5,5,5,5,5,5,5, 12,10,10,10,10,10,10, 10,10,10,10, 10,10,10, 13,15,13,12,13,12,6]
    : [0,5,5, 12,10,10,10,10,10,10, 10,10,10,10, 10,10,10, 13,15,13,12,13,12,6];
  widths.forEach((w, i) => { if (i > 0 && i <= COLS) ws.getColumn(i).width = w; });

  // ── ROW 1 – App banner (dark green, large white text) ──────────────────────
  ws.getRow(1).height = 40;
  paintRow(ws, 1, COLS, (cell, cn) => {
    cell.fill = solid(C.headerBg);
    applyFont(cell, { bold: true, argb: C.white, size: 16 });
    applyAlign(cell, cn <= 2 ? "left" : "center", "middle");
    applyBorder(cell,
      b("medium", C.headerBg), b("medium", C.headerBg),
      b("medium", C.primaryBg), b("medium", C.headerBg)
    );
  });

  // ── ROW 2 – Green sub-header ────────────────────────────────────────────────
  ws.getRow(2).height = 28;
  paintRow(ws, 2, COLS, (cell, cn) => {
    cell.fill = solid(C.primaryBg);
    applyFont(cell, { bold: true, argb: C.white, size: 11 });
    applyAlign(cell, cn <= 2 ? "left" : "center", "middle");
    applyBorder(cell,
      b("medium", C.primaryBg), b("medium", C.primaryBg),
      b("thin", C.bdrGreen), b("medium", C.primaryBg)
    );
  });

  // ── ROWS 3-5 – Info panel (pale green, labelled) ────────────────────────────
  for (let rn = 3; rn <= 5; rn++) {
    ws.getRow(rn).height = 22;
    paintRow(ws, rn, COLS, (cell, cn) => {
      const raw = cell.value;
      const v   = (raw && typeof raw === "object" && "result" in raw) ? raw.result : raw;
      const isL = cn === 1; const isR = cn === COLS;

      if (typeof v === "string" && /STR|GWR|FIN|WDW/i.test(v)) {
        cell.fill = solid(C.amberBg);
        applyFont(cell, { bold: true, argb: C.amberText });
        applyBorder(cell, b("thin", C.amberBdr), b("thin", C.amberBdr), b("thin", C.amberBdr), b("thin", C.amberBdr));
      } else {
        cell.fill = solid(C.panelBg);
        const isLabel = typeof v === "string" && v.length > 0;
        applyFont(cell, { bold: isLabel, argb: isLabel ? C.labelText : C.darkText });
        applyBorder(cell,
          b("hair", C.bdrHair),
          isL ? b("medium", C.headerBg) : b("hair", C.bdrHair),
          b("hair", C.bdrHair),
          isR ? b("medium", C.headerBg) : b("hair", C.bdrHair)
        );
      }
      applyAlign(cell, "left", "middle");
    });
  }

  // ── ROWS 6-9 – Column headers ────────────────────────────────────────────────
  for (let rn = 6; rn <= 9; rn++) {
    ws.getRow(rn).height = 28;
    paintRow(ws, rn, COLS, (cell, cn) => {
      const isSilo = cn >= siloA && cn <= siloC;
      const isL = cn === 1; const isR = cn === COLS;
      const isTop = rn === 6; const isBot = rn === 9;

      if (isSilo) {
        cell.fill = solid(C.amberBg);
        applyFont(cell, { bold: true, argb: C.amberText, size: 10 });
        applyBorder(cell,
          isTop ? b("medium", C.amberBdr) : b("thin", C.amberBdr),
          b("thin", C.amberBdr),
          isBot ? b("medium", C.amberBdr) : b("thin", C.amberBdr),
          b("thin", C.amberBdr)
        );
      } else {
        cell.fill = solid(C.primaryBg);
        applyFont(cell, { bold: true, argb: C.white, size: 10 });
        applyBorder(cell,
          isTop ? b("medium", C.headerBg) : b("thin", C.bdrGreen),
          isL   ? b("medium", C.headerBg) : b("thin", C.bdrGreen),
          isBot ? b("medium", C.primaryBg): b("thin", C.bdrGreen),
          isR   ? b("medium", C.headerBg) : b("thin", C.bdrGreen)
        );
      }
      applyAlign(cell, "center", "middle", true);
    });
  }

  // ── DATA ROWS 10+ ─────────────────────────────────────────────────────────
  for (let rn = 10; rn <= lastR; rn++) {
    ws.getRow(rn).height = 20;
    const isEven = rn % 2 === 0;
    const isLast = rn === lastR;

    paintRow(ws, rn, COLS, (cell, cn) => {
      const raw = cell.value;
      const v   = (raw && typeof raw === "object" && "result" in raw) ? raw.result : raw;
      const isL = cn === 1; const isR = cn === COLS;
      const isSilo = cn >= siloA && cn <= siloC;

      if (isSilo) {
        cell.fill = solid(isEven ? C.amberRow : C.amberBase);
        applyFont(cell, {
          bold: typeof v === "number" && v > 0,
          argb: typeof v === "number" && v > 0 ? C.amberText : C.mutedText,
        });
        applyBorder(cell,
          b("hair", C.bdrAmber), b("thin", C.amberBdr),
          isLast ? b("medium", C.amberBdr) : b("hair", C.bdrAmber),
          b("thin", C.amberBdr)
        );
        applyAlign(cell, "right", "middle");
        if (typeof v === "number" && !cell.numFmt) cell.numFmt = "#,##0.0";

      } else {
        const bg = isEven ? C.rowAlt : C.rowBase;
        cell.fill = solid(bg);
        applyBorder(cell,
          b("hair", C.bdrHair),
          isL ? b("medium", C.headerBg) : b("hair", C.bdrHair),
          isLast ? b("medium", C.headerBg) : b("hair", C.bdrHair),
          isR ? b("medium", C.headerBg) : b("hair", C.bdrHair)
        );

        if (cn === dateC) {
          applyFont(cell, { argb: C.mutedText, size: 9 });
          applyAlign(cell, "center", "middle");
          if (!cell.numFmt && v) cell.numFmt = "ddd d/mm";
        } else if (typeof v === "number") {
          applyFont(cell, { argb: C.darkText });
          applyAlign(cell, "right", "middle");
          if (!cell.numFmt) cell.numFmt = v > 999 ? "#,##0" : v % 1 !== 0 ? "0.0" : "0";
        } else if (typeof v === "string") {
          const isBold = /TOTAL|CATCH|MORT|SUMMARY/i.test(v);
          applyFont(cell, { bold: isBold, argb: isBold ? C.labelText : C.darkText });
          applyAlign(cell, "left", "middle");
        } else {
          applyFont(cell, { argb: C.darkText });
        }
      }
    });
  }
}

// ─── EOB styler ───────────────────────────────────────────────────────────────
function styleEOB(ws) {
  const COLS = 25; const lastR = ws.rowCount;
  ws.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];
  [0,6,16,14,14,6,6,15,13,14,6,6,15,13,14,6,15,12,14,18,6,6,18,24,15,15]
    .forEach((w, i) => { if (i > 0 && i <= COLS) ws.getColumn(i).width = w; });

  ws.getRow(1).height = 40;
  paintRow(ws, 1, COLS, (cell) => {
    cell.fill = solid(C.headerBg);
    applyFont(cell, { bold: true, argb: C.white, size: 15 });
    applyAlign(cell, "left", "middle");
    applyBorder(cell, b("medium", C.headerBg), b("medium", C.headerBg), b("medium", C.primaryBg), b("medium", C.headerBg));
  });
  ws.getRow(2).height = 28;
  paintRow(ws, 2, COLS, (cell) => {
    cell.fill = solid(C.primaryBg);
    applyFont(cell, { bold: true, argb: C.white, size: 11 });
    applyAlign(cell, "left", "middle");
    applyBorder(cell, b("medium", C.primaryBg), b("medium", C.primaryBg), b("thin", C.bdrGreen), b("medium", C.primaryBg));
  });

  for (let rn = 3; rn <= 6; rn++) {
    ws.getRow(rn).height = 24;
    paintRow(ws, rn, COLS, (cell, cn) => {
      const raw = cell.value;
      const v   = (raw && typeof raw === "object" && "result" in raw) ? raw.result : raw;
      if (typeof v === "string" && /STARTER|GROWER|FINISHER|WITHDRAW/i.test(v)) {
        cell.fill = solid(C.amberBg); applyFont(cell, { bold: true, argb: C.amberText });
        applyBorder(cell, b("thin", C.amberBdr), b("thin", C.amberBdr), b("thin", C.amberBdr), b("thin", C.amberBdr));
      } else if (typeof v === "string") {
        cell.fill = solid(C.primaryBg); applyFont(cell, { bold: true, argb: C.white });
        applyBorder(cell, b("thin", C.bdrGreen), b("thin", C.bdrGreen), b("thin", C.bdrGreen), b("thin", C.bdrGreen));
      } else {
        cell.fill = solid(C.panelBg); applyFont(cell, { argb: C.darkText });
        applyBorder(cell, b("hair", C.bdrHair), cn===1?b("medium",C.headerBg):b("hair",C.bdrHair), b("hair",C.bdrHair), cn===COLS?b("medium",C.headerBg):b("hair",C.bdrHair));
      }
      applyAlign(cell, "center", "middle", true);
    });
  }

  for (let rn = 7; rn <= lastR; rn++) {
    ws.getRow(rn).height = 20;
    const isEven = rn % 2 === 0; const isLast = rn === lastR;
    paintRow(ws, rn, COLS, (cell, cn) => {
      const raw = cell.value;
      const v   = (raw && typeof raw === "object" && "result" in raw) ? raw.result : raw;
      const isL = cn === 1; const isR = cn === COLS;
      if (typeof v === "string" && /TOTAL|FEED|HAND|PURCHASE|USED|LEFT|WEIGHT/i.test(v)) {
        cell.fill = solid(C.blueBg); applyFont(cell, { bold: true, argb: C.blueText });
        applyBorder(cell, b("thin","FF9DC3E6"), b("thin","FF9DC3E6"), b("thin","FF9DC3E6"), b("thin","FF9DC3E6"));
        applyAlign(cell, "left", "middle");
      } else {
        cell.fill = solid(isEven ? C.rowAlt : C.rowBase);
        applyBorder(cell, b("hair",C.bdrHair), isL?b("medium",C.headerBg):b("hair",C.bdrHair), isLast?b("medium",C.headerBg):b("hair",C.bdrHair), isR?b("medium",C.headerBg):b("hair",C.bdrHair));
        if (typeof v === "number") { applyFont(cell, { argb: C.darkText }); applyAlign(cell, "right", "middle"); if (!cell.numFmt) cell.numFmt = v > 999 ? "#,##0" : "0.00"; }
        else { applyFont(cell, { argb: C.darkText }); applyAlign(cell, "left", "middle"); }
      }
    });
  }
}

// ─── Stock Take styler ────────────────────────────────────────────────────────
function styleStock(ws) {
  const COLS = 9; const lastR = ws.rowCount;
  ws.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];
  [0,6,17,13,21,17,17,17,17,17].forEach((w,i) => { if (i>0 && i<=COLS) ws.getColumn(i).width = w; });

  ws.getRow(1).height = 40;
  paintRow(ws, 1, COLS, (cell) => {
    cell.fill = solid(C.headerBg); applyFont(cell, { bold: true, argb: C.white, size: 15 });
    applyAlign(cell, "left", "middle");
    applyBorder(cell, b("medium",C.headerBg), b("medium",C.headerBg), b("medium",C.primaryBg), b("medium",C.headerBg));
  });
  ws.getRow(2).height = 28;
  paintRow(ws, 2, COLS, (cell) => {
    cell.fill = solid(C.primaryBg); applyFont(cell, { bold: true, argb: C.white, size: 11 });
    applyAlign(cell, "left", "middle");
    applyBorder(cell, b("medium",C.primaryBg), b("medium",C.primaryBg), b("thin",C.bdrGreen), b("medium",C.primaryBg));
  });
  for (let rn = 3; rn <= 5; rn++) {
    ws.getRow(rn).height = 26;
    paintRow(ws, rn, COLS, (cell, cn) => {
      cell.fill = solid(C.primaryBg); applyFont(cell, { bold: true, argb: C.white });
      applyBorder(cell, b("thin",C.bdrGreen), cn===1?b("medium",C.headerBg):b("thin",C.bdrGreen), b("thin",C.bdrGreen), cn===COLS?b("medium",C.headerBg):b("thin",C.bdrGreen));
      applyAlign(cell, "center", "middle", true);
    });
  }
  for (let rn = 6; rn <= lastR; rn++) {
    ws.getRow(rn).height = 20;
    const isEven = rn % 2 === 0; const isLast = rn === lastR;
    paintRow(ws, rn, COLS, (cell, cn) => {
      const raw = cell.value; const v = (raw && typeof raw === "object" && "result" in raw) ? raw.result : raw;
      const isL = cn===1; const isR = cn===COLS;
      if (typeof v === "string" && /SHED\s*\d|^\d+\s*&/i.test(v)) {
        cell.fill = solid(C.primaryBg); applyFont(cell, { bold: true, argb: C.white });
        applyBorder(cell, b("thin",C.bdrGreen), b("thin",C.bdrGreen), b("thin",C.bdrGreen), b("thin",C.bdrGreen));
        applyAlign(cell, "center", "middle");
      } else {
        cell.fill = solid(isEven ? C.rowAlt : C.rowBase);
        applyBorder(cell, b("hair",C.bdrHair), isL?b("medium",C.headerBg):b("hair",C.bdrHair), isLast?b("medium",C.headerBg):b("hair",C.bdrHair), isR?b("medium",C.headerBg):b("hair",C.bdrHair));
        if (typeof v === "number") { applyFont(cell, { argb: C.darkText }); applyAlign(cell, "right", "middle"); if (!cell.numFmt) cell.numFmt = "#,##0"; }
        else { applyFont(cell, { argb: C.darkText }); applyAlign(cell, "left", "middle"); }
      }
    });
  }
}

// ─── Build workbook ───────────────────────────────────────────────────────────
const MAX = { shed1: 34, shed: 23, eob: 25, stock: 9, guide: 8 };

const srcWb = new ExcelJS.Workbook();
await srcWb.xlsx.readFile(SRC);
const dstWb = new ExcelJS.Workbook();
dstWb.creator = "Silo Mate"; dstWb.modified = new Date();

for (const srcWs of srcWb.worksheets) {
  const n = srcWs.name.trim().toUpperCase();
  let type;
  if      (n.match(/SHED\s*1\s*&\s*2/))              type = "shed1";
  else if (n.includes("SHED"))                        type = "shed";
  else if (n.includes("END") || n.includes("BATCH")) type = "eob";
  else if (n.includes("STOCK"))                       type = "stock";
  else                                                type = "guide";

  const keepCols = Math.min(MAX[type], getLastCol(srcWs));
  const dstWs = dstWb.addWorksheet(srcWs.name.trim(), {
    properties: { tabColor: { argb: C.primaryBg } },
    ...(type === "guide" ? { state: "hidden" } : {}),
  });

  copyData(srcWs, dstWs, keepCols);

  if      (type === "shed1" || type === "shed") styleShed(dstWs, type === "shed1");
  else if (type === "eob")   styleEOB(dstWs);
  else if (type === "stock") styleStock(dstWs);

  console.log(`✓ ${srcWs.name.trim().padEnd(20)} ${dstWs.columnCount} cols`);
}

await dstWb.xlsx.writeFile(OUT);
console.log("Done →", OUT);
