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
const COL_B = 1;   // DATE (per-day date)
const COL_C = 2;   // Placement date (C3) / Bird count (C2)
const COL_E = 4;   // FEED ORDERED (deliveries)
const COL_G = 6;   // FEED ALLOC remaining
const COL_H = 7;   // FEED USAGE
const COL_I = 8;   // FEED ON HAND
const COL_J = 9;   // SILO TOTAL
const COL_K = 10;  // Silo A
const COL_L = 11;  // Silo B
const COL_M = 12;  // Silo C

// ── Farm config (shared localStorage with Silo Tracker) ─────────────────────
const FARM_CONFIG_KEY = "silo-farm-config";

interface FarmShedConfig { shedGroupId: number; active: boolean; silos: { letter: string }[] }
interface FarmConfigData { shedGroups?: FarmShedConfig[] }

function readFarmConfig(): FarmConfigData {
  try {
    const raw = localStorage.getItem(FARM_CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

// Maps shed sheet index (0-based, counting only SHED sheets) → shedGroupId (1–10)
const SHED_SHEET_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// Cobb 500 grams per bird per day (day 1 → day 54)
const COBB500_GRAMS = [22,24,26,28,30,32,34,36,40,45,50,55,60,65,74,75,80,87,93,97,103,107,113,118,122,128,134,139,140,142,149,153,158,163,165,168,171,174,176,178,180,181,188,190,192,193,194,195,196,197,197,197,198,197];

function parseDateInput(str: string): Date | null {
  if (!str) return null;
  // DD/MM/YYYY or D/M/YYYY
  const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]));
  // YYYY-MM-DD (ISO)
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
  // MM/DD/YYYY (US, fallback)
  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return new Date(parseInt(mdy[3]), parseInt(mdy[1]) - 1, parseInt(mdy[2]));
  // Natural language fallback
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function recalculate(
  cells: Map<string, CellInfo>,
  edits: Map<string, string>,
  triggeredRow: number,
  triggeredCol: number,
  maxRow: number
): Map<string, string> {
  const newEdits = new Map(edits);

  const getNum = (r: number, c: number): number => {
    const key = `${r},${c}`;
    const ev = newEdits.get(key);
    if (ev !== undefined) return parseFloat(ev) || 0;
    return parseFloat(cells.get(key)?.value ?? "0") || 0;
  };
  const setNum = (r: number, c: number, val: number) => {
    newEdits.set(`${r},${c}`, String(Math.round(val * 100) / 100));
  };

  // ── Bird count (C2, r=1, c=2) → allocation headers + daily feed usage ──
  if (triggeredRow === 1 && triggeredCol === COL_C) {
    const birds = getNum(1, COL_C);
    setNum(1, COL_H, Math.round(birds * 0.325));   // STR ALL
    setNum(2, COL_H, Math.round(birds * 1.15));    // GWR ALL
    setNum(3, COL_H, Math.round(birds * 1.7));     // FIN ALL
    setNum(4, COL_H, Math.round(birds * 1.5));     // WDW ALL
    // Cascade daily feed usage using Cobb 500 table: H = grams[age-1] × birds / 1000
    for (let r = 0; r <= maxRow; r++) {
      const age = parseInt(cells.get(`${r},0`)?.value ?? "");
      if (!isNaN(age) && age >= 1 && age <= COBB500_GRAMS.length) {
        setNum(r, COL_H, Math.round(COBB500_GRAMS[age - 1] * birds / 1000));
      }
    }
    return newEdits;
  }

  // ── Placement date (C3, r=2, c=2) → all date cells in column B ──
  if (triggeredRow === 2 && triggeredCol === COL_C) {
    const dateStr = newEdits.get("2,2") ?? cells.get("2,2")?.value ?? "";
    const placement = parseDateInput(dateStr);
    if (placement) {
      for (let r = 0; r <= maxRow; r++) {
        const age = parseInt(cells.get(`${r},0`)?.value ?? "");
        if (!isNaN(age) && age >= 1) {
          const d = new Date(placement.getFullYear(), placement.getMonth(), placement.getDate() + (age - 1));
          const formatted = d.toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
          newEdits.set(`${r},${COL_B}`, formatted);
        }
      }
    }
    return newEdits;
  }

  // Only cascade for silo columns (K,L,M) or delivery (E) below
  if (![COL_K, COL_L, COL_M, COL_E, COL_J].includes(triggeredCol)) return newEdits;

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
  const [farmConfig, setFarmConfig] = useState<FarmConfigData>(readFarmConfig);
  const workbookRef = useRef<XLSX.WorkBook | null>(null);
  const rawBufferRef = useRef<ArrayBuffer | null>(null);
  const seedDoneRef = useRef(false);
  const deliverySeedDoneRef = useRef(false);

  // Sync farm config whenever Silo Tracker updates localStorage
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === FARM_CONFIG_KEY) setFarmConfig(readFarmConfig());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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

  // ── Seed today's readings from the Silo Mate app ─────────────────────────
  useEffect(() => {
    if (sheets.length === 0 || seedDoneRef.current) return;
    seedDoneRef.current = true;

    fetch("/api/readings/today")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.sheds) return;

        const today = new Date().toLocaleDateString("en-AU", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
        });

        // Build sheetIdx → { "row,col" → value } map
        const seedMap = new Map<number, Map<string, string>>();

        for (const shed of data.sheds as Array<{
          shedGroupName: string;
          silos: Array<{ letter: string; saved: boolean; amountRemaining: number | null }>;
        }>) {
          const nums = shed.shedGroupName.match(/\d+/g) ?? [];

          // Match shed numbers to sheet numbers (e.g. "1","2" → "SHED 1 & 2")
          const sheetIdx = sheets.findIndex(s => {
            const sNums = s.name.match(/\d+/g) ?? [];
            return nums.length > 0 && nums.every(n => sNums.includes(n));
          });
          if (sheetIdx === -1) continue;

          const sheet = sheets[sheetIdx];

          // Find the row where column B (index 1, the DATE column) matches today's date
          let dateRow = -1;
          for (const [key, cell] of sheet.cells.entries()) {
            const parts = key.split(",");
            if (parseInt(parts[1]) === 1 && cell.value === today) {
              dateRow = parseInt(parts[0]);
              break;
            }
          }
          if (dateRow === -1) continue;

          const letterToCol: Record<string, number> = { A: COL_K, B: COL_L, C: COL_M };
          const pairs = new Map<string, string>();

          for (const silo of shed.silos) {
            if (!silo.saved || silo.amountRemaining === null) continue;
            const col = letterToCol[silo.letter];
            if (col === undefined) continue;
            pairs.set(`${dateRow},${col}`, String(silo.amountRemaining));
          }

          if (pairs.size > 0) seedMap.set(sheetIdx, pairs);
        }

        if (seedMap.size === 0) return;

        setEdits(prev => {
          const next = [...prev];
          for (const [si, pairs] of seedMap.entries()) {
            let m = new Map(next[si]);
            pairs.forEach((val, key) => m.set(key, val));
            const sheet = sheets[si];
            if (sheet) {
              // Find the earliest edited row to trigger cascade from
              let minRow = sheet.maxRow;
              pairs.forEach((_, key) => {
                const r = parseInt(key.split(",")[0]);
                if (r < minRow) minRow = r;
              });
              m = recalculate(sheet.cells, m, minRow, COL_K, sheet.maxRow);
            }
            next[si] = m;
          }
          return next;
        });
        // These are already-saved readings — don't flag as unsaved changes
      })
      .catch(() => { /* silently ignore — app works fine without API readings */ });
  }, [sheets]);

  // ── Seed deliveries from Silo Mate into "end of batch" sheet ────────────────
  useEffect(() => {
    if (sheets.length === 0 || deliverySeedDoneRef.current) return;
    deliverySeedDoneRef.current = true;

    // Section column mapping (0-based): date | docket | tonnes
    const FEED_COLS: Record<string, { date: number; docket: number; tonnes: number }> = {
      starter:    { date: 1,  docket: 2,  tonnes: 3  },
      grower:     { date: 6,  docket: 7,  tonnes: 8  },
      finisher:   { date: 10, docket: 11, tonnes: 12 },
      withdrawl:  { date: 14, docket: 15, tonnes: 16 },
      withdrawal: { date: 14, docket: 15, tonnes: 16 },
      wdw:        { date: 14, docket: 15, tonnes: 16 },
    };

    const getCols = (feedType: string) => {
      const ft = feedType.toLowerCase().trim();
      if (FEED_COLS[ft]) return FEED_COLS[ft];
      if (ft.includes("start")) return FEED_COLS.starter;
      if (ft.includes("grow"))  return FEED_COLS.grower;
      if (ft.includes("fin"))   return FEED_COLS.finisher;
      if (ft.includes("with") || ft.includes("wdw")) return FEED_COLS.withdrawl;
      return null;
    };

    fetch("/api/deliveries")
      .then(r => r.ok ? r.json() : null)
      .then((deliveries: Array<{
        feedType: string; amount: number; notes: string | null; deliveryDate: string;
      }> | null) => {
        if (!deliveries || deliveries.length === 0) return;

        const eobIdx = sheets.findIndex(s => s.name.trim().toLowerCase() === "end of batch");
        if (eobIdx === -1) return;
        const eobSheet = sheets[eobIdx];

        const DATA_START_ROW = 6; // 0-based → Excel row 7

        // Collect existing docket numbers so we don't duplicate
        const existingDockets = new Set<string>();
        for (const [key, cell] of eobSheet.cells.entries()) {
          const col = parseInt(key.split(",")[1]);
          if ([2, 7, 11, 15].includes(col) && cell.value) {
            existingDockets.add(String(cell.value).trim());
          }
        }

        // Find the last occupied row for a given date column
        const findLastRow = (dateCol: number): number => {
          let last = DATA_START_ROW - 1;
          for (const key of eobSheet.cells.keys()) {
            const parts = key.split(",");
            if (parseInt(parts[1]) === dateCol) {
              const r = parseInt(parts[0]);
              if (r > last) last = r;
            }
          }
          return last;
        };

        const pairs = new Map<string, string>();
        const sectionNextRow: Record<number, number> = {};

        // Sort deliveries oldest-first so they appear in date order
        const sorted = [...deliveries].sort(
          (a, b) => new Date(a.deliveryDate).getTime() - new Date(b.deliveryDate).getTime()
        );

        for (const delivery of sorted) {
          const cols = getCols(delivery.feedType);
          if (!cols) continue;

          const docket = delivery.notes
            ? delivery.notes.replace(/^Doc:\s*/i, "").trim()
            : "";

          // Skip if this docket is already in the spreadsheet
          if (docket && existingDockets.has(docket)) continue;

          // Initialise next-row pointer for this section
          if (!(cols.date in sectionNextRow)) {
            sectionNextRow[cols.date] = findLastRow(cols.date) + 1;
          }
          const row = sectionNextRow[cols.date];

          const dateStr = new Date(delivery.deliveryDate).toLocaleDateString("en-AU", {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
          });

          pairs.set(`${row},${cols.date}`, dateStr);
          if (docket) pairs.set(`${row},${cols.docket}`, docket);
          pairs.set(`${row},${cols.tonnes}`, String(delivery.amount));

          sectionNextRow[cols.date]++;
        }

        if (pairs.size === 0) return;

        setEdits(prev => {
          const next = [...prev];
          const m = new Map(next[eobIdx] ?? []);
          pairs.forEach((val, key) => m.set(key, val));
          next[eobIdx] = m;
          return next;
        });
      })
      .catch(() => { /* silently ignore */ });
  }, [sheets]);

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

  const resetForNewBatch = async () => {
    if (!confirm(
      "Start New Batch?\n\nThis will clear ALL delivery and silo reading records from the app, and reset the spreadsheet to its base state.\n\nThis cannot be undone."
    )) return;
    try {
      await fetch("/api/batch/reset", { method: "DELETE" });
    } catch {
      // best effort — still clear locally even if API fails
    }
    seedDoneRef.current = false;
    deliverySeedDoneRef.current = false;

    // Build blank edits for all sheets
    const eobIdx = sheets.findIndex(s => s.name.trim().toLowerCase() === "end of batch");
    const newEdits = sheets.map((_, i) => {
      const m = new Map<string, string>();
      const name = sheets[i]?.name.trim().toUpperCase() ?? "";

      // ── Shed sheets ─────────────────────────────────────────────────────────
      if (name.includes("SHED")) {
        // Placement date: row 3 (r2,c2)
        m.set("2,2", "");
        // Birds per shed: row 4 (r3,c2) and row 5 (r4,c2)
        m.set("3,2", "");
        m.set("4,2", "");

        // Data rows 13–72 (0-based 12–71):
        for (let r = 12; r <= 71; r++) {
          m.set(`${r},4`,  ""); // col E – Feed Ordered
          m.set(`${r},10`, ""); // col K – Silo A
          m.set(`${r},11`, ""); // col L – Silo B
          m.set(`${r},12`, ""); // col M – Silo C
          m.set(`${r},13`, ""); // col N – Catch Morts
          m.set(`${r},14`, ""); // col O – Birds Left
        }
        return m;
      }

      if (i !== eobIdx) return m;

      // ── "end of batch" sheet ────────────────────────────────────────────────

      // Delivery rows (Excel 7–36, 0-based rows 6–35)
      // STARTER B/C/D, GROWER G/H/I, FINISHER K/L/M, WITHDRAWL O/P/Q
      const deliveryCols = [1, 2, 3, 6, 7, 8, 10, 11, 12, 14, 15, 16];
      for (let r = 6; r <= 35; r++) {
        for (const c of deliveryCols) {
          m.set(`${r},${c}`, "");
        }
      }

      // Section totals row (Excel row 37, 0-based row 36)
      m.set("36,3",  "0");  // D37 – STARTER total
      m.set("36,8",  "0");  // I37 – GROWER total
      m.set("36,12", "0");  // M37 – FINISHER total (hardcoded in xlsx, must be zeroed)
      m.set("36,16", "0");  // Q37 – WITHDRAWL total

      // Summary panel
      m.set("7,18",  "");   // S8  – Last Batch feed left (manual)
      m.set("11,18", "0");  // S12 – Total Feed Purchased (formula, cached)
      m.set("15,18", "");   // S16 – Feed Left This Batch (manual)
      m.set("18,18", "0");  // S19 – Feed Used (formula, cached)

      // Feed totals panel (col X = 23)
      m.set("18,23", "");   // X19 – feed on hand last batch (manual)
      m.set("19,23", "");   // X20 – feed delivered this batch (manual)
      m.set("20,23", "");   // X21 – feed on hand this batch (manual)
      m.set("21,23", "0");  // X22 – total feed use (formula, cached)

      // Bird totals panel (cols W/X/Y = 22/23/24, Excel rows 5–16 → 0-based 4–15)
      // Col V (21) holds shed numbers (1–12) — keep those as labels
      for (let r = 4; r <= 15; r++) {
        m.set(`${r},22`, ""); // W – Birds Placed
        m.set(`${r},23`, ""); // X – Birds Catched
        m.set(`${r},24`, ""); // Y – Actual Morts
      }
      // Row 17 (0-based 16) has SUM formulas for catched/morts — zero them
      m.set("16,23", "0");  // X17 – total birds catched (formula, cached)
      m.set("16,24", "0");  // Y17 – total actual morts (formula, cached)

      return m;
    });

    setEdits(newEdits);
    setHasChanges(false);
  };

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
            onClick={resetForNewBatch}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-semibold bg-white/10 hover:bg-white/20 transition-colors text-white border border-white/30"
            title="Clear all data and start a new batch"
          >
            ↺ New Batch
          </button>
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
        {(() => {
          let shedCount = 0;
          return sheets.map((s, i) => {
          const tabName = s.name.trim().toUpperCase();
          if (tabName === "WEEKLY STOCK TAKE" || tabName === "CONSUMPTION GUIDE") return null;

          // Check if this is a shed tab and if its group is active
          if (tabName.includes("SHED")) {
            const shedGroupId = SHED_SHEET_ORDER[shedCount];
            shedCount++;
            const groupCfg = farmConfig.shedGroups?.find(g => g.shedGroupId === shedGroupId);
            // If config found: use stored active flag. If missing: groups 1-6 active by default, 7+ inactive.
            const groupActive = groupCfg ? groupCfg.active !== false : shedGroupId <= 6;
            if (!groupActive) return null;
          }

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
        });
        })()}
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
