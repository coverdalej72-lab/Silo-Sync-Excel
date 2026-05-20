import ExcelJS from "exceljs";

const EXCEL_GREEN = "FF217346";
const LIGHT_GREEN = "FFE2EFDA";
const WHITE = "FFFFFFFF";
const DARK_TEXT = "FF212121";
const MID_GREY = "FFD9D9D9";
const GOLD = "FFC9A227";
const TOTAL_BG = "FF1a5c36";

function applyHeaderRow(row: ExcelJS.Row, columns: string[]) {
  row.values = ["", ...columns];
  row.eachCell((cell, col) => {
    if (col === 1) return;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_GREEN } };
    cell.font = { bold: true, color: { argb: WHITE }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
    cell.border = {
      bottom: { style: "thin", color: { argb: WHITE } },
    };
  });
  row.height = 28;
}

function applyDataRow(row: ExcelJS.Row, isAlt: boolean) {
  row.eachCell((cell, col) => {
    if (col === 1) return;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: isAlt ? LIGHT_GREEN : WHITE },
    };
    cell.font = { color: { argb: DARK_TEXT }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      bottom: { style: "hair", color: { argb: MID_GREY } },
    };
  });
  row.height = 22;
}

// Format a UTC ISO date string as DD/MM/YYYY in AEST (UTC+10).
function toAESTDateStr(isoStr: string): string {
  const AEST_MS = 10 * 3600_000;
  const local = new Date(new Date(isoStr).getTime() + AEST_MS);
  const dd = String(local.getUTCDate()).padStart(2, "0");
  const mm = String(local.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = local.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function toTonnes(amount: number, unit: string): number {
  return unit === "t" ? amount : amount / 1000;
}

export async function exportToExcel(
  readings: {
    readingDate: string;
    shedGroupName: string;
    siloLetter: string;
    feedType: string;
    amountRemaining: number;
    unit: string;
  }[],
  deliveries: {
    deliveryDate: string;
    amount: number;
    notes?: string | null;
    shedGroupName?: string | null;
  }[],
  farmName?: string
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Farm Buddy";
  wb.created = new Date();

  // ── Readings sheet ──────────────────────────────────────────────────────────
  const ws = wb.addWorksheet("Readings", {
    pageSetup: { fitToPage: true, fitToWidth: 1 },
    views: [{ state: "frozen", ySplit: 2 }],
  });

  // Title row
  ws.mergeCells("B1:G1");
  const titleCell = ws.getCell("B1");
  titleCell.value = `Farm Buddy — Daily Readings${farmName ? `  ·  ${farmName}` : ""}`;
  titleCell.font = { bold: true, size: 14, color: { argb: WHITE } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_GREEN } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 36;

  // Header row
  const headers = ["Date", "Shed", "Silo", "Feed Type", "Amount", "Unit"];
  applyHeaderRow(ws.getRow(2), headers);

  // Column widths
  ws.columns = [
    { width: 2 },   // spacer
    { width: 16 },  // Date
    { width: 18 },  // Shed
    { width: 8 },   // Silo
    { width: 20 },  // Feed Type
    { width: 12 },  // Amount
    { width: 10 },  // Unit
  ];

  readings.forEach((r, i) => {
    const row = ws.addRow([
      "",
      toAESTDateStr(r.readingDate),
      r.shedGroupName,
      `Silo ${r.siloLetter}`,
      r.feedType,
      r.amountRemaining,
      r.unit,
    ]);
    applyDataRow(row, i % 2 === 1);
    row.getCell(6).alignment = { horizontal: "right", vertical: "middle" };
  });

  // Auto-filter on header row
  ws.autoFilter = { from: "B2", to: "G2" };

  // ── TOTAL FEED ON HAND summary section ──────────────────────────────────────
  // Compute the latest reading per shed+silo, then sum in tonnes
  if (readings.length > 0) {
    // Latest reading per (shed, silo)
    const latestMap = new Map<string, typeof readings[0]>();
    readings.forEach(r => {
      const key = `${r.shedGroupName}|${r.siloLetter}`;
      const ex = latestMap.get(key);
      if (!ex || r.readingDate > ex.readingDate) latestMap.set(key, r);
    });

    // Group by shed
    const shedMap = new Map<string, { silos: { letter: string; tonne: number }[]; total: number }>();
    for (const [key, r] of latestMap) {
      const [shed, letter] = key.split("|");
      if (!shedMap.has(shed)) shedMap.set(shed, { silos: [], total: 0 });
      const entry = shedMap.get(shed)!;
      const t = toTonnes(r.amountRemaining, r.unit);
      entry.silos.push({ letter, tonne: t });
      entry.total += t;
    }
    for (const e of shedMap.values()) e.silos.sort((a, b) => a.letter.localeCompare(b.letter));

    const grandTotal = [...shedMap.values()].reduce((s, e) => s + e.total, 0);
    const aestNow = new Date(Date.now() + 10 * 3600_000);
    const dateLabel = aestNow.toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

    // Spacer
    ws.addRow([]);

    // Section heading
    const headRow = ws.addRow(["", "FEED ON HAND SUMMARY", "", "", `As at ${dateLabel}`, "", ""]);
    ws.mergeCells(`B${headRow.number}:D${headRow.number}`);
    ws.mergeCells(`E${headRow.number}:G${headRow.number}`);
    headRow.eachCell((cell, col) => {
      if (col === 1) return;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_GREEN } };
      cell.font = { bold: true, color: { argb: WHITE }, size: 11 };
      cell.alignment = { vertical: "middle", horizontal: col === 2 ? "left" : "right" };
    });
    headRow.height = 24;

    // Per-shed rows
    let altIdx = 0;
    for (const [shedName, entry] of shedMap) {
      const siloStr = entry.silos.map(s => `Silo ${s.letter}: ${s.tonne.toFixed(1)} t`).join("   ");
      const row = ws.addRow(["", shedName, siloStr, "", entry.total.toFixed(1), "t", ""]);
      ws.mergeCells(`C${row.number}:D${row.number}`);
      applyDataRow(row, altIdx % 2 === 1);
      row.getCell(2).font = { bold: true, color: { argb: DARK_TEXT }, size: 10 };
      row.getCell(5).alignment = { horizontal: "right", vertical: "middle" };
      row.getCell(5).font = { bold: true, color: { argb: DARK_TEXT }, size: 10 };
      altIdx++;
    }

    // Grand total row
    const totalRow = ws.addRow(["", "TOTAL FEED ON HAND", "", "", grandTotal.toFixed(1), "t", ""]);
    ws.mergeCells(`B${totalRow.number}:D${totalRow.number}`);
    totalRow.eachCell((cell, col) => {
      if (col === 1) return;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } };
      cell.font = { bold: true, color: { argb: WHITE }, size: 12 };
      cell.alignment = { vertical: "middle", horizontal: col === 5 ? "right" : "left" };
    });
    // Gold accent on the total value cell
    totalRow.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
    totalRow.getCell(5).font = { bold: true, color: { argb: "FF000000" }, size: 13 };
    totalRow.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
    totalRow.getCell(6).font = { bold: true, color: { argb: "FF000000" }, size: 12 };
    totalRow.height = 28;
  }

  // ── Deliveries sheet ────────────────────────────────────────────────────────
  const ws2 = wb.addWorksheet("Deliveries", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  ws2.mergeCells("B1:F1");
  const t2 = ws2.getCell("B1");
  t2.value = `Farm Buddy — Deliveries${farmName ? `  ·  ${farmName}` : ""}`;
  t2.font = { bold: true, size: 14, color: { argb: WHITE } };
  t2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_GREEN } };
  t2.alignment = { vertical: "middle", horizontal: "left" };
  ws2.getRow(1).height = 36;

  const dHeaders = ["Date", "Kilograms", "Shed", "Doc / Notes"];
  applyHeaderRow(ws2.getRow(2), dHeaders);

  ws2.columns = [
    { width: 2 },
    { width: 16 },
    { width: 14 },
    { width: 20 },
    { width: 28 },
  ];

  deliveries.forEach((d, i) => {
    const row = ws2.addRow([
      "",
      toAESTDateStr(d.deliveryDate),
      d.amount,
      d.shedGroupName ?? "",
      d.notes ?? "",
    ]);
    applyDataRow(row, i % 2 === 1);
    row.getCell(3).alignment = { horizontal: "right", vertical: "middle" };
  });

  ws2.autoFilter = { from: "B2", to: "E2" };

  // ── Download ────────────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `silo-mate-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
