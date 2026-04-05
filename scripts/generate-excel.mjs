import ExcelJS from "exceljs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "public/silo-mate-template.xlsx");

const GREEN       = "FF217346";
const LIGHT_GREEN = "FFE2EFDA";
const MID_GREEN   = "FF70AD47";
const WHITE       = "FFFFFFFF";
const OFF_WHITE   = "FFF9FBF9";
const DARK        = "FF1A1A1A";
const GREY_BORDER = "FFB0B0B0";
const AMBER       = "FFFFF2CC";
const AMBER_DARK  = "FFBF8F00";

function solid(argb) {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function thinBorder(color = GREY_BORDER) {
  const s = { style: "thin", color: { argb: color } };
  return { top: s, left: s, bottom: s, right: s };
}

function headerCell(cell, text, opts = {}) {
  cell.value = text;
  cell.fill = solid(opts.bg ?? GREEN);
  cell.font = { bold: true, color: { argb: opts.fg ?? WHITE }, size: opts.size ?? 11, name: "Calibri" };
  cell.alignment = { vertical: "middle", horizontal: opts.align ?? "center", wrapText: false };
  cell.border = thinBorder(opts.borderColor ?? GREEN);
}

function dataCell(cell, value, opts = {}) {
  cell.value = value ?? "";
  cell.fill = solid(opts.bg ?? WHITE);
  cell.font = { color: { argb: DARK }, size: 10, name: "Calibri", bold: opts.bold ?? false };
  cell.alignment = { vertical: "middle", horizontal: opts.align ?? "left" };
  cell.border = thinBorder();
}

// ─── SHEET 1: Dashboard ───────────────────────────────────────────────────────
function makeDashboard(wb) {
  const ws = wb.addWorksheet("Dashboard", { views: [{ showGridLines: false }] });

  ws.columns = [
    { width: 2 },
    { width: 22 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 2 },
  ];

  // Banner
  ws.mergeCells("B1:F3");
  const banner = ws.getCell("B1");
  banner.value = "SILO MATE";
  banner.fill = solid(GREEN);
  banner.font = { bold: true, size: 28, color: { argb: WHITE }, name: "Calibri" };
  banner.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 20;
  ws.getRow(2).height = 30;
  ws.getRow(3).height = 20;

  ws.mergeCells("B4:F4");
  const sub = ws.getCell("B4");
  sub.value = "Farm Feed & Silo Management";
  sub.fill = solid(MID_GREEN);
  sub.font = { size: 12, color: { argb: WHITE }, italic: true, name: "Calibri" };
  sub.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(4).height = 24;

  ws.getRow(5).height = 14;

  // Tabs info
  const sections = [
    ["Daily Readings", "Record silo levels for each shed group every day"],
    ["Deliveries", "Log each feed delivery with kg, date and doc number"],
    ["End of Batch", "Complete batch summary when sheds are cleared"],
    ["History", "Auto-populated log of all readings"],
  ];

  let r = 6;
  sections.forEach(([title, desc]) => {
    ws.mergeCells(`B${r}:C${r}`);
    headerCell(ws.getCell(`B${r}`), title, { align: "left", bg: GREEN });
    ws.mergeCells(`D${r}:F${r}`);
    const dc = ws.getCell(`D${r}`);
    dc.value = desc;
    dc.fill = solid(LIGHT_GREEN);
    dc.font = { size: 10, name: "Calibri" };
    dc.alignment = { vertical: "middle", horizontal: "left" };
    dc.border = thinBorder();
    ws.getRow(r).height = 26;
    r++;
  });

  ws.getRow(r).height = 14;
  r++;

  // Farm details block
  ws.mergeCells(`B${r}:C${r}`);
  headerCell(ws.getCell(`B${r}`), "Farm Details", { align: "left" });
  ws.getRow(r).height = 24;
  r++;

  const details = [["Farm Name", ""], ["Manager", ""], ["Location", ""], ["Date Started", ""]];
  details.forEach(([lbl, val]) => {
    const lc = ws.getCell(`B${r}`);
    lc.value = lbl;
    lc.fill = solid(LIGHT_GREEN);
    lc.font = { bold: true, size: 10, name: "Calibri" };
    lc.alignment = { vertical: "middle", horizontal: "left" };
    lc.border = thinBorder();

    ws.mergeCells(`C${r}:F${r}`);
    dataCell(ws.getCell(`C${r}`), val, { bg: OFF_WHITE });
    ws.getRow(r).height = 22;
    r++;
  });

  ws.getColumn(1).width = 2;
}

// ─── SHEET 2: Daily Readings ──────────────────────────────────────────────────
function makeReadings(wb) {
  const ws = wb.addWorksheet("Daily Readings", {
    views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
  });

  ws.columns = [
    { width: 2 },         // A spacer
    { width: 14 },        // B Date
    { width: 20 },        // C Shed Group
    { width: 8 },         // D Silo
    { width: 22 },        // E Feed Type
    { width: 12 },        // F Amount (tons)
    { width: 10 },        // G Unit
    { width: 16 },        // H Notes
    { width: 2 },         // I spacer
  ];

  // Title
  ws.mergeCells("B1:H2");
  const t = ws.getCell("B1");
  t.value = "Silo Mate — Daily Readings";
  t.fill = solid(GREEN);
  t.font = { bold: true, size: 16, color: { argb: WHITE }, name: "Calibri" };
  t.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 14;
  ws.getRow(2).height = 28;

  ws.mergeCells("B3:H3");
  const instCell = ws.getCell("B3");
  instCell.value = "Enter one row per silo reading. Date format: DD/MM/YYYY";
  instCell.fill = solid(MID_GREEN);
  instCell.font = { size: 9, color: { argb: WHITE }, italic: true, name: "Calibri" };
  instCell.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(3).height = 18;

  // Column headers
  const cols = ["Date", "Shed Group", "Silo", "Feed Type", "Amount", "Unit", "Notes"];
  const headerRow = ws.getRow(4);
  headerRow.height = 26;
  cols.forEach((c, i) => {
    headerCell(headerRow.getCell(i + 2), c);
  });
  ws.autoFilter = { from: "B4", to: "H4" };

  // Pre-fill shed group / silo rows (6 sheds x 3 silos = 18 rows as a template)
  const sheds = ["Sheds 1 & 2", "Sheds 3 & 4", "Sheds 5 & 6", "Sheds 7 & 8", "Sheds 9 & 10", "Sheds 11 & 12"];
  const silos = ["A", "B", "C"];
  let row = 5;

  sheds.forEach((shed, si) => {
    silos.forEach((silo, li) => {
      const isAlt = si % 2 === 1;
      const bg = isAlt ? LIGHT_GREEN : OFF_WHITE;
      const r = ws.getRow(row);
      r.height = 22;

      // Date — user fills in
      dataCell(r.getCell(2), li === 0 ? new Date() : "", { bg, align: "center" });
      if (li === 0) r.getCell(2).numFmt = "dd/mm/yyyy";

      // Shed — merge-like: only show on first silo
      dataCell(r.getCell(3), shed, { bg, bold: li === 0 });
      dataCell(r.getCell(4), `Silo ${silo}`, { bg, align: "center", bold: true });
      dataCell(r.getCell(5), "", { bg }); // Feed Type — user fills
      dataCell(r.getCell(6), "", { bg, align: "right" }); // Amount
      dataCell(r.getCell(7), "tons", { bg, align: "center" }); // Unit default

      // Unit dropdown
      r.getCell(7).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: ['"tons,kg,bushels,lbs"'],
      };

      dataCell(r.getCell(8), "", { bg }); // Notes
      row++;
    });
    // Blank separator row between sheds
    ws.getRow(row).height = 6;
    ws.getRow(row).getCell(2).fill = solid(GREEN);
    row++;
  });
}

// ─── SHEET 3: Deliveries ──────────────────────────────────────────────────────
function makeDeliveries(wb) {
  const ws = wb.addWorksheet("Deliveries", {
    views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
  });

  ws.columns = [
    { width: 2 },
    { width: 14 },  // Date
    { width: 16 },  // Doc Number
    { width: 16 },  // Kilograms
    { width: 22 },  // Shed Group
    { width: 22 },  // Feed Type
    { width: 20 },  // Notes
    { width: 2 },
  ];

  ws.mergeCells("B1:G2");
  const t = ws.getCell("B1");
  t.value = "Silo Mate — Deliveries";
  t.fill = solid(GREEN);
  t.font = { bold: true, size: 16, color: { argb: WHITE }, name: "Calibri" };
  t.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 14;
  ws.getRow(2).height = 28;

  ws.mergeCells("B3:G3");
  const inst = ws.getCell("B3");
  inst.value = "Scan the QR code on your delivery docket or enter manually";
  inst.fill = solid(MID_GREEN);
  inst.font = { size: 9, color: { argb: WHITE }, italic: true, name: "Calibri" };
  inst.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(3).height = 18;

  const cols = ["Date", "Doc Number", "Kilograms", "Shed Group", "Feed Type", "Notes"];
  const hr = ws.getRow(4);
  hr.height = 26;
  cols.forEach((c, i) => headerCell(hr.getCell(i + 2), c));
  ws.autoFilter = { from: "B4", to: "G4" };

  // 30 blank data rows
  for (let i = 0; i < 30; i++) {
    const r = ws.getRow(5 + i);
    r.height = 22;
    const bg = i % 2 === 0 ? OFF_WHITE : LIGHT_GREEN;
    dataCell(r.getCell(2), "", { bg, align: "center" });
    r.getCell(2).numFmt = "dd/mm/yyyy";
    dataCell(r.getCell(3), "", { bg, align: "center" });
    dataCell(r.getCell(4), "", { bg, align: "right" });
    r.getCell(4).numFmt = "#,##0";
    dataCell(r.getCell(5), "", { bg });
    dataCell(r.getCell(6), "", { bg });
    dataCell(r.getCell(7), "", { bg });

    r.getCell(5).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Sheds 1 & 2,Sheds 3 & 4,Sheds 5 & 6,Sheds 7 & 8,Sheds 9 & 10,Sheds 11 & 12"'],
    };
  }
}

// ─── SHEET 4: End of Batch ────────────────────────────────────────────────────
function makeEndOfBatch(wb) {
  const ws = wb.addWorksheet("End of Batch", {
    views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
  });

  ws.columns = [
    { width: 2 },
    { width: 20 },  // Shed Group
    { width: 10 },  // Batch No
    { width: 14 },  // Start Date
    { width: 14 },  // End Date
    { width: 14 },  // Bird Count
    { width: 16 },  // Total Feed (tons)
    { width: 16 },  // FCR
    { width: 20 },  // Notes
    { width: 2 },
  ];

  ws.mergeCells("B1:I2");
  const t = ws.getCell("B1");
  t.value = "Silo Mate — End of Batch";
  t.fill = solid(GREEN);
  t.font = { bold: true, size: 16, color: { argb: WHITE }, name: "Calibri" };
  t.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 14;
  ws.getRow(2).height = 28;

  ws.mergeCells("B3:I3");
  const inst = ws.getCell("B3");
  inst.value = "Complete one row when each shed batch is finished";
  inst.fill = solid(MID_GREEN);
  inst.font = { size: 9, color: { argb: WHITE }, italic: true, name: "Calibri" };
  inst.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(3).height = 18;

  const cols = ["Shed Group", "Batch No", "Start Date", "End Date", "Bird Count", "Total Feed (tons)", "FCR", "Notes"];
  const hr = ws.getRow(4);
  hr.height = 26;
  cols.forEach((c, i) => headerCell(hr.getCell(i + 2), c));
  ws.autoFilter = { from: "B4", to: "I4" };

  // One pre-filled row per shed group + 20 blank rows
  const sheds = ["Sheds 1 & 2", "Sheds 3 & 4", "Sheds 5 & 6", "Sheds 7 & 8", "Sheds 9 & 10", "Sheds 11 & 12"];
  sheds.forEach((shed, i) => {
    const r = ws.getRow(5 + i);
    r.height = 24;
    const bg = i % 2 === 0 ? OFF_WHITE : LIGHT_GREEN;
    dataCell(r.getCell(2), shed, { bg, bold: true });
    dataCell(r.getCell(3), "", { bg, align: "center" });
    dataCell(r.getCell(4), "", { bg, align: "center" });
    r.getCell(4).numFmt = "dd/mm/yyyy";
    dataCell(r.getCell(5), "", { bg, align: "center" });
    r.getCell(5).numFmt = "dd/mm/yyyy";
    dataCell(r.getCell(6), "", { bg, align: "right" });
    r.getCell(6).numFmt = "#,##0";
    dataCell(r.getCell(7), "", { bg, align: "right" });
    r.getCell(7).numFmt = "#,##0.00";
    // FCR formula: total feed / bird count (placeholder)
    dataCell(r.getCell(8), "", { bg, align: "right" });
    r.getCell(8).numFmt = "0.000";
    dataCell(r.getCell(9), "", { bg });
  });

  // Totals / summary row
  const sumRow = ws.getRow(11);
  sumRow.height = 26;
  ws.mergeCells("B11:C11");
  headerCell(ws.getCell("B11"), "TOTALS", { align: "left", bg: GREEN });
  headerCell(ws.getCell("D11"), "", { bg: GREEN });
  headerCell(ws.getCell("E11"), "", { bg: GREEN });
  const birdTotal = ws.getCell("F11");
  birdTotal.value = { formula: "SUM(F5:F10)" };
  birdTotal.fill = solid(GREEN);
  birdTotal.font = { bold: true, color: { argb: WHITE }, name: "Calibri" };
  birdTotal.numFmt = "#,##0";
  birdTotal.alignment = { horizontal: "right", vertical: "middle" };

  const feedTotal = ws.getCell("G11");
  feedTotal.value = { formula: "SUM(G5:G10)" };
  feedTotal.fill = solid(GREEN);
  feedTotal.font = { bold: true, color: { argb: WHITE }, name: "Calibri" };
  feedTotal.numFmt = "#,##0.00";
  feedTotal.alignment = { horizontal: "right", vertical: "middle" };

  headerCell(ws.getCell("H11"), "", { bg: GREEN });
  headerCell(ws.getCell("I11"), "", { bg: GREEN });
}

// ─── SHEET 5: History (auto log) ─────────────────────────────────────────────
function makeHistory(wb) {
  const ws = wb.addWorksheet("Reading Log", {
    views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
  });

  ws.columns = [
    { width: 2 },
    { width: 14 },
    { width: 20 },
    { width: 8 },
    { width: 22 },
    { width: 12 },
    { width: 10 },
    { width: 20 },
    { width: 2 },
  ];

  ws.mergeCells("B1:H2");
  const t = ws.getCell("B1");
  t.value = "Silo Mate — Full History";
  t.fill = solid(GREEN);
  t.font = { bold: true, size: 16, color: { argb: WHITE }, name: "Calibri" };
  t.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 14;
  ws.getRow(2).height = 28;

  ws.mergeCells("B3:H3");
  const inst = ws.getCell("B3");
  inst.value = "Paste exported data here from Silo Mate app — History tab";
  inst.fill = solid(AMBER);
  inst.font = { size: 9, color: { argb: AMBER_DARK }, italic: true, name: "Calibri" };
  inst.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(3).height = 18;

  const cols = ["Date", "Shed Group", "Silo", "Feed Type", "Amount", "Unit", "Notes"];
  const hr = ws.getRow(4);
  hr.height = 26;
  cols.forEach((c, i) => headerCell(hr.getCell(i + 2), c));
  ws.autoFilter = { from: "B4", to: "H4" };

  for (let i = 0; i < 50; i++) {
    const r = ws.getRow(5 + i);
    r.height = 20;
    const bg = i % 2 === 0 ? OFF_WHITE : LIGHT_GREEN;
    for (let c = 2; c <= 8; c++) dataCell(r.getCell(c), "", { bg });
    r.getCell(2).numFmt = "dd/mm/yyyy";
    r.getCell(6).numFmt = "#,##0.00";
  }
}

// ─── BUILD ────────────────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook();
wb.creator = "Silo Mate";
wb.lastModifiedBy = "Silo Mate";
wb.created = new Date();
wb.modified = new Date();

makeDashboard(wb);
makeReadings(wb);
makeDeliveries(wb);
makeEndOfBatch(wb);
makeHistory(wb);

await wb.xlsx.writeFile(OUT);
console.log("Done →", OUT);
