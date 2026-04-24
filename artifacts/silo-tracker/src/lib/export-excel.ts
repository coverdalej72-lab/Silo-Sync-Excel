import ExcelJS from "exceljs";

const EXCEL_GREEN = "FF217346";
const LIGHT_GREEN = "FFE2EFDA";
const WHITE = "FFFFFFFF";
const DARK_TEXT = "FF212121";
const MID_GREY = "FFD9D9D9";

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
  }[]
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
  titleCell.value = "Farm Buddy — Daily Readings";
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
      new Date(r.readingDate).toLocaleDateString("en-AU"),
      r.shedGroupName,
      `Silo ${r.siloLetter}`,
      r.feedType,
      r.amountRemaining,
      r.unit,
    ]);
    applyDataRow(row, i % 2 === 1);
    // right-align the amount
    row.getCell(6).alignment = { horizontal: "right", vertical: "middle" };
  });

  // Auto-filter on header row
  ws.autoFilter = { from: "B2", to: "G2" };

  // ── Deliveries sheet ────────────────────────────────────────────────────────
  const ws2 = wb.addWorksheet("Deliveries", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  ws2.mergeCells("B1:F1");
  const t2 = ws2.getCell("B1");
  t2.value = "Farm Buddy — Deliveries";
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
      new Date(d.deliveryDate).toLocaleDateString("en-AU"),
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
