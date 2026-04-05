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
  amberDark:  "FFBF8F00",
  blue:       "FFD6E4F0",
  blueMid:    "FF9DC3E6",
  blueDark:   "FF2F75B6",
  grey:       "FFE2E2E2",
  darkGrey:   "FF595959",
  black:      "FF000000",
};

const fill  = (c) => ({ type: "pattern", pattern: "solid", fgColor: { argb: c } });
const bl    = (s = "thin", c = "FFB0C8B0") => ({ style: s, color: { argb: c } });
const boldBorder = (c = G.green) => ({ style: "medium", color: { argb: c } });

function applyFont(cell, opts = {}) {
  cell.font = {
    name: "Calibri",
    size: opts.size || 10,
    bold: !!opts.bold,
    italic: !!opts.italic,
    color: { argb: opts.color || G.black },
  };
}

function hdrCell(cell, bg = G.green, size = 10) {
  cell.fill = fill(bg);
  applyFont(cell, { bold: true, color: G.white, size });
  cell.border = { top: bl("thin", G.green), left: bl("thin", G.green), bottom: bl("thin", G.green), right: bl("thin", G.green) };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

function dataCell(cell, bg = G.white) {
  cell.fill = fill(bg);
  applyFont(cell);
  cell.border = { top: bl("hair"), left: bl("hair"), bottom: bl("hair"), right: bl("hair") };
  cell.alignment = { vertical: "middle" };
}

// Find actual last used column in a sheet
function getLastCol(ws) {
  let max = 0;
  ws.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell, cn) => { if (cn > max) max = cn; });
  });
  return max;
}

// ── Per-sheet column widths ───────────────────────────────────────────────────
// Shed 1&2 has a wider layout (extra cols 14-34 vs 3-23 for other sheds)
const SHED_BIG_WIDTHS  = { 1:5, 2:5, 3:5, 4:5, 5:5, 6:5, 7:5, 8:5, 9:5, 10:5, 11:5, 12:5, 13:5, 14:11, 15:9, 16:9, 17:9, 18:9, 19:9, 20:9, 21:9, 22:9, 23:9, 24:9, 25:9, 26:9, 27:9, 28:11, 29:13, 30:11, 31:11, 32:11, 33:11, 34:6 };
const SHED_STD_WIDTHS  = { 1:5, 2:5, 3:11, 4:9, 5:9, 6:9, 7:9, 8:9, 9:9, 10:9, 11:9, 12:9, 13:9, 14:9, 15:9, 16:9, 17:11, 18:13, 19:11, 20:11, 21:11, 22:11, 23:6 };
const EOB_WIDTHS       = { 1:6, 2:14, 3:13, 4:13, 5:6, 6:6, 7:14, 8:12, 9:13, 10:6, 11:6, 12:14, 13:12, 14:13, 15:6, 16:14, 17:11, 18:13, 19:17, 20:6, 21:6, 22:17, 23:23, 24:14, 25:14 };
const STOCK_WIDTHS     = { 1:6, 2:15, 3:11, 4:19, 5:16, 6:16, 7:16, 8:16, 9:16 };
const GUIDE_WIDTHS     = { 1:8, 2:9, 3:9, 4:15, 5:15, 6:13, 7:13, 8:13 };

function setWidths(ws, widthMap) {
  Object.entries(widthMap).forEach(([n, w]) => {
    const col = ws.getColumn(parseInt(n));
    if (col) col.width = w;
  });
}

// ── Shed sheets ───────────────────────────────────────────────────────────────
function styleShed(ws, isBig) {
  const widths = isBig ? SHED_BIG_WIDTHS : SHED_STD_WIDTHS;
  const siloStart = isBig ? 22 : 11; // column where A/B/C start
  const siloEnd   = isBig ? 24 : 13;
  const dateCol   = isBig ? 14 : 3;

  ws.properties = ws.properties ?? {};
  ws.properties.tabColor = { argb: G.green };
  ws.views = [{ state: "frozen", ySplit: 9, showGridLines: false }];

  ws.eachRow((row, rn) => {
    // Row heights
    row.height = rn === 1 ? 32 : rn <= 5 ? 22 : rn <= 9 ? 28 : 20;

    row.eachCell({ includeEmpty: false }, (cell) => {
      const raw = cell.value;
      const v   = (raw && typeof raw === "object" && "result" in raw) ? raw.result : raw;
      const cn  = cell._column?._number ?? cell.col;

      // ── Title rows 1-2 ──
      if (rn <= 2) {
        cell.fill = fill(G.darkGreen);
        applyFont(cell, { bold: true, color: G.white, size: rn === 1 ? 14 : 11 });
        cell.alignment = { vertical: "middle" };
        return;
      }

      // ── Info block rows 3-5 ──
      if (rn >= 3 && rn <= 5) {
        if (typeof v === "string" && /STR|GWR|FIN|WDW/i.test(v)) {
          cell.fill = fill(G.amber);
          applyFont(cell, { bold: true, color: G.amberDark });
        } else if (typeof v === "string") {
          cell.fill = fill(G.midGreen);
          applyFont(cell, { bold: true, color: G.white });
        } else {
          cell.fill = fill(G.lightGreen);
          applyFont(cell, { bold: true });
        }
        cell.border = { top: bl("thin"), left: bl("thin"), bottom: bl("thin"), right: bl("thin") };
        cell.alignment = { vertical: "middle" };
        return;
      }

      // ── Header rows 6-9 ──
      if (rn >= 6 && rn <= 9) {
        // Silo columns get amber header
        if (cn >= siloStart && cn <= siloEnd) {
          cell.fill = fill(G.amber);
          applyFont(cell, { bold: true, color: G.amberDark });
          cell.border = { top: bl("medium", G.amberDark), left: bl("thin", G.amberDark), bottom: bl("medium", G.amberDark), right: bl("thin", G.amberDark) };
          cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        } else {
          hdrCell(cell, G.green);
        }
        return;
      }

      // ── Data rows 10+ ──
      const isAlt = rn % 2 === 0;
      const baseBg = isAlt ? G.lightGreen : G.offWhite;

      // Silo columns (A, B, C) — amber tint
      if (cn >= siloStart && cn <= siloEnd) {
        const siloBg = isAlt ? G.amberLight : G.amber + "55";
        cell.fill = fill(isAlt ? "FFFFF2CC" : "FFFEF9E7");
        applyFont(cell, { bold: typeof v === "number" && v > 0 });
        cell.border = { top: bl("hair", G.amberDark), left: bl("thin", G.amberDark), bottom: bl("hair", G.amberDark), right: bl("thin", G.amberDark) };
        cell.alignment = { vertical: "middle", horizontal: "right" };
        if (typeof v === "number") cell.numFmt = "#,##0.0";
        return;
      }

      // Date column
      if (cn === dateCol && (v instanceof Date || typeof v === "object")) {
        dataCell(cell, baseBg);
        cell.numFmt = "ddd d/mm";
        cell.alignment = { vertical: "middle", horizontal: "center" };
        return;
      }

      if (typeof v === "number") {
        dataCell(cell, baseBg);
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = v > 999 ? "#,##0" : v % 1 !== 0 ? "0.0" : "0";
      } else if (v != null) {
        dataCell(cell, baseBg);
      }
    });
  });

  // Thick border around header block
  for (let r = 6; r <= 9; r++) {
    const row = ws.getRow(r);
    row.getCell(1).border = { ...(row.getCell(1).border ?? {}), left: boldBorder() };
  }

  setWidths(ws, widths);
}

// ── End of batch ──────────────────────────────────────────────────────────────
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
        cell.fill = fill(G.darkGreen);
        applyFont(cell, { bold: true, color: G.white, size: rn === 1 ? 13 : 11 });
        cell.alignment = { vertical: "middle" };
        return;
      }
      if (rn >= 3 && rn <= 6) {
        if (typeof v === "string" && /STARTER|GROWER|FINISHER|WITHDRAW/i.test(v)) {
          cell.fill = fill(G.amber); applyFont(cell, { bold: true, color: G.amberDark });
        } else if (typeof v === "string") {
          hdrCell(cell, G.green);
        } else {
          cell.fill = fill(G.lightGreen); applyFont(cell, { bold: true });
        }
        cell.border = { top: bl("thin"), left: bl("thin"), bottom: bl("thin"), right: bl("thin") };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        return;
      }
      const bg = isAlt ? G.lightGreen : G.offWhite;
      if (typeof v === "number") {
        dataCell(cell, bg);
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = v > 999 ? "#,##0" : "0.0";
      } else if (typeof v === "string" && /TOTAL|FEED|HAND|PURCHASE|USED|LEFT/i.test(v)) {
        cell.fill = fill(G.blue); applyFont(cell, { bold: true, color: G.blueDark });
        cell.border = { top: bl("thin", G.blueMid), left: bl("thin", G.blueMid), bottom: bl("thin", G.blueMid), right: bl("thin", G.blueMid) };
      } else if (v != null) {
        dataCell(cell, bg);
      }
    });
  });

  setWidths(ws, EOB_WIDTHS);
}

// ── Weekly stock take ─────────────────────────────────────────────────────────
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
        cell.fill = fill(G.darkGreen);
        applyFont(cell, { bold: true, color: G.white, size: 12 });
        cell.alignment = { vertical: "middle" };
        return;
      }
      if (rn >= 3 && rn <= 5) {
        if (typeof v === "string") hdrCell(cell, G.green);
        else { cell.fill = fill(G.lightGreen); applyFont(cell, { bold: true }); }
        cell.border = { top: bl("thin"), left: bl("thin"), bottom: bl("thin"), right: bl("thin") };
        return;
      }
      const bg = isAlt ? G.lightGreen : G.offWhite;
      if (typeof v === "number") {
        dataCell(cell, bg);
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = "#,##0";
      } else if (typeof v === "string" && /SHED|\d\s*&/i.test(v)) {
        cell.fill = fill(G.midGreen); applyFont(cell, { bold: true, color: G.white });
        cell.border = { top: bl("thin", G.green), left: bl("thin", G.green), bottom: bl("thin", G.green), right: bl("thin", G.green) };
      } else if (v != null) {
        dataCell(cell, bg);
      }
    });
  });

  setWidths(ws, STOCK_WIDTHS);
}

// ── Consumption guide (hidden) ────────────────────────────────────────────────
function styleGuide(ws) {
  ws.properties = ws.properties ?? {};
  ws.properties.tabColor = { argb: G.green };
  ws.state = "hidden";

  ws.eachRow((row, rn) => {
    row.height = rn <= 7 ? 24 : 20;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const raw = cell.value;
      const v   = (raw && typeof raw === "object" && "result" in raw) ? raw.result : raw;
      const isAlt = rn % 2 === 0;

      if (rn <= 7) {
        if (typeof v === "string") hdrCell(cell, G.green);
        else { cell.fill = fill(G.lightGreen); applyFont(cell, { bold: true }); }
        return;
      }
      const bg = isAlt ? G.lightGreen : G.offWhite;
      if (typeof v === "number") {
        dataCell(cell, bg);
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = "0.0";
      } else if (v != null) {
        dataCell(cell, bg);
        cell.alignment = { vertical: "middle", horizontal: "center" };
      }
    });
  });

  setWidths(ws, GUIDE_WIDTHS);
}

// ── Trim excess columns ───────────────────────────────────────────────────────
function trimCols(ws, keepCols) {
  const total = ws.columnCount;
  if (total > keepCols) {
    try { ws.spliceColumns(keepCols + 1, total - keepCols); } catch {}
  }
  // Reset ALL column widths to narrow default so nothing is overly wide
  for (let c = 1; c <= ws.columnCount; c++) {
    ws.getColumn(c).width = 8;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SRC);
wb.creator  = "Silo Mate";
wb.modified = new Date();

// Hardcoded keep-col counts based on actual data analysis
const KEEP_COLS = {
  guide: 10,
  shed1: 36,
  shed:  25,
  eob:   27,
  stock: 11,
};

wb.eachSheet((ws) => {
  const n = ws.name.trim().toUpperCase();

  let type, keep;
  if (n.includes("SHED 1"))                          { type = "shed1"; keep = KEEP_COLS.shed1; }
  else if (n.includes("SHED"))                        { type = "shed";  keep = KEEP_COLS.shed;  }
  else if (n.includes("END") || n.includes("BATCH")) { type = "eob";   keep = KEEP_COLS.eob;   }
  else if (n.includes("STOCK"))                       { type = "stock"; keep = KEEP_COLS.stock; }
  else                                                { type = "guide"; keep = KEEP_COLS.guide; }

  // Trim FIRST so styling doesn't touch garbage columns
  trimCols(ws, keep);

  // Then style
  if (type === "shed1" || type === "shed") styleShed(ws, type === "shed1");
  else if (type === "eob")   styleEOB(ws);
  else if (type === "stock") styleStock(ws);
  else                       styleGuide(ws);

  console.log(`✓ ${ws.name.trim()} → ${ws.columnCount} cols`);
});

await wb.xlsx.writeFile(OUT);
console.log("Done →", OUT);
