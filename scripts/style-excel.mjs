import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "../../attached_assets/feed_program_batch_120_1775355933095.xlsx");
const OUT = path.join(__dirname, "public/silo-mate-feed-program.xlsx");

// ── App Palette ───────────────────────────────────────────────────────────────
const P = {
  darkGreen:  "FF1A5C36",
  green:      "FF217346",
  midGreen:   "FF2E8B57",
  lightGreen: "FFD6EAD6",
  paleGreen:  "FFF0F7F0",
  panelGreen: "FFE8F5E8",
  white:      "FFFFFFFF",
  amber:      "FFFFC000",
  amberLight: "FFFFF2CC",
  amberFaint: "FFFEF9ED",
  amberDark:  "FF9C6500",
  blue:       "FFD6E4F0",
  blueDark:   "FF2F75B6",
  charcoal:   "FF1F1F1F",
  darkText:   "FF2D3D2D",
  muted:      "FF5A5A5A",
};

const fill  = (c) => ({ type: "pattern", pattern: "solid", fgColor: { argb: c } });
const bdr   = (s, c) => ({ style: s, color: { argb: c } });
const thin  = (c = "FF9EC89E") => bdr("thin",   c);
const hair  = (c = "FFBBD4BB") => bdr("hair",   c);
const med   = (c = P.green)    => bdr("medium", c);
const thick = (c = P.darkGreen) => bdr("thick", c);
const allBdr = (b) => ({ top: b, left: b, bottom: b, right: b });

function fnt(cell, opts = {}) {
  const { bold=false, size=10, color=P.charcoal, italic=false } = opts;
  cell.font = { name: "Calibri", size, bold, italic, color: { argb: color } };
}

function align(cell, h="left", v="middle", wrap=false) {
  cell.alignment = { horizontal: h, vertical: v, wrapText: wrap };
}

// Style every cell in a row across all columns (including empty/merged)
function styleRowAll(ws, rn, totalC, applyFn) {
  const row = ws.getRow(rn);
  for (let c = 1; c <= totalC; c++) {
    applyFn(row.getCell(c), c, rn);
  }
}

// ── Copy sheet (values only, no styles) ──────────────────────────────────────
function getLastUsedCol(ws) {
  let max = 0;
  ws.eachRow((row) => row.eachCell({ includeEmpty: false }, (_, cn) => { if (cn > max) max = cn; }));
  return max;
}

function copySheet(src, dst, keepCols) {
  (src.model.merges || []).forEach((m) => {
    try {
      const br = m.split(":")[1];
      let c = 0; for (const ch of br.match(/[A-Z]+/)[0]) c = c * 26 + (ch.charCodeAt(0) - 64);
      if (c <= keepCols) dst.mergeCells(m);
    } catch {}
  });
  src.eachRow((srcRow, rn) => {
    const dstRow = dst.getRow(rn);
    if (srcRow.height) dstRow.height = srcRow.height;
    for (let cn = 1; cn <= keepCols; cn++) {
      const sc = srcRow.getCell(cn);
      const dc = dstRow.getCell(cn);
      if (sc.formula)           dc.value = { formula: sc.formula, result: sc.result };
      else if (sc.value != null) dc.value = sc.value;
      if (sc.numFmt)             dc.numFmt = sc.numFmt;
    }
  });
}

// ── Column widths ─────────────────────────────────────────────────────────────
const W = {
  shed1: { 1:5,2:5,3:5,4:5,5:5,6:5,7:5,8:5,9:5,10:5,11:5,12:5,13:5, 14:12,15:10,16:10,17:10,18:10,19:10,20:10, 21:10,22:9,23:9,24:9, 25:9,26:9,27:9, 28:13,29:15,30:13,31:12,32:13,33:12,34:6 },
  shed:  { 1:5,2:5, 3:12,4:10,5:10,6:10,7:10,8:10,9:10, 10:10,11:9,12:9,13:9, 14:9,15:9,16:9, 17:13,18:15,19:13,20:12,21:13,22:12,23:6 },
  eob:   { 1:6,2:16,3:14,4:14,5:6,6:6,7:15,8:13,9:14,10:6,11:6,12:15,13:13,14:14,15:6,16:15,17:12,18:14,19:18,20:6,21:6,22:18,23:24,24:15,25:15 },
  stock: { 1:6,2:17,3:13,4:21,5:17,6:17,7:17,8:17,9:17 },
  guide: { 1:8,2:9,3:9,4:15,5:15,6:13,7:13,8:13 },
};

function applyWidths(ws, key) {
  Object.entries(W[key]).forEach(([n, w]) => { const c = ws.getColumn(+n); if (c) c.width = w; });
}

// ── SHED styling ──────────────────────────────────────────────────────────────
function styleShed(ws, isBig) {
  const key   = isBig ? "shed1" : "shed";
  const total = isBig ? 34 : 23;
  const siloA = isBig ? 22 : 11;
  const siloC = isBig ? 24 : 13;
  const dateC = isBig ? 14 : 3;
  const lastR = ws.rowCount;

  ws.properties = ws.properties ?? {};
  ws.properties.tabColor = { argb: P.green };
  ws.views = [{ state: "frozen", ySplit: 9, showGridLines: false }];

  // ── Row 1: Dark green banner ─────────────────────────────────────────────
  ws.getRow(1).height = 38;
  styleRowAll(ws, 1, total, (cell) => {
    cell.fill = fill(P.darkGreen);
    fnt(cell, { bold: true, color: P.white, size: 15 });
    align(cell, "left", "middle");
    cell.border = { top: thick(), left: thick(), right: thick(), bottom: med() };
  });

  // ── Row 2: Green sub-banner ──────────────────────────────────────────────
  ws.getRow(2).height = 26;
  styleRowAll(ws, 2, total, (cell) => {
    cell.fill = fill(P.green);
    fnt(cell, { bold: true, color: P.white, size: 11 });
    align(cell, "left", "middle");
    cell.border = { top: med(), left: thick(), right: thick(), bottom: thin() };
  });

  // ── Rows 3-5: Info panel ─────────────────────────────────────────────────
  for (let rn = 3; rn <= 5; rn++) {
    ws.getRow(rn).height = 22;
    styleRowAll(ws, rn, total, (cell, cn) => {
      const raw = cell.value;
      const v   = (raw && typeof raw === "object" && "result" in raw) ? raw.result : raw;
      const isL = cn === 1;
      const isR = cn === total;
      const baseBdr = { left: isL ? thick() : hair(), right: isR ? thick() : hair(), top: hair(), bottom: hair() };

      if (typeof v === "string" && /STR|GWR|FIN|WDW/i.test(v)) {
        cell.fill = fill(P.amber);
        fnt(cell, { bold: true, color: P.amberDark });
        cell.border = allBdr(thin(P.amberDark));
      } else {
        cell.fill = fill(P.panelGreen);
        fnt(cell, { bold: typeof v === "string" && v.length > 0, color: P.green, size: 10 });
        cell.border = baseBdr;
      }
      align(cell, "left", "middle");
    });
  }

  // ── Rows 6-9: Column headers ─────────────────────────────────────────────
  for (let rn = 6; rn <= 9; rn++) {
    ws.getRow(rn).height = 26;
    styleRowAll(ws, rn, total, (cell, cn) => {
      const isSilo = cn >= siloA && cn <= siloC;
      const isL    = cn === 1;
      const isR    = cn === total;
      const isTop  = rn === 6;
      const isBot  = rn === 9;

      if (isSilo) {
        cell.fill = fill(P.amber);
        fnt(cell, { bold: true, color: P.amberDark, size: 10 });
        cell.border = {
          top:    isTop ? med(P.amberDark) : thin(P.amberDark),
          bottom: isBot ? med(P.amberDark) : thin(P.amberDark),
          left:   thin(P.amberDark),
          right:  thin(P.amberDark),
        };
      } else {
        cell.fill = fill(P.green);
        fnt(cell, { bold: true, color: P.white, size: 10 });
        cell.border = {
          top:    isTop ? thick() : thin(P.green),
          bottom: isBot ? med()   : thin(P.green),
          left:   isL   ? thick() : thin(P.green),
          right:  isR   ? thick() : thin(P.green),
        };
      }
      align(cell, "center", "middle", true);
    });
  }

  // ── Data rows 10+ ────────────────────────────────────────────────────────
  ws.eachRow((row, rn) => {
    if (rn < 10) return;
    const isEven = rn % 2 === 0;
    const bg = isEven ? P.lightGreen : P.paleGreen;
    const isLast = rn === lastR;

    row.height = 20;

    // Style ALL columns in data rows (not just filled cells)
    for (let cn = 1; cn <= total; cn++) {
      const cell = row.getCell(cn);
      const raw  = cell.value;
      const v    = (raw && typeof raw === "object" && "result" in raw) ? raw.result : raw;
      const isL  = cn === 1;
      const isR  = cn === total;

      const outerL = isL ? thick() : null;
      const outerR = isR ? thick() : null;
      const outerB = isLast ? thick() : null;

      if (cn >= siloA && cn <= siloC) {
        cell.fill = fill(isEven ? P.amberLight : P.amberFaint);
        fnt(cell, { bold: typeof v === "number" && v > 0, color: P.amberDark });
        cell.border = {
          top:    hair(P.amberDark),
          bottom: outerB || hair(P.amberDark),
          left:   thin(P.amberDark),
          right:  thin(P.amberDark),
        };
        align(cell, "right", "middle");
        if (typeof v === "number" && !cell.numFmt) cell.numFmt = "#,##0.0";
      } else {
        cell.fill = fill(bg);
        const dataBdr = {
          top:    hair(),
          bottom: outerB || hair(),
          left:   outerL || hair(),
          right:  outerR || hair(),
        };
        cell.border = dataBdr;

        if (cn === dateC) {
          fnt(cell, { color: P.muted, size: 9 });
          align(cell, "center", "middle");
          if (!cell.numFmt && v) cell.numFmt = "ddd d/mm";
        } else if (typeof v === "number") {
          fnt(cell, { color: P.darkText });
          align(cell, "right", "middle");
          if (!cell.numFmt) cell.numFmt = v > 999 ? "#,##0" : v % 1 !== 0 ? "0.0" : "0";
        } else if (typeof v === "string") {
          fnt(cell, { bold: /TOTAL|CATCH|MORT/i.test(v), color: P.darkText });
          align(cell, "left", "middle");
        } else {
          fnt(cell, { color: P.darkText });
        }
      }
    }
  });

  applyWidths(ws, key);
}

// ── EOB styling ───────────────────────────────────────────────────────────────
function styleEOB(ws) {
  const total = 25;
  const lastR = ws.rowCount;
  ws.properties = ws.properties ?? {};
  ws.properties.tabColor = { argb: P.green };
  ws.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];

  ws.getRow(1).height = 38;
  styleRowAll(ws, 1, total, (cell) => {
    cell.fill = fill(P.darkGreen);
    fnt(cell, { bold: true, color: P.white, size: 14 });
    align(cell, "left", "middle");
    cell.border = { top: thick(), left: thick(), right: thick(), bottom: med() };
  });

  ws.getRow(2).height = 26;
  styleRowAll(ws, 2, total, (cell) => {
    cell.fill = fill(P.green);
    fnt(cell, { bold: true, color: P.white, size: 11 });
    align(cell, "left", "middle");
    cell.border = { top: med(), left: thick(), right: thick(), bottom: thin() };
  });

  for (let rn = 3; rn <= 6; rn++) {
    ws.getRow(rn).height = 24;
    styleRowAll(ws, rn, total, (cell, cn) => {
      const raw = cell.value;
      const v   = (raw && typeof raw === "object" && "result" in raw) ? raw.result : raw;
      if (typeof v === "string" && /STARTER|GROWER|FINISHER|WITHDRAW/i.test(v)) {
        cell.fill = fill(P.amber); fnt(cell, { bold: true, color: P.amberDark });
        cell.border = allBdr(thin(P.amberDark));
      } else if (typeof v === "string") {
        cell.fill = fill(P.green); fnt(cell, { bold: true, color: P.white });
        cell.border = allBdr(thin(P.green));
      } else {
        cell.fill = fill(P.panelGreen); fnt(cell, { color: P.darkText });
        cell.border = allBdr(hair());
      }
      align(cell, "center", "middle", true);
    });
  }

  ws.eachRow((row, rn) => {
    if (rn < 7) return;
    row.height = 20;
    const isEven = rn % 2 === 0;
    const bg = isEven ? P.lightGreen : P.paleGreen;
    const isLast = rn === lastR;

    for (let cn = 1; cn <= total; cn++) {
      const cell = row.getCell(cn);
      const raw  = cell.value;
      const v    = (raw && typeof raw === "object" && "result" in raw) ? raw.result : raw;
      const isL = cn === 1; const isR = cn === total;

      cell.fill = fill(bg);
      cell.border = {
        top:    hair(),
        bottom: isLast ? thick() : hair(),
        left:   isL ? thick() : hair(),
        right:  isR ? thick() : hair(),
      };
      if (typeof v === "string" && /TOTAL|FEED|HAND|PURCHASE|USED|LEFT|WEIGHT/i.test(v)) {
        cell.fill = fill(P.blue); fnt(cell, { bold: true, color: P.blueDark });
        cell.border = allBdr(thin("FF9DC3E6"));
      } else if (typeof v === "number") {
        fnt(cell, { color: P.darkText }); align(cell, "right", "middle");
        if (!cell.numFmt) cell.numFmt = v > 999 ? "#,##0" : "0.00";
      } else { fnt(cell, { color: P.darkText }); align(cell, "left", "middle"); }
    }
  });

  applyWidths(ws, "eob");
}

// ── Stock Take styling ────────────────────────────────────────────────────────
function styleStock(ws) {
  const total = 9;
  const lastR = ws.rowCount;
  ws.properties = ws.properties ?? {};
  ws.properties.tabColor = { argb: P.green };
  ws.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];

  ws.getRow(1).height = 38;
  styleRowAll(ws, 1, total, (cell) => {
    cell.fill = fill(P.darkGreen); fnt(cell, { bold: true, color: P.white, size: 14 });
    align(cell, "left", "middle");
    cell.border = { top: thick(), left: thick(), right: thick(), bottom: med() };
  });
  ws.getRow(2).height = 26;
  styleRowAll(ws, 2, total, (cell) => {
    cell.fill = fill(P.green); fnt(cell, { bold: true, color: P.white, size: 11 });
    align(cell, "left", "middle");
    cell.border = { top: med(), left: thick(), right: thick(), bottom: thin() };
  });
  for (let rn = 3; rn <= 5; rn++) {
    ws.getRow(rn).height = 26;
    styleRowAll(ws, rn, total, (cell, cn) => {
      cell.fill = fill(P.green); fnt(cell, { bold: true, color: P.white });
      cell.border = { top: thin(P.green), bottom: thin(P.green), left: cn===1?thick():thin(P.green), right: cn===total?thick():thin(P.green) };
      align(cell, "center", "middle", true);
    });
  }

  ws.eachRow((row, rn) => {
    if (rn < 6) return;
    row.height = 20;
    const isEven = rn % 2 === 0;
    const bg = isEven ? P.lightGreen : P.paleGreen;
    const isLast = rn === lastR;

    for (let cn = 1; cn <= total; cn++) {
      const cell = row.getCell(cn);
      const raw  = cell.value;
      const v    = (raw && typeof raw === "object" && "result" in raw) ? raw.result : raw;
      const isL = cn === 1; const isR = cn === total;

      if (typeof v === "string" && /SHED\s*\d|^\d+\s*&/i.test(v)) {
        cell.fill = fill(P.midGreen); fnt(cell, { bold: true, color: P.white });
        cell.border = allBdr(thin(P.green)); align(cell, "center", "middle");
      } else {
        cell.fill = fill(bg);
        cell.border = { top: hair(), bottom: isLast?thick():hair(), left: isL?thick():hair(), right: isR?thick():hair() };
        if (typeof v === "number") {
          fnt(cell, { color: P.darkText }); align(cell, "right", "middle");
          if (!cell.numFmt) cell.numFmt = "#,##0";
        } else { fnt(cell, { color: P.darkText }); align(cell, "left", "middle"); }
      }
    }
  });

  applyWidths(ws, "stock");
}

// ── Guide (hidden) ────────────────────────────────────────────────────────────
function styleGuide(ws) {
  ws.properties = ws.properties ?? {};
  ws.state = "hidden";
  applyWidths(ws, "guide");
}

// ── Main ──────────────────────────────────────────────────────────────────────
const MAX_COLS = { shed1: 34, shed: 23, eob: 25, stock: 9, guide: 8 };

const srcWb = new ExcelJS.Workbook();
await srcWb.xlsx.readFile(SRC);

const dstWb = new ExcelJS.Workbook();
dstWb.creator  = "Silo Mate";
dstWb.modified = new Date();

for (const srcWs of srcWb.worksheets) {
  const n = srcWs.name.trim().toUpperCase();
  let type;
  if      (n.match(/SHED\s*1\s*&\s*2/))              type = "shed1";
  else if (n.includes("SHED"))                        type = "shed";
  else if (n.includes("END") || n.includes("BATCH")) type = "eob";
  else if (n.includes("STOCK"))                       type = "stock";
  else                                                type = "guide";

  const keepCols = Math.min(MAX_COLS[type], getLastUsedCol(srcWs));
  const dstWs = dstWb.addWorksheet(srcWs.name.trim(), {
    properties: { tabColor: { argb: P.green } },
  });

  copySheet(srcWs, dstWs, keepCols);

  if (type === "shed1" || type === "shed") styleShed(dstWs, type === "shed1");
  else if (type === "eob")   styleEOB(dstWs);
  else if (type === "stock") styleStock(dstWs);
  else                       styleGuide(dstWs);

  console.log(`✓ ${srcWs.name.trim().padEnd(20)} cols:${dstWs.columnCount}`);
}

await dstWb.xlsx.writeFile(OUT);
console.log("Done →", OUT);
