/**
 * Reads the original feed program Excel, preserves all formulas/data,
 * and applies Silo Mate styling.
 */
import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "../../attached_assets/feed_program_batch_120_1775355933095.xlsx");
const OUT = path.join(__dirname, "public/silo-mate-feed-program.xlsx");

// ── Colours ──────────────────────────────────────────────────────────────────
const GREEN        = "FF217346";  // Excel / Silo Mate green
const MID_GREEN    = "FF2E8B57";
const LIGHT_GREEN  = "FFE2EFDA";
const WHITE        = "FFFFFFFF";
const OFF_WHITE    = "FFF5FAF5";
const DARK         = "FF1A1A1A";
const AMBER        = "FFFFF2CC";
const AMBER_BG     = "FFFFD966";

function solid(argb) {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function applyFont(cell, opts = {}) {
  cell.font = {
    name: "Calibri",
    size: opts.size ?? 10,
    bold: opts.bold ?? false,
    color: { argb: opts.color ?? DARK },
    italic: opts.italic ?? false,
  };
}

function isHeaderLike(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return false;
  if (typeof v === "string") {
    const t = v.trim().toUpperCase();
    return (
      t.length > 1 &&
      (t === v.trim() ||             // all-caps
       t.includes("GROWER") ||
       t.includes("SHED") ||
       t.includes("TOTAL") ||
       t.includes("DATE") ||
       t.includes("FEED") ||
       t.includes("BIRDS") ||
       t.includes("BATCH") ||
       t.includes("FARM") ||
       t.includes("STOCK") ||
       t.includes("WEEK") ||
       t.includes("ALL.") ||
       t.includes("ALLOC") ||
       t.includes("USAGE") ||
       t.includes("HAND") ||
       t.includes("CONSUMP") ||
       t.includes("STAND") ||
       t.includes("MORT") ||
       t.includes("AGE") ||
       t.includes("SILO") ||
       t.includes("CATCH")
      )
    );
  }
  return false;
}

function styleSheet(ws, sheetName) {
  const isConsumption = sheetName.includes("Consumption");
  const isEndOfBatch  = sheetName.includes("end") || sheetName.includes("batch");
  const isStockTake   = sheetName.includes("STOCK") || sheetName.includes("stock");
  const isShed        = sheetName.toUpperCase().includes("SHED");

  // --- Tab colour ---
  ws.properties = ws.properties ?? {};
  ws.properties.tabColor = { argb: GREEN };

  ws.eachRow((row, rn) => {
    let rowIsHeader = false;

    // Detect header rows by position and content
    if (rn <= 2) rowIsHeader = true;
    if (isShed && (rn === 8 || rn === 9 || rn === 10 || rn === 11)) rowIsHeader = true;
    if (isConsumption && rn <= 7) rowIsHeader = true;
    if (isEndOfBatch && (rn <= 6)) rowIsHeader = true;
    if (isStockTake && rn <= 5) rowIsHeader = true;

    row.eachCell({ includeEmpty: false }, (cell) => {
      const hasValue = cell.value !== null && cell.value !== undefined;
      if (!hasValue) return;

      const existing = cell.fill?.fgColor?.argb;

      // --- Header rows: green background, white bold text ---
      if (rowIsHeader || isHeaderLike(cell)) {
        cell.fill = solid(GREEN);
        applyFont(cell, { bold: true, color: WHITE, size: 10 });
        cell.alignment = cell.alignment ?? {};
        cell.alignment.vertical = "middle";
      }
      // --- Row 1 title: larger ---
      else if (rn === 1) {
        cell.fill = solid(GREEN);
        applyFont(cell, { bold: true, color: WHITE, size: 12 });
      }
      // --- Feed allocation rows (STR/GWR/FIN/WDW) ---
      else if (
        typeof cell.value === "string" &&
        /\b(STR|GWR|FIN|WDW|STARTER|GROWER|FINISHER|WITHDRAW)/i.test(cell.value)
      ) {
        cell.fill = solid(MID_GREEN);
        applyFont(cell, { bold: true, color: WHITE });
      }
      // --- Alternating data rows ---
      else {
        const isAlt = rn % 2 === 0;
        // Only override if no existing meaningful fill
        if (!existing || existing === "FF000000" || existing === "FFFFFFFF" || existing === "00000000") {
          cell.fill = solid(isAlt ? LIGHT_GREEN : OFF_WHITE);
        }
        applyFont(cell, { size: 10 });
      }

      // --- Number formatting for common patterns ---
      if (typeof cell.value === "number" || (cell.value?.result && typeof cell.value.result === "number")) {
        const num = typeof cell.value === "number" ? cell.value : cell.value.result;
        if (num > 1000 && Number.isInteger(num)) {
          cell.numFmt = cell.numFmt || "#,##0";
        } else if (num > 0 && num < 1000 && !Number.isInteger(num)) {
          cell.numFmt = cell.numFmt || "0.00";
        }
      }
    });

    // --- Row heights ---
    if (rn === 1) row.height = 28;
    else if (rowIsHeader) row.height = row.height ?? 22;
    else row.height = row.height ?? 20;
  });

  // --- Title banner: first row, col A ---
  const titleCell = ws.getCell("A1");
  if (!titleCell.value) {
    // Try to find any cell in row 1
  }

  // Freeze top rows
  if (isShed) {
    ws.views = [{ state: "frozen", ySplit: 11, showGridLines: false }];
  } else if (isConsumption) {
    ws.views = [{ state: "frozen", ySplit: 7, showGridLines: false }];
  } else if (isEndOfBatch) {
    ws.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];
  } else if (isStockTake) {
    ws.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SRC);

wb.creator  = "Silo Mate";
wb.modified = new Date();

wb.eachSheet((ws) => {
  styleSheet(ws, ws.name);
});

await wb.xlsx.writeFile(OUT);
console.log("Done →", OUT);
