import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
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
interface FarmConfigData { farmName?: string; shedGroups?: FarmShedConfig[] }

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
  isDateCell?: boolean;
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
      const isDateCell = cell?.t === "d";
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
        isDateCell,
      });
    }
  }
  return { name, rawName, tabColor: tabArgb, cells, minRow, maxRow, minCol, maxCol, colWidths, rowHeights, merges };
}

interface EditingCell { r: number; c: number; sheetIdx: number }

// ── ShedInfoPanel ──────────────────────────────────────────────────────────
function ShedInfoPanel({ sheet, edits }: { sheet: SheetParsed; edits?: Map<string, string> }) {
  const { cells } = sheet;
  const safeEdits = edits ?? new Map<string, string>();
  const g = (r: number, c: number) => {
    const edited = safeEdits.get(`${r},${c}`);
    if (edited !== undefined) return edited;
    return String(cells.get(`${r},${c}`)?.value ?? "");
  };
  const fmt = (v: string | number) => { const n = parseFloat(String(v).replace(/,/g, "")); return isNaN(n) ? String(v) : n.toLocaleString(); };

  const shedNum    = g(0, 6);
  const totalBirdsRaw = g(1, 2);
  const placement  = g(2, 2);
  const shed1Name  = g(3, 1);  const shed1Birds = g(3, 2);
  const shed2Name  = g(4, 1);  const shed2Birds = g(4, 2);
  const strAlloc   = g(1, 7);
  const gwrAlloc   = g(2, 7);
  const finAlloc   = g(3, 7);
  const wdwAlloc   = g(4, 7);

  const allocations = [["STR", strAlloc], ["GWR", gwrAlloc], ["FIN", finAlloc], ["WDW", wdwAlloc]] as [string, string][];

  // If g(1,2) is a date string rather than a number, compute total from individual shed counts
  const totalBirdsRawNum = parseFloat(String(totalBirdsRaw).replace(/,/g, ""));
  const shed1Num = parseFloat(String(shed1Birds).replace(/,/g, "")) || 0;
  const shed2Num = parseFloat(String(shed2Birds).replace(/,/g, "")) || 0;
  const totalBirdsNum = !isNaN(totalBirdsRawNum) && totalBirdsRawNum > 0
    ? totalBirdsRawNum
    : (shed1Num + shed2Num > 0 ? shed1Num + shed2Num : NaN);
  const totalBirds = !isNaN(totalBirdsNum) ? String(totalBirdsNum) : "";

  // Live-compute Total Feed Ordered (sum of COL_E = col 4, rows 12–71)
  let totalFeedOrdered = 0;
  for (let r = 12; r <= 71; r++) {
    const raw = safeEdits.has(`${r},4`) ? safeEdits.get(`${r},4`)! : (cells.get(`${r},4`)?.value ?? "");
    const n = parseFloat(String(raw).replace(/,/g, ""));
    if (!isNaN(n)) totalFeedOrdered += n;
  }
  const kgPerBird = totalFeedOrdered > 0 && !isNaN(totalBirdsNum) && totalBirdsNum > 0
    ? (totalFeedOrdered / totalBirdsNum).toFixed(3)
    : null;

  return (
    <div style={{ background: "linear-gradient(135deg, #1a5c36 0%, #217346 100%)", color: "#fff", padding: "14px 20px 12px", borderBottom: "3px solid #C9A227", fontFamily: "Inter,'Segoe UI',sans-serif" }}>
      {/* Top row: shed badge + date + bird count */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ background: "#C9A227", color: "#000", borderRadius: 7, padding: "3px 14px", fontWeight: 800, fontSize: 18, letterSpacing: 0.5, whiteSpace: "nowrap" }}>
          SHED {shedNum}
        </div>
        {placement && (
          <div style={{ fontSize: 12, opacity: 0.85, whiteSpace: "nowrap" }}>
            📅 <strong>{placement}</strong>
          </div>
        )}
        <div style={{ marginLeft: "auto", background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: "5px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{fmt(totalBirds)}</div>
          <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 1 }}>Total Birds</div>
        </div>
      </div>
      {/* Middle row: individual sheds + allocations */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        {shed1Name && <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 5, padding: "4px 10px", fontSize: 12 }}><span style={{ opacity: 0.7 }}>{shed1Name}: </span><strong>{fmt(shed1Birds)}</strong></div>}
        {shed2Name && <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 5, padding: "4px 10px", fontSize: 12 }}><span style={{ opacity: 0.7 }}>{shed2Name}: </span><strong>{fmt(shed2Birds)}</strong></div>}
        <div style={{ flex: 1 }} />
        {allocations.map(([lbl, val]) => val ? (
          <div key={lbl} style={{ background: "rgba(201,162,39,0.25)", border: "1px solid rgba(201,162,39,0.45)", borderRadius: 5, padding: "4px 10px", textAlign: "center", fontSize: 12 }}>
            <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 1 }}>{lbl}</div>
            <div style={{ fontWeight: 700 }}>{fmt(val)} kg</div>
          </div>
        ) : null)}
      </div>
      {/* Bottom row: feed totals */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.5 }}>Feed Summary:</div>
        <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 5, padding: "3px 10px", fontSize: 12 }}>
          <span style={{ opacity: 0.75 }}>Total Feed Ordered: </span>
          <strong>{totalFeedOrdered > 0 ? fmt(totalFeedOrdered) + " kg" : "—"}</strong>
        </div>
        {kgPerBird && (
          <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 5, padding: "3px 10px", fontSize: 12 }}>
            <span style={{ opacity: 0.75 }}>kg/Bird: </span>
            <strong>{kgPerBird}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

// ── EobInfoPanel ──────────────────────────────────────────────────────────
function EobInfoPanel({ sheet, edits, farmName }: { sheet: SheetParsed; edits: Map<string, string>; farmName: string }) {
  const { cells } = sheet;
  const g = (r: number, c: number) => {
    const edited = edits.get(`${r},${c}`);
    if (edited !== undefined) return edited;
    return String(cells.get(`${r},${c}`)?.value ?? "");
  };
  const fmt = (v: string) => {
    const n = parseFloat(v.replace(/,/g, ""));
    return isNaN(n) || v === "" ? "—" : n.toLocaleString();
  };

  const batchNum       = g(1, 2);
  const totalPurchased = g(11, 18);
  const feedUsed       = g(18, 18);
  const feedLeft       = g(15, 18);
  const lastBatchLeft  = g(7, 18);
  // Bird totals — end of batch row (row 16, 0-indexed)
  const totalBirdsCatched = g(16, 23);
  const totalMorts        = g(16, 24);

  const shareEmail = () => {
    const subject = encodeURIComponent(`${farmName} — Batch ${batchNum} End of Batch Summary`);
    const body = encodeURIComponent([
      `${farmName} — Batch ${batchNum} End of Batch Summary`,
      ``,
      `FEED SUMMARY`,
      `─────────────────────────────────`,
      `Total Feed Purchased : ${totalPurchased ? fmt(totalPurchased) + " kg" : "—"}`,
      `Feed Used            : ${feedUsed ? fmt(feedUsed) + " kg" : "—"}`,
      `Feed Left This Batch : ${feedLeft ? fmt(feedLeft) + " kg" : "—"}`,
      `Last Batch Feed Left : ${lastBatchLeft ? fmt(lastBatchLeft) + " kg" : "—"}`,
      ``,
      `BIRD SUMMARY`,
      `─────────────────────────────────`,
      `Total Birds Catched  : ${totalBirdsCatched ? fmt(totalBirdsCatched) : "—"}`,
      `Total Mortalities    : ${totalMorts ? fmt(totalMorts) : "—"}`,
      ``,
      `Generated by Silo Mate`,
    ].join("\n"));
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  };

  const feedStats: [string, string, string][] = [
    ["TOTAL PURCHASED", totalPurchased, "kg"],
    ["FEED USED",       feedUsed,       "kg"],
    ["FEED LEFT",       feedLeft,       "kg"],
    ["LAST BATCH LEFT", lastBatchLeft,  "kg"],
  ];

  return (
    <div style={{ background: "linear-gradient(135deg, #1a5c36 0%, #217346 100%)", color: "#fff", padding: "14px 20px 12px", borderBottom: "3px solid #C9A227", fontFamily: "Inter,'Segoe UI',sans-serif" }}>
      {/* Row 1: Badge + batch number + bird totals + email button */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ background: "#C9A227", color: "#000", borderRadius: 7, padding: "3px 14px", fontWeight: 800, fontSize: 16, letterSpacing: 0.5, whiteSpace: "nowrap" }}>
          END OF BATCH
        </div>
        {batchNum && (
          <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 5, padding: "3px 11px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
            Batch #{batchNum}
          </div>
        )}
        <div style={{ opacity: 0.75, fontSize: 13, whiteSpace: "nowrap" }}>{farmName}</div>
        <div style={{ flex: 1 }} />
        {totalBirdsCatched && (
          <div style={{ textAlign: "center", fontSize: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{fmt(totalBirdsCatched)}</div>
            <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 1 }}>Birds Catched</div>
          </div>
        )}
        {totalMorts && (
          <div style={{ background: "rgba(220,38,38,0.3)", border: "1px solid rgba(220,38,38,0.5)", borderRadius: 5, padding: "3px 10px", textAlign: "center", fontSize: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{fmt(totalMorts)}</div>
            <div style={{ fontSize: 9, opacity: 0.8, textTransform: "uppercase", letterSpacing: 1 }}>Mortalities</div>
          </div>
        )}
        <button
          onClick={shareEmail}
          style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 6, padding: "7px 15px", color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
          onMouseOver={e => (e.currentTarget.style.background = "rgba(255,255,255,0.25)")}
          onMouseOut={e  => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
        >
          ✉ Share via Email
        </button>
      </div>
      {/* Row 2: Feed stat pills */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {feedStats.map(([label, value, unit]) => (
          <div key={label} style={{ background: "rgba(201,162,39,0.25)", border: "1px solid rgba(201,162,39,0.45)", borderRadius: 5, padding: "4px 12px", textAlign: "center", fontSize: 12, minWidth: 90 }}>
            <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
            <div style={{ fontWeight: 700 }}>{value ? `${fmt(value)} ${unit}` : "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SheetView({
  sheet,
  sheetIdx,
  edits,
  onEdit,
  editingCell,
  setEditingCell,
  startRow,
  isShedSheet,
  isEobSheet,
}: {
  sheet: SheetParsed;
  sheetIdx: number;
  edits: Map<string, string>;
  onEdit: (key: string, value: string) => void;
  editingCell: EditingCell | null;
  setEditingCell: (c: EditingCell | null) => void;
  startRow?: number;
  isShedSheet?: boolean;
  isEobSheet?: boolean;
}) {
  const { cells, minRow, maxRow, minCol, maxCol, colWidths, rowHeights } = sheet;
  const effectiveStart = startRow ?? minRow;
  const inputRef = useRef<HTMLInputElement>(null);

  // Trim empty trailing columns — only consider visible rows (r >= effectiveStart)
  const displayMaxCol = useMemo(() => {
    let last = minCol;
    for (const [key, info] of cells) {
      if (info.hidden) continue;
      const parts = key.split(",");
      const r = parseInt(parts[0]);
      const c = parseInt(parts[1]);
      if (r >= effectiveStart && info.value !== "" && c > last) last = c;
    }
    // Also include any cells that have edits beyond our scanned range
    for (const [key] of edits) {
      const parts = key.split(",");
      const r = parseInt(parts[0]);
      const c = parseInt(parts[1]);
      if (r >= effectiveStart && c > last) last = c;
    }
    return Math.min(last, maxCol);
  }, [cells, edits, effectiveStart, minCol, maxCol]);

  useEffect(() => {
    if (editingCell && inputRef.current) inputRef.current.focus();
  }, [editingCell]);

  const commitEdit = (r: number, c: number, val: string) => {
    onEdit(`${r},${c}`, val);
    setEditingCell(null);
  };

  // Pre-compute header row heights for sticky offsets
  const row7Height  = isShedSheet ? Math.max(rowHeights[7]  ?? 20, 26) : 0;
  // EOB header row 3 is sticky at top=0

  return (
    <table style={{ borderCollapse: "collapse", fontFamily: "Calibri,'Segoe UI',sans-serif", tableLayout: "fixed", width: "auto", minWidth: "100%" }}>
      <colgroup>
        {Array.from({ length: displayMaxCol - minCol + 1 }, (_, i) => {
          const c = minCol + i;
          return <col key={c} style={{ width: colWidths[c] ?? 80, minWidth: 24 }} />;
        })}
      </colgroup>
      <tbody>
        {Array.from({ length: maxRow - effectiveStart + 1 }, (_, ri) => {
          const r = effectiveStart + ri;

          // Skip blank setup rows in shed sheets (between the column headers and the data)
          if (isShedSheet && (r === 9 || r === 10)) return null;

          const rowH = isShedSheet && (r === 7 || r === 8) ? Math.max(rowHeights[r] ?? 20, 26) : (rowHeights[r] ?? 20);

          // Determine row-level background
          const isShedHeader  = isShedSheet && (r === 7 || r === 8);
          const isShedTotals  = isShedSheet && r === 11;
          const isShedData    = isShedSheet && r >= 12 && r <= 71;
          const isShedSummary = isShedSheet && r >= 72;
          const isEobHeader   = isEobSheet  && r === 3;
          const isAnyHeader   = isShedHeader || isEobHeader;
          const rowBg = isAnyHeader
            ? "#1a5c36"
            : isShedTotals
            ? "#f5f0dc"
            : isShedSummary
            ? "#eef4ee"
            : isShedData
            ? (r % 2 === 0 ? "#f9f9f9" : "#ffffff")
            : isEobSheet && r % 2 === 0
            ? "#f9f9f9"
            : undefined;
          // EOB row 3 is sticky at top=0
          const eobStickyTop = 0;

          return (
            <tr key={r} style={{ height: rowH, background: rowBg }}>
              {Array.from({ length: displayMaxCol - minCol + 1 }, (_, ci) => {
                const c = minCol + ci;
                const info = cells.get(`${r},${c}`);
                if (!info) return <td key={c} style={{ height: rowH, background: isAnyHeader ? "#1a5c36" : (rowBg ?? "#fff"), borderRight: "1px solid rgba(0,0,0,0.07)", position: isAnyHeader ? "sticky" : undefined, top: isAnyHeader ? (isShedHeader ? (r === 7 ? 0 : row7Height) : eobStickyTop) : undefined, zIndex: isAnyHeader ? 3 : undefined }} />;
                if (info.hidden) return null;
                const key = `${r},${c}`;
                const isEditing = editingCell?.r === r && editingCell?.c === c && editingCell?.sheetIdx === sheetIdx;
                const rawVal = edits.has(key) ? edits.get(key)! : info.value;
                // Hide template date values sitting in header rows (e.g. "Monday 16 July 2018")
                const displayVal = (isAnyHeader && info.isDateCell) ? "" : rawVal;
                const fs = isShedHeader ? (info.fontSize ?? 11) : (info.fontSize ?? 11);

                // Column I (index 8) = FEED ON HAND — highlight red when negative (feed run out)
                const numVal = parseFloat(displayVal.replace(/,/g, ""));
                const isFeedRunOut = c === 8 && !isNaN(numVal) && numVal < 0 && !isAnyHeader;

                // Columns E & F (FEED ORDERED / SILO) — strip XLSX yellow highlight
                // Header rows override everything; otherwise strip E/F yellow
                let cellBg: string | null;
                if (isAnyHeader) {
                  cellBg = "#1a5c36";
                } else if (c === COL_E || c === 5) {
                  cellBg = null;
                } else {
                  cellBg = info.bgColor;
                }

                const cellTextColor = isAnyHeader
                  ? (info.bold ? "#C9A227" : "rgba(255,255,255,0.92)")
                  : isFeedRunOut
                  ? "#ffffff"
                  : (info.fontColor ?? "#000");

                const borderStyle = isAnyHeader
                  ? "1px solid rgba(255,255,255,0.15)"
                  : "1px solid rgba(0,0,0,0.08)";

                const stickyTop = isShedHeader
                  ? (r === 7 ? 0 : row7Height)
                  : isEobHeader
                  ? eobStickyTop
                  : undefined;

                return (
                  <td
                    key={c}
                    colSpan={info.colSpan}
                    rowSpan={info.rowSpan}
                    onDoubleClick={() => !isAnyHeader && setEditingCell({ r, c, sheetIdx })}
                    title={isFeedRunOut ? "⚠ FEED RUN OUT" : "Double-click to edit"}
                    style={{
                      background: isFeedRunOut ? "#dc2626" : (cellBg ?? (rowBg ?? "#fff")),
                      color: cellTextColor,
                      fontWeight: info.bold || isAnyHeader ? "bold" : "normal",
                      fontStyle: info.italic ? "italic" : "normal",
                      fontSize: fs,
                      textAlign: (info.hAlign as any) ?? "left",
                      verticalAlign: info.vAlign === "center" ? "middle" : info.vAlign === "bottom" ? "bottom" : "top",
                      whiteSpace: info.wrapText ? "pre-wrap" : "nowrap",
                      overflow: "hidden",
                      textOverflow: isEditing ? "clip" : "ellipsis",
                      padding: isEditing ? 0 : isAnyHeader ? "2px 5px" : "1px 3px",
                      borderTop: isAnyHeader ? "none" : (info.borderTop ?? borderStyle),
                      borderBottom: isAnyHeader ? "none" : (info.borderBottom ?? borderStyle),
                      borderLeft: isAnyHeader ? borderStyle : (info.borderLeft ?? borderStyle),
                      borderRight: isAnyHeader ? borderStyle : (info.borderRight ?? borderStyle),
                      height: rowH,
                      maxWidth: 400,
                      cursor: isAnyHeader ? "default" : "pointer",
                      outline: isEditing ? "2px solid #1a5c36" : "none",
                      letterSpacing: isAnyHeader ? 0.3 : 0,
                      position: isAnyHeader ? "sticky" : undefined,
                      top: stickyTop,
                      zIndex: isAnyHeader ? 3 : undefined,
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
                          background: cellBg ?? "#fff", color: info.fontColor ?? "#000",
                          fontWeight: info.bold ? "bold" : "normal",
                          fontSize: fs, fontFamily: "Calibri,sans-serif",
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

// ── Summary Tab Components ────────────────────────────────────────────────

function SummaryInputField({ label, value, onSave, wide }: { label: string; value: string; onSave: (v: string) => void; wide?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
      <span style={{ fontSize: 11, color: "#555", minWidth: wide ? 0 : 80, flexShrink: 0 }}>{label}</span>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { onSave(draft); setEditing(false); }}
          onKeyDown={e => {
            if (e.key === "Enter") { onSave(draft); setEditing(false); }
            if (e.key === "Escape") { setDraft(value); setEditing(false); }
          }}
          style={{ flex: 1, border: "2px solid #1a5c36", borderRadius: 4, padding: "3px 7px", fontSize: 13, outline: "none", minWidth: 0 }}
        />
      ) : (
        <div
          onClick={() => { setDraft(value); setEditing(true); }}
          style={{ flex: 1, background: "#f5f5f5", borderRadius: 4, padding: "3px 7px", fontSize: 13, cursor: "pointer", minHeight: 22, color: value ? "#000" : "#aaa", minWidth: 0 }}
        >
          {value || "tap to edit…"}
        </div>
      )}
    </div>
  );
}

// ── Feed Alert System ────────────────────────────────────────────────────────

const FEED_ORDER_LEAD_DAYS = 7; // days needed to receive a feed order

interface FeedAlert {
  shedGroupName: string;
  feedOnHand: number;       // kg currently available
  dailyUsage: number;       // kg/day (avg recent days)
  daysRemaining: number;
  urgency: "critical" | "warning" | "watch"; // ≤3d, ≤7d, ≤14d
  sheetIdx: number;
}

function computeFeedAlerts(
  sheets: SheetParsed[],
  edits: Map<string, string>[],
  farmConfig: FarmConfigData,
): FeedAlert[] {
  const alerts: FeedAlert[] = [];
  let shedCount = 0;

  for (let i = 0; i < sheets.length; i++) {
    const tabName = sheets[i].name.trim().toUpperCase();
    if (tabName === "WEEKLY STOCK TAKE" || tabName === "CONSUMPTION GUIDE") continue;
    if (!tabName.includes("SHED")) continue;

    const shedGroupId = SHED_SHEET_ORDER[shedCount] ?? (shedCount + 1);
    shedCount++;

    const groupCfg = farmConfig.shedGroups?.find(g => g.shedGroupId === shedGroupId);
    const groupActive = groupCfg ? groupCfg.active !== false : shedGroupId <= 6;
    if (!groupActive) continue;

    const getV = (row: number, col: number): number => {
      const key = `${row},${col}`;
      const ev = edits[i]?.get(key);
      const cv = String(sheets[i].cells.get(key)?.value ?? "");
      const raw = ev !== undefined ? ev : cv;
      return parseFloat(raw.replace(/,/g, "")) || 0;
    };

    const maxRow = sheets[i].numRows - 1;

    // Walk from bottom to find latest row with a valid age AND feed usage
    let latestRow = -1;
    for (let r = maxRow; r >= 3; r--) {
      const age = getV(r, 0);
      const usage = getV(r, COL_H);
      if (age >= 1 && usage > 0) { latestRow = r; break; }
    }
    if (latestRow < 0) continue;

    // Feed on hand: use FEED ON HAND (COL_I); fall back to SILO TOTAL (COL_J)
    let feedOnHand = getV(latestRow, COL_I);
    if (feedOnHand <= 0) feedOnHand = getV(latestRow, COL_J);
    if (feedOnHand <= 0) continue;

    // Average daily usage over last 5 days
    let usageSum = 0, usageDays = 0;
    for (let r = latestRow; r >= Math.max(3, latestRow - 4); r--) {
      const u = getV(r, COL_H);
      if (u > 0) { usageSum += u; usageDays++; }
    }
    const avgDailyUsage = usageDays > 0 ? usageSum / usageDays : 0;
    if (avgDailyUsage <= 0) continue;

    const daysRemaining = feedOnHand / avgDailyUsage;

    // Only surface alerts within 14-day horizon
    if (daysRemaining > 14) continue;

    const urgency = daysRemaining <= 3 ? "critical"
      : daysRemaining <= FEED_ORDER_LEAD_DAYS ? "warning"
      : "watch";

    alerts.push({
      shedGroupName: sheets[i].name.trim(),
      feedOnHand,
      dailyUsage: avgDailyUsage,
      daysRemaining,
      urgency,
      sheetIdx: i,
    });
  }

  return alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

function FeedAlertBanner({ alerts, onGoToShed }: { alerts: FeedAlert[]; onGoToShed: (sheetIdx: number) => void }) {
  const [expanded, setExpanded] = useState(true);
  if (alerts.length === 0) return null;

  const hasCritical = alerts.some(a => a.urgency === "critical");
  const hasWarning  = alerts.some(a => a.urgency === "warning");
  const topUrgency  = hasCritical ? "critical" : hasWarning ? "warning" : "watch";

  const colors = {
    critical: { bg: "#fff0f0", border: "#f5c6cb", accent: "#c0392b", label: "🚨 FEED CRITICAL — ORDER IMMEDIATELY" },
    warning:  { bg: "#fff8f0", border: "#ffe0b2", accent: "#e67e22", label: "⚠️ FEED LOW — ORDER NOW (within 7-day lead time)" },
    watch:    { bg: "#fffde7", border: "#fff3cd", accent: "#f39c12", label: "📋 FEED WATCH — Order soon" },
  };
  const c = colors[topUrgency];

  return (
    <div style={{ background: c.bg, borderBottom: `3px solid ${c.accent}`, padding: "0", fontFamily: "Inter,'Segoe UI',sans-serif" }}>
      {/* Banner header row */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", cursor: "pointer" }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ fontWeight: 800, fontSize: 12, color: c.accent, flex: 1 }}>{c.label}</div>
        <div style={{ display: "flex", gap: 6 }}>
          {alerts.map((a, i) => (
            <span key={i} style={{
              background: a.urgency === "critical" ? "#c0392b" : a.urgency === "warning" ? "#e67e22" : "#f39c12",
              color: "#fff", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700,
            }}>
              {a.shedGroupName} · {a.daysRemaining.toFixed(1)}d
            </span>
          ))}
        </div>
        <div style={{ fontSize: 12, color: c.accent, fontWeight: 700 }}>{expanded ? "▲" : "▼"}</div>
      </div>

      {/* Expanded detail cards */}
      {expanded && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "0 14px 12px" }}>
          {alerts.map((a, i) => {
            const urgColor = a.urgency === "critical" ? "#c0392b" : a.urgency === "warning" ? "#e67e22" : "#f39c12";
            const orderBy = new Date();
            orderBy.setDate(orderBy.getDate() + Math.max(0, Math.floor(a.daysRemaining) - FEED_ORDER_LEAD_DAYS));
            const orderByStr = a.daysRemaining <= FEED_ORDER_LEAD_DAYS
              ? "Order TODAY"
              : `Order by ${orderBy.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}`;
            return (
              <div
                key={i}
                onClick={() => onGoToShed(a.sheetIdx)}
                style={{ background: "#fff", border: `2px solid ${urgColor}`, borderRadius: 10, padding: "10px 14px", minWidth: 180, cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}
              >
                <div style={{ fontWeight: 800, fontSize: 13, color: "#333", marginBottom: 4 }}>{a.shedGroupName}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: urgColor, lineHeight: 1 }}>{a.daysRemaining.toFixed(1)}</div>
                <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>days remaining</div>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>
                  <strong>{Math.round(a.feedOnHand).toLocaleString()} kg</strong> on hand
                </div>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>
                  <strong>{Math.round(a.dailyUsage).toLocaleString()} kg</strong> / day
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: urgColor, background: `${urgColor}18`, borderRadius: 5, padding: "3px 8px", textAlign: "center" }}>
                  {orderByStr}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ShedSummaryCard({
  sheetIdx, sheet, edits, onEdit, getCell, eobSheetIdx, shed1Num, shed2Num,
}: {
  sheetIdx: number; sheet: SheetParsed; edits: Map<string, string>;
  onEdit: (si: number, key: string, val: string) => void;
  getCell: (si: number, r: number, c: number) => string;
  eobSheetIdx: number; shed1Num: number; shed2Num: number;
}) {
  if (!sheet) return null;
  const shedNum   = getCell(sheetIdx, 0, 6);
  const placement = getCell(sheetIdx, 2, 2);
  const shed1Name = getCell(sheetIdx, 3, 1) || "Shed 1";
  const shed2Name = getCell(sheetIdx, 4, 1) || "Shed 2";
  const shed1Birds = getCell(sheetIdx, 3, 2);
  const shed2Birds = getCell(sheetIdx, 4, 2);
  const strAlloc  = getCell(sheetIdx, 1, 7);
  const gwrAlloc  = getCell(sheetIdx, 2, 7);
  const finAlloc  = getCell(sheetIdx, 3, 7);
  const wdwAlloc  = getCell(sheetIdx, 4, 7);

  const b1 = parseFloat(shed1Birds.replace(/,/g, "")) || 0;
  const b2 = parseFloat(shed2Birds.replace(/,/g, "")) || 0;
  const totalBirds = b1 + b2;

  let totalFeed = 0;
  for (let r = 12; r <= 71; r++) {
    const f = parseFloat(getCell(sheetIdx, r, 4).replace(/,/g, ""));
    if (!isNaN(f)) totalFeed += f;
  }
  const kgPerBird = totalBirds > 0 && totalFeed > 0 ? (totalFeed / totalBirds).toFixed(3) : null;

  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #dde8e0", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
      <div style={{ background: "linear-gradient(135deg, #1a5c36 0%, #217346 100%)", color: "#fff", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ background: "#C9A227", color: "#000", borderRadius: 5, padding: "2px 10px", fontWeight: 800, fontSize: 14, whiteSpace: "nowrap" }}>SHED {shedNum}</div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.1 }}>{totalBirds > 0 ? totalBirds.toLocaleString() : "—"}</div>
          <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 1 }}>Total Birds</div>
        </div>
      </div>
      <div style={{ padding: "12px 14px" }}>
        <SummaryInputField label="Placement" value={placement} onSave={v => onEdit(sheetIdx, "2,2", v)} />
        <div style={{ height: 1, background: "#eee", margin: "8px 0" }} />
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#888", marginBottom: 5 }}>Birds Per Shed</div>
        <SummaryInputField label={shed1Name} value={shed1Birds} onSave={v => {
          onEdit(sheetIdx, "3,2", v);
          if (eobSheetIdx >= 0) onEdit(eobSheetIdx, `${shed1Num + 3},22`, v);
        }} />
        <SummaryInputField label={shed2Name} value={shed2Birds} onSave={v => {
          onEdit(sheetIdx, "4,2", v);
          if (eobSheetIdx >= 0) onEdit(eobSheetIdx, `${shed2Num + 3},22`, v);
        }} />
        <div style={{ height: 1, background: "#eee", margin: "8px 0" }} />
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#888", marginBottom: 5 }}>Feed Allocations (kg)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
          {([["STR", "1,7", strAlloc], ["GWR", "2,7", gwrAlloc], ["FIN", "3,7", finAlloc], ["WDW", "4,7", wdwAlloc]] as [string, string, string][]).map(([lbl, key, val]) => (
            <SummaryInputField key={lbl} label={lbl} value={val} onSave={v => onEdit(sheetIdx, key, v)} />
          ))}
        </div>
        {(totalFeed > 0 || kgPerBird) && (
          <>
            <div style={{ height: 1, background: "#eee", margin: "8px 0" }} />
            <div style={{ display: "flex", gap: 8 }}>
              {totalFeed > 0 && (
                <div style={{ flex: 1, background: "#f0f7f3", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1a5c36" }}>{totalFeed.toLocaleString()}</div>
                  <div style={{ fontSize: 9, color: "#666", textTransform: "uppercase", letterSpacing: 0.4 }}>Feed Ordered (kg)</div>
                </div>
              )}
              {kgPerBird && (
                <div style={{ flex: 1, background: "#fff8e6", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#8b6a00" }}>{kgPerBird}</div>
                  <div style={{ fontSize: 9, color: "#666", textTransform: "uppercase", letterSpacing: 0.4 }}>kg / Bird</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryView({ sheets, edits, handleEdit, farmConfig }: {
  sheets: SheetParsed[];
  edits: Map<string, string>[];
  handleEdit: (si: number, key: string, val: string) => void;
  farmConfig: FarmConfigData;
}) {
  const getCell = (si: number, r: number, c: number) => {
    const e = edits[si];
    if (e?.has(`${r},${c}`)) return e.get(`${r},${c}`) ?? "";
    return String(sheets[si]?.cells.get(`${r},${c}`)?.value ?? "");
  };

  const eobIdx = sheets.findIndex(s => s.name.trim().toLowerCase() === "end of batch");

  let shedCount = 0;
  const shedItems: { sheetIdx: number; shedGroupId: number }[] = [];
  for (let i = 0; i < sheets.length; i++) {
    const tabName = sheets[i].name.trim().toUpperCase();
    if (tabName === "WEEKLY STOCK TAKE" || tabName === "CONSUMPTION GUIDE") continue;
    if (tabName.includes("SHED")) {
      const shedGroupId = SHED_SHEET_ORDER[shedCount] ?? (shedCount + 1);
      const groupCfg = farmConfig.shedGroups?.find(g => g.shedGroupId === shedGroupId);
      const groupActive = groupCfg ? groupCfg.active !== false : shedGroupId <= 6;
      if (groupActive) shedItems.push({ sheetIdx: i, shedGroupId });
      shedCount++;
    }
  }

  let grandBirds = 0, grandFeed = 0;
  for (const { sheetIdx } of shedItems) {
    const b1 = parseFloat(getCell(sheetIdx, 3, 2).replace(/,/g, "")) || 0;
    const b2 = parseFloat(getCell(sheetIdx, 4, 2).replace(/,/g, "")) || 0;
    grandBirds += b1 + b2;
    for (let r = 12; r <= 71; r++) {
      const f = parseFloat(getCell(sheetIdx, r, 4).replace(/,/g, ""));
      if (!isNaN(f)) grandFeed += f;
    }
  }
  const overallKgPerBird = grandBirds > 0 && grandFeed > 0 ? (grandFeed / grandBirds).toFixed(3) : null;

  return (
    <div style={{ padding: "20px 20px 32px", fontFamily: "Inter,'Segoe UI',sans-serif", overflowY: "auto", height: "100%" }}>
      <div style={{ background: "linear-gradient(135deg, #1a5c36 0%, #217346 100%)", color: "#fff", borderRadius: 10, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderBottom: "3px solid #C9A227" }}>
        <div style={{ background: "#C9A227", color: "#000", borderRadius: 7, padding: "3px 14px", fontWeight: 800, fontSize: 15 }}>BATCH SUMMARY</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: "5px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{grandBirds > 0 ? grandBirds.toLocaleString() : "—"}</div>
            <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 1 }}>Total Birds Placed</div>
          </div>
          {grandFeed > 0 && (
            <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: "5px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{grandFeed.toLocaleString()}</div>
              <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 1 }}>Total Feed Ordered (kg)</div>
            </div>
          )}
          {overallKgPerBird && (
            <div style={{ background: "rgba(201,162,39,0.3)", border: "1px solid #C9A227", borderRadius: 8, padding: "5px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{overallKgPerBird}</div>
              <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 1 }}>Overall kg / Bird</div>
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {shedItems.map(({ sheetIdx, shedGroupId }) => (
          <ShedSummaryCard
            key={shedGroupId}
            sheetIdx={sheetIdx}
            sheet={sheets[sheetIdx]}
            edits={edits[sheetIdx] ?? new Map()}
            onEdit={handleEdit}
            getCell={getCell}
            eobSheetIdx={eobIdx}
            shed1Num={shedGroupId * 2 - 1}
            shed2Num={shedGroupId * 2}
          />
        ))}
      </div>
    </div>
  );
}

// ── BatchResultsView ──────────────────────────────────────────────────────
interface ShedCatch {
  birds: number;
  dateSerial: number;
  age: number;
  sex: string;
  aveWeight: number;
  totalWeight: number;
}
interface ShedBatchData {
  shedNum: number;
  placement: number;
  morts: number;
  mortPct: number;
  totalCaught: number;
  aveWeight: number;
  totalWeight: number;
  cages: number;
  catches: ShedCatch[];
}
const xlDateToStr = (serial: number) => {
  if (!serial) return "—";
  const d = new Date((serial - 25569) * 86400000);
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" });
};
interface BatchSummary {
  farmName: string;
  batchNum: number;
  totalPlaced: number;
  totalOut: number;
  mortalityPct: number;
  aveWeight: number;
  fcr: number;
  cfcr: number;
  cage: number;
  actualAge: number;
  correctedAge: number;
  feedOnHand: number;
  feedDelivered: number;
  feedConsumed: number;
}

async function loadBatchResultsXlsx(baseUrl: string): Promise<{ sheds: ShedBatchData[]; summary: BatchSummary | null }> {
  const res = await fetch(`${baseUrl}batch-results.xlsx`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws || !ws["!ref"]) return { sheds: [], summary: null };

  const gv = (row: number, col: number): unknown => {
    const cell = ws[XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })];
    return cell?.v !== undefined ? cell.v : null;
  };
  const num = (v: unknown) => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isNaN(n) ? 0 : n; };

  // Overall summary from the right-side summary block (cols 32-40)
  const farmName   = String(gv(1, 2) ?? "");
  const batchNum   = num(gv(1, 7));
  const totalPlaced    = num(gv(4, 34));
  const totalOut       = num(gv(7, 34));
  const mortalityPct   = num(gv(5, 34)) * 100;
  const aveWeight      = num(gv(9, 34));
  const fcr            = num(gv(9, 38));
  const cfcr           = num(gv(11, 38));
  const cage           = num(gv(6, 40));
  const actualAge      = num(gv(11, 34));   // "Actual Age" — average age (days) at catch
  const correctedAge   = num(gv(12, 34));   // "Correct Age to 2.45" — age corrected to standard weight
  const feedOnHand     = num(gv(6, 38));
  const feedDelivered  = num(gv(5, 38));
  const feedConsumed   = num(gv(7, 38));

  // Shed data: 3 sheds per block, stacked every 16 rows.
  // Column groups (1-indexed): left=cols1-9, mid=cols11-19, right=cols21-29
  const COLS = [
    { p: 2,  m: 2,  mp: 3,  tc: 2,  aw: 6,  tw: 7  },
    { p: 12, m: 12, mp: 13, tc: 12, aw: 16, tw: 17 },
    { p: 22, m: 22, mp: 23, tc: 22, aw: 26, tw: 27 },
  ];

  const sheds: ShedBatchData[] = [];
  const range = XLSX.utils.decode_range(ws["!ref"]!);
  let shedCounter = 0;

  for (let r = 1; r <= range.e.r + 1; r++) {
    if (String(gv(r, 1) ?? "").toLowerCase().trim() !== "placement") continue;
    const pRow = r;       // placement row
    const mRow = r + 1;   // morts row
    const tRow = r + 12;  // totals row (total birds caught, ave wgt, total wgt)

    for (let gi = 0; gi < 3; gi++) {
      shedCounter++;
      const c = COLS[gi];
      const placement = num(gv(pRow, c.p));
      if (!placement) continue; // empty shed slot — skip but keep counter
      // Parse individual catch rows between morts row and totals row
      const catches: ShedCatch[] = [];
      for (let cr = mRow + 1; cr < tRow; cr++) {
        const birds = num(gv(cr, c.p));
        if (!birds) continue;
        catches.push({
          birds,
          dateSerial: num(gv(cr, c.p + 1)),
          age:        num(gv(cr, c.p + 2)),
          sex:        String(gv(cr, c.p + 3) ?? "").toUpperCase(),
          aveWeight:  num(gv(cr, c.aw)),
          totalWeight: num(gv(cr, c.tw)),
        });
      }
      sheds.push({
        shedNum:     shedCounter,
        placement,
        morts:       num(gv(mRow, c.m)),
        mortPct:     num(gv(mRow, c.mp)) * 100,
        totalCaught: num(gv(tRow, c.tc)),
        aveWeight:   num(gv(tRow, c.aw)),
        totalWeight: num(gv(tRow, c.tw)),
        cages:       catches.length,
        catches,
      });
    }
  }

  return { sheds, summary: { farmName, batchNum, totalPlaced, totalOut, mortalityPct, aveWeight, fcr, cfcr, cage, actualAge, correctedAge, feedOnHand, feedDelivered, feedConsumed } };
}

const BATCH_CATCHES_KEY = "silo-batch-catches";
const EDITS_KEY = "silo-fp-edits";

function loadEditsFromStorage(): Map<string, string>[] {
  try {
    const s = localStorage.getItem(EDITS_KEY);
    if (!s) return [];
    return (JSON.parse(s) as [string, string][][]).map(arr => new Map(arr));
  } catch { return []; }
}

function saveEditsToStorage(edits: Map<string, string>[]) {
  localStorage.setItem(EDITS_KEY, JSON.stringify(edits.map(m => [...m.entries()])));
}

interface EditableCatch { date: string; age: string; birds: string; aveWgt: string; totalWgt: string; }
type CatchMap = Record<number, EditableCatch[]>;

function parseCatches(map: CatchMap, shedNum: number) {
  const rows = map[shedNum] ?? [];
  const totalCaught = rows.reduce((a, r) => a + (parseFloat(r.birds) || 0), 0);
  const totalWgtKg  = rows.reduce((a, r) => {
    const tw = parseFloat(r.totalWgt);
    const bw = (parseFloat(r.birds) || 0) * (parseFloat(r.aveWgt) || 0);
    return a + (tw > 0 ? tw * 1000 : bw);
  }, 0);
  const aveWgt = totalCaught > 0 ? totalWgtKg / totalCaught : 0;
  return { rows, totalCaught, totalWgtKg, aveWgt };
}

interface ParsedEmailRow { shedNum: number; age: string; birds: string; aveWgt: string; totalWgt: string; }

function parseEmailCatchText(text: string): ParsedEmailRow[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i].toUpperCase();
    if (upper.includes('SHED') && (upper.includes('BIRD') || upper.includes('AGE')) && upper.includes('ACTUAL')) {
      headerIdx = i; break;
    }
  }
  if (headerIdx === -1) return [];
  const headerLine = lines[headerIdx];
  const splitRow = (line: string) => line.includes('\t') ? line.split('\t').map(c => c.trim()) : line.split(/\s{2,}/).map(c => c.trim());
  const headerCols = splitRow(headerLine).map(c => c.toUpperCase());
  const findCol = (kw: string) => headerCols.findIndex(c => c.includes(kw));
  const shedIdx   = findCol('SHED');
  const ageIdx    = headerCols.findIndex(c => c === 'AGE');
  const birdIdx   = findCol('BIRD');
  const actualIdx = headerCols.findIndex(c => c === 'ACTUAL');
  const totalIdx  = findCol('TOTAL');
  if (shedIdx === -1 || birdIdx === -1) return [];
  const results: ParsedEmailRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    const shedNum = parseInt(cols[shedIdx]?.replace(/[^\d]/g, ''), 10);
    const birds   = parseInt((cols[birdIdx] ?? '').replace(/,/g, ''), 10);
    const aveWgt  = actualIdx >= 0 ? parseFloat((cols[actualIdx] ?? '').replace(/,/g, '')) : NaN;
    const totalKg = totalIdx  >= 0 ? parseFloat((cols[totalIdx]  ?? '').replace(/,/g, '')) : NaN;
    const age     = ageIdx    >= 0 ? (cols[ageIdx] ?? '') : '';
    if (!isNaN(shedNum) && shedNum > 0 && !isNaN(birds) && birds > 0) {
      results.push({
        shedNum,
        age,
        birds: String(birds),
        aveWgt: isNaN(aveWgt) ? '' : aveWgt.toFixed(3),
        totalWgt: !isNaN(totalKg) && totalKg > 0 ? (totalKg / 1000).toFixed(3) : '',
      });
    }
  }
  return results;
}

function BatchResultsView({ sheets, edits, farmConfig, shedPlacement, onEobCatch, onBatchNum }: { sheets: SheetParsed[]; edits: Map<string, string>[]; farmConfig: FarmConfigData; shedPlacement: Map<number, number>; onEobCatch?: (shedNum: number, totalCaught: number) => void; onBatchNum?: (n: number) => void }) {
  const [xlSheds, setXlSheds] = useState<ShedBatchData[]>([]);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ok" | "error">("loading");
  const [catchMap, setCatchMap] = useState<CatchMap>(() => {
    try { return JSON.parse(localStorage.getItem(BATCH_CATCHES_KEY) || "{}"); } catch { return {}; }
  });
  const [editCell, setEditCell] = useState<{ shedNum: number; rowIdx: number; field: keyof EditableCatch } | null>(null);
  const [editVal, setEditVal] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ shedNum: number; rowIdx: number } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [newBatchNum, setNewBatchNum] = useState("");
  const [overrideBatchNum, setOverrideBatchNum] = useState<number | null>(() => {
    const s = localStorage.getItem("silo-batch-num");
    return s ? parseInt(s, 10) || null : null;
  });
  const [overrideFarmName, setOverrideFarmName] = useState<string>(() =>
    localStorage.getItem("silo-batch-farm-name") ?? ""
  );
  const [editingHeader, setEditingHeader] = useState<"farm" | "batch" | null>(null);
  const [headerEditVal, setHeaderEditVal] = useState("");
  const [showEmailImport, setShowEmailImport] = useState(false);
  const [emailText, setEmailText] = useState("");
  const [emailParsed, setEmailParsed] = useState<ParsedEmailRow[] | null>(null);
  const [emailParseError, setEmailParseError] = useState("");
  const [emailImportMode, setEmailImportMode] = useState<"add" | "replace">("add");

  useEffect(() => {
    loadBatchResultsXlsx(import.meta.env.BASE_URL)
      .then(({ sheds, summary }) => {
        setXlSheds(sheds);
        setSummary(summary);
        setLoadState("ok");
        const resolved = parseInt(localStorage.getItem("silo-batch-num") || "0", 10) || summary?.batchNum || 0;
        if (resolved > 0 && onBatchNum) onBatchNum(resolved);
      })
      .catch(() => setLoadState("error"));
  }, []);

  // Seed catchMap from xlsx on first load (if localStorage was empty)
  // Skip seeding when we've just done a New Batch reset
  useEffect(() => {
    if (loadState !== "ok") return;
    const stored = localStorage.getItem(BATCH_CATCHES_KEY);
    if (stored && stored !== "{}") return;
    if (localStorage.getItem("silo-batch-new") === "1") {
      localStorage.removeItem("silo-batch-new");
      return;
    }
    const init: CatchMap = {};
    xlSheds.forEach(s => {
      if (s.catches.length > 0) {
        init[s.shedNum] = s.catches.map(c => ({
          date:     xlDateToStr(c.dateSerial),
          age:      String(c.age),
          birds:    String(c.birds),
          aveWgt:   c.aveWeight.toFixed(3),
          totalWgt: c.totalWeight > 0 ? (c.totalWeight / 1000).toFixed(2) : "",
        }));
      }
    });
    if (Object.keys(init).length > 0) {
      setCatchMap(init);
      localStorage.setItem(BATCH_CATCHES_KEY, JSON.stringify(init));
    }
  }, [loadState, xlSheds]);

  const saveCatchMap = (next: CatchMap) => {
    setCatchMap(next);
    localStorage.setItem(BATCH_CATCHES_KEY, JSON.stringify(next));
    // Push total caught per shed back to EOB "birds catched" column (0-based col 23)
    if (onEobCatch) {
      const allShedNums = new Set([
        ...Object.keys(next).map(Number),
        ...Object.keys(catchMap).map(Number),
      ]);
      allShedNums.forEach(shedNum => {
        const { totalCaught } = parseCatches(next, shedNum);
        onEobCatch(shedNum, totalCaught);
      });
    }
  };

  const updateRow = (shedNum: number, rowIdx: number, field: keyof EditableCatch, value: string) => {
    const rows = [...(catchMap[shedNum] ?? [])];
    rows[rowIdx] = { ...rows[rowIdx], [field]: value };
    saveCatchMap({ ...catchMap, [shedNum]: rows });
  };

  const addRow = (shedNum: number) => {
    const rows = [...(catchMap[shedNum] ?? []), { date: "", age: "", birds: "", aveWgt: "", totalWgt: "" }];
    saveCatchMap({ ...catchMap, [shedNum]: rows });
  };

  const removeRow = (shedNum: number, rowIdx: number) => {
    const rows = (catchMap[shedNum] ?? []).filter((_, i) => i !== rowIdx);
    saveCatchMap({ ...catchMap, [shedNum]: rows });
  };

  const handleClearBatch = () => {
    setCatchMap({});
    localStorage.removeItem(BATCH_CATCHES_KEY);
    const parsed = parseInt(newBatchNum, 10);
    if (!isNaN(parsed) && parsed > 0) {
      localStorage.setItem("silo-batch-num", String(parsed));
      setOverrideBatchNum(parsed);
    } else {
      localStorage.removeItem("silo-batch-num");
      setOverrideBatchNum(null);
    }
    setShowClearConfirm(false);
  };

  const openClearModal = () => {
    const currentBatch = overrideBatchNum ?? summary?.batchNum ?? 0;
    setNewBatchNum(currentBatch > 0 ? String(currentBatch + 1) : "");
    setShowClearConfirm(true);
  };

  const startEdit = (shedNum: number, rowIdx: number, field: keyof EditableCatch, current: string) => {
    setEditCell({ shedNum, rowIdx, field });
    setEditVal(current);
  };

  const commitEdit = () => {
    if (editCell) { updateRow(editCell.shedNum, editCell.rowIdx, editCell.field, editVal); }
    setEditCell(null);
  };

  const isGroupActive = (shedNum: number) => {
    const groupId = Math.ceil(shedNum / 2);
    const cfg = farmConfig.shedGroups?.find(g => g.shedGroupId === groupId);
    return cfg ? cfg.active !== false : groupId <= 6;
  };

  // All active shed numbers (union of xlsx sheds + live placement)
  const xlShedNums = new Set(xlSheds.map(s => s.shedNum));
  const allShedNums = new Set([...xlShedNums]);
  shedPlacement.forEach((_, n) => allShedNums.add(n));
  const activeShedNums = [...allShedNums].filter(n => isGroupActive(n)).sort((a, b) => a - b);

  // Per-shed derived stats
  const shedStats = activeShedNums.map(shedNum => {
    const xlShed = xlSheds.find(s => s.shedNum === shedNum);
    const placement = shedPlacement.get(shedNum) ?? xlShed?.placement ?? 0;
    const { rows, totalCaught, totalWgtKg, aveWgt } = parseCatches(catchMap, shedNum);
    const morts = placement - totalCaught;
    const mortPct = placement > 0 ? (morts / placement) * 100 : 0;
    return { shedNum, placement, rows, totalCaught, totalWgtKg, aveWgt, morts, mortPct };
  });

  const totalPlaced  = shedStats.reduce((a, s) => a + s.placement,    0);
  const totalCaught  = shedStats.reduce((a, s) => a + s.totalCaught,  0);
  const totalMorts   = shedStats.reduce((a, s) => a + s.morts,        0);
  const overallMortPct = totalPlaced > 0 ? ((totalMorts / totalPlaced) * 100).toFixed(2) + "%" : "—";

  const totalWgtKgAll = shedStats.reduce((a, s) => a + s.totalWgtKg, 0);
  const globalAveWgt  = totalCaught > 0 ? totalWgtKgAll / totalCaught : 0;
  const hasCatchData  = totalCaught > 0;

  const fmtN = (n: number, dec = 0) => isNaN(n) || n === 0 ? "—" : dec > 0 ? n.toFixed(dec) : n.toLocaleString();

  const cardStyle = (color: string): React.CSSProperties => ({
    background: "#fff", border: `2px solid ${color}22`, borderLeft: `4px solid ${color}`,
    borderRadius: 10, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4,
  });

  const inputStyle: React.CSSProperties = {
    width: "100%", border: "none", outline: "2px solid #C9A227", borderRadius: 4,
    padding: "2px 4px", fontSize: 12, background: "#fffde7", textAlign: "right",
    boxSizing: "border-box",
  };

  const isEditing = (shedNum: number, rowIdx: number, field: keyof EditableCatch) =>
    editCell?.shedNum === shedNum && editCell?.rowIdx === rowIdx && editCell?.field === field;

  if (loadState === "loading") return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#888", fontFamily: "Inter,'Segoe UI',sans-serif" }}>
      Loading batch results…
    </div>
  );

  if (loadState === "error") return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#c0392b", fontFamily: "Inter,'Segoe UI',sans-serif", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 18 }}>⚠️</div>
      <div>Could not load batch results file.</div>
    </div>
  );

  return (
    <div style={{ padding: "20px 20px 32px", fontFamily: "Inter,'Segoe UI',sans-serif", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1a5c36 0%, #217346 100%)", color: "#fff", borderRadius: 10, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderBottom: "3px solid #C9A227" }}>
        <div style={{ background: "#C9A227", color: "#000", borderRadius: 7, padding: "3px 14px", fontWeight: 800, fontSize: 15 }}>BATCH RESULTS</div>

        {/* Editable farm name */}
        {editingHeader === "farm" ? (
          <input
            autoFocus
            value={headerEditVal}
            onChange={e => setHeaderEditVal(e.target.value)}
            onBlur={() => {
              const v = headerEditVal.trim();
              setOverrideFarmName(v);
              if (v) localStorage.setItem("silo-batch-farm-name", v);
              else localStorage.removeItem("silo-batch-farm-name");
              setEditingHeader(null);
            }}
            onKeyDown={e => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditingHeader(null);
            }}
            style={{ fontSize: 15, fontWeight: 700, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.5)", borderRadius: 6, color: "#fff", padding: "3px 10px", outline: "none", width: 160 }}
          />
        ) : (
          <div
            title="Click to edit farm name"
            onClick={() => { setHeaderEditVal(overrideFarmName || farmConfig.farmName || ""); setEditingHeader("farm"); }}
            style={{ fontSize: 15, fontWeight: 700, cursor: "pointer", borderBottom: "1px dashed rgba(255,255,255,0.5)", paddingBottom: 1 }}
          >
            {overrideFarmName || farmConfig.farmName || <span style={{ opacity: 0.5 }}>Farm name</span>}
          </div>
        )}

        {/* Editable batch number */}
        {editingHeader === "batch" ? (
          <input
            autoFocus
            type="number"
            value={headerEditVal}
            onChange={e => setHeaderEditVal(e.target.value)}
            onBlur={() => {
              const parsed = parseInt(headerEditVal, 10);
              if (!isNaN(parsed) && parsed > 0) {
                setOverrideBatchNum(parsed);
                localStorage.setItem("silo-batch-num", String(parsed));
              }
              setEditingHeader(null);
            }}
            onKeyDown={e => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditingHeader(null);
            }}
            style={{ fontSize: 15, fontWeight: 600, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.5)", borderRadius: 6, color: "#fff", padding: "3px 10px", outline: "none", width: 100 }}
          />
        ) : (
          <div
            title="Click to edit batch number"
            onClick={() => { const bn = overrideBatchNum ?? summary?.batchNum; setHeaderEditVal(bn ? String(bn) : ""); setEditingHeader("batch"); }}
            style={{ fontSize: 15, opacity: 0.9, cursor: "pointer", borderBottom: "1px dashed rgba(255,255,255,0.5)", paddingBottom: 1 }}
          >
            {(() => {
              const bn = overrideBatchNum ?? summary?.batchNum;
              if (bn && bn > 0) return `Batch #${bn}`;
              const hint = summary?.batchNum ? summary.batchNum + 1 : null;
              return <span style={{ opacity: 0.5 }}>{hint ? `e.g. Batch #${hint}` : "Batch #"}</span>;
            })()}
          </div>
        )}
        <button
          onClick={() => { setEmailText(""); setEmailParsed(null); setEmailParseError(""); setShowEmailImport(true); }}
          style={{ marginLeft: "auto", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.4)", color: "#fff", borderRadius: 7, padding: "6px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
          title="Import catch data from a Baiada weighbridge email"
        >
          📧 Import Catches
        </button>
      </div>

      {/* Top stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(165px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div style={cardStyle("#1a5c36")}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#1a5c36" }}>{totalPlaced > 0 ? totalPlaced.toLocaleString() : "—"}</div>
          <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>Birds Placed</div>
        </div>
        <div style={cardStyle("#217346")}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#217346" }}>{totalCaught > 0 ? totalCaught.toLocaleString() : "—"}</div>
          <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>Birds Caught</div>
        </div>
        <div style={cardStyle("#c0392b")}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#c0392b" }}>{totalMorts > 0 ? totalMorts.toLocaleString() : "—"}</div>
          <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>Total Morts</div>
        </div>
        <div style={cardStyle("#e67e22")}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#e67e22" }}>{overallMortPct}</div>
          <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>Mortality %</div>
        </div>
        {globalAveWgt > 0 && (
          <div style={cardStyle("#8e44ad")}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#8e44ad" }}>{globalAveWgt.toFixed(3)} kg</div>
            <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>Ave. Weight</div>
          </div>
        )}
        <div style={cardStyle("#2980b9")}>
          <div style={{ fontSize: 22, fontWeight: 800, color: hasCatchData && summary && summary.fcr > 0 ? "#2980b9" : "#ccc" }}>
            {hasCatchData && summary && summary.fcr > 0 ? summary.fcr.toFixed(3) : "—"}
          </div>
          <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>FCR</div>
        </div>
        <div style={cardStyle("#16a085")}>
          <div style={{ fontSize: 22, fontWeight: 800, color: hasCatchData && summary && summary.cfcr > 0 ? "#16a085" : "#ccc" }}>
            {hasCatchData && summary && summary.cfcr > 0 ? summary.cfcr.toFixed(3) : "—"}
          </div>
          <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>CFCR</div>
        </div>
        {hasCatchData && summary && summary.actualAge > 0 && (
          <div style={cardStyle("#5b6fa6")}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#5b6fa6" }}>{summary.actualAge.toFixed(1)} <span style={{ fontSize: 13 }}>days</span></div>
            <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>Actual Age</div>
          </div>
        )}
        {hasCatchData && summary && summary.correctedAge > 0 && (
          <div style={cardStyle("#7d6aa0")}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#7d6aa0" }}>{summary.correctedAge.toFixed(1)} <span style={{ fontSize: 13 }}>days</span></div>
            <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>CAGE</div>
          </div>
        )}
      </div>

      {/* Feed summary — live values from End of Batch sheet, fall back to xlsx */}
      {summary && (() => {
        // Read a cell from the EOB sheet: edits override base value
        const eobIdx = sheets.findIndex(s => s.name.trim().toLowerCase() === "end of batch");
        const getEobNum = (row: number, col: number): number => {
          if (eobIdx < 0) return 0;
          const key = `${row},${col}`;
          const editVal = edits[eobIdx]?.get(key);
          if (editVal !== undefined) return parseFloat(editVal) || 0;
          const cell = sheets[eobIdx].cells.get(key);
          return parseFloat(String(cell?.value ?? 0)) || 0;
        };
        // EOB rows (0-indexed): 18=on-hand-last, 19=delivered, 20=on-hand-now, 21=consumed; col 23
        const eobDelivered = getEobNum(19, 23);
        const eobOnHand    = getEobNum(20, 23);
        const eobConsumed  = getEobNum(21, 23);
        const feedDelivered = eobDelivered > 0 ? eobDelivered : (hasCatchData ? summary.feedDelivered : 0);
        const feedOnHand    = eobOnHand    > 0 ? eobOnHand    : (hasCatchData ? summary.feedOnHand    : 0);
        const feedConsumed  = eobConsumed  > 0 ? eobConsumed  : (hasCatchData ? summary.feedConsumed  : 0);
        const fromEob = eobDelivered > 0;
        return (
          <div style={{ background: "#f4f9f6", border: "1px solid #c8e6d4", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: "#1a5c36", textTransform: "uppercase", letterSpacing: 0.5 }}>Feed Summary</div>
              {fromEob && <div style={{ fontSize: 10, color: "#888", background: "#e8f5ee", borderRadius: 4, padding: "2px 7px" }}>live from End of Batch</div>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
              {[
                { label: "Feed Delivered", value: fmtN(feedDelivered) + " kg" },
                { label: "Feed Consumed",  value: fmtN(feedConsumed)  + " kg" },
                { label: "Feed on Hand",   value: fmtN(feedOnHand)    + " kg" },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#217346" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Per-shed cards */}
      {activeShedNums.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 10, color: "#1a5c36", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Per-Shed Breakdown ({activeShedNums.length} active shed{activeShedNums.length !== 1 ? "s" : ""}) — tap a cell to edit
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
            {shedStats.map(({ shedNum, placement, rows, totalCaught: sc, totalWgtKg, aveWgt, morts, mortPct }) => (
              <div key={shedNum} style={{ background: "#fff", borderRadius: 10, border: "1px solid #dde8e0", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>

                {/* Card header */}
                <div style={{ background: "linear-gradient(135deg, #1a5c36 0%, #217346 100%)", color: "#fff", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ background: "#C9A227", color: "#000", borderRadius: 5, padding: "2px 10px", fontWeight: 800, fontSize: 14 }}>SHED {shedNum}</div>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 14, flexWrap: "wrap" }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 15, fontWeight: 800 }}>{placement > 0 ? placement.toLocaleString() : "—"}</div>
                      <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.8 }}>Placed</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 15, fontWeight: 800 }}>{sc > 0 ? sc.toLocaleString() : "—"}</div>
                      <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.8 }}>Caught</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: morts > 0 ? "#ffb3a7" : "#fff" }}>{morts > 0 ? morts.toLocaleString() : "—"}</div>
                      <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.8 }}>Morts{mortPct > 0 ? ` (${mortPct.toFixed(1)}%)` : ""}</div>
                    </div>
                  </div>
                </div>

                {/* Catch rows table */}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f0f7f3" }}>
                      <th style={{ padding: "6px 8px", textAlign: "left",  color: "#1a5c36", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, width: "22%" }}>Date</th>
                      <th style={{ padding: "6px 8px", textAlign: "right", color: "#1a5c36", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, width: "10%" }}>Age</th>
                      <th style={{ padding: "6px 8px", textAlign: "right", color: "#1a5c36", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, width: "16%" }}>Birds</th>
                      <th style={{ padding: "6px 8px", textAlign: "right", color: "#1a5c36", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, width: "18%" }}>Ave Wgt</th>
                      <th style={{ padding: "6px 8px", textAlign: "right", color: "#1a5c36", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, width: "18%" }}>Total Wgt (kg)</th>
                      <th style={{ width: "8%" }} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, ci) => {
                      const rowBirds = parseFloat(row.birds) || 0;
                      const rowAve   = parseFloat(row.aveWgt) || 0;
                      const rowTw    = parseFloat(row.totalWgt) > 0 ? parseFloat(row.totalWgt) : (rowBirds * rowAve) / 1000;
                      const cellProps = (field: keyof EditableCatch, display: string, align: "left" | "right" = "right") => ({
                        style: { padding: "5px 8px", textAlign: align as React.CSSProperties["textAlign"], color: "#333", cursor: "pointer", background: isEditing(shedNum, ci, field) ? "#fffde7" : "transparent" } as React.CSSProperties,
                        onClick: () => startEdit(shedNum, ci, field, row[field]),
                      });
                      return (
                        <tr key={ci} style={{ borderTop: "1px solid #eef3ef", background: pendingDelete?.shedNum === shedNum && pendingDelete?.rowIdx === ci ? "#fff0f0" : ci % 2 === 0 ? "#fff" : "#f9fcfa" }}>
                          <td {...cellProps("date", row.date, "left")}>
                            {isEditing(shedNum, ci, "date") ? (
                              <input style={{ ...inputStyle, textAlign: "left" }} value={editVal} autoFocus
                                onChange={e => setEditVal(e.target.value)}
                                onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditCell(null); }} />
                            ) : (row.date || <span style={{ color: "#aaa" }}>dd/mm/yyyy</span>)}
                          </td>
                          <td {...cellProps("age", row.age)}>
                            {isEditing(shedNum, ci, "age") ? (
                              <input style={inputStyle} type="number" value={editVal} autoFocus
                                onChange={e => setEditVal(e.target.value)}
                                onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditCell(null); }} />
                            ) : (row.age ? `${row.age}d` : <span style={{ color: "#aaa" }}>0d</span>)}
                          </td>
                          <td {...cellProps("birds", row.birds)}>
                            {isEditing(shedNum, ci, "birds") ? (
                              <input style={inputStyle} type="number" value={editVal} autoFocus
                                onChange={e => setEditVal(e.target.value)}
                                onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditCell(null); }} />
                            ) : (rowBirds > 0 ? rowBirds.toLocaleString() : <span style={{ color: "#aaa" }}>—</span>)}
                          </td>
                          <td {...cellProps("aveWgt", row.aveWgt)}>
                            {isEditing(shedNum, ci, "aveWgt") ? (
                              <input style={inputStyle} type="number" step="0.001" value={editVal} autoFocus
                                onChange={e => setEditVal(e.target.value)}
                                onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditCell(null); }} />
                            ) : (rowAve > 0 ? `${rowAve.toFixed(3)} kg` : <span style={{ color: "#aaa" }}>—</span>)}
                          </td>
                          <td {...cellProps("totalWgt", row.totalWgt)}>
                            {isEditing(shedNum, ci, "totalWgt") ? (
                              <input style={inputStyle} type="number" step="0.01" value={editVal} autoFocus
                                onChange={e => setEditVal(e.target.value)}
                                onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditCell(null); }} />
                            ) : (rowTw > 0 ? `${Math.round(rowTw * 1000).toLocaleString()} kg` : <span style={{ color: "#aaa" }}>—</span>)}
                          </td>
                          <td style={{ padding: "5px 6px", textAlign: "center", whiteSpace: "nowrap" }}>
                            {pendingDelete?.shedNum === shedNum && pendingDelete?.rowIdx === ci ? (
                              <>
                                <button
                                  onClick={() => { removeRow(shedNum, ci); setPendingDelete(null); }}
                                  style={{ background: "#c0392b", border: "none", color: "#fff", cursor: "pointer", fontSize: 10, fontWeight: 700, padding: "3px 6px", borderRadius: 4, marginRight: 2 }}
                                  title="Confirm delete">✓</button>
                                <button
                                  onClick={() => setPendingDelete(null)}
                                  style={{ background: "#aaa", border: "none", color: "#fff", cursor: "pointer", fontSize: 10, fontWeight: 700, padding: "3px 6px", borderRadius: 4 }}
                                  title="Cancel">✕</button>
                              </>
                            ) : (
                              <button
                                onClick={() => setPendingDelete({ shedNum, rowIdx: ci })}
                                style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "2px 6px", borderRadius: 4 }}
                                title="Delete row">×</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid #1a5c36", background: "#d4eddf" }}>
                      <td colSpan={2} style={{ padding: "6px 8px", color: "#1a5c36", fontWeight: 800, fontSize: 11 }}>TOTAL</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: "#1a1a1a", fontWeight: 800 }}>{sc > 0 ? sc.toLocaleString() : "—"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: "#1a1a1a", fontWeight: 800 }}>{aveWgt > 0 ? `${aveWgt.toFixed(3)} kg` : "—"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: "#1a1a1a", fontWeight: 800 }}>{totalWgtKg > 0 ? `${Math.round(totalWgtKg).toLocaleString()} kg` : "—"}</td>
                      <td />
                    </tr>
                    <tr>
                      <td colSpan={6} style={{ padding: "6px 8px" }}>
                        <button onClick={() => addRow(shedNum)}
                          style={{ width: "100%", background: "#f0f7f3", border: "1px dashed #1a5c36", borderRadius: 6, color: "#1a5c36", fontWeight: 700, cursor: "pointer", padding: "5px 0", fontSize: 12 }}>
                          + Add Catch
                        </button>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeShedNums.length === 0 && (
        <div style={{ textAlign: "center", color: "#888", padding: "40px 20px", fontSize: 14 }}>
          No active sheds configured. Add catch rows once sheds are set up.
        </div>
      )}

      {/* Clear confirmation modal */}
      {showClearConfirm && (() => {
        const shedsWithData = Object.values(catchMap).filter(r => r.length > 0).length;
        const totalRows = Object.values(catchMap).reduce((a, r) => a + r.length, 0);
        const batchLabel = summary?.batchNum && summary.batchNum > 0 ? `Batch #${summary.batchNum}` : "current batch";
        const farmLabel = farmConfig.farmName || "";
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
            onClick={() => setShowClearConfirm(false)}>
            <div style={{ background: "#fff", borderRadius: 14, maxWidth: 420, width: "100%", boxShadow: "0 8px 40px rgba(0,0,0,0.3)", overflow: "hidden" }}
              onClick={e => e.stopPropagation()}>
              {/* Modal header */}
              <div style={{ background: "#c0392b", color: "#fff", padding: "16px 20px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 22 }}>⚠️</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>Clear for New Batch</div>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>This action cannot be undone</div>
                </div>
              </div>
              {/* Modal body */}
              <div style={{ padding: "20px 24px" }}>
                <div style={{ fontSize: 14, color: "#333", marginBottom: 16, lineHeight: 1.5 }}>
                  The following catch data will be <strong>permanently deleted</strong>:
                </div>
                <div style={{ background: "#fff5f5", border: "1px solid #f5c6cb", borderRadius: 8, padding: "14px 16px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                  {farmLabel && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: "#666" }}>Farm</span>
                      <span style={{ fontWeight: 700, color: "#333" }}>{farmLabel}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "#666" }}>Batch</span>
                    <span style={{ fontWeight: 700, color: "#333" }}>{batchLabel}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderTop: "1px solid #f5c6cb", paddingTop: 8 }}>
                    <span style={{ color: "#666" }}>Sheds with catch data</span>
                    <span style={{ fontWeight: 700, color: "#c0392b" }}>{shedsWithData}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "#666" }}>Total catch rows</span>
                    <span style={{ fontWeight: 700, color: "#c0392b" }}>{totalRows}</span>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
                  The xlsx summary (FCR, feed data) will remain. Only the per-shed catch rows entered here will be cleared.
                </div>
                {/* New batch number */}
                <div style={{ background: "#f0f7f3", border: "1px solid #c8e6d4", borderRadius: 8, padding: "14px 16px", marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#1a5c36", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                    New Batch Number
                  </label>
                  <input
                    type="number"
                    value={newBatchNum}
                    onChange={e => setNewBatchNum(e.target.value)}
                    placeholder="Enter new batch #"
                    style={{ width: "100%", border: "1px solid #a8d5b9", borderRadius: 7, padding: "10px 12px", fontSize: 16, fontWeight: 700, color: "#1a5c36", background: "#fff", boxSizing: "border-box", outline: "none" }}
                    autoFocus
                    onKeyDown={e => { if (e.key === "Enter") handleClearBatch(); if (e.key === "Escape") setShowClearConfirm(false); }}
                  />
                  {newBatchNum && !isNaN(parseInt(newBatchNum, 10)) && (
                    <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>
                      New batch will be labelled <strong>Batch #{parseInt(newBatchNum, 10)}</strong>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setShowClearConfirm(false)}
                    style={{ flex: 1, background: "#f0f0f0", border: "none", borderRadius: 8, padding: "11px 0", fontWeight: 700, fontSize: 14, cursor: "pointer", color: "#333" }}>
                    Cancel
                  </button>
                  <button onClick={handleClearBatch}
                    style={{ flex: 1, background: "#c0392b", border: "none", borderRadius: 8, padding: "11px 0", fontWeight: 800, fontSize: 14, cursor: "pointer", color: "#fff" }}>
                    Delete {totalRows} Catch Row{totalRows !== 1 ? "s" : ""}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Email Import Modal ── */}
      {showEmailImport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setShowEmailImport(false)}>
          <div style={{ background: "#fff", borderRadius: 14, maxWidth: 560, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 12px 50px rgba(0,0,0,0.35)" }}
            onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div style={{ background: "linear-gradient(135deg, #1a5c36 0%, #217346 100%)", color: "#fff", padding: "16px 20px", borderRadius: "14px 14px 0 0", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 22 }}>📧</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Import Catches from Email</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>Paste the weighbridge email table below</div>
              </div>
              <button onClick={() => setShowEmailImport(false)}
                style={{ marginLeft: "auto", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 6, width: 30, height: 30, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
                ✕
              </button>
            </div>

            <div style={{ padding: "20px 24px" }}>

              {/* Instructions */}
              <div style={{ background: "#f0f7f3", border: "1px solid #c8e6d4", borderRadius: 8, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: "#333", lineHeight: 1.6 }}>
                <strong>How to paste:</strong> Open the Adelaide Weighbridge email → select all the table text → copy → paste below.<br/>
                <span style={{ color: "#666", fontSize: 12 }}>Works with the Baiada format: GROWER · SHED # · AGE · BIRD # · ESTIMATE · ACTUAL · TOTAL KG</span>
              </div>

              {/* Paste area */}
              <textarea
                value={emailText}
                onChange={e => { setEmailText(e.target.value); setEmailParsed(null); setEmailParseError(""); }}
                placeholder={"GROWER\tSHED #\tAGE\tBIRD #\tESTIMATE\tACTUAL\tTOTAL KG\nDouble B\t10\t45\t26208\t3.44\t3.66\t96013\n..."}
                rows={7}
                style={{ width: "100%", border: "1.5px solid #c8e6d4", borderRadius: 8, padding: "10px 12px", fontSize: 12, fontFamily: "monospace", resize: "vertical", boxSizing: "border-box", outline: "none", color: "#222" }}
              />

              {/* Parse button */}
              <button
                onClick={() => {
                  const rows = parseEmailCatchText(emailText);
                  if (rows.length === 0) {
                    setEmailParseError("Could not detect the weighbridge table. Make sure you copied the full table including the header row (GROWER, SHED #, AGE, BIRD #, ACTUAL, TOTAL KG).");
                    setEmailParsed(null);
                  } else {
                    setEmailParsed(rows);
                    setEmailParseError("");
                  }
                }}
                style={{ width: "100%", background: "#1a5c36", color: "#fff", border: "none", borderRadius: 8, padding: "11px 0", fontWeight: 700, fontSize: 14, cursor: "pointer", marginTop: 10 }}
              >
                🔍 Parse Email Table
              </button>

              {/* Error message */}
              {emailParseError && (
                <div style={{ background: "#fff0f0", border: "1px solid #f5c6cb", borderRadius: 8, padding: "12px 14px", marginTop: 12, fontSize: 13, color: "#c0392b" }}>
                  ⚠️ {emailParseError}
                </div>
              )}

              {/* Parsed preview */}
              {emailParsed && emailParsed.length > 0 && (
                <>
                  <div style={{ marginTop: 18, marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#1a5c36", marginBottom: 4 }}>
                      ✅ Found {emailParsed.length} catch row{emailParsed.length !== 1 ? "s" : ""}
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "Inter,'Segoe UI',sans-serif" }}>
                        <thead>
                          <tr style={{ background: "#1a5c36", color: "#fff" }}>
                            {["Shed", "Age (days)", "Birds", "Ave Wgt (kg)", "Total Wgt (kg)"].map(h => (
                              <th key={h} style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {emailParsed.map((r, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? "#f4f9f6" : "#fff" }}>
                              <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 700, color: "#1a5c36" }}>SHED {r.shedNum}</td>
                              <td style={{ padding: "5px 10px", textAlign: "right" }}>{r.age || "—"}</td>
                              <td style={{ padding: "5px 10px", textAlign: "right" }}>{parseInt(r.birds).toLocaleString()}</td>
                              <td style={{ padding: "5px 10px", textAlign: "right" }}>{r.aveWgt || "—"}</td>
                              <td style={{ padding: "5px 10px", textAlign: "right" }}>{r.totalWgt ? `${Math.round(parseFloat(r.totalWgt) * 1000).toLocaleString()} kg` : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Import mode */}
                  <div style={{ background: "#fffde7", border: "1px solid #ffe082", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#333", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>How to import</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {([
                        { val: "add", label: "Add to existing catches", desc: "Keeps any current catch rows and adds these on top" },
                        { val: "replace", label: "Replace per-shed catches", desc: "Removes existing rows for matching sheds and replaces with these" },
                      ] as const).map(opt => (
                        <label key={opt.val} style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                          <input type="radio" name="emailImportMode" value={opt.val}
                            checked={emailImportMode === opt.val}
                            onChange={() => setEmailImportMode(opt.val)}
                            style={{ marginTop: 3 }}
                          />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{opt.label}</div>
                            <div style={{ fontSize: 11, color: "#666" }}>{opt.desc}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Confirm import */}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setShowEmailImport(false)}
                      style={{ flex: 1, background: "#f0f0f0", border: "none", borderRadius: 8, padding: "11px 0", fontWeight: 700, fontSize: 14, cursor: "pointer", color: "#333" }}>
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (!emailParsed) return;
                        const next = { ...catchMap };
                        emailParsed.forEach(row => {
                          const newCatch: EditableCatch = { date: "", age: row.age, birds: row.birds, aveWgt: row.aveWgt, totalWgt: row.totalWgt };
                          if (emailImportMode === "replace") {
                            next[row.shedNum] = [newCatch];
                          } else {
                            next[row.shedNum] = [...(next[row.shedNum] ?? []), newCatch];
                          }
                        });
                        saveCatchMap(next);
                        setShowEmailImport(false);
                      }}
                      style={{ flex: 2, background: "#1a5c36", color: "#fff", border: "none", borderRadius: 8, padding: "11px 0", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
                    >
                      ✅ Import {emailParsed.length} Catch Row{emailParsed.length !== 1 ? "s" : ""}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MortsView helpers ─────────────────────────────────────────────────────────
const MORTS_LOG_KEY = "silo-morts-log";
const CULLS_LOG_KEY = "silo-culls-log";
type MortsLog = Record<string, Record<number, number>>;

function getWeekDays(offset: number): Date[] {
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}
function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

// ── MortsView ─────────────────────────────────────────────────────────────────
function MortsView({ sheets, edits, handleEdit, farmConfig }: {
  sheets: SheetParsed[];
  edits: Map<string, string>[];
  handleEdit: (si: number, key: string, val: string) => void;
  farmConfig: FarmConfigData;
}) {
  const [mortsLog, setMortsLog] = useState<MortsLog>(() => {
    try { return JSON.parse(localStorage.getItem(MORTS_LOG_KEY) || "{}"); } catch { return {}; }
  });
  const [cullsLog, setCullsLog] = useState<MortsLog>(() => {
    try { return JSON.parse(localStorage.getItem(CULLS_LOG_KEY) || "{}"); } catch { return {}; }
  });
  const [weekOffset, setWeekOffset] = useState(0);
  const [editCell, setEditCell] = useState<{ date: string; shed: number; type: "m" | "c" } | null>(null);
  const [editVal, setEditVal] = useState("");
  const [editingShed, setEditingShed] = useState<number | null>(null);
  const [editMorts, setEditMorts] = useState("");

  const eobIdx = sheets.findIndex(s => s.name.trim().toLowerCase() === "end of batch");
  const getEobNum = (row: number, col: number): number => {
    if (eobIdx < 0) return 0;
    const key = `${row},${col}`;
    const ev = edits[eobIdx]?.get(key);
    if (ev !== undefined) return parseFloat(ev) || 0;
    return parseFloat(String(sheets[eobIdx].cells.get(key)?.value ?? 0)) || 0;
  };

  const activeShedNums: number[] = [];
  (farmConfig.shedGroups ?? []).forEach((g: FarmShedConfig) => {
    if (g.active !== false) {
      const id = g.shedGroupId;
      const odd = id * 2 - 1; const even = id * 2;
      if (odd > 0 && odd <= 24) { activeShedNums.push(odd); activeShedNums.push(even); }
    }
  });
  const shedNums = activeShedNums.length > 0 ? activeShedNums : Array.from({ length: 12 }, (_, i) => i + 1);

  const days = getWeekDays(weekOffset);
  const weekLabel = `${days[0].toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`;

  const placementDate = useMemo((): Date | null => {
    const si = sheets.findIndex(s => /shed/i.test(s.name) && !/end/i.test(s.name));
    if (si < 0) return null;
    const raw = edits[si]?.get("2,2") ?? String(sheets[si].cells.get("2,2")?.value ?? "");
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }, [sheets, edits]);

  const getDayNum = (d: Date): number | null => {
    if (!placementDate) return null;
    const n = Math.floor((d.getTime() - placementDate.getTime()) / 86400000) + 1;
    return n >= 1 && n <= 120 ? n : null;
  };

  const saveEntry = (log: MortsLog, setLog: (v: MortsLog) => void, key: string, date: string, shed: number, val: string) => {
    const n = parseInt(val.replace(/,/g, ""), 10);
    const next: MortsLog = { ...log };
    if (!next[date]) next[date] = {};
    if (isNaN(n) || n < 0) { delete next[date][shed]; } else { next[date][shed] = n; }
    if (Object.keys(next[date] ?? {}).length === 0) delete next[date];
    setLog(next);
    localStorage.setItem(key, JSON.stringify(next));
    setEditCell(null);
  };
  const saveMorts = (date: string, shed: number, val: string) => saveEntry(mortsLog, setMortsLog, MORTS_LOG_KEY, date, shed, val);
  const saveCulls = (date: string, shed: number, val: string) => saveEntry(cullsLog, setCullsLog, CULLS_LOG_KEY, date, shed, val);


  const handlePrint = () => {
    const farmName = farmConfig.farmName ?? "Farm";
    const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

    // ── Page splitting ────────────────────────────────────────────────────────
    // A4 landscape: ~277mm wide × ~190mm printable height (10mm margins).
    // At 8pt font + 4pt padding each shed pair (M+C) takes ~11mm.
    // Allow 12 sheds per page (≈ 132mm for rows + ~25mm for header/title/totals).
    // For more sheds, split evenly: 13-24 → 2 pages, 25-36 → 3 pages, etc.
    const SHEDS_PER_PAGE = 12;
    const numPages = Math.ceil(shedNums.length / SHEDS_PER_PAGE);
    const shedsPerPage = Math.ceil(shedNums.length / numPages); // evenly balanced
    const chunks: number[][] = [];
    for (let i = 0; i < shedNums.length; i += shedsPerPage) {
      chunks.push(shedNums.slice(i, i + shedsPerPage));
    }

    // ── Shared style strings ──────────────────────────────────────────────────
    const colWidths = `<col style="width:6%"><col style="width:5%">${days.map(() => `<col style="width:12.7%">`).join("")}`;
    const TH  = `background:#8b1a1a;color:#fff;border:1.5px solid #000;padding:3pt 4pt;font-size:8pt;text-align:center;`;
    const TD  = `border:1px solid #000;padding:4pt 3pt;text-align:center;font-size:8pt;`;

    const dayHeaders = days.map((d, i) => {
      const dn = getDayNum(d);
      return `<th style="${TH}">${DAYS[i]}<br/><span style="font-size:6.5pt;opacity:0.85">${d.toLocaleDateString("en-AU",{day:"numeric",month:"short"})}${dn ? ` D${dn}` : ""}</span></th>`;
    }).join("");

    // ── Build one page block per chunk ────────────────────────────────────────
    const printedDate = new Date().toLocaleDateString("en-AU");
    const pages = chunks.map((chunk, pageIdx) => {
      const isLast = pageIdx === chunks.length - 1;
      const pageLabel = numPages > 1 ? ` &nbsp;|&nbsp; Sheet ${pageIdx + 1} of ${numPages} (Sheds ${chunk[0]}–${chunk[chunk.length - 1]})` : "";

      const shedRows = chunk.map((s, ci) => {
        const mCells = days.map(d => { const v = mortsLog[isoDate(d)]?.[s]; return `<td style="${TD}">${v ?? ""}</td>`; }).join("");
        const cCells = days.map(d => { const v = cullsLog[isoDate(d)]?.[s]; return `<td style="${TD}background:#fefef4;">${v ?? ""}</td>`; }).join("");
        const shBg = ci % 2 === 0 ? "#fff" : "#f7f7f7";
        return `<tr style="background:${shBg}">
          <td rowspan="2" style="${TD}background:#f8e8e8;font-weight:800;font-size:9pt;vertical-align:middle;">S${s}</td>
          <td style="${TD}background:#fff8f8;font-weight:700;color:#8b1a1a;font-size:7pt;">M</td>
          ${mCells}
        </tr><tr style="background:${shBg}">
          <td style="${TD}background:#fffff0;font-weight:700;color:#555;font-size:7pt;">C</td>
          ${cCells}
        </tr>`;
      }).join("");

      return `
        <div style="${isLast ? "" : "page-break-after:always"}">
          <h2 style="color:#8b1a1a;margin:0 0 1mm;font-size:12pt">${farmName} — Daily Morts &amp; Culls</h2>
          <p style="margin:0 0 3mm;color:#555;font-size:8pt">Week: ${weekLabel}${pageLabel} &nbsp;|&nbsp; Printed: ${printedDate} &nbsp;|&nbsp; <b>M</b> = Morts &nbsp; <b>C</b> = Culls</p>
          <table>
            <colgroup>${colWidths}</colgroup>
            <thead><tr>
              <th colspan="2" style="${TH}font-size:9pt;">Shed</th>
              ${dayHeaders}
            </tr></thead>
            <tbody>${shedRows}</tbody>
          </table>
        </div>`;
    }).join("");

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Morts &amp; Culls — ${weekLabel}</title><style>
      @page{size:A4 landscape;margin:10mm}
      *{box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:8pt;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      table{border-collapse:collapse;width:100%;table-layout:fixed}
      @media print{body{padding:0}button{display:none}}
    </style></head><body>${pages}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  const mortColor = (pct: number) => pct >= 4 ? "#c0392b" : pct >= 2 ? "#e67e22" : pct >= 1 ? "#f1c40f" : "#27ae60";
  const fmtN = (n: number) => Math.round(n).toLocaleString();

  const shedData = shedNums.map(shedNum => {
    const row = shedNum + 3;
    const placed = getEobNum(row, 22); const catched = getEobNum(row, 23); const morts = getEobNum(row, 24);
    const mortPct = placed > 0 ? (morts / placed) * 100 : 0;
    return { shedNum, row, placed, catched, morts, mortPct };
  });
  const totalPlaced = shedData.reduce((a, s) => a + s.placed, 0);
  const totalCatched = shedData.reduce((a, s) => a + s.catched, 0);
  const totalMorts = shedData.reduce((a, s) => a + s.morts, 0);
  const totalMortPct = totalPlaced > 0 ? (totalMorts / totalPlaced) * 100 : 0;

  const saveEobEdit = (shedNum: number, row: number) => {
    const val = parseFloat(editMorts.replace(/,/g, ""));
    if (!isNaN(val) && eobIdx >= 0) handleEdit(eobIdx, `${row},24`, String(Math.round(val)));
    setEditingShed(null);
  };

  const TH: React.CSSProperties = { background: "#8b1a1a", color: "#fff", padding: "7px 5px", textAlign: "center", whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 2, fontSize: 11, borderRight: "1px solid rgba(255,255,255,0.2)" };
  const TH_STICKY: React.CSSProperties = { ...TH, left: 0, zIndex: 3, minWidth: 54 };
  const TD: React.CSSProperties = { borderRight: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb", padding: "0", textAlign: "center" };
  const TD_STICKY: React.CSSProperties = { ...TD, position: "sticky", left: 0, zIndex: 1, background: "#f0f7f3", minWidth: 54, padding: "6px 4px", fontSize: 11, fontWeight: 700 };

  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f8f8f8" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "#fff", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
            <button onClick={() => setWeekOffset(w => w - 1)} style={{ padding: "5px 11px", borderRadius: 7, border: "1px solid #ddd", background: "#f5f5f5", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>‹</button>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: "#8b1a1a" }}>{weekLabel}</div>
              {weekOffset === 0 && <div style={{ fontSize: 9, color: "#aaa", letterSpacing: 0.5, textTransform: "uppercase" }}>Current Week</div>}
            </div>
            <button onClick={() => setWeekOffset(w => w + 1)} style={{ padding: "5px 11px", borderRadius: 7, border: "1px solid #ddd", background: "#f5f5f5", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>›</button>
            <button onClick={() => setWeekOffset(0)} style={{ padding: "5px 9px", borderRadius: 7, border: "1px solid #ddd", background: "#f5f5f5", cursor: "pointer", fontSize: 11, color: "#555" }}>Today</button>
            <button onClick={handlePrint} style={{ padding: "5px 11px", borderRadius: 7, background: "#8b1a1a", color: "#fff", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>🖨 Print</button>
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 14, padding: "4px 12px", background: "#fff", borderBottom: "1px solid #f0e0e0", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#8b1a1a" }}><div style={{ width: 10, height: 10, background: "#fff8f8", border: "1px solid #e5c5c5", borderRadius: 2 }} /><b>M</b> Morts</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#555" }}><div style={{ width: 10, height: 10, background: "#fffff0", border: "1px solid #d5d5a0", borderRadius: 2 }} /><b>C</b> Culls</div>
            <div style={{ marginLeft: "auto", fontSize: 10, color: "#aaa" }}>Tap a cell to edit</div>
          </div>

          {/* Scrollable table — Sheds as rows, Days as columns */}
          <div style={{ flex: 1, overflowX: "auto", overflowY: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: "max-content", width: "100%" }}>
              <thead>
                <tr>
                  {/* Shed col + M/C col — both sticky */}
                  <th colSpan={2} style={{ ...TH_STICKY, minWidth: 68, verticalAlign: "middle", borderRight: "2px solid rgba(255,255,255,0.4)" }}>Shed</th>
                  {days.map((d, i) => {
                    const dayNum = getDayNum(d);
                    const isToday = isoDate(d) === isoDate(new Date());
                    return (
                      <th key={i} style={{ ...TH, minWidth: 52, background: isToday ? "#b8640a" : "#8b1a1a" }}>
                        {DAY_LABELS[i]}
                        <div style={{ fontSize: 9, fontWeight: 400, opacity: 0.85 }}>
                          {d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                          {dayNum ? ` D${dayNum}` : ""}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {shedNums.map((s, si) => {
                  const shedBg = si % 2 === 0 ? "#fff" : "#fcfcfc";
                  return (
                    <React.Fragment key={s}>
                      {/* Morts row */}
                      <tr>
                        <td rowSpan={2} style={{
                          ...TD_STICKY, width: 44, background: "#f8e8e8", color: "#8b1a1a",
                          fontWeight: 800, fontSize: 13, verticalAlign: "middle",
                          borderRight: "none", borderBottom: "2px solid #e0c0c0",
                        }}>
                          S{s}
                        </td>
                        <td style={{
                          ...TD_STICKY, left: 44, width: 24, background: "#fff8f8", color: "#8b1a1a",
                          fontWeight: 700, fontSize: 10, verticalAlign: "middle",
                          borderLeft: "none", borderRight: "2px solid #e5c5c5",
                        }}>M</td>
                        {days.map((d, di) => {
                          const iso = isoDate(d);
                          const isToday = iso === isoDate(new Date());
                          const val = mortsLog[iso]?.[s];
                          const isEditing = editCell?.date === iso && editCell?.shed === s && editCell?.type === "m";
                          return (
                            <td key={di} style={{ ...TD, background: isToday ? "#fffde7" : shedBg }}>
                              {isEditing ? (
                                <input type="number" inputMode="numeric" value={editVal} autoFocus
                                  onChange={e => setEditVal(e.target.value)}
                                  onBlur={() => saveMorts(iso, s, editVal)}
                                  onKeyDown={e => { if (e.key === "Enter") saveMorts(iso, s, editVal); if (e.key === "Escape") setEditCell(null); }}
                                  style={{ width: "100%", border: "2px solid #8b1a1a", borderRadius: 2, padding: "4px 1px", textAlign: "center", fontSize: 12, outline: "none", background: "#fff8f8", fontWeight: 700 }}
                                />
                              ) : (
                                <div onClick={() => { setEditCell({ date: iso, shed: s, type: "m" }); setEditVal(val !== undefined ? String(val) : ""); }}
                                  style={{ padding: "7px 3px", cursor: "pointer", minHeight: 28, textAlign: "center", color: val ? (val > 30 ? "#c0392b" : "#8b1a1a") : "#ddd", fontWeight: val ? 700 : 400 }}>
                                  {val !== undefined ? val : "·"}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      {/* Culls row */}
                      <tr>
                        <td style={{
                          ...TD_STICKY, left: 44, width: 24, background: "#fffff0", color: "#666",
                          fontWeight: 700, fontSize: 10, verticalAlign: "middle",
                          borderLeft: "none", borderRight: "2px solid #e5c5c5", borderBottom: "2px solid #e0c0c0",
                        }}>C</td>
                        {days.map((d, di) => {
                          const iso = isoDate(d);
                          const isToday = iso === isoDate(new Date());
                          const val = cullsLog[iso]?.[s];
                          const isEditing = editCell?.date === iso && editCell?.shed === s && editCell?.type === "c";
                          const bg = isToday ? "#fffde0" : si % 2 === 0 ? "#fffff8" : "#fafaf0";
                          return (
                            <td key={di} style={{ ...TD, background: bg, borderBottom: "2px solid #e0c0c0" }}>
                              {isEditing ? (
                                <input type="number" inputMode="numeric" value={editVal} autoFocus
                                  onChange={e => setEditVal(e.target.value)}
                                  onBlur={() => saveCulls(iso, s, editVal)}
                                  onKeyDown={e => { if (e.key === "Enter") saveCulls(iso, s, editVal); if (e.key === "Escape") setEditCell(null); }}
                                  style={{ width: "100%", border: "2px solid #8b8b00", borderRadius: 2, padding: "4px 1px", textAlign: "center", fontSize: 12, outline: "none", background: "#fffff0", fontWeight: 700 }}
                                />
                              ) : (
                                <div onClick={() => { setEditCell({ date: iso, shed: s, type: "c" }); setEditVal(val !== undefined ? String(val) : ""); }}
                                  style={{ padding: "7px 3px", cursor: "pointer", minHeight: 28, textAlign: "center", color: val ? "#666" : "#ddd", fontWeight: val ? 700 : 400 }}>
                                  {val !== undefined ? val : "·"}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
    </div>
  );
}

export default function App() {
  const [sheets, setSheets] = useState<SheetParsed[]>([]);
  const [active, setActive] = useState(0);
  const [activeView, setActiveView] = useState<null | "summary" | "batchResults" | "morts">(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [edits, setEdits] = useState<Map<string, string>[]>(loadEditsFromStorage);
  const [autoSaved, setAutoSaved] = useState(false);
  const [batchKey, setBatchKey] = useState(0);
  const batchNumCacheRef = useRef(parseInt(localStorage.getItem("silo-batch-num") || "0", 10));
  const [farmConfig, setFarmConfig] = useState<FarmConfigData>(readFarmConfig);
  const workbookRef = useRef<XLSX.WorkBook | null>(null);
  const rawBufferRef = useRef<ArrayBuffer | null>(null);
  const seedDoneRef = useRef(false);
  const deliverySeedDoneRef = useRef(false);

  // Map shedNum → current placement count (live from shed sheet edits)
  const shedPlacement = useMemo<Map<number, number>>(() => {
    const map = new Map<number, number>();
    let sc = 0;
    for (let i = 0; i < sheets.length; i++) {
      const tab = sheets[i].name.trim().toUpperCase();
      if (tab === "WEEKLY STOCK TAKE" || tab === "CONSUMPTION GUIDE") continue;
      if (tab.includes("SHED")) {
        const gid = SHED_SHEET_ORDER[sc] ?? (sc + 1);
        const getV = (key: string) => {
          const e = edits[i];
          const v = e?.has(key) ? e.get(key)! : String(sheets[i].cells.get(key)?.value ?? "");
          return parseFloat(v.replace(/,/g, "")) || 0;
        };
        map.set(gid * 2 - 1, getV("3,2")); // odd shed (e.g., shed 1, 3, 5…)
        map.set(gid * 2,     getV("4,2")); // even shed (e.g., shed 2, 4, 6…)
        sc++;
      }
    }
    return map;
  }, [sheets, edits]);

  // Feed alert computation (recalculates whenever sheets/edits/farmConfig change)
  const feedAlerts = useMemo(() => computeFeedAlerts(sheets, edits, farmConfig), [sheets, edits, farmConfig]);

  // Initialize and sync theme with Silo Tracker
  useEffect(() => {
    const applyTheme = (t: string | null) => {
      document.documentElement.classList.toggle("dark", t === "dark");
    };
    applyTheme(localStorage.getItem("silo-theme"));
    const onThemeStorage = (e: StorageEvent) => {
      if (e.key === "silo-theme") applyTheme(e.newValue);
    };
    window.addEventListener("storage", onThemeStorage);
    return () => window.removeEventListener("storage", onThemeStorage);
  }, []);

  // Detect if a batch reset was triggered from Silo Tracker (cross-device sync)
  useEffect(() => {
    fetch(`${BASE}api/batch/version`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { version: string | null } | null) => {
        if (!data || !data.version) return;
        const stored = localStorage.getItem("silo-batch-version");
        if (stored !== null && stored !== data.version) {
          // A reset happened elsewhere — clear the Silo Tracker-originated batch data
          localStorage.removeItem("silo-batch-catches");
          localStorage.removeItem("silo-batch-farm-name");
          localStorage.removeItem("silo-morts-log");
          localStorage.removeItem("silo-culls-log");
          localStorage.setItem("silo-batch-new", "1");
        }
        if (stored !== data.version) {
          localStorage.setItem("silo-batch-version", data.version);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync farm config whenever Silo Tracker updates localStorage
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === FARM_CONFIG_KEY) setFarmConfig(readFarmConfig());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Auto-save edits to localStorage whenever they change
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (edits.length === 0) return;
    saveEditsToStorage(edits);
    setAutoSaved(true);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => setAutoSaved(false), 2000);
  }, [edits]);

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
        // Preserve any edits already loaded from localStorage; only expand the array if more sheets
        setEdits(prev => result.map((_, i) => prev[i] ?? new Map()));
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
  }, [sheets]);

  const resetForNewBatch = async () => {
    const currentBatch = batchNumCacheRef.current;
    const suggestedNext = currentBatch > 0 ? String(currentBatch + 1) : "";
    const batchInput = window.prompt(
      "Start New Batch?\n\nThis will clear ALL delivery and silo reading records and reset the spreadsheet.\n\nEnter the new batch number (or leave blank to skip numbering):",
      suggestedNext
    );
    if (batchInput === null) return; // user cancelled
    try {
      await fetch("/api/batch/reset", { method: "DELETE" });
      // Fetch and store the new batch version so Silo Tracker syncs on next load
      const vRes = await fetch(`${BASE}api/batch/version`);
      if (vRes.ok) {
        const vData = await vRes.json() as { version: string | null };
        if (vData.version) localStorage.setItem("silo-batch-version", vData.version);
      }
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

    // Clear Batch Results catch data so it resets cleanly
    // Flag prevents the seeding effect re-populating catches from the xlsx on remount
    localStorage.setItem("silo-batch-new", "1");
    localStorage.removeItem("silo-batch-catches");
    localStorage.removeItem("silo-batch-farm-name");
    // Clear per-shed morts & culls daily log
    localStorage.removeItem("silo-morts-log");
    localStorage.removeItem("silo-culls-log");
    localStorage.removeItem(EDITS_KEY);
    // Save the batch number the user typed (or clear if left blank)
    const nextBatch = parseInt(batchInput.trim(), 10);
    if (!isNaN(nextBatch) && nextBatch > 0) {
      localStorage.setItem("silo-batch-num", String(nextBatch));
      batchNumCacheRef.current = nextBatch;
    } else {
      localStorage.removeItem("silo-batch-num");
      batchNumCacheRef.current = 0;
    }
    setBatchKey(k => k + 1);
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
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-zinc-900">
      {/* Header */}
      <div className="bg-[#1a5c36] text-white px-4 py-2 flex items-center gap-3 shadow-md shrink-0">
        <span className="text-lg font-bold tracking-wide">{farmConfig.farmName ?? "Double B Farm"} — Feed Program</span>
        <div className="ml-auto flex items-center gap-2">
          {autoSaved && (
            <span className="text-green-300 text-xs font-semibold transition-opacity duration-500">✓ Saved</span>
          )}
          <button
            onClick={resetForNewBatch}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-semibold bg-white/10 hover:bg-white/20 transition-colors text-white border border-white/30"
            title="Clear all data and start a new batch"
          >
            ↺ New Batch
          </button>
          <button
            onClick={downloadFile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-semibold transition-colors bg-[#2d8653] hover:bg-[#1a5c36] text-white"
          >
            ⬇ Download
          </button>
          <button
            onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
              } else {
                document.exitFullscreen();
              }
            }}
            className="flex items-center justify-center w-8 h-8 rounded bg-white/10 hover:bg-white/20 transition-colors text-white border border-white/30"
            title="Toggle fullscreen"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M3 3h5v2H5v3H3V3zm9 0h5v5h-2V5h-3V3zM3 12h2v3h3v2H3v-5zm12 3h-3v2h5v-5h-2v3z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Hint bar */}
      <div className="bg-[#e8f5ee] dark:bg-zinc-800 border-b border-green-200 dark:border-zinc-700 px-4 py-1 text-xs text-green-800 dark:text-green-300 shrink-0">
        Double-click any cell to edit. Press <kbd className="bg-white dark:bg-zinc-700 border border-green-300 dark:border-zinc-600 rounded px-1">Enter</kbd> or click away to confirm.
      </div>

      {/* Sheet tabs */}
      <div className="flex items-end gap-0.5 px-3 pt-2 bg-gray-200 dark:bg-zinc-800 overflow-x-auto shrink-0">
        {/* Summary tab */}
        <button
          onClick={() => setActiveView("summary")}
          className="px-3 py-1.5 text-xs font-semibold rounded-t border border-b-0 whitespace-nowrap transition-all"
          style={{
            backgroundColor: activeView === "summary" ? "#1a5c36" : "#1a5c3688",
            color: "#fff",
            borderColor: "#1a5c36",
            opacity: activeView === "summary" ? 1 : 0.72,
            transform: activeView === "summary" ? "translateY(1px)" : "translateY(3px)",
            marginRight: 4,
          }}
        >
          ☰ Summary
        </button>
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
          const bg = "#C9A227";
          const fg = contrastColor(bg);
          const hasEdits = edits[i]?.size > 0;
          const tabAlert = feedAlerts.find(a => a.sheetIdx === i);
          const alertDotColor = tabAlert?.urgency === "critical" ? "#c0392b" : tabAlert?.urgency === "warning" ? "#e67e22" : tabAlert ? "#f39c12" : null;
          return (
            <button
              key={i}
              onClick={() => { setActive(i); setActiveView(null); }}
              className="px-3 py-1.5 text-xs font-semibold rounded-t border border-b-0 whitespace-nowrap transition-all"
              style={{
                backgroundColor: isActive ? bg : `${bg}aa`,
                color: isActive ? fg : fg,
                borderColor: alertDotColor ?? bg,
                borderWidth: alertDotColor ? 2 : 1,
                opacity: isActive ? 1 : 0.72,
                transform: isActive ? "translateY(1px)" : "translateY(3px)",
              }}
            >
              {alertDotColor && <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: alertDotColor, marginRight: 5, verticalAlign: "middle", animation: tabAlert?.urgency === "critical" ? "pulse 1.2s infinite" : "none" }} />}
              {s.name}{hasEdits ? " •" : ""}
            </button>
          );
        });
        })()}
        {/* Batch Results tab — sits after end of batch */}
        <button
          onClick={() => setActiveView("batchResults")}
          className="px-3 py-1.5 text-xs font-semibold rounded-t border border-b-0 whitespace-nowrap transition-all"
          style={{
            backgroundColor: activeView === "batchResults" ? "#1a5c36" : "#1a5c3688",
            color: "#fff",
            borderColor: "#1a5c36",
            opacity: activeView === "batchResults" ? 1 : 0.72,
            transform: activeView === "batchResults" ? "translateY(1px)" : "translateY(3px)",
            marginLeft: 4,
          }}
        >
          📊 Batch Results
        </button>
        {/* Morts tab */}
        <button
          onClick={() => setActiveView("morts")}
          className="px-3 py-1.5 text-xs font-semibold rounded-t border border-b-0 whitespace-nowrap transition-all"
          style={{
            backgroundColor: activeView === "morts" ? "#8b1a1a" : "#8b1a1a88",
            color: "#fff",
            borderColor: "#8b1a1a",
            opacity: activeView === "morts" ? 1 : 0.72,
            transform: activeView === "morts" ? "translateY(1px)" : "translateY(3px)",
            marginLeft: 4,
          }}
        >
          💀 Morts
        </button>
      </div>

      {/* Feed Alert Banner */}
      <FeedAlertBanner
        alerts={feedAlerts}
        onGoToShed={(sheetIdx) => { setActive(sheetIdx); setActiveView(null); }}
      />

      {/* Spreadsheet / Summary */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-zinc-900 border-t-2 border-[#217346]">
        {activeView === "summary" ? (
          <div className="flex-1 overflow-auto">
            <SummaryView sheets={sheets} edits={edits} handleEdit={handleEdit} farmConfig={farmConfig} />
          </div>
        ) : activeView === "morts" ? (
          <div className="flex-1 overflow-auto">
            <MortsView key={batchKey} sheets={sheets} edits={edits} handleEdit={handleEdit} farmConfig={farmConfig} />
          </div>
        ) : activeView === "batchResults" ? (
          <div className="flex-1 overflow-auto">
            <BatchResultsView
              key={batchKey}
              sheets={sheets}
              edits={edits}
              farmConfig={farmConfig}
              shedPlacement={shedPlacement}
              onBatchNum={(n) => { batchNumCacheRef.current = n; }}
              onEobCatch={(shedNum, totalCaught) => {
                const eobIdx = sheets.findIndex(s => s.name.trim().toLowerCase() === "end of batch");
                if (eobIdx < 0) return;
                // EOB row for shed N is (N + 3) 0-indexed; col 23 = "birds catched"
                handleEdit(eobIdx, `${shedNum + 3},23`, String(totalCaught));
              }}
            />
          </div>
        ) : current && (() => {
          const tabName = current.name.trim().toUpperCase();
          const isShed = tabName.includes("SHED");
          const isEob  = tabName === "END OF BATCH";
          const activeEdits = edits[active] ?? new Map();
          return (
            <>
              {isShed && <ShedInfoPanel sheet={current} edits={activeEdits} />}
              {isEob  && <EobInfoPanel sheet={current} edits={activeEdits} farmName={farmConfig.farmName ?? "Farm"} />}
              <div className="flex-1 overflow-auto">
                <SheetView
                  sheet={current}
                  sheetIdx={active}
                  edits={activeEdits}
                  onEdit={(key, val) => handleEdit(active, key, val)}
                  editingCell={editingCell}
                  setEditingCell={setEditingCell}
                  startRow={isEob ? 3 : isShed ? 7 : undefined}
                  isShedSheet={isShed}
                  isEobSheet={isEob}
                />
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
