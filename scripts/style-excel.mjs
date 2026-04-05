import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "../../attached_assets/feed_program_batch_120_1775355933095.xlsx");
const OUT = path.join(__dirname, "public/silo-mate-feed-program.xlsx");

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  green:       "FF217346",
  midGreen:    "FF2E8B57",
  lightGreen:  "FFE2EFDA",
  white:       "FFFFFFFF",
  offWhite:    "FFF5FAF5",
  dark:        "FF1A1A1A",
  grey:        "FFD6DCE4",
  amber:       "FFFFD966",
  amberDark:   "FFBF8F00",
  blue:        "FFD6E4F0",
  blueDark:    "FF2F75B6",
  red:         "FFFFC7CE",
  redDark:     "FF9C0006",
};

const solid  = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const border = (style = "thin", argb = "FFB0B0B0") => ({ style, color: { argb } });
const box    = (s = "thin") => ({ top: border(s), left: border(s), bottom: border(s), right: border(s) });
const thick  = () => border("medium", C.green);

function font(cell, opts = {}) {
  cell.font = { name: "Calibri", size: opts.size ?? 10, bold: !!opts.bold,
    color: { argb: opts.color ?? C.dark }, italic: !!opts.italic };
}

function headerStyle(cell, bg = C.green) {
  cell.fill = solid(bg);
  font(cell, { bold: true, color: C.white });
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = box("thin");
}

function dataStyle(cell, bg = C.white) {
  cell.fill = solid(bg);
  font(cell);
  cell.alignment = { vertical: "middle" };
  cell.border = box("hair");
}

// ── Column widths per sheet type ──────────────────────────────────────────────
const SHED_WIDTHS = {
  A:5, B:5, C:10, D:10, E:10, F:10, G:10, H:10, I:10, J:10,
  K:10, L:10, M:10, N:11, O:11, P:11, Q:5, R:11, S:11, T:12,
  U:12, V:9, W:9, X:9, Y:10, Z:8, _:8, AB:8, AC:12, AD:12, AE:12
};

const EOB_WIDTHS = {
  A:4, B:14, C:13, D:13, E:4, F:4, G:14, H:12, I:13, J:4,
  K:4, L:14, M:12, N:13, O:4, P:14, Q:11, R:13, S:17, T:4,
  U:4, V:17, W:23, X:14, Y:14
};

const STOCK_WIDTHS = {
  A:4, B:14, C:10, D:18, E:16, F:16, G:16, H:16, I:16
};

const GUIDE_WIDTHS = {
  A:8, B:9, C:9, D:14, E:14, F:12, G:12, H:12
};

function setColumnWidths(ws, map) {
  // First reset ALL columns to very narrow (hides the clutter)
  for (let c = 1; c <= ws.columnCount; c++) {
    const col = ws.getColumn(c);
    col.width = 0.5;
    col.hidden = true;
  }
  // Then set the meaningful ones
  Object.entries(map).forEach(([letter, width]) => {
    try {
      const col = ws.getColumn(letter);
      col.width = width;
      col.hidden = false;
    } catch {}
  });
}

// ── Style: Shed sheets ────────────────────────────────────────────────────────
function styleShed(ws, shedName) {
  setColumnWidths(ws, SHED_WIDTHS);
  ws.properties = ws.properties ?? {};
  ws.properties.tabColor = { argb: C.green };
  ws.views = [{ state: "frozen", ySplit: 11, xSplit: 0, showGridLines: false }];

  ws.eachRow((row, rn) => {
    const h = row.height;
    row.height = rn === 1 ? 30 : rn <= 5 ? 22 : rn <= 11 ? 24 : 20;

    row.eachCell({ includeEmpty: false }, (cell) => {
      const raw = cell.value;
      const v   = raw?.result ?? raw;
      const isStr = typeof v === "string";

      // Title row
      if (rn === 1) {
        cell.fill = solid(C.green);
        font(cell, { bold: true, color: C.white, size: 12 });
        cell.alignment = { vertical: "middle" };
        return;
      }

      // Bird / placement info rows 2-5
      if (rn >= 2 && rn <= 5) {
        if (isStr && /GROWER|BIRDS|PLACEMENT|DOUBLE/i.test(v)) {
          cell.fill = solid(C.midGreen);
          font(cell, { bold: true, color: C.white });
        } else if (isStr && /STR|GWR|FIN|WDW/i.test(v)) {
          cell.fill = solid(C.amber);
          font(cell, { bold: true, color: C.amberDark });
        } else {
          cell.fill = solid(C.lightGreen);
          font(cell, { bold: true });
        }
        cell.border = box("thin");
        cell.alignment = { vertical: "middle" };
        return;
      }

      // Header rows 7-11
      if (rn >= 7 && rn <= 11) {
        headerStyle(cell, C.green);
        return;
      }

      // Data rows
      const isAlt = (rn % 2 === 0);
      const bg = isAlt ? C.lightGreen : C.offWhite;

      // Highlight silo columns (V,W,X = cols 22,23,24) amber
      const cn = cell.col ?? cell._column?._number;
      if (cn >= 22 && cn <= 24) {
        dataStyle(cell, isAlt ? "FFFFF2CC" : "FFFEF9E7");
        font(cell, { bold: typeof v === "number" && v > 0 });
        cell.alignment = { vertical: "middle", horizontal: "right" };
      } else if (typeof v === "number") {
        dataStyle(cell, bg);
        cell.alignment = { vertical: "middle", horizontal: "right" };
        if (v > 1000) cell.numFmt = "#,##0";
      } else {
        dataStyle(cell, bg);
      }
    });
  });

  // Thick green border around the header block
  for (let r = 7; r <= 11; r++) {
    try {
      ws.getRow(r).getCell("A").border = { ...box("thin"), left: thick() };
    } catch {}
  }
}

// ── Style: End of Batch ───────────────────────────────────────────────────────
function styleEndOfBatch(ws) {
  setColumnWidths(ws, EOB_WIDTHS);
  ws.properties.tabColor = { argb: C.green };
  ws.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];

  ws.eachRow((row, rn) => {
    row.height = rn <= 6 ? 24 : 22;

    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value?.result ?? cell.value;
      const isStr = typeof v === "string";

      if (rn <= 2) { // Title rows
        cell.fill = solid(C.green);
        font(cell, { bold: true, color: C.white, size: rn === 1 ? 13 : 11 });
        cell.alignment = { vertical: "middle" };
        return;
      }
      if (rn >= 3 && rn <= 6) { // Section headers
        if (isStr && /STARTER|GROWER|FINISHER|WITHDRAW/i.test(v)) {
          cell.fill = solid(C.amber); font(cell, { bold: true, color: C.amberDark });
        } else if (isStr && /DATE|DOCKET|TONNE|BATCH|BIRD|CATCHE|MORT|PLACED/i.test(v)) {
          headerStyle(cell, C.green);
        } else if (isStr) {
          cell.fill = solid(C.midGreen); font(cell, { bold: true, color: C.white });
        } else {
          cell.fill = solid(C.lightGreen); font(cell);
        }
        cell.border = box("thin");
        cell.alignment = { vertical: "middle", horizontal: "center" };
        return;
      }

      const isAlt = rn % 2 === 0;
      if (typeof v === "number") {
        dataStyle(cell, isAlt ? C.lightGreen : C.offWhite);
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = v > 999 ? "#,##0" : "0.00";
      } else if (isStr && /FEED|TOTAL|PURCHASE|USED|LEFT|HAND/i.test(v)) {
        cell.fill = solid(C.blue); font(cell, { bold: true, color: C.blueDark });
        cell.border = box("thin");
        cell.alignment = { vertical: "middle" };
      } else {
        dataStyle(cell, isAlt ? C.lightGreen : C.offWhite);
      }
    });
  });
}

// ── Style: Weekly Stock Take ──────────────────────────────────────────────────
function styleStockTake(ws) {
  setColumnWidths(ws, STOCK_WIDTHS);
  ws.properties.tabColor = { argb: C.green };
  ws.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];

  ws.eachRow((row, rn) => {
    row.height = rn <= 5 ? 24 : 22;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value?.result ?? cell.value;
      const isStr = typeof v === "string";

      if (rn <= 2) {
        cell.fill = solid(C.green); font(cell, { bold: true, color: C.white, size: 12 });
        cell.alignment = { vertical: "middle" }; return;
      }
      if (rn >= 3 && rn <= 5) {
        if (isStr && /FEED|STOCK|DATE|FARM|SHED|SILO|TYPE|MON|TUE|WED|THU|FRI/i.test(v)) {
          headerStyle(cell, C.green);
        } else { dataStyle(cell, C.lightGreen); }
        return;
      }
      const isAlt = rn % 2 === 0;
      if (typeof v === "number") {
        dataStyle(cell, isAlt ? C.lightGreen : C.offWhite);
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = "#,##0";
      } else if (isStr && /SHED|SILO|starter|grower|finisher/i.test(v)) {
        cell.fill = solid(C.lightGreen); font(cell, { bold: true });
        cell.border = box("thin");
        cell.alignment = { vertical: "middle" };
      } else {
        dataStyle(cell, isAlt ? C.lightGreen : C.offWhite);
      }
    });
  });
}

// ── Style: Consumption Guide ──────────────────────────────────────────────────
function styleGuide(ws) {
  setColumnWidths(ws, GUIDE_WIDTHS);
  ws.properties.tabColor = { argb: C.green };
  ws.views = [{ state: "frozen", ySplit: 7, showGridLines: false }];

  ws.eachRow((row, rn) => {
    row.height = rn <= 7 ? 24 : 20;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value?.result ?? cell.value;
      const isStr = typeof v === "string";

      if (rn <= 4) {
        if (isStr && /STAND|CONSUMP|AGE|DAYS|COCKS|PULLS|MIXED|WINTER|COBB|F\.C\.R/i.test(v)) {
          headerStyle(cell, C.green);
        } else { cell.fill = solid(C.green); font(cell, { bold: true, color: C.white }); }
        cell.border = box("thin"); return;
      }
      if (rn >= 5 && rn <= 7) {
        cell.fill = solid(C.midGreen); font(cell, { bold: true, color: C.white });
        cell.border = box("thin"); cell.alignment = { vertical: "middle", horizontal: "center" };
        return;
      }
      const isAlt = rn % 2 === 0;
      if (typeof v === "number") {
        dataStyle(cell, isAlt ? C.lightGreen : C.offWhite);
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.numFmt = v > 100 ? "#,##0.0" : "0.0";
      } else {
        dataStyle(cell, isAlt ? C.lightGreen : C.offWhite);
        cell.alignment = { vertical: "middle", horizontal: "center" };
      }
    });
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SRC);
wb.creator = "Silo Mate";
wb.modified = new Date();

wb.eachSheet((ws) => {
  const n = ws.name.trim().toUpperCase();
  if (n.includes("SHED"))              styleShed(ws, ws.name);
  else if (n.includes("END") || n.includes("BATCH")) styleEndOfBatch(ws);
  else if (n.includes("STOCK"))        styleStockTake(ws);
  else                                 styleGuide(ws);
});

await wb.xlsx.writeFile(OUT);
console.log("Done →", OUT);
