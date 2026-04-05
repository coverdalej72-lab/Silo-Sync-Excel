import { useEffect, useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";

function escapeXml(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function updateCellInXml(xml: string, addr: string, newVal: string): string {
  const numVal = parseFloat(newVal.replace(/,/g, ""));
  const isNum = !isNaN(numVal) && newVal.trim() !== "";
  // Match <c ... r="ADDR" ... > ... </c>
  const cellRe = new RegExp(`(<c\\b[^>]*\\br="${escapeRegex(addr)}"[^>]*>)([\\s\\S]*?)(</c>)`, "g");
  let matched = false;
  const out = xml.replace(cellRe, (_match, open, _inner, close) => {
    matched = true;
    // Strip existing t="..." attribute so we can set the correct one
    let newOpen = open.replace(/\s+t="[^"]*"/, "");
    if (isNum) {
      return `${newOpen}<v>${numVal}</v>${close}`;
    } else {
      // Insert t="inlineStr" right after <c
      newOpen = newOpen.replace(/^<c\b/, '<c t="inlineStr"');
      return `${newOpen}<is><t>${escapeXml(newVal)}</t></is>${close}`;
    }
  });
  if (!matched) {
    // Cell doesn't exist in XML yet — inject a new <c> before </row>
    const numStr = isNum ? `<v>${numVal}</v>` : `<is><t>${escapeXml(newVal)}</t></is>`;
    const type = isNum ? "" : ` t="inlineStr"`;
    return out.replace(/<\/row>/, `<c r="${addr}"${type}>${numStr}</c></row>`);
  }
  return out;
}

async function getSheetXmlPaths(zip: JSZip): Promise<string[]> {
  const wbRelsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string") ?? "";
  // Build rId -> target map
  const ridToTarget = new Map<string, string>();
  for (const m of wbRelsXml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    ridToTarget.set(m[1], m[2]);
  }
  const wbXml = await zip.file("xl/workbook.xml")?.async("string") ?? "";
  const paths: string[] = [];
  for (const m of wbXml.matchAll(/<sheet\b[^>]*\br:id="([^"]+)"/g)) {
    const target = ridToTarget.get(m[1]) ?? "";
    paths.push(target.startsWith("worksheets/") ? `xl/${target}` : target);
  }
  return paths;
}

// Column indices (0-based Excel column letters)
const COL_E = 4;   // FEED ORDERED (deliveries)
const COL_G = 6;   // FEED ALLOC remaining
const COL_H = 7;   // FEED USAGE
const COL_I = 8;   // FEED ON HAND
const COL_J = 9;   // SILO TOTAL
const COL_K = 10;  // Silo A
const COL_L = 11;  // Silo B
const COL_M = 12;  // Silo C

function recalculate(
  cells: Map<string, CellInfo>,
  edits: Map<string, string>,
  triggeredRow: number,
  triggeredCol: number,
  maxRow: number
): Map<string, string> {
  // Only cascade for silo columns (K,L,M) or delivery (E)
  if (![COL_K, COL_L, COL_M, COL_E, COL_J].includes(triggeredCol)) return edits;

  const newEdits = new Map(edits);

  const getNum = (r: number, c: number): number => {
    const key = `${r},${c}`;
    const editVal = newEdits.get(key);
    if (editVal !== undefined) return parseFloat(editVal) || 0;
    return parseFloat(cells.get(key)?.value ?? "0") || 0;
  };
  const setNum = (r: number, c: number, val: number) => {
    newEdits.set(`${r},${c}`, String(Math.round(val * 100) / 100));
  };

  // Cascade G (FEED ALLOC remaining) down when E (delivery) is edited
  if (triggeredCol === COL_E) {
    for (let r = triggeredRow; r <= maxRow; r++) {
      const gPrev = getNum(r - 1, COL_G);
      const e = getNum(r, COL_E);
      if (e !== 0 || cells.has(`${r},${COL_E}`)) {
        setNum(r, COL_G, gPrev - e);
      }
    }
  }

  // Cascade J (SILO TOTAL) and I (FEED ON HAND) from triggeredRow down
  for (let r = triggeredRow; r <= maxRow; r++) {
    const k = getNum(r, COL_K);
    const l = getNum(r, COL_L);
    const m = getNum(r, COL_M);
    const j = k + l + m;
    // Only set J if at least one silo column exists on this row
    if (cells.has(`${r},${COL_K}`) || cells.has(`${r},${COL_L}`) || cells.has(`${r},${COL_M}`) || cells.has(`${r},${COL_J}`)) {
      setNum(r, COL_J, j);
      const h = getNum(r, COL_H);
      const e = getNum(r, COL_E);
      const iPrev = getNum(r - 1, COL_I);
      const iNew = j > 0 ? j - h + e : iPrev - h + e;
      setNum(r, COL_I, iNew);
    }
  }

  return newEdits;
}

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

interface RichStyle {
  fontColor: string | null;
  bgColor: string | null;
  bold: boolean;
  fontSize: number;
}

interface SheetParsed {
  name: string;
  rawName: string;
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

function contrastColor(hex?: string): string {
  if (!hex) return "#000";
  const raw = hex.startsWith("#") ? hex.slice(1) : hex;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "#000";
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? "#000000" : "#ffffff";
}

function borderStyle(b?: { style?: string; color?: { rgb?: string } }): string | undefined {
  if (!b?.style || b.style === "none") return undefined;
  const color = b.color?.rgb ? `#${b.color.rgb.length === 8 ? b.color.rgb.slice(2) : b.color.rgb}` : "#ccc";
  const w = b.style === "thick" ? "2px" : b.style === "medium" ? "1.5px" : "1px";
  return `${w} solid ${color}`;
}

function parseSheet(
  ws: XLSX.WorkSheet,
  name: string,
  rawName: string,
  tabArgb: string | undefined,
  richStyles: Record<string, RichStyle> | undefined
): SheetParsed {
  const ref = ws["!ref"];
  if (!ref) {
    return { name, rawName, tabColor: tabArgb, cells: new Map(), minRow: 0, maxRow: 0, minCol: 0, maxCol: 0, colWidths: [], rowHeights: [], merges: [] };
  }
  const range = XLSX.utils.decode_range(ref);
  const minRow = range.s.r, maxRow = range.e.r;
  const minCol = range.s.c, maxCol = range.e.c;

  const rawMerges = ws["!merges"] ?? [];
  const mergeSet = new Map<string, { r: number; c: number; rs: number; cs: number }>();
  const mergeHidden = new Set<string>();
  const merges: { r: number; c: number; rs: number; cs: number }[] = [];
  for (const m of rawMerges) {
    const rs = m.e.r - m.s.r + 1, cs = m.e.c - m.s.c + 1;
    mergeSet.set(`${m.s.r},${m.s.c}`, { r: m.s.r, c: m.s.c, rs, cs });
    merges.push({ r: m.s.r, c: m.s.c, rs, cs });
    for (let r = m.s.r; r <= m.e.r; r++)
      for (let c = m.s.c; c <= m.e.c; c++)
        if (r !== m.s.r || c !== m.s.c) mergeHidden.add(`${r},${c}`);
  }

  const rawCols = ws["!cols"] ?? [];
  const colWidths: number[] = [];
  for (let c = minCol; c <= maxCol; c++) {
    const col = rawCols[c];
    colWidths[c] = col?.wpx ? Math.max(col.wpx, 20) : col?.wch ? Math.max(Math.round(col.wch * 7), 20) : 80;
  }

  const rawRows = ws["!rows"] ?? [];
  const rowHeights: number[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    const row = rawRows[r];
    rowHeights[r] = row?.hpx ? row.hpx : row?.hpt ? Math.round(row.hpt * 1.33) : 20;
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
        if (cell.t === "d" && cell.v instanceof Date)
          value = cell.v.toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
        else if (cell.w != null) value = cell.w;
        else if (cell.v != null) value = String(cell.v);
      }

      // Primary: use rich style data from the pre-extracted JSON (accurate font + bg colors)
      const rich = richStyles?.[addr];

      // Fallback: SheetJS flat style for fill colour (when rich data not available)
      const s = (cell as any)?.s;
      let fallbackBg: string | undefined;
      if (!rich?.bgColor && s?.patternType === "solid" && s?.fgColor?.rgb) {
        const raw = s.fgColor.rgb as string;
        const hex = raw.length === 8 ? raw.slice(2) : raw;
        if (hex.toUpperCase() !== "FFFFFF" && hex !== "") fallbackBg = `#${hex}`;
      }

      const al = s?.alignment;
      const border = s?.border;

      const bgColor = rich?.bgColor ?? fallbackBg;
      const fontColor = rich?.fontColor ?? undefined;
      const bold = rich?.bold ?? s?.bold ?? false;
      const fontSize = rich?.fontSize ?? s?.sz ?? 11;

      cells.set(key, {
        value,
        bold,
        italic: s?.italic ?? false,
        fontSize,
        fontColor,
        bgColor,
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
  return { name, rawName, tabColor: tabArgb, cells, minRow, maxRow, minCol, maxCol, colWidths, rowHeights, merges };
}

interface EditingCell { r: number; c: number; sheetIdx: number }

const thStyle: React.CSSProperties = {
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
};

const rnStyle: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 1,
  background: "#e8ede8",
  border: "1px solid #b0b0b0",
  fontSize: 10,
  color: "#555",
  textAlign: "center",
  userSelect: "none",
  fontFamily: "Calibri,sans-serif",
  padding: "0 3px",
  minWidth: 42,
  width: 42,
};

function SheetView({
  sheet,
  sheetIdx,
  edits,
  onEdit,
  editingCell,
  setEditingCell,
}: {
  sheet: SheetParsed;
  sheetIdx: number;
  edits: Map<string, string>;
  onEdit: (key: string, value: string) => void;
  editingCell: EditingCell | null;
  setEditingCell: (c: EditingCell | null) => void;
}) {
  const { cells, minRow, maxRow, minCol, maxCol, colWidths, rowHeights } = sheet;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCell && inputRef.current) inputRef.current.focus();
  }, [editingCell]);

  const commitEdit = (r: number, c: number, val: string) => {
    onEdit(`${r},${c}`, val);
    setEditingCell(null);
  };

  return (
    <table style={{ borderCollapse: "collapse", fontFamily: "Arial,sans-serif", tableLayout: "fixed" }}>
      <colgroup>
        <col style={{ width: 42, minWidth: 42 }} />
        {Array.from({ length: maxCol - minCol + 1 }, (_, i) => {
          const c = minCol + i;
          return <col key={c} style={{ width: colWidths[c] ?? 80, minWidth: 24 }} />;
        })}
      </colgroup>
      <thead>
        <tr>
          <th style={thStyle} />
          {Array.from({ length: maxCol - minCol + 1 }, (_, i) => {
            const c = minCol + i;
            return <th key={c} style={thStyle}>{colLetter(c)}</th>;
          })}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: maxRow - minRow + 1 }, (_, ri) => {
          const r = minRow + ri;
          const rowH = rowHeights[r] ?? 20;
          return (
            <tr key={r} style={{ height: rowH }}>
              <td style={rnStyle}>{r + 1}</td>
              {Array.from({ length: maxCol - minCol + 1 }, (_, ci) => {
                const c = minCol + ci;
                const info = cells.get(`${r},${c}`);
                if (!info) return <td key={c} style={{ border: "1px solid #e0e0e0", height: rowH, background: "#fff" }} />;
                if (info.hidden) return null;
                const key = `${r},${c}`;
                const isEditing = editingCell?.r === r && editingCell?.c === c && editingCell?.sheetIdx === sheetIdx;
                const displayVal = edits.has(key) ? edits.get(key)! : info.value;
                const fs = info.fontSize ?? 11;

                // Column I (index 8) = FEED ON HAND — highlight red when negative (feed run out)
                const numVal = parseFloat(displayVal.replace(/,/g, ""));
                const isFeedRunOut = c === 8 && !isNaN(numVal) && numVal < 0;

                return (
                  <td
                    key={c}
                    colSpan={info.colSpan}
                    rowSpan={info.rowSpan}
                    onDoubleClick={() => setEditingCell({ r, c, sheetIdx })}
                    title={isFeedRunOut ? "⚠ FEED RUN OUT" : "Double-click to edit"}
                    style={{
                      background: isFeedRunOut ? "#dc2626" : (info.bgColor ?? "#fff"),
                      color: isFeedRunOut ? "#ffffff" : (info.fontColor ?? "#000"),
                      fontWeight: info.bold ? "bold" : "normal",
                      fontStyle: info.italic ? "italic" : "normal",
                      fontSize: fs,
                      textAlign: (info.hAlign as any) ?? "left",
                      verticalAlign: info.vAlign === "center" ? "middle" : info.vAlign === "bottom" ? "bottom" : "top",
                      whiteSpace: info.wrapText ? "pre-wrap" : "nowrap",
                      overflow: "hidden",
                      textOverflow: isEditing ? "clip" : "ellipsis",
                      padding: isEditing ? 0 : "1px 3px",
                      borderTop: info.borderTop ?? "1px solid #e0e0e0",
                      borderBottom: info.borderBottom ?? "1px solid #e0e0e0",
                      borderLeft: info.borderLeft ?? "1px solid #e0e0e0",
                      borderRight: info.borderRight ?? "1px solid #e0e0e0",
                      height: rowH,
                      maxWidth: 400,
                      cursor: "default",
                      outline: isEditing ? "2px solid #1a5c36" : "none",
                    }}
                  >
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        defaultValue={displayVal}
                        onBlur={(e) => commitEdit(r, c, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Tab") {
                            e.preventDefault();
                            commitEdit(r, c, (e.target as HTMLInputElement).value);
                          }
                          if (e.key === "Escape") setEditingCell(null);
                        }}
                        style={{
                          width: "100%", height: "100%", border: "none", outline: "none",
                          background: info.bgColor ?? "#fff", color: info.fontColor ?? "#000",
                          fontWeight: info.bold ? "bold" : "normal",
                          fontSize: fs, fontFamily: "Arial,sans-serif",
                          padding: "1px 3px", boxSizing: "border-box",
                        }}
                      />
                    ) : displayVal}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function App() {
  const [sheets, setSheets] = useState<SheetParsed[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [edits, setEdits] = useState<Map<string, string>[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const workbookRef = useRef<XLSX.WorkBook | null>(null);
  const rawBufferRef = useRef<ArrayBuffer | null>(null);

  useEffect(() => {
    const xlsxUrl = `${BASE}feed-program.xlsx`;
    const styleUrl = `${BASE}style-data.json`;

    Promise.all([
      fetch(xlsxUrl).then(r => { if (!r.ok) throw new Error(`xlsx HTTP ${r.status}`); return r.arrayBuffer(); }),
      fetch(styleUrl).then(r => { if (!r.ok) throw new Error(`styles HTTP ${r.status}`); return r.json(); }),
    ])
      .then(([buf, styleData]: [ArrayBuffer, Record<string, Record<string, RichStyle>>]) => {
        rawBufferRef.current = buf;
        const wb = XLSX.read(buf, { type: "array", cellStyles: true, cellDates: true, dense: false });
        workbookRef.current = wb;

        // Build a trimmed-name -> richStyles lookup from style-data.json
        const styleByTrimmed = new Map<string, Record<string, RichStyle>>();
        Object.entries(styleData).forEach(([rawName, cellMap]) => {
          styleByTrimmed.set(rawName.trim(), cellMap);
        });

        const result: SheetParsed[] = [];
        let startIdx = 0;

        wb.SheetNames.forEach((rawName, idx) => {
          const ws = wb.Sheets[rawName];
          if (!ws) return;
          const trimmedName = rawName.trim();
          const tabColor = wb.Workbook?.Sheets?.[idx]?.TabColor;
          const tabArgb = tabColor?.rgb ? `#${tabColor.rgb}` : undefined;
          const richStyles = styleByTrimmed.get(trimmedName);
          const parsed = parseSheet(ws, trimmedName, rawName, tabArgb, richStyles);

          if (trimmedName.toUpperCase().includes("3") && trimmedName.toUpperCase().includes("4")) {
            startIdx = result.length;
          }
          result.push(parsed);
        });

        setSheets(result);
        setEdits(result.map(() => new Map()));
        setActive(startIdx);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  const handleEdit = useCallback((sheetIdx: number, key: string, value: string) => {
    setEdits((prev) => {
      const next = [...prev];
      const m = new Map(next[sheetIdx]);
      m.set(key, value);
      const [r, c] = key.split(",").map(Number);
      const sheet = sheets[sheetIdx];
      const recalculated = sheet ? recalculate(sheet.cells, m, r, c, sheet.maxRow) : m;
      next[sheetIdx] = recalculated;
      return next;
    });
    setHasChanges(true);
  }, [sheets]);

  const downloadFile = async () => {
    if (!rawBufferRef.current) return;
    const zip = await JSZip.loadAsync(rawBufferRef.current.slice(0));
    const sheetPaths = await getSheetXmlPaths(zip);

    for (let si = 0; si < sheets.length; si++) {
      const sheetEdits = edits[si];
      if (!sheetEdits || sheetEdits.size === 0) continue;
      const xmlPath = sheetPaths[si];
      if (!xmlPath) continue;
      let xml = await zip.file(xmlPath)?.async("string");
      if (!xml) continue;
      sheetEdits.forEach((newVal, key) => {
        const [r, c] = key.split(",").map(Number);
        const addr = XLSX.utils.encode_cell({ r, c });
        xml = updateCellInXml(xml!, addr, newVal);
      });
      zip.file(xmlPath, xml!);
    }

    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 3 } });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "feed-program.xlsx";
    a.click();
    URL.revokeObjectURL(url);
    setHasChanges(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-green-50">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-green-800 font-semibold">Loading Feed Program…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-screen bg-red-50">
      <p className="text-red-700 font-semibold">Failed to load: {error}</p>
    </div>
  );

  const current = sheets[active];

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-[#1a5c36] text-white px-4 py-2 flex items-center gap-3 shadow-md shrink-0">
        <span className="text-lg font-bold tracking-wide">Double B Farm — Feed Program</span>
        <div className="ml-auto flex items-center gap-2">
          {hasChanges && <span className="text-yellow-300 text-xs font-semibold">● Unsaved changes</span>}
          <button
            onClick={downloadFile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-semibold transition-colors"
            style={{ background: hasChanges ? "#f59e0b" : "#2d8653", color: hasChanges ? "#000" : "#fff" }}
          >
            ⬇ Save & Download
          </button>
        </div>
      </div>

      {/* Hint bar */}
      <div className="bg-[#e8f5ee] border-b border-green-200 px-4 py-1 text-xs text-green-800 shrink-0">
        Double-click any cell to edit. Press <kbd className="bg-white border border-green-300 rounded px-1">Enter</kbd> or click away to confirm.
      </div>

      {/* Sheet tabs */}
      <div className="flex items-end gap-0.5 px-3 pt-2 bg-gray-200 overflow-x-auto shrink-0">
        {sheets.map((s, i) => {
          const isActive = i === active;
          const bg = s.tabColor ?? "#217346";
          const fg = contrastColor(s.tabColor);
          const hasEdits = edits[i]?.size > 0;
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
              {s.name}{hasEdits ? " •" : ""}
            </button>
          );
        })}
      </div>

      {/* Spreadsheet */}
      <div className="flex-1 overflow-auto bg-white border-t-2 border-[#217346]">
        {current && (
          <SheetView
            sheet={current}
            sheetIdx={active}
            edits={edits[active] ?? new Map()}
            onEdit={(key, val) => handleEdit(active, key, val)}
            editingCell={editingCell}
            setEditingCell={setEditingCell}
          />
        )}
      </div>
    </div>
  );
}
