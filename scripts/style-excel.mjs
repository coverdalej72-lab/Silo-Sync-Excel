import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "../../attached_assets/feed_program_batch_120_1775355933095.xlsx");
const OUT = path.join(__dirname, "public/silo-mate-feed-program.xlsx");

// ── App Palette (matches Silo Mate app exactly) ───────────────────────────────
const P = {
  darkGreen:   "FF1A5C36",   // app header banner
  green:       "FF217346",   // primary / tab / col headers
  midGreen:    "FF2E8B57",   // sub-headers
  lightGreen:  "FFD6EAD6",   // alt row even
  paleGreen:   "FFF0F7F0",   // alt row odd
  panelGreen:  "FFE8F5E8",   // info panel bg
  white:       "FFFFFFFF",
  offWhite:    "FFF9FCF9",
  amber:       "FFFFC000",   // silo highlight header
  amberLight:  "FFFFF2CC",   // silo data even
  amberFaint:  "FFFEF9ED",   // silo data odd
  amberDark:   "FF9C6500",
  blue:        "FFD6E4F0",
  blueDark:    "FF2F75B6",
  silver:      "FFD9D9D9",
  charcoal:    "FF2D2D2D",
  muted:       "FF666666",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fill  = (c) => ({ type: "pattern", pattern: "solid", fgColor: { argb: c } });
const bdr   = (s, c) => ({ style: s, color: { argb: c } });
const thin  = (c = "FFB8D4B8") => bdr("thin",   c);
const hair  = (c = "FFCCDDCC") => bdr("hair",   c);
const med   = (c = P.green)   => bdr("medium", c);
const thick = (c = P.green)   => bdr("thick",  c);

function box(t, l, b, r) { return { top: t, left: l, bottom: b, right: r }; }
function allBdr(b)        { return box(b, b, b, b); }

function fnt(cell, { bold=false, size=10, color=P.charcoal, italic=false } = {}) {
  cell.font = { name: "Calibri", size, bold, italic, color: { argb: color } };
}

function align(cell, h="left", v="middle", wrap=false) {
  cell.alignment = { horizontal: h, vertical: v, wrapText: wrap };
}

// ── Find last used column ─────────────────────────────────────────────────────
function getLastUsedCol(ws) {
  let max = 0;
  ws.eachRow((row) => row.eachCell({ includeEmpty: false }, (_, cn) => { if (cn > max) max = cn; }));
  return max;
}

// ── Copy cells from src to dst (cols 1..keepCols) ────────────────────────────
function copySheet(src, dst, keepCols) {
  // Merged cells within range
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
      if (sc.formula)    dc.value = { formula: sc.formula, result: sc.result };
      else if (sc.value != null) dc.value = sc.value;
      if (sc.numFmt)     dc.numFmt = sc.numFmt;
      if (sc.alignment)  dc.alignment = { ...sc.alignment };
    }
  });
}

// ── Apply themed styling on top of copied data ────────────────────────────────

// Column widths
const W = {
  shed1: { 1:5,2:5,3:5,4:5,5:5,6:5,7:5,8:5,9:5,10:5,11:5,12:5,13:5, 14:11,15:9,16:9,17:9,18:9,19:9,20:9, 21:9,22:9,23:9,24:9, 25:9,26:9,27:9, 28:12,29:14,30:12,31:11,32:12,33:11,34:6 },
  shed:  { 1:5,2:5, 3:11,4:9,5:9,6:9,7:9,8:9,9:9, 10:9,11:9,12:9,13:9, 14:9,15:9,16:9, 17:12,18:14,19:12,20:11,21:12,22:11,23:6 },
  eob:   { 1:6,2:15,3:13,4:13,5:6,6:6,7:14,8:12,9:13,10:6,11:6,12:14,13:12,14:13,15:6,16:14,17:11,18:13,19:17,20:6,21:6,22:17,23:23,24:14,25:14 },
  stock: { 1:6,2:16,3:12,4:20,5:16,6:16,7:16,8:16,9:16 },
  guide: { 1:8,2:9,3:9,4:15,5:15,6:13,7:13,8:13 },
};

function applyWidths(ws, key) {
  Object.entries(W[key]).forEach(([n, w]) => { const c = ws.getColumn(+n); if (c) c.width = w; });
}

// ── SHED sheet styling ────────────────────────────────────────────────────────
function styleShed(ws, isBig) {
  const key    = isBig ? "shed1" : "shed";
  const totalC = isBig ? 34 : 23;
  const siloA  = isBig ? 22 : 11;
  const siloC  = isBig ? 24 : 13;
  const dateC  = isBig ? 14 : 3;

  ws.properties = ws.properties ?? {};
  ws.properties.tabColor = { argb: P.green };
  ws.views = [{ state: "frozen", ySplit: 9, showGridLines: false }];

  // Outer border around the whole header block (rows 1-9)
  for (let r = 1; r <= 9; r++) {
    for (let c = 1; c <= totalC; c++) {
      const cell = ws.getRow(r).getCell(c);
      const isTop   = r === 1;
      const isBot   = r === 9;
      const isLeft  = c === 1;
      const isRight = c === totalC;
      if (isTop || isBot || isLeft || isRight) {
        const existing = cell.border || {};
        cell.border = {
          ...existing,
          ...(isTop   ? { top:    thick() } : {}),
          ...(isBot   ? { bottom: thick() } : {}),
          ...(isLeft  ? { left:   thick() } : {}),
          ...(isRight ? { right:  thick() } : {}),
        };
      }
    }
  }

  ws.eachRow((row, rn) => {
    row.height = rn === 1 ? 38 : rn === 2 ? 26 : rn <= 5 ? 22 : rn <= 9 ? 26 : 20;

    row.eachCell({ includeEmpty: false }, (cell) => {
      const raw = cell.value;
      const v   = (raw && typeof raw === "object" && "result" in raw) ? raw.result : raw;
      const cn  = cell._column?._number ?? 0;

      // ── Row 1 — App banner ──────────────────────────────────────────────
      if (rn === 1) {
        cell.fill = fill(P.darkGreen);
        fnt(cell, { bold: true, color: P.white, size: 15 });
        align(cell, "left", "middle");
        return;
      }
      // ── Row 2 — Sub-banner ──────────────────────────────────────────────
      if (rn === 2) {
        cell.fill = fill(P.green);
        fnt(cell, { bold: true, color: P.white, size: 11 });
        align(cell, "left", "middle");
        return;
      }
      // ── Rows 3-5 — Info panel ───────────────────────────────────────────
      if (rn >= 3 && rn <= 5) {
        if (typeof v === "string" && /STR|GWR|FIN|WDW/i.test(v)) {
          cell.fill = fill(P.amber);
          fnt(cell, { bold: true, color: P.amberDark });
          cell.border = allBdr(thin(P.amberDark));
        } else if (typeof v === "string") {
          cell.fill = fill(P.panelGreen);
          fnt(cell, { bold: true, color: P.green });
          cell.border = allBdr(thin(P.green));
        } else {
          cell.fill = fill(P.panelGreen);
          fnt(cell, { bold: false });
          cell.border = allBdr(hair());
        }
        align(cell, "left", "middle");
        return;
      }
      // ── Rows 6-9 — Column headers ───────────────────────────────────────
      if (rn >= 6 && rn <= 9) {
        if (cn >= siloA && cn <= siloC) {
          // Silo columns — amber header with thick top/bottom border
          cell.fill = fill(P.amber);
          fnt(cell, { bold: true, color: P.amberDark, size: 10 });
          cell.border = {
            top:    med(P.amberDark),
            left:   thin(P.amberDark),
            bottom: med(P.amberDark),
            right:  thin(P.amberDark),
          };
          align(cell, "center", "middle", true);
        } else {
          // Standard column header — app green
          cell.fill = fill(P.green);
          fnt(cell, { bold: true, color: P.white, size: 10 });
          cell.border = allBdr(thin(P.green));
          align(cell, "center", "middle", true);
        }
        return;
      }

      // ── Data rows ───────────────────────────────────────────────────────
      const isAlt = rn % 2 === 0;
      const isEven = isAlt;

      if (cn >= siloA && cn <= siloC) {
        // Silo A/B/C — amber tinted, right-aligned, bold if non-zero
        cell.fill = fill(isEven ? P.amberLight : P.amberFaint);
        fnt(cell, { bold: typeof v === "number" && v > 0, size: 10 });
        cell.border = {
          top:    hair(P.amberDark),
          left:   thin(P.amberDark),
          bottom: hair(P.amberDark),
          right:  thin(P.amberDark),
        };
        align(cell, "right", "middle");
        if (typeof v === "number" && !cell.numFmt) cell.numFmt = "#,##0.0";
        return;
      }

      const bg = isEven ? P.lightGreen : P.paleGreen;
      if (cn === dateC && (v instanceof Date || (typeof raw === "object" && raw?.formula))) {
        cell.fill = fill(bg);
        fnt(cell, { bold: false });
        cell.border = allBdr(hair());
        align(cell, "center", "middle");
        if (!cell.numFmt) cell.numFmt = "ddd d/mm";
        return;
      }
      if (typeof v === "number") {
        cell.fill = fill(bg);
        fnt(cell);
        cell.border = allBdr(hair());
        align(cell, "right", "middle");
        if (!cell.numFmt) cell.numFmt = v > 999 ? "#,##0" : v % 1 !== 0 ? "0.0" : "0";
        return;
      }
      if (v != null) {
        cell.fill = fill(bg);
        fnt(cell);
        cell.border = allBdr(hair());
        align(cell, "left", "middle");
      }
    });
  });

  // Thick outer border around data area (row 10 downward)
  const lastDataRow = ws.rowCount;
  for (let r = 10; r <= lastDataRow; r++) {
    const row = ws.getRow(r);
    const l = row.getCell(1);
    const ri = row.getCell(totalC);
    l.border  = { ...(l.border  || {}), left:  thick() };
    ri.border = { ...(ri.border || {}), right: thick() };
    if (r === lastDataRow) {
      for (let c = 1; c <= totalC; c++) {
        const cell = row.getCell(c);
        cell.border = { ...(cell.border || {}), bottom: thick() };
      }
    }
  }

  applyWidths(ws, key);
}

// ── EOB sheet styling ─────────────────────────────────────────────────────────
function styleEOB(ws) {
  const totalC = 25;
  ws.properties = ws.properties ?? {};
  ws.properties.tabColor = { argb: P.green };
  ws.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];

  ws.eachRow((row, rn) => {
    row.height = rn === 1 ? 36 : rn === 2 ? 26 : rn <= 6 ? 24 : 20;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const raw = cell.value;
      const v   = (raw && typeof raw === "object" && "result" in raw) ? raw.result : raw;
      const isAlt = rn % 2 === 0;

      if (rn === 1) {
        cell.fill = fill(P.darkGreen);
        fnt(cell, { bold: true, color: P.white, size: 14 });
        align(cell, "left", "middle"); return;
      }
      if (rn === 2) {
        cell.fill = fill(P.green);
        fnt(cell, { bold: true, color: P.white, size: 11 });
        align(cell, "left", "middle"); return;
      }
      if (rn >= 3 && rn <= 6) {
        if (typeof v === "string" && /STARTER|GROWER|FINISHER|WITHDRAW/i.test(v)) {
          cell.fill = fill(P.amber); fnt(cell, { bold: true, color: P.amberDark });
          cell.border = allBdr(thin(P.amberDark));
        } else if (typeof v === "string") {
          cell.fill = fill(P.green); fnt(cell, { bold: true, color: P.white });
          cell.border = allBdr(thin(P.green));
        } else {
          cell.fill = fill(P.panelGreen); fnt(cell, { bold: true });
          cell.border = allBdr(hair());
        }
        align(cell, "center", "middle", true); return;
      }
      const bg = isAlt ? P.lightGreen : P.paleGreen;
      if (typeof v === "number") {
        cell.fill = fill(bg); fnt(cell);
        cell.border = allBdr(hair()); align(cell, "right", "middle");
        if (!cell.numFmt) cell.numFmt = v > 999 ? "#,##0" : "0.00";
      } else if (typeof v === "string" && /TOTAL|FEED|HAND|PURCHASE|USED|LEFT|WEIGHT/i.test(v)) {
        cell.fill = fill(P.blue); fnt(cell, { bold: true, color: P.blueDark });
        cell.border = allBdr(thin("FF9DC3E6")); align(cell, "left", "middle");
      } else if (v != null) {
        cell.fill = fill(bg); fnt(cell);
        cell.border = allBdr(hair()); align(cell, "left", "middle");
      }
    });
  });

  // Banner outer border
  for (let c = 1; c <= totalC; c++) {
    const t = ws.getRow(1).getCell(c);
    const b = ws.getRow(ws.rowCount).getCell(c);
    t.border = { ...(t.border || {}), top: thick() };
    b.border = { ...(b.border || {}), bottom: thick() };
  }
  for (let r = 1; r <= ws.rowCount; r++) {
    const l = ws.getRow(r).getCell(1);
    const ri = ws.getRow(r).getCell(totalC);
    l.border  = { ...(l.border  || {}), left:  thick() };
    ri.border = { ...(ri.border || {}), right: thick() };
  }

  applyWidths(ws, "eob");
}

// ── Stock Take styling ────────────────────────────────────────────────────────
function styleStock(ws) {
  const totalC = 9;
  ws.properties = ws.properties ?? {};
  ws.properties.tabColor = { argb: P.green };
  ws.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];

  ws.eachRow((row, rn) => {
    row.height = rn === 1 ? 36 : rn <= 5 ? 26 : 20;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const raw = cell.value;
      const v   = (raw && typeof raw === "object" && "result" in raw) ? raw.result : raw;
      const isAlt = rn % 2 === 0;

      if (rn === 1) {
        cell.fill = fill(P.darkGreen); fnt(cell, { bold: true, color: P.white, size: 14 });
        align(cell, "left", "middle"); return;
      }
      if (rn === 2) {
        cell.fill = fill(P.green); fnt(cell, { bold: true, color: P.white, size: 11 });
        align(cell, "left", "middle"); return;
      }
      if (rn >= 3 && rn <= 5) {
        cell.fill = fill(P.green); fnt(cell, { bold: true, color: P.white });
        cell.border = allBdr(thin(P.green)); align(cell, "center", "middle", true); return;
      }
      const bg = isAlt ? P.lightGreen : P.paleGreen;
      if (typeof v === "string" && /SHED\s*\d|^\d+\s*&\s*\d+/i.test(v)) {
        cell.fill = fill(P.midGreen); fnt(cell, { bold: true, color: P.white });
        cell.border = allBdr(thin(P.green)); align(cell, "center", "middle");
      } else if (typeof v === "number") {
        cell.fill = fill(bg); fnt(cell); cell.border = allBdr(hair());
        align(cell, "right", "middle"); if (!cell.numFmt) cell.numFmt = "#,##0";
      } else if (v != null) {
        cell.fill = fill(bg); fnt(cell); cell.border = allBdr(hair());
        align(cell, "left", "middle");
      }
    });
  });

  // Outer border
  for (let c = 1; c <= totalC; c++) {
    ws.getRow(1).getCell(c).border = { ...(ws.getRow(1).getCell(c).border||{}), top: thick() };
    ws.getRow(ws.rowCount).getCell(c).border = { ...(ws.getRow(ws.rowCount).getCell(c).border||{}), bottom: thick() };
  }
  for (let r = 1; r <= ws.rowCount; r++) {
    const l = ws.getRow(r).getCell(1);
    const ri = ws.getRow(r).getCell(totalC);
    l.border  = { ...(l.border  || {}), left:  thick() };
    ri.border = { ...(ri.border || {}), right: thick() };
  }

  applyWidths(ws, "stock");
}

// ── Guide (hidden) ────────────────────────────────────────────────────────────
function styleGuide(ws) {
  ws.properties = ws.properties ?? {};
  ws.state = "hidden";
  applyWidths(ws, "guide");
}

// ── Max columns per sheet ─────────────────────────────────────────────────────
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
  if (n.match(/SHED\s*1\s*&\s*2/))                   type = "shed1";
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

  console.log(`✓ ${srcWs.name.trim().padEnd(18)} cols:${dstWs.columnCount}`);
}

await dstWb.xlsx.writeFile(OUT);
console.log("Done →", OUT);
