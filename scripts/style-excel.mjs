import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "../../attached_assets/feed_program_batch_120_1775355933095.xlsx");
const OUT = path.join(__dirname, "public/silo-mate-feed-program.xlsx");

// ── Palette ───────────────────────────────────────────────────────────────────
const G = {
  darkGreen:  "FF1A5C36",
  green:      "FF217346",
  midGreen:   "FF2E8B57",
  lightGreen: "FFD6EAD6",
  paleGreen:  "FFF0F7F0",
  white:      "FFFFFFFF",
  offWhite:   "FFF8FBF8",
  amber:      "FFFFD966",
  amberLight: "FFFFF2CC",
  amberFaint: "FFFEF9E7",
  amberDark:  "FFBF8F00",
  blue:       "FFD6E4F0",
  blueMid:    "FF9DC3E6",
  blueDark:   "FF2F75B6",
};

const fillSolid = (c) => ({ type: "pattern", pattern: "solid", fgColor: { argb: c } });
const thinBdr   = (c = "FFB0C8B0") => ({ style: "thin",   color: { argb: c } });
const hairBdr   = (c = "FFB0C8B0") => ({ style: "hair",   color: { argb: c } });
const medBdr    = (c) => ({ style: "medium", color: { argb: c } });

function fnt(cell, opts = {}) {
  cell.font = {
    name: "Calibri",
    size: opts.size || 10,
    bold: !!opts.bold,
    italic: !!opts.italic,
    color: { argb: opts.color || "FF000000" },
  };
}

function hdrCell(cell, bg = G.green, size = 10) {
  cell.fill = fillSolid(bg);
  fnt(cell, { bold: true, color: G.white, size });
  cell.border = { top: thinBdr(G.green), left: thinBdr(G.green), bottom: thinBdr(G.green), right: thinBdr(G.green) };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

function dataCell(cell, bg = G.white) {
  cell.fill = fillSolid(bg);
  fnt(cell);
  cell.border = { top: hairBdr(), left: hairBdr(), bottom: hairBdr(), right: hairBdr() };
  cell.alignment = { vertical: "middle" };
}

// ── Find last used column ─────────────────────────────────────────────────────
function getLastUsedCol(ws) {
  let max = 0;
  ws.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (_, cn) => { if (cn > max) max = cn; });
  });
  return max;
}

// ── Copy sheet from src to dst (only cols 1..keepCols) ────────────────────────
function copySheet(src, dst, keepCols) {
  // Copy merged cells (only those within keepCols)
  (src.model.merges || []).forEach((m) => {
    try {
      const [tl, br] = m.split(":");
      const brCol = ExcelJS.utils?.col2num
        ? ExcelJS.utils.col2num(br.match(/[A-Z]+/)[0])
        : (() => { let n=0; for(const c of br.match(/[A-Z]+/)[0]) n=n*26+(c.charCodeAt(0)-64); return n; })();
      if (brCol <= keepCols) dst.mergeCells(m);
    } catch {}
  });

  // Copy rows & cells
  src.eachRow((srcRow, rn) => {
    const dstRow = dst.getRow(rn);
    dstRow.height = srcRow.height || undefined;

    for (let cn = 1; cn <= keepCols; cn++) {
      const srcCell = srcRow.getCell(cn);
      const dstCell = dstRow.getCell(cn);

      // Copy value / formula
      if (srcCell.formula) {
        dstCell.value = { formula: srcCell.formula, result: srcCell.result };
      } else if (srcCell.value !== null && srcCell.value !== undefined) {
        dstCell.value = srcCell.value;
      }

      // Copy number format
      if (srcCell.numFmt) dstCell.numFmt = srcCell.numFmt;

      // Copy alignment
      if (srcCell.alignment) dstCell.alignment = { ...srcCell.alignment };
    }
  });
}

// ── Per-sheet column widths (only for data columns) ───────────────────────────
function applyWidths(ws, map) {
  Object.entries(map).forEach(([n, w]) => {
    const c = ws.getColumn(parseInt(n));
    if (c) c.width = w;
  });
}

// Shed 1&2 has an extra block of columns 1-13 for historical reasons
const W_SHED1 = { 1:5,2:5,3:5,4:5,5:5,6:5,7:5,8:5,9:5,10:5,11:5,12:5,13:5, 14:11,15:9,16:9,17:9,18:9,19:9,20:9, 21:9,22:9,23:9,24:9, 25:9,26:9,27:9, 28:12,29:14,30:12,31:11,32:12,33:11,34:6 };
const W_SHED  = { 1:5,2:5, 3:11,4:9,5:9,6:9,7:9,8:9,9:9, 10:9,11:9,12:9,13:9, 14:9,15:9,16:9, 17:12,18:14,19:12,20:11,21:12,22:11,23:6 };
const W_EOB   = { 1:6,2:14,3:13,4:13,5:6,6:6,7:14,8:12,9:13,10:6,11:6,12:14,13:12,14:13,15:6,16:14,17:11,18:13,19:17,20:6,21:6,22:17,23:23,24:14,25:14 };
const W_STOCK = { 1:6,2:15,3:11,4:19,5:16,6:16,7:16,8:16,9:16 };
const W_GUIDE = { 1:8,2:9,3:9,4:15,5:15,6:13,7:13,8:13 };

// ── Style: Shed ───────────────────────────────────────────────────────────────
function styleShed(ws, isBig) {
  const siloA = isBig ? 22 : 11;
  const siloC = isBig ? 24 : 13;
  const dateC = isBig ? 14 : 3;

  ws.properties = ws.properties ?? {};
  ws.properties.tabColor = { argb: G.green };
  ws.views = [{ state: "frozen", ySplit: 9, showGridLines: false }];

  ws.eachRow((row, rn) => {
    row.height = rn === 1 ? 32 : rn <= 5 ? 22 : rn <= 9 ? 28 : 20;

    row.eachCell({ includeEmpty: false }, (cell) => {
      const raw = cell.value;
      const v   = (raw && typeof raw === "object" && "result" in raw) ? raw.result : raw;
      const cn  = cell._column?._number ?? 0;

      if (rn <= 2) {
        cell.fill = fillSolid(G.darkGreen);
        fnt(cell, { bold: true, color: G.white, size: rn === 1 ? 14 : 11 });
        cell.alignment = { vertical: "middle" };
        return;
      }
      if (rn >= 3 && rn <= 5) {
        if (typeof v === "string" && /STR|GWR|FIN|WDW/i.test(v)) {
          cell.fill = fillSolid(G.amber); fnt(cell, { bold: true, color: G.amberDark });
        } else if (typeof v === "string") {
          cell.fill = fillSolid(G.midGreen); fnt(cell, { bold: true, color: G.white });
        } else {
          cell.fill = fillSolid(G.lightGreen); fnt(cell, { bold: true });
        }
        cell.border = { top: thinBdr(), left: thinBdr(), bottom: thinBdr(), right: thinBdr() };
        cell.alignment = { vertical: "middle" };
        return;
      }
      if (rn >= 6 && rn <= 9) {
        if (cn >= siloA && cn <= siloC) {
          cell.fill = fillSolid(G.amber);
          fnt(cell, { bold: true, color: G.amberDark });
          cell.border = { top: medBdr(G.amberDark), left: thinBdr(G.amberDark), bottom: medBdr(G.amberDark), right: thinBdr(G.amberDark) };
          cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        } else {
          hdrCell(cell, G.green);
        }
        return;
      }
      // Data
      const isAlt = rn % 2 === 0;
      const bg = isAlt ? G.lightGreen : G.offWhite;
      if (cn >= siloA && cn <= siloC) {
        cell.fill = fillSolid(isAlt ? G.amberLight : G.amberFaint);
        fnt(cell, { bold: typeof v === "number" && v > 0 });
        cell.border = { top: hairBdr(G.amberDark), left: thinBdr(G.amberDark), bottom: hairBdr(G.amberDark), right: thinBdr(G.amberDark) };
        cell.alignment = { vertical: "middle", horizontal: "right" };
        if (typeof v === "number") cell.numFmt = cell.numFmt || "#,##0.0";
        return;
      }
      if (typeof v === "number") {
        dataCell(cell, bg);
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = cell.numFmt || (v > 999 ? "#,##0" : v % 1 !== 0 ? "0.0" : "0");
      } else if (v != null) {
        dataCell(cell, bg);
      }
    });
  });

  applyWidths(ws, isBig ? W_SHED1 : W_SHED);
}

// ── Style: End of Batch ───────────────────────────────────────────────────────
function styleEOB(ws) {
  ws.properties = ws.properties ?? {};
  ws.properties.tabColor = { argb: G.green };
  ws.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];

  ws.eachRow((row, rn) => {
    row.height = rn <= 2 ? 28 : rn <= 6 ? 24 : 20;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const raw = cell.value;
      const v   = (raw && typeof raw === "object" && "result" in raw) ? raw.result : raw;
      const isAlt = rn % 2 === 0;
      if (rn <= 2) {
        cell.fill = fillSolid(G.darkGreen); fnt(cell, { bold: true, color: G.white, size: rn===1?13:11 });
        cell.alignment = { vertical: "middle" }; return;
      }
      if (rn >= 3 && rn <= 6) {
        if (typeof v === "string" && /STARTER|GROWER|FINISHER|WITHDRAW/i.test(v)) {
          cell.fill = fillSolid(G.amber); fnt(cell, { bold: true, color: G.amberDark });
        } else if (typeof v === "string") { hdrCell(cell, G.green); }
        else { cell.fill = fillSolid(G.lightGreen); fnt(cell, { bold: true }); }
        cell.border = { top: thinBdr(), left: thinBdr(), bottom: thinBdr(), right: thinBdr() };
        cell.alignment = { vertical: "middle", horizontal: "center" }; return;
      }
      const bg = isAlt ? G.lightGreen : G.offWhite;
      if (typeof v === "number") {
        dataCell(cell, bg); cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = cell.numFmt || (v > 999 ? "#,##0" : "0.0");
      } else if (typeof v === "string" && /TOTAL|FEED|HAND|PURCHASE|USED|LEFT/i.test(v)) {
        cell.fill = fillSolid(G.blue); fnt(cell, { bold: true, color: G.blueDark });
        cell.border = { top: thinBdr(G.blueMid), left: thinBdr(G.blueMid), bottom: thinBdr(G.blueMid), right: thinBdr(G.blueMid) };
      } else if (v != null) { dataCell(cell, bg); }
    });
  });
  applyWidths(ws, W_EOB);
}

// ── Style: Weekly Stock Take ──────────────────────────────────────────────────
function styleStock(ws) {
  ws.properties = ws.properties ?? {};
  ws.properties.tabColor = { argb: G.green };
  ws.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];

  ws.eachRow((row, rn) => {
    row.height = rn <= 5 ? 26 : 20;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const raw = cell.value;
      const v   = (raw && typeof raw === "object" && "result" in raw) ? raw.result : raw;
      const isAlt = rn % 2 === 0;
      if (rn <= 2) {
        cell.fill = fillSolid(G.darkGreen); fnt(cell, { bold: true, color: G.white, size: 12 });
        cell.alignment = { vertical: "middle" }; return;
      }
      if (rn >= 3 && rn <= 5) {
        if (typeof v === "string") hdrCell(cell, G.green);
        else { cell.fill = fillSolid(G.lightGreen); fnt(cell, { bold: true }); }
        cell.border = { top: thinBdr(), left: thinBdr(), bottom: thinBdr(), right: thinBdr() }; return;
      }
      const bg = isAlt ? G.lightGreen : G.offWhite;
      if (typeof v === "number") {
        dataCell(cell, bg); cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = cell.numFmt || "#,##0";
      } else if (typeof v === "string" && /SHED|\d\s*&/i.test(v)) {
        cell.fill = fillSolid(G.midGreen); fnt(cell, { bold: true, color: G.white });
        cell.border = { top: thinBdr(G.green), left: thinBdr(G.green), bottom: thinBdr(G.green), right: thinBdr(G.green) };
      } else if (v != null) { dataCell(cell, bg); }
    });
  });
  applyWidths(ws, W_STOCK);
}

// ── Style: Consumption Guide ──────────────────────────────────────────────────
function styleGuide(ws) {
  ws.properties = ws.properties ?? {};
  ws.properties.tabColor = { argb: G.green };
  ws.state = "hidden";
  applyWidths(ws, W_GUIDE);
}

// ── Max columns per sheet type ────────────────────────────────────────────────
const MAX_COLS = { shed1: 34, shed: 23, eob: 25, stock: 9, guide: 8 };

// ── Main ──────────────────────────────────────────────────────────────────────
const srcWb = new ExcelJS.Workbook();
await srcWb.xlsx.readFile(SRC);

const dstWb = new ExcelJS.Workbook();
dstWb.creator  = "Silo Mate";
dstWb.modified = new Date();

for (const srcWs of srcWb.worksheets) {
  const n = srcWs.name.trim().toUpperCase();
  let type;
  if (n.includes("SHED 1"))                          type = "shed1";
  else if (n.includes("SHED"))                        type = "shed";
  else if (n.includes("END") || n.includes("BATCH")) type = "eob";
  else if (n.includes("STOCK"))                       type = "stock";
  else                                                type = "guide";

  const keepCols = MAX_COLS[type];
  const actualLast = getLastUsedCol(srcWs);
  const colLimit = Math.min(keepCols, actualLast);

  // Add a fresh sheet to the destination workbook
  const dstWs = dstWb.addWorksheet(srcWs.name.trim(), {
    properties: { tabColor: { argb: "FF217346" } },
  });

  // Copy content
  copySheet(srcWs, dstWs, colLimit);

  // Style the new sheet
  if (type === "shed1" || type === "shed") styleShed(dstWs, type === "shed1");
  else if (type === "eob")   styleEOB(dstWs);
  else if (type === "stock") styleStock(dstWs);
  else                       styleGuide(dstWs);

  console.log(`✓ ${srcWs.name.trim().padEnd(18)} src-cols:${actualLast}  kept:${colLimit}  dst-cols:${dstWs.columnCount}`);
}

await dstWb.xlsx.writeFile(OUT);
console.log("Done →", OUT);
