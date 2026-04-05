import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

interface CellInfo {
  value: string;
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
  fontColor?: string;
  bgColor?: string;
  hAlign?: string;
  vAlign?: string;
  colSpan?: number;
  rowSpan?: number;
  hidden?: boolean;
  wrapText?: boolean;
  borderTop?: string;
  borderBottom?: string;
  borderLeft?: string;
  borderRight?: string;
}

interface SheetParsed {
  name: string;
  tabColor?: string;
  cells: Map<string, CellInfo>;
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
  colWidths: number[];
  rowHeights: number[];
  merges: { r: number; c: number; rs: number; cs: number }[];
}

const BASE = import.meta.env.BASE_URL;

function colLetter(n: number): string {
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function argbToHex(argb?: string): string | undefined {
  if (!argb || argb.length < 6) return undefined;
  if (argb.length === 8) return `#${argb.slice(2)}`;
  if (argb.length === 6) return `#${argb}`;
  return undefined;
}

function contrastColor(hex?: string): string {
  if (!hex) return "#000";
  const raw = hex.startsWith("#") ? hex.slice(1) : hex;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "#000";
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? "#000000" : "#ffffff";
}

function borderStyle(b?: { style?: string; color?: { rgb?: string; theme?: number } }): string | undefined {
  if (!b?.style || b.style === "none") return undefined;
  const color = argbToHex(b.color?.rgb) ?? "#ccc";
  const w = b.style === "thick" ? "2px" : b.style === "medium" ? "1.5px" : "1px";
  return `${w} solid ${color}`;
}

function parseSheet(ws: XLSX.WorkSheet, name: string, tabArgb?: string): SheetParsed {
  const ref = ws["!ref"];
  if (!ref) {
    return { name, tabColor: tabArgb, cells: new Map(), minRow: 0, maxRow: 0, minCol: 0, maxCol: 0, colWidths: [], rowHeights: [], merges: [] };
  }

  const range = XLSX.utils.decode_range(ref);
  const minRow = range.s.r;
  const maxRow = range.e.r;
  const minCol = range.s.c;
  const maxCol = range.e.c;

  // Parse merges
  const rawMerges = ws["!merges"] ?? [];
  const mergeSet = new Map<string, { r: number; c: number; rs: number; cs: number }>();
  const mergeHidden = new Set<string>();
  const merges: { r: number; c: number; rs: number; cs: number }[] = [];

  for (const m of rawMerges) {
    const rs = m.e.r - m.s.r + 1;
    const cs = m.e.c - m.s.c + 1;
    const entry = { r: m.s.r, c: m.s.c, rs, cs };
    mergeSet.set(`${m.s.r},${m.s.c}`, entry);
    merges.push(entry);
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (r !== m.s.r || c !== m.s.c) mergeHidden.add(`${r},${c}`);
      }
    }
  }

  // Parse col widths (Excel char widths → approximate px)
  const rawCols = ws["!cols"] ?? [];
  const colWidths: number[] = [];
  for (let c = minCol; c <= maxCol; c++) {
    const col = rawCols[c];
    if (col?.wpx) colWidths[c] = Math.max(col.wpx, 20);
    else if (col?.wch) colWidths[c] = Math.max(Math.round(col.wch * 7), 20);
    else colWidths[c] = 80;
  }

  // Parse row heights
  const rawRows = ws["!rows"] ?? [];
  const rowHeights: number[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    const row = rawRows[r];
    if (row?.hpx) rowHeights[r] = row.hpx;
    else if (row?.hpt) rowHeights[r] = Math.round(row.hpt * 1.33);
    else rowHeights[r] = 20;
  }

  const cells = new Map<string, CellInfo>();

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const key = `${r},${c}`;
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell: XLSX.CellObject | undefined = ws[addr];

      const hidden = mergeHidden.has(key);
      const merge = mergeSet.get(key);

      let value = "";
      if (cell) {
        if (cell.t === "d" && cell.v instanceof Date) {
          value = cell.v.toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
        } else if (cell.w != null) {
          value = cell.w;
        } else if (cell.v != null) {
          value = String(cell.v);
        }
      }

      const s = (cell as any)?.s;
      const font = s?.font;
      const fill = s?.fill;
      const al = s?.alignment;
      const border = s?.border;

      const bgColor = argbToHex(fill?.fgColor?.rgb);
      const fontColor = argbToHex(font?.color?.rgb);

      cells.set(key, {
        value,
        bold: font?.bold ?? false,
        italic: font?.italic ?? false,
        fontSize: font?.sz ?? 11,
        fontColor: fontColor,
        bgColor: bgColor,
        hAlign: al?.horizontal,
        vAlign: al?.vertical,
        wrapText: al?.wrapText,
        colSpan: merge ? merge.cs : undefined,
        rowSpan: merge ? merge.rs : undefined,
        hidden,
        borderTop: borderStyle(border?.top),
        borderBottom: borderStyle(border?.bottom),
        borderLeft: borderStyle(border?.left),
        borderRight: borderStyle(border?.right),
      });
    }
  }

  return { name, tabColor: tabArgb, cells, minRow, maxRow, minCol, maxCol, colWidths, rowHeights, merges };
}

function SheetView({ sheet }: { sheet: SheetParsed }) {
  const { cells, minRow, maxRow, minCol, maxCol, colWidths, rowHeights } = sheet;

  const colCount = maxCol - minCol + 1;
  const rowCount = maxRow - minRow + 1;

  return (
    <div style={{ display: "block" }}>
      <table
        style={{
          borderCollapse: "collapse",
          fontFamily: "Calibri, 'Segoe UI', sans-serif",
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          {/* Row number column */}
          <col style={{ width: 42, minWidth: 42 }} />
          {Array.from({ length: colCount }, (_, i) => {
            const c = minCol + i;
            return <col key={c} style={{ width: colWidths[c] ?? 80, minWidth: 24 }} />;
          })}
        </colgroup>
        <thead>
          <tr>
            {/* Corner cell */}
            <th
              style={{
                position: "sticky",
                left: 0,
                top: 0,
                zIndex: 3,
                background: "#e8ede8",
                border: "1px solid #b0b0b0",
                width: 42,
                minWidth: 42,
                height: 20,
                fontSize: 10,
                color: "#555",
                textAlign: "center",
              }}
            />
            {Array.from({ length: colCount }, (_, i) => {
              const c = minCol + i;
              return (
                <th
                  key={c}
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                    background: "#e8ede8",
                    border: "1px solid #b0b0b0",
                    height: 20,
                    fontSize: 10,
                    color: "#444",
                    textAlign: "center",
                    fontWeight: 600,
                    userSelect: "none",
                    padding: "1px 2px",
                  }}
                >
                  {colLetter(c)}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, ri) => {
            const r = minRow + ri;
            const rowH = rowHeights[r] ?? 20;
            return (
              <tr key={r} style={{ height: rowH }}>
                {/* Row number */}
                <td
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 1,
                    background: "#e8ede8",
                    border: "1px solid #b0b0b0",
                    fontSize: 10,
                    color: "#555",
                    textAlign: "center",
                    userSelect: "none",
                    fontFamily: "Calibri, sans-serif",
                    padding: "0 3px",
                    minWidth: 42,
                    width: 42,
                  }}
                >
                  {r + 1}
                </td>
                {Array.from({ length: colCount }, (_, ci) => {
                  const c = minCol + ci;
                  const info = cells.get(`${r},${c}`);
                  if (!info) {
                    return (
                      <td
                        key={c}
                        style={{ border: "1px solid #e0e0e0", height: rowH, background: "#fff" }}
                      />
                    );
                  }
                  if (info.hidden) return null;
                  const fs = info.fontSize ?? 11;
                  return (
                    <td
                      key={c}
                      colSpan={info.colSpan}
                      rowSpan={info.rowSpan}
                      style={{
                        background: info.bgColor ?? "#fff",
                        color: info.fontColor ?? "#000",
                        fontWeight: info.bold ? "bold" : "normal",
                        fontStyle: info.italic ? "italic" : "normal",
                        fontSize: fs,
                        textAlign: (info.hAlign as any) ?? "left",
                        verticalAlign: info.vAlign === "center" ? "middle" : info.vAlign === "bottom" ? "bottom" : "top",
                        whiteSpace: info.wrapText ? "pre-wrap" : "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        padding: "1px 3px",
                        borderTop: info.borderTop ?? "1px solid #e0e0e0",
                        borderBottom: info.borderBottom ?? "1px solid #e0e0e0",
                        borderLeft: info.borderLeft ?? "1px solid #e0e0e0",
                        borderRight: info.borderRight ?? "1px solid #e0e0e0",
                        height: rowH,
                        maxWidth: 400,
                      }}
                    >
                      {info.value}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const [sheets, setSheets] = useState<SheetParsed[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = `${BASE}feed-program.xlsx`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        const wb = XLSX.read(buf, {
          type: "array",
          cellStyles: true,
          cellDates: true,
          dense: false,
        });

        const result: SheetParsed[] = [];
        let startIdx = 0;

        wb.SheetNames.forEach((name, idx) => {
          const ws = wb.Sheets[name];
          if (!ws) return;
          const tabColor = wb.Workbook?.Sheets?.[idx]?.TabColor;
          const tabArgb = tabColor?.rgb ? tabColor.rgb : undefined;
          const parsed = parseSheet(ws, name.trim(), tabArgb ? argbToHex(tabArgb) : undefined);
          if (name.trim().toUpperCase().includes("3") && name.trim().toUpperCase().includes("4")) {
            startIdx = result.length;
          }
          result.push(parsed);
        });

        setSheets(result);
        setActive(startIdx);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-green-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-green-800 font-semibold">Loading Feed Program…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-red-50">
        <p className="text-red-700 font-semibold">Failed to load: {error}</p>
      </div>
    );
  }

  const current = sheets[active];

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-[#1a5c36] text-white px-4 py-2 flex items-center gap-3 shadow-md shrink-0">
        <span className="text-lg font-bold tracking-wide">Double B Farm — Feed Program</span>
        <span className="ml-auto text-sm text-green-200 opacity-75">{sheets.length} sheets</span>
      </div>

      {/* Sheet tabs */}
      <div className="flex items-end gap-0.5 px-3 pt-2 bg-gray-200 overflow-x-auto shrink-0">
        {sheets.map((s, i) => {
          const isActive = i === active;
          const bg = s.tabColor ?? "#217346";
          const fg = contrastColor(s.tabColor);
          return (
            <button
              key={i}
              onClick={() => setActive(i)}
              className="px-3 py-1.5 text-xs font-semibold rounded-t border border-b-0 whitespace-nowrap transition-all"
              style={{
                backgroundColor: isActive ? bg : `${bg}aa`,
                color: isActive ? fg : fg,
                borderColor: bg,
                opacity: isActive ? 1 : 0.72,
                transform: isActive ? "translateY(1px)" : "translateY(3px)",
              }}
            >
              {s.name}
            </button>
          );
        })}
      </div>

      {/* Spreadsheet content */}
      <div className="flex-1 overflow-auto bg-white border-t-2 border-[#217346]">
        {current && <SheetView sheet={current} />}
      </div>
    </div>
  );
}
