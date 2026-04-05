import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "../../attached_assets/feed_program_batch_120_1775355933095.xlsx");
const OUT = path.join(__dirname, "public/silo-mate-feed-program.xlsx");

const C = {
  green:      "FF217346",
  midGreen:   "FF2E8B57",
  lightGreen: "FFE2EFDA",
  white:      "FFFFFFFF",
  offWhite:   "FFF5FAF5",
  dark:       "FF1A1A1A",
  amber:      "FFFFD966",
  amberDark:  "FFBF8F00",
  blue:       "FFD6E4F0",
  blueDark:   "FF2F75B6",
};

const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const b = (s = "thin", argb = "FFB0B0B0") => ({ style: s, color: { argb } });
const box = (s = "thin") => ({ top: b(s), left: b(s), bottom: b(s), right: b(s) });

function applyFont(cell, opts = {}) {
  cell.font = {
    name: "Calibri",
    size: opts.size ?? 10,
    bold: !!opts.bold,
    color: { argb: opts.color ?? C.dark },
    italic: !!opts.italic,
  };
}

function styleCell(cell, bg, fontOpts = {}) {
  cell.fill = solid(bg);
  applyFont(cell, fontOpts);
  cell.border = box("hair");
}

function headerCell(cell, bg = C.green) {
  cell.fill = solid(bg);
  applyFont(cell, { bold: true, color: C.white });
  cell.border = box("thin");
  if (!cell.alignment?.wrapText) {
    cell.alignment = { ...(cell.alignment ?? {}), vertical: "middle", wrapText: true };
  }
}

// Only touch cells that have values — never modify column structure
function styleSheet(ws, type) {
  ws.properties = ws.properties ?? {};
  ws.properties.tabColor = { argb: C.green };

  // Determine freeze row based on type
  const freeze = type === "shed" ? 11 : type === "eob" ? 6 : type === "stock" ? 5 : 7;
  ws.views = [{ state: "frozen", ySplit: freeze, showGridLines: false }];

  ws.eachRow((row, rn) => {
    // Set reasonable row heights only
    if (!row.height || row.height < 5) {
      row.height = rn <= 3 ? 26 : 20;
    }

    row.eachCell({ includeEmpty: false }, (cell) => {
      const raw  = cell.value;
      const v    = (raw && typeof raw === "object" && "result" in raw) ? raw.result : raw;
      const isStr = typeof v === "string";
      const isNum = typeof v === "number";
      const isAlt = rn % 2 === 0;
      const altBg = isAlt ? C.lightGreen : C.offWhite;

      if (type === "shed") {
        if (rn === 1) {
          // Title
          cell.fill = solid(C.green);
          applyFont(cell, { bold: true, color: C.white, size: 13 });
          return;
        }
        if (rn >= 2 && rn <= 5) {
          // Farm info rows
          if (isStr && /STR|GWR|FIN|WDW/i.test(v)) {
            styleCell(cell, C.amber, { bold: true, color: C.amberDark });
          } else if (isStr) {
            styleCell(cell, C.midGreen, { bold: true, color: C.white });
          } else {
            styleCell(cell, C.lightGreen, { bold: true });
          }
          return;
        }
        if (rn >= 7 && rn <= 11) {
          headerCell(cell, C.green); return;
        }
        // Data rows
        if (isNum) {
          styleCell(cell, altBg);
          cell.alignment = { ...(cell.alignment ?? {}), horizontal: "right", vertical: "middle" };
          if (v > 999) cell.numFmt = cell.numFmt || "#,##0";
        } else if (isStr) {
          styleCell(cell, altBg);
        }
      }

      else if (type === "eob") {
        if (rn <= 2) {
          cell.fill = solid(C.green);
          applyFont(cell, { bold: true, color: C.white, size: rn === 1 ? 13 : 11 });
          return;
        }
        if (rn >= 3 && rn <= 6) {
          if (isStr && /STARTER|GROWER|FINISHER|WITHDRAW/i.test(v)) {
            styleCell(cell, C.amber, { bold: true, color: C.amberDark });
          } else if (isStr && /DATE|DOCKET|TONNE|BATCH|BIRD|CATCH|MORT|PLACED/i.test(v)) {
            headerCell(cell, C.green);
          } else if (isStr) {
            styleCell(cell, C.midGreen, { bold: true, color: C.white });
          } else {
            styleCell(cell, C.lightGreen, { bold: true });
          }
          return;
        }
        if (isNum) {
          styleCell(cell, altBg);
          cell.alignment = { ...(cell.alignment ?? {}), horizontal: "right", vertical: "middle" };
          if (v > 999) cell.numFmt = cell.numFmt || "#,##0";
        } else if (isStr && /FEED|TOTAL|PURCHASE|USED|LEFT|HAND/i.test(v)) {
          styleCell(cell, C.blue, { bold: true, color: C.blueDark });
        } else if (isStr) {
          styleCell(cell, altBg);
        }
      }

      else if (type === "stock") {
        if (rn <= 2) {
          cell.fill = solid(C.green);
          applyFont(cell, { bold: true, color: C.white, size: 12 });
          return;
        }
        if (rn >= 3 && rn <= 5) {
          if (isStr) headerCell(cell, C.green);
          else styleCell(cell, C.lightGreen, { bold: true });
          return;
        }
        if (isNum) {
          styleCell(cell, altBg);
          cell.alignment = { ...(cell.alignment ?? {}), horizontal: "right", vertical: "middle" };
          cell.numFmt = cell.numFmt || "#,##0";
        } else if (isStr && /SHED|\d\s*&/i.test(v)) {
          styleCell(cell, C.lightGreen, { bold: true });
        } else if (isStr) {
          styleCell(cell, altBg);
        }
      }

      else { // Consumption Guide
        if (rn <= 7) {
          if (isStr) headerCell(cell, C.green);
          else { cell.fill = solid(C.lightGreen); applyFont(cell, { bold: true }); }
          return;
        }
        if (isNum) {
          styleCell(cell, altBg);
          cell.alignment = { ...(cell.alignment ?? {}), horizontal: "right", vertical: "middle" };
          cell.numFmt = cell.numFmt || "0.0";
        } else {
          styleCell(cell, altBg);
          cell.alignment = { ...(cell.alignment ?? {}), horizontal: "center", vertical: "middle" };
        }
      }
    });
  });
}

// ── Run ───────────────────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SRC);
wb.creator  = "Silo Mate";
wb.modified = new Date();

wb.eachSheet((ws) => {
  const n = ws.name.trim().toUpperCase();
  let type = "guide";
  if (n.includes("SHED"))                           type = "shed";
  else if (n.includes("END") || n.includes("BATCH")) type = "eob";
  else if (n.includes("STOCK"))                      type = "stock";

  styleSheet(ws, type);
  if (type === "guide") ws.state = "hidden";
  console.log("Styled:", ws.name, "→", type);
});

await wb.xlsx.writeFile(OUT);
console.log("Done →", OUT);
