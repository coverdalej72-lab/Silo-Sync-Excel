import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend, Scatter, ScatterChart,
} from "recharts";
import JSZip from "jszip";
import {
  parseXlsxBuffer,
  encodeCell,
  decodeRange,
  type WorkBook,
  type WorkSheet,
  type CellObject,
} from "./lib/xlsxParser";
import { EndOfBatchContent } from "./components/EndOfBatchContent";
import EggProductionView from "./components/EggProductionView";
import BodyWeightView from "./components/BodyWeightView";
import { LANGUAGES, createTranslator, LanguageContext, useT } from "./lib/i18n";

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
interface FarmConfigData { farmName?: string; shedGroups?: FarmShedConfig[]; showExtraShedCols?: boolean; theme?: string; processor?: "baiada" | "ingham"; farmType?: "broiler" | "breeder"; language?: string }

interface AppTheme { id: string; name: string; primary: string; mid: string; pale: string; border: string; soft: string; dim: string }
const APP_THEMES: AppTheme[] = [
  { id: "forest",  name: "Forest",  primary: "#1a5c36", mid: "#217346", pale: "#e8f5ee", border: "#c8e6d4", soft: "#f0f7f3", dim: "#1a5c3688" },
  { id: "ocean",   name: "Ocean",   primary: "#1a3d7a", mid: "#1e5fa6", pale: "#e8f0fa", border: "#b0cef0", soft: "#f0f4fa", dim: "#1a3d7a88" },
  { id: "sunset",  name: "Sunset",  primary: "#7a3010", mid: "#a84520", pale: "#fdf0e8", border: "#f0c8a8", soft: "#fdf5f0", dim: "#7a301088" },
  { id: "plum",    name: "Plum",    primary: "#4e1a6e", mid: "#6b2d9e", pale: "#f2e8fa", border: "#d0a8f0", soft: "#f6f0fa", dim: "#4e1a6e88" },
  { id: "night",   name: "Night",   primary: "#1c2340", mid: "#2e3d6e", pale: "#e8eaf5", border: "#b0b8d8", soft: "#f0f1f8", dim: "#1c234088" },
];
function getTheme(id?: string): AppTheme { return APP_THEMES.find(t => t.id === id) ?? APP_THEMES[0]; }
function applyTheme(t: AppTheme) {
  const r = document.documentElement;
  r.style.setProperty("--pm-primary", t.primary);
  r.style.setProperty("--pm-primary-mid", t.mid);
  r.style.setProperty("--pm-primary-pale", t.pale);
  r.style.setProperty("--pm-primary-border", t.border);
  r.style.setProperty("--pm-primary-soft", t.soft);
  r.style.setProperty("--pm-primary-dim", t.dim);
}
// Apply theme immediately (before first render) so CSS vars are ready
applyTheme(getTheme(readFarmConfig().theme));

function readFarmConfig(): FarmConfigData {
  try {
    const raw = localStorage.getItem(FARM_CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveFarmConfig(cfg: FarmConfigData) {
  localStorage.setItem(FARM_CONFIG_KEY, JSON.stringify(cfg));
  window.dispatchEvent(new StorageEvent("storage", { key: FARM_CONFIG_KEY }));
}

const BATCH_HISTORY_KEY    = "feedmate-batch-history";
const EDITS_AUTOSAVE_KEY   = "feedmate-edits-autosave";

function serializeEdits(edits: Map<string, string>[]): string {
  return JSON.stringify(edits.map(m => [...m.entries()]));
}
function deserializeEdits(json: string): Map<string, string>[] {
  const arr = JSON.parse(json) as [string, string][][];
  return arr.map(pairs => new Map(pairs));
}
const FLOCK_WEIGHIN_KEY   = "feedmate-flock-weighins";
const FLOCK_BREEDS_KEY    = "feedmate-flock-breeds";
interface BatchHistoryEntry {
  batchNum: number;
  date: string;
  totalBirds: number;
  totalFeedKg: number;
  fcr: number | null;
  cfcr: number | null;
  cage: number | null;
  mortalityPct: number | null;
  aveWeight: number | null;
}
function readBatchHistory(): BatchHistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(BATCH_HISTORY_KEY) ?? "[]"); } catch { return []; }
}

// Maps shed sheet index (0-based, counting only SHED sheets) → shedGroupId (1–12)
const SHED_SHEET_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// Cobb 500 grams per bird per day (day 1 → day 54)
const COBB500_GRAMS = [22,24,26,28,30,32,34,36,40,45,50,55,60,65,74,75,80,87,93,97,103,107,113,118,122,128,134,139,140,142,149,153,158,163,165,168,171,174,176,178,180,181,188,190,192,193,194,195,196,197,197,197,198,197];

// Cobb 500 average live weight per bird (kg) at each day (day 1 → day 56)
const COBB_WEIGHT_KG = [0.042,0.055,0.071,0.090,0.112,0.138,0.169,0.205,0.246,0.293,0.346,0.406,0.472,0.545,0.626,0.714,0.810,0.914,1.026,1.145,1.272,1.405,1.546,1.693,1.846,2.005,2.170,2.339,2.513,2.691,2.872,3.056,3.242,3.430,3.618,3.807,3.996,4.184,4.371,4.556,4.739,4.920,5.098,5.272,5.443,5.609,5.770,5.926,6.076,6.220,6.358,6.489,6.613,6.730,6.840,6.942];

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

// Build the initial edits map for a shed sheet by seeding values from the
// spreadsheet template that should be treated as app-level edits:
//   • Feed Alloc (COL_G) — cascaded from the allocation header row
//   • Feed Ordered (COL_E) — preserved so deliveries in old spreadsheets survive
//   • Silo A/B/C (COL_K/L/M) — preserved so silo readings in old spreadsheets survive
// After seeding, the FOH cascade is run so Feed On Hand reflects all of these.
function buildInitialEditsForSheet(sheet: SheetParsed): Map<string, string> {
  const m = new Map<string, string>();
  const isShed = sheet.name.toUpperCase().includes("SHED") &&
                 !sheet.name.toUpperCase().includes("WEEKLY");
  if (!isShed) return m;

  const getCellNum = (r: number, c: number): number =>
    parseFloat(sheet.cells.get(`${r},${c}`)?.value ?? "0") || 0;
  const getCellStr = (r: number, c: number): string =>
    sheet.cells.get(`${r},${c}`)?.value ?? "";

  // Seed Feed Alloc cascade (COL_G)
  let gPrev = getCellNum(11, COL_G);
  for (let r = 12; r <= 71; r++) {
    const h = getCellNum(r, COL_H);
    const g = gPrev - h;
    m.set(`${r},${COL_G}`, String(Math.round(g * 100) / 100));
    gPrev = g;
  }

  // Seed Feed Ordered (COL_E) and Silo readings (COL_K/L/M) from the spreadsheet
  // template so that values from an imported old spreadsheet are preserved and
  // picked up by the FOH cascade (which only reads from edits, not template cells).
  let minSeedRow = sheet.maxRow + 1;
  for (let r = 12; r <= 71; r++) {
    const e = getCellStr(r, COL_E);
    const k = getCellStr(r, COL_K);
    const l = getCellStr(r, COL_L);
    const mv = getCellStr(r, COL_M);
    if (e !== "" && parseFloat(e) !== 0) {
      m.set(`${r},${COL_E}`, e);
      if (r < minSeedRow) minSeedRow = r;
    }
    if (k !== "" && parseFloat(k) !== 0) {
      m.set(`${r},${COL_K}`, k);
      if (r < minSeedRow) minSeedRow = r;
    }
    if (l !== "" && parseFloat(l) !== 0) {
      m.set(`${r},${COL_L}`, l);
      if (r < minSeedRow) minSeedRow = r;
    }
    if (mv !== "" && parseFloat(mv) !== 0) {
      m.set(`${r},${COL_M}`, mv);
      if (r < minSeedRow) minSeedRow = r;
    }
    // Col F (5) is the silo letter column — valid values are A/B/C only.
    // Spreadsheets often have formula artefacts here that resolve to numbers.
    // Suppress those so only actual letters show through on shed data rows.
    const fLetter = getCellStr(r, 5);
    if (fLetter !== "" && !isNaN(parseFloat(fLetter))) {
      m.set(`${r},5`, "");
    }
  }

  // Always seed Feed On Hand (COL_I) from the template into the edits map,
  // rounded to 2 decimal places. This prevents raw Excel floating-point values
  // (e.g. 24901.399999999998) from leaking into the display when no silo
  // readings have been entered to trigger the cascade.
  // If silo readings DO exist, the cascade below will overwrite these with
  // freshly computed values.
  for (let r = 12; r <= 71; r++) {
    const fohStr = getCellStr(r, COL_I);
    const foh = parseFloat(fohStr);
    if (fohStr !== "" && !isNaN(foh)) {
      m.set(`${r},${COL_I}`, String(Math.round(foh * 100) / 100));
    }
  }

  // Run the FOH cascade from the earliest seeded row so Feed On Hand is correct
  if (minSeedRow <= sheet.maxRow) {
    return recalculate(sheet.cells, m, minSeedRow, COL_K, sheet.maxRow);
  }

  return m;
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

  // Only cascade for silo columns (K,L,M), delivery (E), feed usage (H), or silo total (J)
  if (![COL_K, COL_L, COL_M, COL_E, COL_H, COL_J].includes(triggeredCol)) return newEdits;

  // Cascade G (FEED ALLOC remaining) down when FEED USAGE (H) is edited
  // G(row) = G(row-1) - H(row) — counts down remaining allocation each day
  if (triggeredCol === COL_H) {
    for (let r = triggeredRow; r <= maxRow; r++) {
      const gPrev = getNum(r - 1, COL_G);
      const h = getNum(r, COL_H);
      setNum(r, COL_G, gPrev - h);
    }
  }

  // Cascade J (SILO TOTAL) and I (FEED ON HAND) from triggeredRow down
  for (let r = triggeredRow; r <= maxRow; r++) {
    // Silo columns: only use app-entered edits, not template values from the spreadsheet.
    // Template silo cells may contain leftover readings from a previous batch and would
    // incorrectly reset FOH on those dates.
    const getEditOnly = (row: number, col: number): number => {
      const ev = newEdits.get(`${row},${col}`);
      return ev !== undefined ? (parseFloat(ev) || 0) : 0;
    };
    const k = getEditOnly(r, COL_K);
    const l = getEditOnly(r, COL_L);
    const m = getEditOnly(r, COL_M);
    const j = k + l + m;
    // Only set J if at least one silo column exists on this row
    if (cells.has(`${r},${COL_K}`) || cells.has(`${r},${COL_L}`) || cells.has(`${r},${COL_M}`) || cells.has(`${r},${COL_J}`)) {
      setNum(r, COL_J, j);
      const h = getNum(r, COL_H);
      // Feed Ordered (col E): only use app-entered edits, not template spreadsheet values.
      // Template values in this column can contain delivery data from a previous batch
      // and would artificially inflate FOH even when no delivery has been recorded.
      const e = getEditOnly(r, COL_E);
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
  ws: WorkSheet,
  name: string,
  rawName: string,
  tabArgb: string | undefined,
  richStyles: Record<string, RichStyle> | undefined
): SheetParsed {
  const ref = ws["!ref"];
  if (!ref) {
    return { name, rawName, tabColor: tabArgb, cells: new Map(), minRow: 0, maxRow: 0, minCol: 0, maxCol: 0, colWidths: [], rowHeights: [], merges: [] };
  }
  const range = decodeRange(ref);
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
      const addr = encodeCell({ r, c });
      const cell: CellObject | undefined = ws[addr] as CellObject | undefined;
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
    <div style={{ background: "linear-gradient(135deg, var(--pm-primary) 0%, var(--pm-primary-mid) 100%)", color: "#fff", padding: "14px 20px 12px", borderBottom: "3px solid #C9A227", fontFamily: "Inter,'Segoe UI',sans-serif" }}>
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
    <div style={{ background: "linear-gradient(135deg, var(--pm-primary) 0%, var(--pm-primary-mid) 100%)", color: "#fff", padding: "14px 20px 12px", borderBottom: "3px solid #C9A227", fontFamily: "Inter,'Segoe UI',sans-serif" }}>
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
  mortsLog,
  cullsLog,
  showExtraShedCols,
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
  mortsLog?: MortsLog;
  cullsLog?: MortsLog;
  showExtraShedCols?: boolean;
}) {
  const { cells, minRow, maxRow, minCol, maxCol, colWidths, rowHeights } = sheet;
  const effectiveStart = startRow ?? minRow;
  const inputRef = useRef<HTMLInputElement>(null);
  const navigatingRef = useRef(false);

  // Trim empty trailing columns — only consider visible rows (r >= effectiveStart)
  const displayMaxCol = useMemo(() => {
    // When extra shed columns are hidden, stop rendering after BIRDS LEFT (col 14)
    if (isShedSheet && !showExtraShedCols) return 14;
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
  }, [cells, edits, effectiveStart, minCol, maxCol, isShedSheet, showExtraShedCols]);

  // Compute cumulative birds remaining per shed data row (col 14 = BIRDS LEFT)
  // Accounts for: col 13 (CATCH/MORTS manual entries) + Morts tab log + Culls tab log
  const birdsLeftByRow = useMemo(() => {
    if (!isShedSheet) return new Map<number, number>();
    const getNum = (r: number, c: number): number => {
      const key = `${r},${c}`;
      const raw = edits.has(key) ? edits.get(key)! : (cells.get(key)?.value ?? "");
      return parseFloat(String(raw).replace(/,/g, "")) || 0;
    };
    // Total birds: try r=1,c=2 first; fall back to shed1 + shed2
    let total = getNum(1, 2);
    if (!total) total = getNum(3, 2) + getNum(4, 2);
    if (!total) return new Map<number, number>();

    // Parse shed numbers from the sheet name e.g. "SHED 1 & 2" → [1, 2]
    const shedNums: number[] = [];
    const shedMatch = sheet.rawName.match(/(\d+)\s*&\s*(\d+)/);
    if (shedMatch) { shedNums.push(parseInt(shedMatch[1]), parseInt(shedMatch[2])); }

    // Placement date from cell r=2,c=2 (C2)
    let placementDate: Date | null = null;
    const pdRaw = edits.has("2,2") ? edits.get("2,2")! : (cells.get("2,2")?.value ?? "");
    if (pdRaw) {
      const parsed = new Date(pdRaw);
      if (!isNaN(parsed.getTime())) placementDate = parsed;
    }

    // Dynamically find where Day 1 (AGE=1) is — same logic as shedDataStartRow
    let dataStart = 12;
    for (let r = 9; r <= 16; r++) {
      const v0 = String(cells.get(`${r},0`)?.value ?? "").trim();
      const v1 = String(cells.get(`${r},1`)?.value ?? "").trim();
      if (v0 === "1" || v1 === "1") { dataStart = r; break; }
    }

    const map = new Map<number, number>();
    let cumDeductions = 0;
    for (let r = dataStart; r < dataStart + 60; r++) {
      // Manual catch/morts entered directly on the shed tab
      cumDeductions += getNum(r, 13);

      // Morts tab log: sum morts + culls for this day's date across the shed's numbers
      if (placementDate && shedNums.length > 0 && (mortsLog || cullsLog)) {
        const dayNum = r - (dataStart - 1); // row dataStart = day 1
        const rowDate = new Date(placementDate);
        rowDate.setDate(placementDate.getDate() + dayNum - 1);
        const iso = rowDate.toISOString().slice(0, 10);
        for (const sn of shedNums) {
          cumDeductions += (mortsLog?.[iso]?.[sn] ?? 0);
          cumDeductions += (cullsLog?.[iso]?.[sn] ?? 0);
        }
      }

      map.set(r, total - cumDeductions);
    }
    return map;
  }, [isShedSheet, cells, edits, sheet.rawName, mortsLog, cullsLog]);

  useEffect(() => {
    if (editingCell && inputRef.current) inputRef.current.focus();
  }, [editingCell]);

  const commitEdit = (r: number, c: number, val: string) => {
    onEdit(`${r},${c}`, val);
    setEditingCell(null);
  };

  // Dynamically detect where Day 1 (AGE=1) starts — handles imported files with
  // different header row counts vs the built-in template (which uses r=12)
  const shedDataStartRow = useMemo(() => {
    if (!isShedSheet) return 12;
    // Scan columns 0 and 1 for the first cell with value "1" after header rows (r>8)
    for (let r = 9; r <= 16; r++) {
      const v0 = String(cells.get(`${r},0`)?.value ?? "").trim();
      const v1 = String(cells.get(`${r},1`)?.value ?? "").trim();
      if (v0 === "1" || v1 === "1") return r;
    }
    return 12; // fallback
  }, [isShedSheet, cells]);

  // Compute worst FOH status across all data rows — used to colour the FEED ON HAND column header
  const worstFohStatus = useMemo<'critical' | 'warning' | 'caution' | null>(() => {
    if (!isShedSheet) return null;
    let dataStart = 12;
    for (let r = 9; r <= 16; r++) {
      const v0 = String(cells.get(`${r},0`)?.value ?? "").trim();
      const v1 = String(cells.get(`${r},1`)?.value ?? "").trim();
      if (v0 === "1" || v1 === "1") { dataStart = r; break; }
    }
    let worst: 'critical' | 'warning' | 'caution' | null = null;
    for (let r = dataStart; r < dataStart + 60; r++) {
      const fohRaw = edits.has(`${r},8`) ? edits.get(`${r},8`)! : String(cells.get(`${r},8`)?.value ?? "");
      const foh = parseFloat(fohRaw.replace(/,/g, ""));
      if (isNaN(foh) || !isFinite(foh)) continue;
      if (foh <= 0) return 'critical';
      const usageRaw = edits.has(`${r},7`) ? edits.get(`${r},7`)! : String(cells.get(`${r},7`)?.value ?? "");
      const usage = parseFloat(usageRaw.replace(/,/g, "")) || 0;
      if (usage > 0 && foh <= usage * 2) worst = 'warning';
      else if (usage > 0 && foh <= usage * 4 && worst !== 'warning') worst = 'caution';
    }
    return worst;
  }, [isShedSheet, cells, edits]);

  // Pre-compute header row heights for sticky offsets
  const row7Height  = isShedSheet ? Math.max(rowHeights[7]  ?? 20, 26) : 0;
  // EOB header row 3 is sticky at top=0

  return (
    <table style={{ borderCollapse: "collapse", fontFamily: "Calibri,'Segoe UI',sans-serif", tableLayout: "fixed", width: "100%", minWidth: "max-content" }}>
      <colgroup>
        {Array.from({ length: displayMaxCol - minCol + 1 }, (_, i) => {
          const c = minCol + i;
          if (isShedSheet && c === 3) return null;
          // DATE column (c=2) on shed sheets: no fixed width so it absorbs leftover space
          const colW = (isShedSheet && c === 2) ? undefined : (colWidths[c] ?? 80);
          return <col key={c} style={{ width: colW, minWidth: c === 2 ? 80 : 24 }} />;
        })}
      </colgroup>
      <tbody>
        {Array.from({ length: maxRow - effectiveStart + 1 }, (_, ri) => {
          const r = effectiveStart + ri;

          // Determine row-level background
          const isShedHeader  = isShedSheet && (r === 7 || r === 8);
          const isShedSpacer  = isShedSheet && r >= 9 && r < shedDataStartRow; // dynamic spacer rows
          if (isShedSpacer) return null;

          const rowH = isShedSheet && (r === 7 || r === 8) ? Math.max(rowHeights[r] ?? 20, 26) : (rowHeights[r] ?? 20);
          const isShedTotals  = isShedSheet && r === shedDataStartRow - 1;
          const isShedData    = isShedSheet && r >= shedDataStartRow && r < shedDataStartRow + 60;
          const isShedSummary = isShedSheet && r >= shedDataStartRow + 60;
          const isEobHeader   = isEobSheet  && r === 3;
          const isAnyHeader   = isShedHeader || isEobHeader;
          const rowBg = isAnyHeader
            ? "var(--pm-primary)"
            : isShedSpacer
            ? "#ffffff"
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
                if (isShedSheet && c === 3) return null;
                const info = cells.get(`${r},${c}`);
                if (!info) return <td key={c} style={{ height: rowH, background: isAnyHeader ? "var(--pm-primary)" : isShedSpacer ? "#ffffff" : (rowBg ?? "#fff"), border: isAnyHeader ? "1px solid rgba(255,255,255,0.15)" : isShedSpacer ? "1px solid #fff" : "1px solid #000", position: isAnyHeader ? "sticky" : undefined, top: isAnyHeader ? (isShedHeader ? (r === 7 ? 0 : row7Height) : eobStickyTop) : undefined, zIndex: isAnyHeader ? 3 : undefined }} />;
                if (info.hidden) return null;
                const key = `${r},${c}`;
                const isEditing = editingCell?.r === r && editingCell?.c === c && editingCell?.sheetIdx === sheetIdx;
                const rawVal = edits.has(key) ? edits.get(key)! : info.value;
                // Hide template date values sitting in header rows (e.g. "Monday 16 July 2018")
                // Show "—" placeholder for empty CATCH/MORTS (col 13); compute BIRDS LEFT (col 14)
                const isCatchOrBirds = isShedData && (c === 13 || c === 14);
                const birdsLeft = (isShedData && c === 14 && birdsLeftByRow.has(r))
                  ? birdsLeftByRow.get(r)!
                  : null;
                const fmtNum = (v: string) => {
                  const n = parseFloat(String(v).replace(/,/g, ""));
                  return isNaN(n) ? v : Math.round(n).toLocaleString();
                };
                const isNumericShedCol = isShedData && (
                  c === COL_G || c === COL_H || c === COL_I ||
                  c === COL_J || c === COL_K || c === COL_L || c === COL_M ||
                  c === 13 || c === 14
                );
                const displayVal = (isAnyHeader && info.isDateCell) ? ""
                  : (isShedData && c === 14 && birdsLeft !== null)
                    ? birdsLeft.toLocaleString()
                  : (isShedData && c === 13 && (rawVal === "" || rawVal === "0")) ? "—"
                  : (isNumericShedCol && rawVal !== "") ? fmtNum(rawVal)
                  : rawVal;
                const fs = isShedHeader ? (info.fontSize ?? 11) : (info.fontSize ?? 11);

                // Column I (index 8) = FEED ON HAND — 3-tier colour alert
                const numVal = parseFloat(String(displayVal).replace(/,/g, ""));
                const fohStatus: 'critical' | 'warning' | 'caution' | 'good' | null = (() => {
                  if (c !== 8 || isAnyHeader || !isShedData || isNaN(numVal) || !isFinite(numVal)) return null;
                  if (numVal <= 0) return 'critical';
                  const usageRaw = edits.has(`${r},7`) ? edits.get(`${r},7`)! : (cells.get(`${r},7`)?.value ?? "");
                  const usage = parseFloat(String(usageRaw).replace(/,/g, "")) || 0;
                  if (usage > 0 && numVal <= usage * 2) return 'warning';
                  if (usage > 0 && numVal <= usage * 4) return 'caution';
                  return 'good';
                })();
                const isFeedRunOut = fohStatus === 'critical';

                // Columns E & F (FEED ORDERED / SILO) — strip XLSX yellow highlight
                // Header rows override everything; otherwise strip E/F yellow
                // Col 13 (CATCH/MORTS) & col 14 (BIRDS LEFT) — apply light blue bg on shed data rows
                let cellBg: string | null;
                if (isAnyHeader) {
                  cellBg = "var(--pm-primary)";
                } else if (fohStatus === 'critical') {
                  cellBg = "#fecaca";
                } else if (fohStatus === 'warning') {
                  cellBg = "#fed7aa";
                } else if (fohStatus === 'caution') {
                  cellBg = "#fef9c3";
                } else if (fohStatus === 'good') {
                  cellBg = "#dcfce7";
                } else if (c === COL_E || c === 5) {
                  cellBg = null;
                } else if (isShedSheet && isShedData && c === 13) {
                  cellBg = "#fff";
                } else if (isShedSheet && isShedData && c === 14) {
                  cellBg = info.bgColor ?? "#DBEEF4";
                } else {
                  cellBg = info.bgColor ?? null;
                }

                // If a cell's font colour is white but the background is white/light,
                // the text is invisible — clamp it to black.
                const safeFontColor = (fc: string | undefined): string => {
                  if (!fc) return "#000";
                  const fcl = fc.toLowerCase().replace(/\s/g, "");
                  return (fcl === "#ffffff" || fcl === "#fff" || fcl === "white") ? "#000" : fc;
                };
                const cellTextColor = isAnyHeader
                  ? (info.bold ? "#C9A227" : "rgba(255,255,255,0.92)")
                  : fohStatus === 'critical'
                  ? "#991b1b"
                  : fohStatus === 'warning'
                  ? "#92400e"
                  : fohStatus === 'caution'
                  ? "#854d0e"
                  : fohStatus === 'good'
                  ? "#166534"
                  : (isShedSheet && isShedData && c === 13)
                  ? "#000"
                  : safeFontColor(info.fontColor);

                const borderStyle = isAnyHeader
                  ? "1px solid rgba(255,255,255,0.15)"
                  : "1px solid #000";

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
                    title={fohStatus === 'critical' ? "🔴 FEED RUN OUT — order immediately!" : fohStatus === 'warning' ? "🟠 FEED LOW — less than 2 days remaining" : fohStatus === 'caution' ? "🟡 FEED GETTING LOW — less than 4 days remaining" : "Double-click to edit"}
                    style={{
                      background: cellBg ?? (rowBg ?? "#fff"),
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
                      outline: isEditing ? "2px solid var(--pm-primary)" : "none",
                      letterSpacing: isAnyHeader ? 0.3 : 0,
                      position: isAnyHeader ? "sticky" : undefined,
                      top: stickyTop,
                      zIndex: isAnyHeader ? 3 : undefined,
                    }}
                  >
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        defaultValue={isCatchOrBirds && displayVal === "—" ? "" : displayVal}
                        onBlur={(e) => {
                          if (navigatingRef.current) { navigatingRef.current = false; return; }
                          commitEdit(r, c, e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") { setEditingCell(null); return; }
                          const val = (e.target as HTMLInputElement).value;
                          const navigate = (newR: number, newC: number) => {
                            e.preventDefault();
                            navigatingRef.current = true;
                            onEdit(`${r},${c}`, val);
                            let nc = newC;
                            if (isShedSheet && nc === 3) nc += (newC > c ? 1 : -1);
                            setEditingCell({ r: newR, c: Math.max(minCol, Math.min(nc, displayMaxCol)), sheetIdx });
                          };
                          if (e.key === "Enter" || e.key === "ArrowDown") {
                            navigate(r + 1, c);
                          } else if (e.key === "ArrowUp") {
                            navigate(r - 1, c);
                          } else if (e.key === "Tab") {
                            navigate(r, e.shiftKey ? c - 1 : c + 1);
                          }
                        }}
                        style={{
                          width: "100%", height: "100%", border: "none", outline: "none",
                          background: cellBg ?? "#fff", color: safeFontColor(info.fontColor),
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
  const t = useT();
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
          style={{ flex: 1, border: "2px solid var(--pm-primary)", borderRadius: 4, padding: "3px 7px", fontSize: 13, outline: "none", minWidth: 0 }}
        />
      ) : (
        <div
          onClick={() => { setDraft(value); setEditing(true); }}
          style={{ flex: 1, background: "#f5f5f5", borderRadius: 4, padding: "3px 7px", fontSize: 13, cursor: "pointer", minHeight: 22, color: value ? "#000" : "#aaa", minWidth: 0 }}
        >
          {value || t("tapToEdit")}
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

    const maxRow = sheets[i].maxRow;

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

function fmtAllocValue(raw: string): string {
  if (!raw) return raw;
  const stripped = raw.replace(/,/g, "");
  const n = parseFloat(stripped);
  if (isNaN(n)) return raw;
  // Round to 2 dp to eliminate floating-point artefacts (e.g. 163516.19999999998)
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function ShedSummaryCard({
  sheetIdx, sheet, edits, onEdit, getCell, eobSheetIdx, shed1Num, shed2Num,
}: {
  sheetIdx: number; sheet: SheetParsed; edits: Map<string, string>;
  onEdit: (si: number, key: string, val: string) => void;
  getCell: (si: number, r: number, c: number) => string;
  eobSheetIdx: number; shed1Num: number; shed2Num: number;
}) {
  const t = useT();
  if (!sheet) return null;
  const shedNum   = getCell(sheetIdx, 0, 6);
  const placement = getCell(sheetIdx, 2, 2);
  const shed1Name = getCell(sheetIdx, 3, 1) || "Shed 1";
  const shed2Name = getCell(sheetIdx, 4, 1) || "Shed 2";
  const shed1Birds = getCell(sheetIdx, 3, 2);
  const shed2Birds = getCell(sheetIdx, 4, 2);
  const strAlloc  = fmtAllocValue(getCell(sheetIdx, 1, 7));
  const gwrAlloc  = fmtAllocValue(getCell(sheetIdx, 2, 7));
  const finAlloc  = fmtAllocValue(getCell(sheetIdx, 3, 7));
  const wdwAlloc  = fmtAllocValue(getCell(sheetIdx, 4, 7));

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
      <div style={{ background: "linear-gradient(135deg, var(--pm-primary) 0%, var(--pm-primary-mid) 100%)", color: "#fff", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ background: "#C9A227", color: "#000", borderRadius: 5, padding: "2px 10px", fontWeight: 800, fontSize: 14, whiteSpace: "nowrap" }}>SHED {shedNum}</div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.1 }}>{totalBirds > 0 ? totalBirds.toLocaleString() : "—"}</div>
          <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 1 }}>{t("totalBirds")}</div>
        </div>
      </div>
      <div style={{ padding: "12px 14px" }}>
        <SummaryInputField label={t("placement")} value={placement} onSave={v => onEdit(sheetIdx, "2,2", v)} />
        <div style={{ height: 1, background: "#eee", margin: "8px 0" }} />
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#888", marginBottom: 5 }}>{t("birdsPerShed")}</div>
        <SummaryInputField label={shed1Name} value={shed1Birds} onSave={v => {
          onEdit(sheetIdx, "3,2", v);
          if (eobSheetIdx >= 0) onEdit(eobSheetIdx, `${shed1Num + 3},22`, v);
        }} />
        <SummaryInputField label={shed2Name} value={shed2Birds} onSave={v => {
          onEdit(sheetIdx, "4,2", v);
          if (eobSheetIdx >= 0) onEdit(eobSheetIdx, `${shed2Num + 3},22`, v);
        }} />
        <div style={{ height: 1, background: "#eee", margin: "8px 0" }} />
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#888", marginBottom: 5 }}>{t("feedAllocations")}</div>
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
                <div style={{ flex: 1, background: "var(--pm-primary-soft)", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--pm-primary)" }}>{totalFeed.toLocaleString()}</div>
                  <div style={{ fontSize: 9, color: "#666", textTransform: "uppercase", letterSpacing: 0.4 }}>{t("feedOrderedKg")}</div>
                </div>
              )}
              {kgPerBird && (
                <div style={{ flex: 1, background: "#fff8e6", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#8b6a00" }}>{kgPerBird}</div>
                  <div style={{ fontSize: 9, color: "#666", textTransform: "uppercase", letterSpacing: 0.4 }}>{t("kgPerBird")}</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PredictionBanner({ sheets, edits, farmConfig }: {
  sheets: SheetParsed[];
  edits: Map<string, string>[];
  farmConfig: FarmConfigData;
}) {
  const getCell = (si: number, r: number, c: number): string => {
    const e = edits[si];
    if (e?.has(`${r},${c}`)) return e.get(`${r},${c}`) ?? "";
    return String(sheets[si]?.cells.get(`${r},${c}`)?.value ?? "");
  };
  const getNum = (si: number, r: number, c: number) =>
    parseFloat(getCell(si, r, c).replace(/,/g, "")) || 0;

  // Collect active shed sheet indices
  const activeShedIdxs: number[] = [];
  let shedOrder = 0;
  for (let i = 0; i < sheets.length; i++) {
    const name = sheets[i].name.trim().toUpperCase();
    if (!name.includes("SHED") || name.includes("WEEKLY")) continue;
    const shedGroupId = SHED_SHEET_ORDER[shedOrder] ?? (shedOrder + 1);
    const groupCfg = farmConfig.shedGroups?.find(g => g.shedGroupId === shedGroupId);
    const groupActive = groupCfg ? groupCfg.active !== false : (shedGroupId != null && shedGroupId <= 6);
    if (!groupActive) { shedOrder++; continue; }
    activeShedIdxs.push(i);
    shedOrder++;
  }

  let totalBirds = 0;
  for (const si of activeShedIdxs) {
    totalBirds += getNum(si, 3, 2) + getNum(si, 4, 2);
  }
  if (totalBirds === 0) return null;

  // Aggregate daily data across all active sheds (rows 12–71 = days 1–60)
  let lastActualDay = 0;
  const dailyUsage: number[] = [];
  const dailyFOH: number[]   = [];

  for (let day = 1; day <= 60; day++) {
    const r = 11 + day;
    let usage = 0, foh = 0;
    for (const si of activeShedIdxs) {
      usage += getNum(si, r, COL_H);
      foh   += getNum(si, r, COL_I);
    }
    dailyUsage.push(usage);
    dailyFOH.push(foh);
    if (usage > 0) lastActualDay = day;
  }

  if (lastActualDay === 0) return null;

  const totalFeedSoFar = dailyUsage.slice(0, lastActualDay).reduce((a, b) => a + b, 0);
  const currentFOH     = dailyFOH[lastActualDay - 1] || 0;

  // Average daily usage (recent 5 days)
  const recentSlice   = dailyUsage.slice(Math.max(0, lastActualDay - 5), lastActualDay);
  const avgDailyUsage = recentSlice.reduce((a, b) => a + b, 0) / (recentSlice.length || 1);

  // Projected remaining days based on current FOH
  const projRemaining  = avgDailyUsage > 0 ? Math.round(currentFOH / avgDailyUsage) : 0;
  const projCatchDay   = Math.min(lastActualDay + projRemaining, 65);
  const projTotalFeed  = totalFeedSoFar + avgDailyUsage * projRemaining;

  // Projected live weight at catch (Cobb500 curve)
  const projWeightKg = COBB_WEIGHT_KG[Math.min(projCatchDay - 1, COBB_WEIGHT_KG.length - 1)] || 0;

  // Projected FCR at catch
  const projFCR = totalBirds > 0 && projWeightKg > 0
    ? projTotalFeed / (totalBirds * projWeightKg)
    : 0;

  // Chart data
  const chartMax = Math.max(projCatchDay, lastActualDay) + 2;
  const chartData = Array.from({ length: chartMax }, (_, i) => {
    const day = i + 1;
    const std = day <= COBB500_GRAMS.length
      ? Math.round(COBB500_GRAMS[day - 1] * totalBirds / 1000)
      : null;
    return {
      day,
      actual:    day <= lastActualDay ? Math.round(dailyUsage[day - 1]) : null,
      standard:  std,
      projected: day > lastActualDay && day <= projCatchDay ? Math.round(avgDailyUsage) : null,
    };
  });

  const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}t` : `${n}kg`;

  const Chip = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
    <div style={{
      background: accent ? "rgba(201,162,39,0.18)" : "rgba(255,255,255,0.12)",
      border: accent ? "1px solid #C9A227" : "1px solid rgba(255,255,255,0.2)",
      borderRadius: 8, padding: "6px 14px", textAlign: "center", minWidth: 80,
    }}>
      <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.1, color: accent ? "#C9A227" : "#fff" }}>{value}</div>
      <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.8, color: "#fff", marginTop: 2 }}>{label}</div>
    </div>
  );

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: number }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: "#1a2e1a", border: "1px solid #2d5a2d", borderRadius: 6, padding: "8px 12px", fontSize: 11 }}>
        <div style={{ fontWeight: 700, color: "#C9A227", marginBottom: 4 }}>Day {label}</div>
        {payload.map(p => (
          <div key={p.name} style={{ color: p.color }}>
            {p.name}: {fmtK(p.value)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{
      background: "linear-gradient(135deg, #0f2410 0%, #1a3a1a 100%)",
      border: "1px solid #2d5a2d",
      borderRadius: 10,
      padding: "14px 18px 10px",
      marginBottom: 18,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ background: "#C9A227", color: "#000", borderRadius: 6, padding: "2px 12px", fontWeight: 800, fontSize: 12, letterSpacing: 0.5 }}>
          📈 BATCH FORECAST
        </div>
        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>
          Based on current feed usage • Cobb 500 standard
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Chip label="Current Day"       value={`Day ${lastActualDay}`} />
          <Chip label="Est. Catch Day"    value={`Day ${projCatchDay}`} />
          <Chip label="Proj. Weight"      value={`${projWeightKg.toFixed(2)} kg`} accent />
          <Chip label="Proj. FCR"         value={projFCR > 0 ? projFCR.toFixed(3) : "—"} />
          <Chip label="Feed On Hand"      value={fmtK(Math.round(currentFOH))} />
        </div>
      </div>

      <ResponsiveContainer width="100%" height={140}>
        <ComposedChart data={chartData} margin={{ top: 2, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
          <XAxis
            dataKey="day"
            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
            label={{ value: "Day", position: "insideBottomRight", offset: -2, fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
          />
          <YAxis
            tickFormatter={v => `${(v / 1000).toFixed(0)}t`}
            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine x={lastActualDay} stroke="#f97316" strokeDasharray="4 3" strokeWidth={1.5} />
          <Bar dataKey="actual"    name="Actual"    fill="#22c55e" opacity={0.8} maxBarSize={14} />
          <Line dataKey="standard" name="Standard"  stroke="rgba(255,255,255,0.35)" strokeDasharray="5 3" dot={false} strokeWidth={1.5} connectNulls={false} />
          <Line dataKey="projected" name="Projected" stroke="#f97316" strokeDasharray="4 3" dot={false} strokeWidth={2} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>

      <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.45)", flexWrap: "wrap" }}>
        <span><span style={{ color: "#22c55e" }}>██</span> Actual daily feed</span>
        <span><span style={{ color: "rgba(255,255,255,0.4)" }}>╌╌</span> Cobb 500 standard</span>
        <span><span style={{ color: "#f97316" }}>╌╌</span> Projected (from current FOH)</span>
        <span><span style={{ color: "#f97316" }}>│</span> Today (Day {lastActualDay})</span>
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
  const t = useT();
  const [growerName, setGrowerName] = React.useState<string>(
    () => localStorage.getItem("summary-grower-name") ?? ""
  );
  const [editingGrower, setEditingGrower] = React.useState(false);
  const [growerDraft, setGrowerDraft] = React.useState("");
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

  const batchNum = eobIdx >= 0 ? (parseFloat(getCell(eobIdx, 1, 2)) || null) : null;

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
      <PredictionBanner sheets={sheets} edits={edits} farmConfig={farmConfig} />
      <div style={{ background: "linear-gradient(135deg, var(--pm-primary) 0%, var(--pm-primary-mid) 100%)", color: "#fff", borderRadius: 10, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderBottom: "3px solid #C9A227" }}>
        <div style={{ background: "#C9A227", color: "#000", borderRadius: 7, padding: "3px 14px", fontWeight: 800, fontSize: 15 }}>BATCH SUMMARY</div>
        {batchNum && (
          <div style={{ background: "rgba(255,255,255,0.18)", borderRadius: 7, padding: "3px 14px", fontWeight: 700, fontSize: 15, letterSpacing: 0.5 }}>
            Batch #{batchNum}
          </div>
        )}
        {/* Grower name — editable, black text */}
        {editingGrower ? (
          <input
            autoFocus
            value={growerDraft}
            onChange={e => setGrowerDraft(e.target.value)}
            onBlur={() => {
              const v = growerDraft.trim().toUpperCase();
              setGrowerName(v);
              if (v) localStorage.setItem("summary-grower-name", v);
              else localStorage.removeItem("summary-grower-name");
              setEditingGrower(false);
            }}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
            }}
            placeholder="GROWER NAME"
            style={{ background: "#fff", color: "#000", border: "2px solid #C9A227", borderRadius: 7, padding: "3px 12px", fontWeight: 800, fontSize: 15, outline: "none", textTransform: "uppercase", minWidth: 160 }}
          />
        ) : (
          <div
            title="Click to edit grower name"
            onClick={() => { setGrowerDraft(growerName); setEditingGrower(true); }}
            style={{ background: "#fff", color: "#000", borderRadius: 7, padding: "3px 14px", fontWeight: 800, fontSize: 15, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.5, minWidth: 100, border: "2px solid transparent" }}>
            {growerName || <span style={{ opacity: 0.35, fontWeight: 400, fontSize: 13 }}>+ Grower name</span>}
          </div>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: "5px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{grandBirds > 0 ? grandBirds.toLocaleString() : "—"}</div>
            <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 1 }}>{t("totalBirdsPlaced")}</div>
          </div>
          {grandFeed > 0 && (
            <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: "5px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{grandFeed.toLocaleString()}</div>
              <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 1 }}>{t("totalFeedOrderedKg")}</div>
            </div>
          )}
          {overallKgPerBird && (
            <div style={{ background: "rgba(201,162,39,0.3)", border: "1px solid #C9A227", borderRadius: 8, padding: "5px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{overallKgPerBird}</div>
              <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 1 }}>{t("overallKgPerBird")}</div>
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {shedItems.map(({ sheetIdx, shedGroupId }) => {
          // Derive actual shed numbers from the sheet name (e.g. "SHED 1 & 2" → 1, 2).
          // Falling back to the shedGroupId formula only if the name has no shed number pair,
          // because the formula breaks when sheets aren't in perfect sequential order.
          const nameMatch = sheets[sheetIdx]?.rawName?.match(/(\d+)\s*&\s*(\d+)/);
          const shed1Num = nameMatch ? parseInt(nameMatch[1]) : shedGroupId * 2 - 1;
          const shed2Num = nameMatch ? parseInt(nameMatch[2]) : shedGroupId * 2;
          return (
            <ShedSummaryCard
              key={shedGroupId}
              sheetIdx={sheetIdx}
              sheet={sheets[sheetIdx]}
              edits={edits[sheetIdx] ?? new Map()}
              onEdit={handleEdit}
              getCell={getCell}
              eobSheetIdx={eobIdx}
              shed1Num={shed1Num}
              shed2Num={shed2Num}
            />
          );
        })}
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
  fcr: number;
  cfcr: number;
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
  const wb = await parseXlsxBuffer(buf, { raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws || !ws["!ref"]) return { sheds: [], summary: null };

  const gv = (row: number, col: number): unknown => {
    const cell = ws[encodeCell({ r: row - 1, c: col - 1 })] as CellObject | undefined;
    return cell?.v !== undefined ? cell.v : null;
  };
  const num = (v: unknown) => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isNaN(n) ? 0 : n; };

  // Overall summary from the right-side summary block
  // Data sits in column AG (col 33, 1-indexed) for bird/weight metrics,
  // and column AK (col 37, 1-indexed) for feed/FCR metrics.
  const farmName   = String(gv(1, 2) ?? "");
  const batchNum   = num(gv(1, 7));
  const totalPlaced    = num(gv(4, 33));   // AG4  — total birds placed
  const totalOut       = num(gv(7, 33));   // AG7  — total birds caught
  const mortalityPct   = num(gv(5, 33)) * 100; // AG5 — mortality fraction → %
  const aveWeight      = num(gv(9, 33));   // AG9  — average live weight (kg)
  const fcr            = num(gv(9, 37));   // AK9  — FCR
  const cfcr           = num(gv(11, 37));  // AK11 — CFCR
  const cage           = num(gv(6, 40));   // AN6  — average age at cage (days)
  const actualAge      = num(gv(11, 33));  // AG11 — actual age (days) at catch
  const correctedAge   = num(gv(12, 33));  // AG12 — corrected age to 2.45 kg standard
  const feedOnHand     = num(gv(6, 37));   // AK6  — feed on hand (kg)
  const feedDelivered  = num(gv(5, 37));   // AK5  — total feed delivered (kg)
  const feedConsumed   = num(gv(7, 37));   // AK7  — total feed consumed (kg)

  // Shed data: 3 sheds per block, stacked every 16 rows.
  // Column groups (1-indexed): left=cols1-9, mid=cols11-19, right=cols21-29
  const COLS = [
    { p: 2,  m: 2,  mp: 3,  tc: 2,  aw: 6,  tw: 7,  fcr: 8,  cfcr: 9  },
    { p: 12, m: 12, mp: 13, tc: 12, aw: 16, tw: 17, fcr: 18, cfcr: 19 },
    { p: 22, m: 22, mp: 23, tc: 22, aw: 26, tw: 27, fcr: 28, cfcr: 29 },
  ];

  const sheds: ShedBatchData[] = [];
  const range = decodeRange(ws["!ref"]!);
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
        fcr:         num(gv(tRow, c.fcr)),
        cfcr:        num(gv(tRow, c.cfcr)),
        cages:       catches.length,
        catches,
      });
    }
  }

  return { sheds, summary: { farmName, batchNum, totalPlaced, totalOut, mortalityPct, aveWeight, fcr, cfcr, cage, actualAge, correctedAge, feedOnHand, feedDelivered, feedConsumed } };
}

const BATCH_CATCHES_KEY = "silo-batch-catches";
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

function BatchResultsView({ sheets, edits, farmConfig, shedPlacement, onEobCatch, onSummaryLoaded, onCatchMapChange, cleared }: { sheets: SheetParsed[]; edits: Map<string, string>[]; farmConfig: FarmConfigData; shedPlacement: Map<number, number>; onEobCatch?: (shedNum: number, totalCaught: number) => void; onSummaryLoaded?: (s: BatchSummary) => void; onCatchMapChange?: (m: CatchMap) => void; cleared?: boolean }) {
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
    if (cleared) {
      // Batch was just reset — don't repopulate from the static xlsx file.
      // Show a blank state until the user loads new batch results.
      setXlSheds([]);
      setSummary(null);
      setLoadState("ok");
      return;
    }
    loadBatchResultsXlsx(import.meta.env.BASE_URL)
      .then(({ sheds, summary }) => { setXlSheds(sheds); setSummary(summary); setLoadState("ok"); if (summary) onSummaryLoaded?.(summary); })
      .catch(() => setLoadState("error"));
  }, []);

  // Sync batch number from Silo Mate (and vice versa) via storage events
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "silo-batch-num") {
        const parsed = e.newValue ? parseInt(e.newValue, 10) || null : null;
        setOverrideBatchNum(parsed);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // Seed catchMap from xlsx on first load (if localStorage was empty)
  useEffect(() => {
    if (loadState !== "ok") return;
    const stored = localStorage.getItem(BATCH_CATCHES_KEY);
    if (stored && stored !== "{}") return;
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
    onCatchMapChange?.(next);
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
  const globalAveWgt  = totalCaught > 0 ? totalWgtKgAll / totalCaught : (summary?.aveWeight ?? 0);

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
      <div style={{ background: "linear-gradient(135deg, var(--pm-primary) 0%, var(--pm-primary-mid) 100%)", color: "#fff", borderRadius: 10, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderBottom: "3px solid #C9A227" }}>
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
            onClick={() => { setHeaderEditVal(overrideFarmName || farmConfig.farmName || summary?.farmName || ""); setEditingHeader("farm"); }}
            style={{ fontSize: 15, fontWeight: 700, cursor: "pointer", borderBottom: "1px dashed rgba(255,255,255,0.5)", paddingBottom: 1 }}
          >
            {overrideFarmName || farmConfig.farmName || summary?.farmName || <span style={{ opacity: 0.5 }}>Farm name</span>}
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
            {(() => { const bn = overrideBatchNum ?? summary?.batchNum; return bn && bn > 0 ? `Batch #${bn}` : <span style={{ opacity: 0.5 }}>Batch #</span>; })()}
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

      {/* ── Shed Comparison Chart ────────────────────────────────── */}
      {(() => {
        // Mirror exactly the same shed list as the per-shed cards (activeShedNums / shedStats)
        if (shedStats.length === 0) return null;

        const chartData = shedStats.map(({ shedNum, placement, totalCaught, totalWgtKg, aveWgt, morts, mortPct }) => {
          const xl    = xlSheds.find(s => s.shedNum === shedNum);
          const cages = (catchMap[shedNum] ?? []).length;
          // FCR / cFCR: from xlsx totals row only
          const fcr  = xl?.fcr  && xl.fcr  > 0 ? xl.fcr  : undefined;
          const cfcr = xl?.cfcr && xl.cfcr > 0 ? xl.cfcr : undefined;
          // Average weight: from catch data if available, else xlsx
          const wgt  = aveWgt > 0 ? parseFloat(aveWgt.toFixed(3))
            : (xl?.aveWeight && xl.aveWeight > 0 ? xl.aveWeight : undefined);
          return {
            shed:     `Shed ${shedNum}`,
            shedNum,
            placement: placement > 0 ? placement : undefined,
            caught:   totalCaught > 0 ? totalCaught : undefined,
            fcr,
            cfcr,
            cages:    cages > 0 ? cages : undefined,
            mortPct:  mortPct > 0 ? parseFloat(mortPct.toFixed(2)) : undefined,
            aveWgt:   wgt,
          };
        });

        if (chartData.length === 0) return null;

        // Processor-aware: Baiada uses cFCR, Ingham uses FCR
        const processor   = farmConfig.processor ?? "baiada";
        const isBaiada    = processor === "baiada";
        const primaryKey  = isBaiada ? "cfcr" : "fcr";
        const primaryName = isBaiada ? "cFCR" : "FCR";
        const primaryClr  = isBaiada ? "#16a085" : "#2980b9";
        const fcrYLabel   = isBaiada ? "cFCR" : "FCR";

        const hasPrimary = chartData.some(d => d[primaryKey] != null);
        const hasCages   = chartData.some(d => d.cages != null);

        // Custom tooltip
        const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
          if (!active || !payload?.length) return null;
          return (
            <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: "10px 14px", fontSize: 12, boxShadow: "0 3px 10px rgba(0,0,0,0.12)" }}>
              <div style={{ fontWeight: 800, marginBottom: 6, color: "#333" }}>{label}</div>
              {payload.map(p => (
                <div key={p.name} style={{ display: "flex", justifyContent: "space-between", gap: 20, color: p.color, marginBottom: 2 }}>
                  <span>{p.name}</span>
                  <span style={{ fontWeight: 700 }}>{p.name === "Cages" ? p.value : p.value.toFixed(3)}</span>
                </div>
              ))}
            </div>
          );
        };

        return (
          <div style={{ background: "#fff", border: "1px solid #e0e8e4", borderRadius: 12, padding: "16px 20px", marginBottom: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <div style={{ background: "var(--pm-primary)", color: "#fff", borderRadius: 7, padding: "3px 14px", fontWeight: 800, fontSize: 13 }}>📊 ALL SHEDS — PERFORMANCE</div>
              <div style={{ background: isBaiada ? "#e0f4ef" : "#e8f3fb", color: isBaiada ? "#16a085" : "#2980b9", border: `1px solid ${isBaiada ? "#b2dfd6" : "#b8d8f0"}`, borderRadius: 5, padding: "2px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 0.3 }}>
                {isBaiada ? "BAIADA" : "INGHAM"}
              </div>
              <div style={{ display: "flex", gap: 14, marginLeft: "auto", flexWrap: "wrap" }}>
                {hasPrimary && <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: primaryClr }}><span style={{ width: 12, height: 12, background: primaryClr, borderRadius: 2, display: "inline-block" }} />{primaryName}</span>}
                {hasCages   && <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#C9A227" }}><span style={{ width: 12, height: 2, background: "#C9A227", display: "inline-block" }} />Cages</span>}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 50, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="shed" tick={{ fontSize: 11, fontWeight: 600 }} />
                <YAxis yAxisId="fcr" domain={['auto', 'auto']} tick={{ fontSize: 11 }} tickFormatter={v => v.toFixed(2)} label={{ value: fcrYLabel, angle: -90, position: "insideLeft", fontSize: 11, fill: primaryClr }} />
                {hasCages && <YAxis yAxisId="cages" orientation="right" tick={{ fontSize: 11 }} label={{ value: "Cages", angle: 90, position: "insideRight", fontSize: 11, fill: "#C9A227" }} />}
                <Tooltip content={<ChartTooltip />} />
                {hasPrimary && <Bar yAxisId="fcr" dataKey={primaryKey} name={primaryName} fill={primaryClr} radius={[4, 4, 0, 0]} maxBarSize={40} />}
                {hasCages   && <Line yAxisId="cages" type="monotone" dataKey="cages" name="Cages" stroke="#C9A227" strokeWidth={2.5} dot={{ r: 5, fill: "#C9A227", stroke: "#fff", strokeWidth: 2 }} />}
              </ComposedChart>
            </ResponsiveContainer>

            {/* Ave weight secondary chart */}
            {chartData.some(d => d.aveWgt != null) && (
              <div style={{ marginTop: 16, borderTop: "1px solid #f0f0f0", paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#8e44ad", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 8 }}>Avg Live Weight per Shed (kg)</div>
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart data={chartData} margin={{ top: 4, right: 50, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="shed" tick={{ fontSize: 11, fontWeight: 600 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} tickFormatter={v => v.toFixed(2)} label={{ value: "kg", angle: -90, position: "insideLeft", fontSize: 11, fill: "#8e44ad" }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="aveWgt" name="Avg Weight (kg)" fill="#8e44ad" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        );
      })()}

      {/* Top stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(165px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div style={cardStyle("var(--pm-primary)")}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--pm-primary)" }}>{totalPlaced > 0 ? totalPlaced.toLocaleString() : "—"}</div>
          <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>Birds Placed</div>
        </div>
        <div style={cardStyle("var(--pm-primary-mid)")}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--pm-primary-mid)" }}>{totalCaught > 0 ? totalCaught.toLocaleString() : "—"}</div>
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
        {summary && summary.fcr > 0 && (
          <div style={cardStyle("#2980b9")}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#2980b9" }}>{summary.fcr.toFixed(3)}</div>
            <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>FCR</div>
          </div>
        )}
        {summary && summary.cfcr > 0 && (
          <div style={cardStyle("#16a085")}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#16a085" }}>{summary.cfcr.toFixed(3)}</div>
            <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>CFCR</div>
          </div>
        )}
        {summary && summary.actualAge > 0 && (
          <div style={cardStyle("#5b6fa6")}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#5b6fa6" }}>{summary.actualAge.toFixed(1)} <span style={{ fontSize: 13 }}>days</span></div>
            <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>Actual Age</div>
          </div>
        )}
        {summary && summary.correctedAge > 0 && (
          <div style={cardStyle("#7d6aa0")}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#7d6aa0" }}>{summary.correctedAge.toFixed(1)} <span style={{ fontSize: 13 }}>days</span></div>
            <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>Corr. Age (2.45 kg)</div>
          </div>
        )}
        {summary && summary.cage > 0 && (
          <div style={cardStyle("#7f8c8d")}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#7f8c8d" }}>{summary.cage.toFixed(2)} <span style={{ fontSize: 13 }}>days</span></div>
            <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>Cage Age</div>
          </div>
        )}
      </div>

      {/* Ross 308 FF As-Hatched standard comparison at cage age */}
      {summary && summary.cage > 0 && (() => {
        const std = getRoss308Standard(summary.cage);
        if (!std) return null;
        const actualWgtKg = summary.aveWeight;
        const actualFcr   = summary.fcr;
        const stdWgtKg    = std.weight / 1000;
        const wgtDelta    = actualWgtKg > 0 ? actualWgtKg - stdWgtKg : null;
        const fcrDelta    = actualFcr   > 0 ? actualFcr   - std.fcr  : null;
        const wgtPct      = wgtDelta !== null ? (wgtDelta / stdWgtKg) * 100 : null;
        const fcrPct      = fcrDelta !== null ? (fcrDelta / std.fcr)  * 100 : null;
        const isExtrapolated = summary.cage > 33;

        const PctBadge = ({ pct, lowerIsBetter = false }: { pct: number; lowerIsBetter?: boolean }) => {
          const good  = (pct > 0) === !lowerIsBetter;
          const color = good ? "#27ae60" : "#e74c3c";
          const bg    = good ? "#e8f8f0" : "#fdecea";
          const sign  = pct > 0 ? "+" : "";
          const label = good
            ? (lowerIsBetter ? "below std" : "above std")
            : (lowerIsBetter ? "above std" : "below std");
          return (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: bg, color, fontWeight: 800, fontSize: 14, borderRadius: 6, padding: "3px 9px" }}>
              {sign}{Math.abs(pct).toFixed(1)}% <span style={{ fontWeight: 500, fontSize: 11 }}>{label}</span>
            </span>
          );
        };

        return (
          <div style={{ background: "#f0f7f3", border: "1px solid #b2d8c6", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                vs Ross 308 FF Standard
              </div>
              <div style={{ fontSize: 10, color: "#888", background: "#e0f0e9", borderRadius: 4, padding: "2px 7px" }}>
                As-Hatched · {Math.round(summary.cage)} day{Math.round(summary.cage) !== 1 ? "s" : ""}
              </div>
              {isExtrapolated && (
                <div style={{ fontSize: 10, color: "#a07030", background: "#fff3dc", borderRadius: 4, padding: "2px 7px" }}>
                  * extrapolated beyond day 33
                </div>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
              <div>
                <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Weight</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#154d2c" }}>Std: {stdWgtKg.toFixed(3)} kg</span>
                  {actualWgtKg > 0 && <span style={{ fontSize: 13, color: "#555" }}>Actual: {actualWgtKg.toFixed(3)} kg</span>}
                </div>
                {wgtPct !== null && <PctBadge pct={wgtPct} />}
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>FCR</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#154d2c" }}>Std: {std.fcr.toFixed(3)}</span>
                  {actualFcr > 0 && <span style={{ fontSize: 13, color: "#555" }}>Actual: {actualFcr.toFixed(3)}</span>}
                </div>
                {fcrPct !== null && <PctBadge pct={fcrPct} lowerIsBetter />}
              </div>
            </div>
          </div>
        );
      })()}

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
        const feedDelivered = eobDelivered > 0 ? eobDelivered : summary.feedDelivered;
        const feedOnHand    = eobOnHand    > 0 ? eobOnHand    : summary.feedOnHand;
        const feedConsumed  = eobConsumed  > 0 ? eobConsumed  : summary.feedConsumed;
        const fromEob = eobDelivered > 0;
        return (
          <div style={{ background: "var(--pm-primary-soft)", border: "1px solid var(--pm-primary-border)", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.5 }}>Feed Summary</div>
              {fromEob && <div style={{ fontSize: 10, color: "#888", background: "var(--pm-primary-pale)", borderRadius: 4, padding: "2px 7px" }}>live from End of Batch</div>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
              {[
                { label: "Feed Delivered", value: fmtN(feedDelivered) + " kg" },
                { label: "Feed Consumed",  value: fmtN(feedConsumed)  + " kg" },
                { label: "Feed on Hand",   value: fmtN(feedOnHand)    + " kg" },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--pm-primary-mid)" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Per-shed cards */}
      {activeShedNums.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 10, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Per-Shed Breakdown ({activeShedNums.length} active shed{activeShedNums.length !== 1 ? "s" : ""}) — tap a cell to edit
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
            {shedStats.map(({ shedNum, placement, rows, totalCaught: sc, totalWgtKg, aveWgt, morts, mortPct }) => (
              <div key={shedNum} style={{ background: "#fff", borderRadius: 10, border: "1px solid #dde8e0", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>

                {/* Card header */}
                <div style={{ background: "linear-gradient(135deg, var(--pm-primary) 0%, var(--pm-primary-mid) 100%)", color: "#fff", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
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
                    <tr style={{ background: "var(--pm-primary-soft)" }}>
                      <th style={{ padding: "6px 8px", textAlign: "left",  color: "var(--pm-primary)", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, width: "22%" }}>Date</th>
                      <th style={{ padding: "6px 8px", textAlign: "right", color: "var(--pm-primary)", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, width: "10%" }}>Age</th>
                      <th style={{ padding: "6px 8px", textAlign: "right", color: "var(--pm-primary)", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, width: "16%" }}>Birds</th>
                      <th style={{ padding: "6px 8px", textAlign: "right", color: "var(--pm-primary)", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, width: "18%" }}>Ave Wgt</th>
                      <th style={{ padding: "6px 8px", textAlign: "right", color: "var(--pm-primary)", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, width: "18%" }}>Total Wgt</th>
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
                            ) : (rowTw > 0 ? `${rowTw.toFixed(2)} t` : <span style={{ color: "#aaa" }}>—</span>)}
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
                    <tr style={{ borderTop: "2px solid var(--pm-primary)", background: "#d4eddf" }}>
                      <td colSpan={2} style={{ padding: "6px 8px", color: "var(--pm-primary)", fontWeight: 800, fontSize: 11 }}>TOTAL</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: "#1a1a1a", fontWeight: 800 }}>{sc > 0 ? sc.toLocaleString() : "—"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: "#1a1a1a", fontWeight: 800 }}>{aveWgt > 0 ? `${aveWgt.toFixed(3)} kg` : "—"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: "#1a1a1a", fontWeight: 800 }}>{totalWgtKg > 0 ? `${(totalWgtKg / 1000).toFixed(2)} t` : "—"}</td>
                      <td />
                    </tr>
                    <tr>
                      <td colSpan={6} style={{ padding: "6px 8px" }}>
                        <button onClick={() => addRow(shedNum)}
                          style={{ width: "100%", background: "var(--pm-primary-soft)", border: "1px dashed var(--pm-primary)", borderRadius: 6, color: "var(--pm-primary)", fontWeight: 700, cursor: "pointer", padding: "5px 0", fontSize: 12 }}>
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
        const farmLabel = farmConfig.farmName || summary?.farmName || "";
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
                <div style={{ background: "var(--pm-primary-soft)", border: "1px solid var(--pm-primary-border)", borderRadius: 8, padding: "14px 16px", marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                    New Batch Number
                  </label>
                  <input
                    type="number"
                    value={newBatchNum}
                    onChange={e => setNewBatchNum(e.target.value)}
                    placeholder="Enter new batch #"
                    style={{ width: "100%", border: "1px solid var(--pm-primary-border)", borderRadius: 7, padding: "10px 12px", fontSize: 16, fontWeight: 700, color: "var(--pm-primary)", background: "#fff", boxSizing: "border-box", outline: "none" }}
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
            <div style={{ background: "linear-gradient(135deg, var(--pm-primary) 0%, var(--pm-primary-mid) 100%)", color: "#fff", padding: "16px 20px", borderRadius: "14px 14px 0 0", display: "flex", alignItems: "center", gap: 10 }}>
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
              <div style={{ background: "var(--pm-primary-soft)", border: "1px solid var(--pm-primary-border)", borderRadius: 8, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: "#333", lineHeight: 1.6 }}>
                <strong>How to paste:</strong> Open the Adelaide Weighbridge email → select all the table text → copy → paste below.<br/>
                <span style={{ color: "#666", fontSize: 12 }}>Works with the Baiada format: GROWER · SHED # · AGE · BIRD # · ESTIMATE · ACTUAL · TOTAL KG</span>
              </div>

              {/* Paste area */}
              <textarea
                value={emailText}
                onChange={e => { setEmailText(e.target.value); setEmailParsed(null); setEmailParseError(""); }}
                placeholder={"GROWER\tSHED #\tAGE\tBIRD #\tESTIMATE\tACTUAL\tTOTAL KG\nDouble B\t10\t45\t26208\t3.44\t3.66\t96013\n..."}
                rows={7}
                style={{ width: "100%", border: "1.5px solid var(--pm-primary-border)", borderRadius: 8, padding: "10px 12px", fontSize: 12, fontFamily: "monospace", resize: "vertical", boxSizing: "border-box", outline: "none", color: "#222" }}
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
                style={{ width: "100%", background: "var(--pm-primary)", color: "#fff", border: "none", borderRadius: 8, padding: "11px 0", fontWeight: 700, fontSize: 14, cursor: "pointer", marginTop: 10 }}
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
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--pm-primary)", marginBottom: 4 }}>
                      ✅ Found {emailParsed.length} catch row{emailParsed.length !== 1 ? "s" : ""}
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "Inter,'Segoe UI',sans-serif" }}>
                        <thead>
                          <tr style={{ background: "var(--pm-primary)", color: "#fff" }}>
                            {["Shed", "Age (days)", "Birds", "Ave Wgt (kg)", "Total Wgt (t)"].map(h => (
                              <th key={h} style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {emailParsed.map((r, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? "var(--pm-primary-soft)" : "#fff" }}>
                              <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 700, color: "var(--pm-primary)" }}>SHED {r.shedNum}</td>
                              <td style={{ padding: "5px 10px", textAlign: "right" }}>{r.age || "—"}</td>
                              <td style={{ padding: "5px 10px", textAlign: "right" }}>{parseInt(r.birds).toLocaleString()}</td>
                              <td style={{ padding: "5px 10px", textAlign: "right" }}>{r.aveWgt || "—"}</td>
                              <td style={{ padding: "5px 10px", textAlign: "right" }}>{r.totalWgt || "—"}</td>
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
                      style={{ flex: 2, background: "var(--pm-primary)", color: "#fff", border: "none", borderRadius: 8, padding: "11px 0", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
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
function MortsView({ sheets, edits, handleEdit, farmConfig, mortsLog, setMortsLog, cullsLog, setCullsLog }: {
  sheets: SheetParsed[];
  edits: Map<string, string>[];
  handleEdit: (si: number, key: string, val: string) => void;
  farmConfig: FarmConfigData;
  mortsLog: MortsLog;
  setMortsLog: (v: MortsLog) => void;
  cullsLog: MortsLog;
  setCullsLog: (v: MortsLog) => void;
}) {
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
  const TD: React.CSSProperties = { borderRight: "1px solid #e5e7eb", borderBottom: "2px solid #e0c0c0", padding: "0", textAlign: "center" };
  const TD_STICKY: React.CSSProperties = { ...TD, position: "sticky", left: 0, zIndex: 1, background: "var(--pm-primary-soft)", minWidth: 54, padding: "6px 4px", fontSize: 11, fontWeight: 700 };

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
            <div style={{ marginLeft: "auto", fontSize: 10, color: "#aaa" }}>Tap M or C half of a cell to edit</div>
          </div>

          {/* Scrollable table — Sheds as rows, Days as columns, M+C combined per cell */}
          <div style={{ flex: 1, overflowX: "auto", overflowY: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: "max-content", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ ...TH_STICKY, minWidth: 60, verticalAlign: "middle", borderRight: "2px solid rgba(255,255,255,0.4)" }}>Shed</th>
                  {days.map((d, i) => {
                    const dayNum = getDayNum(d);
                    const isToday = isoDate(d) === isoDate(new Date());
                    return (
                      <th key={i} style={{ ...TH, minWidth: 64, background: isToday ? "#b8640a" : "#8b1a1a" }}>
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
                    <tr key={s}>
                      {/* Sticky shed label */}
                      <td style={{
                        ...TD_STICKY, background: "#f8e8e8", color: "#8b1a1a",
                        fontWeight: 800, fontSize: 13, verticalAlign: "middle",
                        borderRight: "2px solid #e0c0c0",
                      }}>
                        S{s}
                      </td>
                      {/* Combined M | C cell per day — side by side */}
                      {days.map((d, di) => {
                        const iso = isoDate(d);
                        const isToday = iso === isoDate(new Date());
                        const mVal = mortsLog[iso]?.[s];
                        const cVal = cullsLog[iso]?.[s];
                        const isEditM = editCell?.date === iso && editCell?.shed === s && editCell?.type === "m";
                        const isEditC = editCell?.date === iso && editCell?.shed === s && editCell?.type === "c";
                        return (
                          <td key={di} style={{ ...TD, background: isToday ? "#fffde7" : shedBg, padding: 0 }}>
                            <div style={{ display: "flex", height: "100%" }}>
                              {/* M — left half */}
                              <div style={{ flex: 1, borderRight: "1px dashed #e5c5c5", background: isToday ? "#fffde7" : "#fff8f8" }}>
                                {isEditM ? (
                                  <input type="number" inputMode="numeric" value={editVal} autoFocus
                                    onChange={e => setEditVal(e.target.value)}
                                    onBlur={() => saveMorts(iso, s, editVal)}
                                    onKeyDown={e => { if (e.key === "Enter") saveMorts(iso, s, editVal); if (e.key === "Escape") setEditCell(null); }}
                                    style={{ width: "100%", border: "2px solid #8b1a1a", borderRadius: 0, padding: "5px 1px", textAlign: "center", fontSize: 11, outline: "none", background: "#fff8f8", fontWeight: 700 }}
                                  />
                                ) : (
                                  <div onClick={() => { setEditCell({ date: iso, shed: s, type: "m" }); setEditVal(mVal !== undefined ? String(mVal) : ""); }}
                                    style={{ padding: "6px 2px", cursor: "pointer", minHeight: 30, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                                    <span style={{ fontSize: 8, fontWeight: 700, color: "#c0a0a0", lineHeight: 1, letterSpacing: 0.3 }}>M</span>
                                    <span style={{ color: mVal ? (mVal > 30 ? "#c0392b" : "#8b1a1a") : "#ddd", fontWeight: mVal ? 700 : 400, fontSize: 12, lineHeight: 1.2 }}>
                                      {mVal !== undefined ? mVal : "·"}
                                    </span>
                                  </div>
                                )}
                              </div>
                              {/* C — right half */}
                              <div style={{ flex: 1, background: isToday ? "#fffde0" : si % 2 === 0 ? "#fffff8" : "#fafaf0" }}>
                                {isEditC ? (
                                  <input type="number" inputMode="numeric" value={editVal} autoFocus
                                    onChange={e => setEditVal(e.target.value)}
                                    onBlur={() => saveCulls(iso, s, editVal)}
                                    onKeyDown={e => { if (e.key === "Enter") saveCulls(iso, s, editVal); if (e.key === "Escape") setEditCell(null); }}
                                    style={{ width: "100%", border: "2px solid #8b8b00", borderRadius: 0, padding: "5px 1px", textAlign: "center", fontSize: 11, outline: "none", background: "#fffff0", fontWeight: 700 }}
                                  />
                                ) : (
                                  <div onClick={() => { setEditCell({ date: iso, shed: s, type: "c" }); setEditVal(cVal !== undefined ? String(cVal) : ""); }}
                                    style={{ padding: "6px 2px", cursor: "pointer", minHeight: 30, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                                    <span style={{ fontSize: 8, fontWeight: 700, color: "#aaa", lineHeight: 1, letterSpacing: 0.3 }}>C</span>
                                    <span style={{ color: cVal ? "#555" : "#ddd", fontWeight: cVal ? 700 : 400, fontSize: 12, lineHeight: 1.2 }}>
                                      {cVal !== undefined ? cVal : "·"}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
    </div>
  );
}

// ── HistoryView ───────────────────────────────────────────────────────────────
function BarChart({ entries, getValue, label, format, color }: {
  entries: BatchHistoryEntry[];
  getValue: (e: BatchHistoryEntry) => number | null;
  label: string;
  format: (n: number) => string;
  color: string;
}) {
  const vals = entries.map(getValue);
  const max = Math.max(...vals.filter((v): v is number => v !== null), 0.001);
  const W = 56, H = 90, gap = 8;
  const PAD_TOP = 18;
  const totalW = entries.length * (W + gap) - gap;
  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e5e5", padding: "14px 16px 10px", overflow: "hidden" }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>{label}</div>
      <svg width={totalW} height={PAD_TOP + H + 22} style={{ display: "block" }}>
        {vals.map((v, i) => {
          const x = i * (W + gap);
          const pct = v !== null ? v / max : 0;
          const barH = Math.max(pct * H, 2);
          const barY = PAD_TOP + H - barH;
          const bn = entries[i].batchNum;
          return (
            <g key={i}>
              <rect x={x} y={barY} width={W} height={barH} rx={4} fill={v !== null ? color : "#e5e5e5"} opacity={i === 0 ? 1 : 0.65 + (i / vals.length) * 0.2} />
              {v !== null && (
                <text x={x + W / 2} y={barY - 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#333">{format(v)}</text>
              )}
              {v === null && (
                <text x={x + W / 2} y={PAD_TOP + H / 2 + 5} textAnchor="middle" fontSize={10} fill="#aaa">—</text>
              )}
              <text x={x + W / 2} y={PAD_TOP + H + 16} textAnchor="middle" fontSize={10} fill="#666" fontWeight={600}>#{bn || "?"}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function HistoryView() {
  const [history, setHistory] = useState<BatchHistoryEntry[]>(readBatchHistory);
  const recent = history.slice(0, 6).reverse(); // oldest → newest so chart reads left to right

  const fmtNum  = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
  const fmtFeed = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}t` : `${n}kg`;
  const fmtDec  = (n: number) => n.toFixed(2);
  const fmtMort = (n: number) => `${n.toFixed(1)}%`;
  const fmtKg   = (n: number) => `${n.toFixed(2)}kg`;

  const clearHistory = () => {
    if (!confirm("Clear all batch history? This cannot be undone.")) return;
    localStorage.removeItem(BATCH_HISTORY_KEY);
    setHistory([]);
  };

  const deleteEntry = (idx: number) => {
    const bn = history[idx]?.batchNum;
    if (!confirm(`Remove Batch #${bn || "?"} from history?`)) return;
    const updated = history.filter((_, i) => i !== idx);
    localStorage.setItem(BATCH_HISTORY_KEY, JSON.stringify(updated));
    setHistory(updated);
  };

  if (recent.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: "center", fontFamily: "Inter,'Segoe UI',sans-serif", color: "#888" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8, color: "var(--pm-primary)" }}>No Batch History Yet</div>
        <div style={{ fontSize: 14 }}>Each time you start a New Batch, the outgoing batch's stats are automatically saved here. Check back after your first new batch.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 20px 40px", fontFamily: "Inter,'Segoe UI',sans-serif", overflowY: "auto", height: "100%" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, var(--pm-primary) 0%, var(--pm-primary-mid) 100%)", color: "#fff", borderRadius: 10, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, borderBottom: "3px solid #C9A227" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: "#C9A227", color: "#000", borderRadius: 7, padding: "3px 14px", fontWeight: 800, fontSize: 15 }}>BATCH HISTORY</div>
          <span style={{ fontSize: 13, opacity: 0.8 }}>Last {recent.length} batch{recent.length !== 1 ? "es" : ""}</span>
        </div>
        <button onClick={clearHistory} style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 6, padding: "5px 14px", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          Clear History
        </button>
      </div>

      {/* Summary Table */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e5e5", overflow: "auto", marginBottom: 24 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 600 }}>
          <thead>
            <tr style={{ background: "var(--pm-primary)", color: "#fff" }}>
              {["Batch", "Date", "Birds Placed", "Feed (kg)", "FCR", "CFCR", "Ave. Age", "Mortality", ""].map(h => (
                <th key={h} style={{ padding: "9px 12px", textAlign: "center", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...recent].reverse().map((e, i) => {
              const date = e.date ? new Date(e.date).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "—";
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? "#f9f9f9" : "#fff", borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "9px 12px", textAlign: "center", fontWeight: 800, color: "var(--pm-primary)" }}>#{e.batchNum || "?"}</td>
                  <td style={{ padding: "9px 12px", textAlign: "center", color: "#555" }}>{date}</td>
                  <td style={{ padding: "9px 12px", textAlign: "center", fontWeight: 700 }}>{e.totalBirds > 0 ? e.totalBirds.toLocaleString() : "—"}</td>
                  <td style={{ padding: "9px 12px", textAlign: "center" }}>{e.totalFeedKg > 0 ? e.totalFeedKg.toLocaleString() : "—"}</td>
                  <td style={{ padding: "9px 12px", textAlign: "center" }}>{e.fcr !== null ? e.fcr.toFixed(3) : "—"}</td>
                  <td style={{ padding: "9px 12px", textAlign: "center" }}>{e.cfcr !== null ? e.cfcr.toFixed(3) : "—"}</td>
                  <td style={{ padding: "9px 12px", textAlign: "center" }}>{e.cage !== null ? `${e.cage.toFixed(2)} days` : "—"}</td>
                  <td style={{ padding: "9px 12px", textAlign: "center", color: e.mortalityPct !== null && e.mortalityPct > 5 ? "#c0392b" : "inherit" }}>{e.mortalityPct !== null ? `${e.mortalityPct.toFixed(2)}%` : "—"}</td>
                  <td style={{ padding: "9px 8px", textAlign: "center" }}>
                    <button
                      onClick={() => deleteEntry(i)}
                      title={`Remove Batch #${e.batchNum || "?"}`}
                      style={{ background: "none", border: "1px solid #ddd", borderRadius: 5, padding: "2px 7px", cursor: "pointer", color: "#c0392b", fontSize: 13, fontWeight: 700, lineHeight: 1 }}>
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <BarChart entries={recent} getValue={e => e.totalBirds || null} label="Birds Placed" format={fmtNum} color="var(--pm-primary)" />
        <BarChart entries={recent} getValue={e => e.totalFeedKg || null} label="Feed Ordered (kg)" format={fmtFeed} color="var(--pm-primary-mid)" />
        <BarChart entries={recent} getValue={e => e.fcr} label="FCR" format={fmtDec} color="#2980b9" />
        <BarChart entries={recent} getValue={e => e.cfcr} label="CFCR" format={fmtDec} color="#8e44ad" />
        <BarChart entries={recent} getValue={e => e.cage} label="Average Age (days)" format={v => `${v.toFixed(1)}d`} color="#C9A227" />
        <BarChart entries={recent} getValue={e => e.mortalityPct} label="Mortality %" format={fmtMort} color="#c0392b" />
      </div>
    </div>
  );
}

// ── Flock Forecast ─────────────────────────────────────────────────────────
interface WeighInData { [shedGroupId: number]: { [age: number]: number } }
interface BreedPoint  { age: number; weight: number; fcr: number }

// Ross 308 FF 2022 — As-Hatched (Mixed Sex) Performance Objectives
// Days 0–33: exact values from official Aviagen 2022 PDF.
// Days 34–56: extrapolated from confirmed 2022 growth trajectory.
const ROSS308FF_DAILY: BreedPoint[] = [
  { age:  0, weight:   44, fcr: 0.000 },
  { age:  1, weight:   62, fcr: 0.196 },
  { age:  2, weight:   81, fcr: 0.352 },
  { age:  3, weight:  102, fcr: 0.476 },
  { age:  4, weight:  125, fcr: 0.577 },
  { age:  5, weight:  151, fcr: 0.658 },
  { age:  6, weight:  181, fcr: 0.724 },
  { age:  7, weight:  213, fcr: 0.780 },
  { age:  8, weight:  249, fcr: 0.826 },
  { age:  9, weight:  288, fcr: 0.865 },
  { age: 10, weight:  330, fcr: 0.900 },
  { age: 11, weight:  376, fcr: 0.930 },
  { age: 12, weight:  425, fcr: 0.957 },
  { age: 13, weight:  477, fcr: 0.982 },
  { age: 14, weight:  533, fcr: 1.005 },
  { age: 15, weight:  592, fcr: 1.026 },
  { age: 16, weight:  655, fcr: 1.047 },
  { age: 17, weight:  720, fcr: 1.066 },
  { age: 18, weight:  789, fcr: 1.086 },
  { age: 19, weight:  860, fcr: 1.105 },
  { age: 20, weight:  935, fcr: 1.123 },
  { age: 21, weight: 1012, fcr: 1.142 },
  { age: 22, weight: 1092, fcr: 1.160 },
  { age: 23, weight: 1174, fcr: 1.178 },
  { age: 24, weight: 1258, fcr: 1.196 },
  { age: 25, weight: 1345, fcr: 1.214 },
  { age: 26, weight: 1434, fcr: 1.233 },
  { age: 27, weight: 1524, fcr: 1.251 },
  { age: 28, weight: 1616, fcr: 1.269 },
  { age: 29, weight: 1710, fcr: 1.288 },
  { age: 30, weight: 1805, fcr: 1.306 },
  { age: 31, weight: 1901, fcr: 1.325 },
  { age: 32, weight: 1999, fcr: 1.343 },
  { age: 33, weight: 2097, fcr: 1.362 },
  // extrapolated ↓
  { age: 34, weight: 2196, fcr: 1.381 },
  { age: 35, weight: 2296, fcr: 1.400 },
  { age: 36, weight: 2397, fcr: 1.418 },
  { age: 37, weight: 2499, fcr: 1.436 },
  { age: 38, weight: 2602, fcr: 1.454 },
  { age: 39, weight: 2705, fcr: 1.473 },
  { age: 40, weight: 2807, fcr: 1.492 },
  { age: 41, weight: 2907, fcr: 1.511 },
  { age: 42, weight: 3005, fcr: 1.530 },
  { age: 43, weight: 3101, fcr: 1.550 },
  { age: 44, weight: 3194, fcr: 1.570 },
  { age: 45, weight: 3284, fcr: 1.590 },
  { age: 46, weight: 3371, fcr: 1.610 },
  { age: 47, weight: 3455, fcr: 1.631 },
  { age: 48, weight: 3535, fcr: 1.652 },
  { age: 49, weight: 3612, fcr: 1.673 },
  { age: 50, weight: 3686, fcr: 1.695 },
  { age: 51, weight: 3757, fcr: 1.717 },
  { age: 52, weight: 3825, fcr: 1.740 },
  { age: 53, weight: 3890, fcr: 1.763 },
  { age: 54, weight: 3952, fcr: 1.786 },
  { age: 55, weight: 4011, fcr: 1.810 },
  { age: 56, weight: 4067, fcr: 1.834 },
];

// Linearly interpolate the Ross 308 FF As-Hatched standard at any given age (days).
function getRoss308Standard(ageDays: number): { weight: number; fcr: number } | null {
  if (ageDays < 0) return null;
  const lo = Math.floor(ageDays);
  const hi = lo + 1;
  const loP = ROSS308FF_DAILY.find(p => p.age === lo);
  const hiP = ROSS308FF_DAILY.find(p => p.age === hi);
  if (!loP) return null;
  if (!hiP || lo === hi) return { weight: loP.weight, fcr: loP.fcr };
  const t = ageDays - lo;
  return {
    weight: Math.round(loP.weight + t * (hiP.weight - loP.weight)),
    fcr:    parseFloat((loP.fcr + t * (hiP.fcr - loP.fcr)).toFixed(3)),
  };
}

const BREED_STANDARDS: Record<string, { name: string; data: BreedPoint[] }> = {
  ross308: { name: "Ross 308 FF", data: [
    { age:  7, weight:  213, fcr: 0.780 },
    { age: 14, weight:  533, fcr: 1.005 },
    { age: 21, weight: 1012, fcr: 1.142 },
    { age: 28, weight: 1616, fcr: 1.269 },
    { age: 35, weight: 2296, fcr: 1.400 },
    { age: 42, weight: 3005, fcr: 1.530 },
    { age: 49, weight: 3612, fcr: 1.673 },
    { age: 56, weight: 4067, fcr: 1.834 },
  ]},
  cobb500: { name: "Cobb 500", data: [
    { age:  7, weight:  180, fcr: 0.83 },
    { age: 14, weight:  510, fcr: 1.10 },
    { age: 21, weight: 1040, fcr: 1.27 },
    { age: 28, weight: 1730, fcr: 1.38 },
    { age: 35, weight: 2500, fcr: 1.52 },
    { age: 42, weight: 3200, fcr: 1.67 },
    { age: 49, weight: 3850, fcr: 1.82 },
  ]},
};

function FlockForecastView({ sheets, edits, farmConfig, catchMap }: {
  sheets: SheetParsed[];
  edits: Map<string, string>[];
  farmConfig: FarmConfigData;
  catchMap: CatchMap;
}) {
  const [weighIns, setWeighIns] = useState<WeighInData>(() => {
    try { return JSON.parse(localStorage.getItem(FLOCK_WEIGHIN_KEY) || "{}"); } catch { return {}; }
  });
  const [shedBreeds, setShedBreeds] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(FLOCK_BREEDS_KEY) || "{}"); } catch { return {}; }
  });
  const [targetAge, setTargetAge]   = useState(42);
  const [editingWI, setEditingWI]   = useState<{ sgId: number; age: number; val: string } | null>(null);

  // Keys are "${sgId}-1" and "${sgId}-2" for individual sheds within a group
  const getShedBreedKey = (sgId: number, slot: 1 | 2) => shedBreeds[`${sgId}-${slot}`] ?? "ross308";
  const getShedBreedStd = (sgId: number, slot: 1 | 2) => BREED_STANDARDS[getShedBreedKey(sgId, slot)] ?? BREED_STANDARDS.ross308;
  const setIndivBreed   = (sgId: number, slot: 1 | 2, key: string) => {
    const next = { ...shedBreeds, [`${sgId}-${slot}`]: key };
    setShedBreeds(next);
    localStorage.setItem(FLOCK_BREEDS_KEY, JSON.stringify(next));
  };

  const saveWeighIn = (sgId: number, age: number, grams: number | null) => {
    const next: WeighInData = JSON.parse(JSON.stringify(weighIns));
    if (!next[sgId]) next[sgId] = {};
    if (grams === null || grams <= 0) delete next[sgId][age];
    else next[sgId][age] = grams;
    setWeighIns(next);
    localStorage.setItem(FLOCK_WEIGHIN_KEY, JSON.stringify(next));
  };

  const gcv = (si: number, r: number, c: number): string => {
    const ed = edits[si]?.get(`${r},${c}`);
    if (ed !== undefined) return ed;
    return String(sheets[si]?.cells.get(`${r},${c}`)?.value ?? "");
  };
  const gcn = (si: number, r: number, c: number) => parseFloat(gcv(si, r, c).replace(/,/g, "")) || 0;

  const today = new Date(); today.setHours(0, 0, 0, 0);

  type ShedFI = {
    si: number; sgId: number; label: string;
    shed1: string; shed2: string;
    birds1: number; birds2: number; birds: number;
    morts1: number; morts2: number;
    placementDate: Date | null; age: number;
    feedUsed: number; feedOnHand: number;
  };

  const shedInfos: ShedFI[] = [];
  let shedCount = 0;
  for (let i = 0; i < sheets.length; i++) {
    const tabName = sheets[i].name.trim().toUpperCase();
    if (tabName === "WEEKLY STOCK TAKE" || tabName === "CONSUMPTION GUIDE") continue;
    if (!tabName.includes("SHED")) continue;
    const sgId = SHED_SHEET_ORDER[shedCount] ?? (shedCount + 1);
    shedCount++;
    const grpCfg = farmConfig.shedGroups?.find(g => g.shedGroupId === sgId);
    const grpActive = grpCfg ? grpCfg.active !== false : sgId <= 6;
    if (!grpActive) continue;

    const shed1  = gcv(i, 3, 1) || `Shed ${sgId * 2 - 1}`;
    const shed2  = gcv(i, 4, 1) || `Shed ${sgId * 2}`;
    const birds1 = gcn(i, 3, 2);
    const birds2 = gcn(i, 4, 2);
    const birds  = birds1 + birds2;
    // Morts: row 3/4 col 4 (column D) holds cumulative morts per shed if available
    const morts1 = gcn(i, 3, 4);
    const morts2 = gcn(i, 4, 4);
    const pd     = parseDateInput(gcv(i, 2, 2));
    const age    = pd ? Math.floor((today.getTime() - pd.getTime()) / 86400000) + 1 : 0;

    let feedUsed = 0;
    for (let r = 12; r <= 71; r++) {
      const n = parseFloat(gcv(i, r, COL_H).replace(/,/g, ""));
      if (!isNaN(n) && n > 0) feedUsed += n;
    }
    const curRow   = Math.min(Math.max(12, 11 + age), 71);
    const feedOnHand = parseFloat(gcv(i, curRow, COL_I).replace(/,/g, "")) || 0;

    shedInfos.push({ si: i, sgId, label: `Shed ${sgId * 2 - 1} & ${sgId * 2}`, shed1, shed2, birds1, birds2, birds, morts1, morts2, placementDate: pd, age, feedUsed, feedOnHand });
  }

  const getProj = (info: ShedFI, slot: 1 | 2 = 1) => {
    const breed  = getShedBreedStd(info.sgId, slot);
    const wi     = weighIns[info.sgId] ?? {};
    const latest = [...breed.data].reverse().find(p => wi[p.age] > 0);
    const ratio  = latest ? wi[latest.age] / latest.weight : 1.0;
    const tgtPt  = breed.data.find(p => p.age >= targetAge) ?? breed.data[breed.data.length - 1];
    const projWt = Math.round(tgtPt.weight * ratio);

    const latestWt = latest ? wi[latest.age] : 0;
    const wgKg     = info.birds > 0 && latestWt > 0 ? ((latestWt - 42) / 1000) * info.birds : 0;
    const actFCR   = wgKg > 0 && info.feedUsed > 0 ? info.feedUsed / wgKg : null;
    const latestFCR = latest?.fcr ?? tgtPt.fcr;
    const projFCR  = actFCR ? Math.round((tgtPt.fcr * (actFCR / latestFCR)) * 100) / 100 : tgtPt.fcr;

    const curPt    = breed.data.find(p => p.age >= info.age) ?? breed.data[0];
    const curProjWt = curPt.weight * ratio;
    const wgNeeded = Math.max(0, (projWt - (latestWt || curProjWt)) / 1000);
    const feedNeeded = info.birds > 0 && wgNeeded > 0 ? Math.round(info.birds * wgNeeded * projFCR) : 0;

    return { ratio, projWt, actFCR, projFCR, feedNeeded, stdWt: tgtPt.weight, stdFCR: tgtPt.fcr, daysLeft: Math.max(0, targetAge - info.age), latestAge: latest?.age ?? null };
  };

  const hdr = (txt: string) => (
    <div style={{ fontWeight: 700, fontSize: 11, color: "var(--pm-primary)", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 8 }}>{txt}</div>
  );

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto", fontFamily: "Calibri,'Segoe UI',sans-serif" }}>
      {/* Page header */}
      <div style={{ background: "linear-gradient(135deg, var(--pm-primary) 0%, var(--pm-primary-mid) 100%)", color: "#fff", borderRadius: 12, padding: "16px 22px", marginBottom: 20, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", borderBottom: "3px solid #C9A227" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>🔮 Flock Forecast</div>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>Growth predictions based on standard breed curves &amp; your weigh-ins</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, opacity: 0.7, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 3 }}>Target Catch Age</div>
            <div style={{ display: "flex", gap: 5 }}>
              {[35, 42, 49].map(a => (
                <button key={a} onClick={() => setTargetAge(a)}
                  style={{ background: targetAge === a ? "#C9A227" : "rgba(255,255,255,0.15)", color: targetAge === a ? "#000" : "#fff", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6, padding: "4px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {a}d
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {shedInfos.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "#aaa", fontSize: 15 }}>No active shed sheets found.</div>
      )}

      {shedInfos.map(info => {
        const p    = getProj(info);
        const wi   = weighIns[info.sgId] ?? {};
        const suf  = info.feedOnHand > 0 && p.feedNeeded > 0 ? info.feedOnHand >= p.feedNeeded : null;
        const buf  = info.feedOnHand - p.feedNeeded;

        return (
          <div key={info.sgId} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e0e8e4", boxShadow: "0 2px 8px rgba(0,0,0,0.07)", marginBottom: 20, overflow: "hidden" }}>
            {/* Shed header bar */}
            <div style={{ background: "linear-gradient(135deg, var(--pm-primary) 0%, var(--pm-primary-mid) 100%)", color: "#fff", padding: "10px 18px" }}>
              {/* Top row: label, age chip, date, total birds */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <div style={{ background: "#C9A227", color: "#000", borderRadius: 6, padding: "2px 12px", fontWeight: 800, fontSize: 14 }}>{info.label}</div>
                {info.age > 0 && <div style={{ background: "rgba(255,255,255,0.18)", borderRadius: 6, padding: "2px 9px", fontSize: 13, fontWeight: 700 }}>Day {info.age}</div>}
                {info.placementDate && <span style={{ fontSize: 12, opacity: 0.75 }}>📅 Placed {info.placementDate.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</span>}
                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{info.birds > 0 ? info.birds.toLocaleString() : "—"}</div>
                  <div style={{ fontSize: 9, opacity: 0.65, textTransform: "uppercase" as const, letterSpacing: 0.8 }}>Total Birds</div>
                </div>
              </div>
              {/* Bottom row: per-shed breed selectors + individual bird counts */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {([1, 2] as (1 | 2)[]).map(slot => {
                  const shedName  = slot === 1 ? info.shed1 : info.shed2;
                  const birdCount = slot === 1 ? info.birds1 : info.birds2;
                  const mortCount = slot === 1 ? info.morts1 : info.morts2;
                  const mortPct   = birdCount > 0 && mortCount > 0 ? ((mortCount / birdCount) * 100).toFixed(2) : null;
                  const shedNum   = info.sgId * 2 - (slot === 1 ? 1 : 0);
                  const catches   = catchMap[shedNum] ?? [];
                  const totalCaught = catches.reduce((a, r) => a + (parseFloat(r.birds) || 0), 0);
                  return (
                    <div key={slot} style={{ background: "rgba(255,255,255,0.12)", borderRadius: 8, padding: "7px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flex: 1, minWidth: 200 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 13 }}>{shedName}</div>
                        <div style={{ fontSize: 11, opacity: 0.75 }}>
                          {birdCount > 0 ? birdCount.toLocaleString() : "—"} birds
                          {mortPct ? <span style={{ marginLeft: 6, color: "#ffc3c3" }}>{mortPct}% mort</span> : null}
                          {totalCaught > 0 ? <span style={{ marginLeft: 6, color: "#c3ffd1" }}>✓ {totalCaught.toLocaleString()} caught</span> : null}
                        </div>
                      </div>
                      <select
                        value={getShedBreedKey(info.sgId, slot)}
                        onChange={e => setIndivBreed(info.sgId, slot, e.target.value)}
                        style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 6, padding: "3px 8px", fontSize: 12, fontWeight: 600, cursor: "pointer", marginLeft: "auto" }}
                      >
                        <option value="ross308" style={{ color: "#000" }}>Ross 308</option>
                        <option value="cobb500" style={{ color: "#000" }}>Cobb 500</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr" }}>
              {/* Left — Weigh-in tracker */}
              <div style={{ padding: "16px 18px", borderRight: "1px solid #f0f0f0" }}>
                {hdr("🐔 Weigh-in Tracker — click a day to enter weight")}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--pm-primary-soft)" }}>
                      {["Age", "Standard", "Actual", "Δ%", ""].map((h, i) => (
                        <th key={i} style={{ padding: "5px 8px", textAlign: i === 0 ? "left" : "right", color: "var(--pm-primary)", fontWeight: 700, fontSize: 11, textTransform: "uppercase" as const }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Build catch-derived weight map for this shed group (avg across both sheds)
                      const catchWts: Record<number, { grams: number; label: string }> = {};
                      ([1, 2] as const).forEach(slot => {
                        const sNum = info.sgId * 2 - (slot === 1 ? 1 : 0);
                        (catchMap[sNum] ?? []).forEach(c => {
                          const age = parseInt(c.age, 10);
                          const kg  = parseFloat(c.aveWgt);
                          if (!isNaN(age) && age > 0 && !isNaN(kg) && kg > 0) {
                            const grams = Math.round(kg * 1000);
                            catchWts[age] = catchWts[age]
                              ? { grams: Math.round((catchWts[age].grams + grams) / 2), label: "Avg catch" }
                              : { grams, label: slot === 1 ? info.shed1 : info.shed2 };
                          }
                        });
                      });
                      return getShedBreedStd(info.sgId, 1).data.map((pt, idx) => {
                      const actual   = wi[pt.age];
                      const catchWt  = catchWts[pt.age];
                      const display  = actual ?? (catchWt?.grams ?? null);
                      const isCatch  = !actual && !!catchWt;
                      const isEdit   = editingWI?.sgId === info.sgId && editingWI?.age === pt.age;
                      const isPast   = info.age >= pt.age;
                      const isTgt    = pt.age === targetAge;
                      const delta    = display ? ((display - pt.weight) / pt.weight) * 100 : null;
                      const statusDot = display == null ? null : delta! >= 3 ? "🟢" : delta! >= -3 ? "🟡" : "🔴";
                      return (
                        <tr key={pt.age} style={{ background: idx % 2 === 0 ? "#fafcfb" : "#fff", borderBottom: "1px solid #f4f4f4", opacity: !isPast && !isTgt ? 0.55 : 1 }}>
                          <td style={{ padding: "5px 8px", fontWeight: isTgt ? 800 : 600, color: isTgt ? "#C9A227" : "#333" }}>
                            Day {pt.age}{isTgt ? " 🎯" : ""}
                          </td>
                          <td style={{ padding: "5px 8px", textAlign: "right", color: "#666" }}>{pt.weight.toLocaleString()}g</td>
                          <td style={{ padding: "5px 8px", textAlign: "right",
                              cursor: isCatch ? "default" : isPast ? "pointer" : "default",
                              color: display ? (delta! >= 0 ? "#1a7a40" : "#c0392b") : "#ccc",
                              background: isCatch ? "#fffbea" : "transparent" }}
                            onClick={() => !isCatch && isPast && setEditingWI({ sgId: info.sgId, age: pt.age, val: actual ? String(actual) : "" })}>
                            {isEdit ? (
                              <input autoFocus type="number" value={editingWI!.val}
                                onChange={e => setEditingWI(prev => prev ? { ...prev, val: e.target.value } : prev)}
                                onBlur={() => {
                                  const g = parseFloat(editingWI!.val);
                                  saveWeighIn(info.sgId, pt.age, isNaN(g) ? null : g);
                                  setEditingWI(null);
                                }}
                                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingWI(null); }}
                                style={{ width: 72, textAlign: "right", border: "1.5px solid var(--pm-primary)", borderRadius: 4, padding: "2px 5px", fontSize: 13, outline: "none" }} />
                            ) : display ? (
                              <span>
                                <strong>{display.toLocaleString()}g</strong>
                                {isCatch && <span style={{ fontSize: 9, color: "#9a7a00", marginLeft: 4 }}>🏭catch</span>}
                              </span>
                            ) : isPast ? (
                              <span style={{ color: "#bbb", fontSize: 11 }}>— tap to enter</span>
                            ) : (
                              <span style={{ color: "#ddd" }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: delta == null ? "#ddd" : delta >= 0 ? "#1a7a40" : "#c0392b" }}>
                            {delta != null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%` : "—"}
                          </td>
                          <td style={{ padding: "5px 8px", textAlign: "right" }}>{statusDot ?? (isPast ? <span style={{ color: "#e0e0e0" }}>⬜</span> : null)}</td>
                        </tr>
                      );
                    }); })()}
                  </tbody>
                </table>
              </div>

              {/* Right — Predictions */}
              <div style={{ padding: "16px 18px" }}>
                {hdr(`📊 Predictions — Day ${targetAge} target`)}

                {/* Projected weight */}
                <div style={{ background: "var(--pm-primary-soft)", border: "1px solid var(--pm-primary-border)", borderRadius: 8, padding: "12px 14px", marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: "#999", textTransform: "uppercase" as const, letterSpacing: 0.4, marginBottom: 3 }}>Projected Catch Weight</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "var(--pm-primary)", lineHeight: 1 }}>{p.projWt > 0 ? `${p.projWt.toLocaleString()}g` : "—"}</div>
                  {p.projWt > 0 && (
                    <>
                      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                        Standard: {p.stdWt.toLocaleString()}g &nbsp;
                        <span style={{ fontWeight: 700, color: p.ratio >= 1 ? "#1a7a40" : "#c0392b" }}>
                          ({p.ratio >= 1 ? "+" : ""}{((p.ratio - 1) * 100).toFixed(1)}% vs standard)
                        </span>
                      </div>
                      {info.birds > 0 && (
                        <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                          Total live: ~{((p.projWt / 1000) * info.birds / 1000).toFixed(1)}t
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* FCR */}
                <div style={{ background: "var(--pm-primary-soft)", border: "1px solid var(--pm-primary-border)", borderRadius: 8, padding: "12px 14px", marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: "#999", textTransform: "uppercase" as const, letterSpacing: 0.4, marginBottom: 6 }}>Feed Conversion Ratio (FCR)</div>
                  <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
                    {[
                      { label: "Actual so far", val: p.actFCR ? p.actFCR.toFixed(2) : "—", color: p.actFCR ? (p.actFCR <= p.stdFCR ? "#1a7a40" : "#c0392b") : "#bbb" },
                      { label: "Projected",     val: (p.actFCR ? p.projFCR : p.stdFCR).toFixed(2), color: "var(--pm-primary)" },
                      { label: "Standard",      val: p.stdFCR.toFixed(2), color: "#aaa" },
                    ].map(({ label, val, color }) => (
                      <div key={label} style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: "#bbb", marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Feed sufficiency */}
                <div style={{ background: suf === null ? "var(--pm-primary-soft)" : suf ? "#f0faf4" : "#fff5f5", border: `1px solid ${suf === null ? "var(--pm-primary-border)" : suf ? "#a8ddb8" : "#f0b0b0"}`, borderRadius: 8, padding: "12px 14px", marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: "#999", textTransform: "uppercase" as const, letterSpacing: 0.4, marginBottom: 8 }}>Feed Sufficiency</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#bbb" }}>Needed to Day {targetAge}</div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: "#c0392b" }}>{p.feedNeeded > 0 ? `${p.feedNeeded.toLocaleString()} kg` : "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#bbb" }}>Feed on Hand</div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: "var(--pm-primary)" }}>{info.feedOnHand > 0 ? `${Math.round(info.feedOnHand).toLocaleString()} kg` : "—"}</div>
                    </div>
                  </div>
                  {suf !== null && (
                    <div style={{ fontWeight: 700, fontSize: 13, color: suf ? "#1a7a40" : "#c0392b" }}>
                      {suf ? `✅ Sufficient — ${Math.round(buf).toLocaleString()} kg buffer` : `⚠️ Shortfall of ${Math.abs(Math.round(buf)).toLocaleString()} kg — order more`}
                    </div>
                  )}
                </div>

                {/* Days chip row */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {p.daysLeft > 0 && info.age > 0 && (
                    <div style={{ background: "var(--pm-primary-pale)", border: "1px solid var(--pm-primary-border)", borderRadius: 6, padding: "5px 11px", fontSize: 12, fontWeight: 600, color: "var(--pm-primary)" }}>
                      🗓 {p.daysLeft} day{p.daysLeft !== 1 ? "s" : ""} to catch
                    </div>
                  )}
                  {p.latestAge && (
                    <div style={{ background: "#fff8e0", border: "1px solid #e8d070", borderRadius: 6, padding: "5px 11px", fontSize: 12, fontWeight: 600, color: "#7a6000" }}>
                      📍 Last weigh-in: Day {p.latestAge}
                    </div>
                  )}
                  {!info.placementDate && (
                    <div style={{ fontSize: 12, color: "#bbb", padding: "5px 0" }}>Set a placement date on the Summary tab to enable age calculations.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Per-shed catch summary strip */}
            {(() => {
              const shedNums = [info.sgId * 2 - 1, info.sgId * 2];
              const shedNames = [info.shed1, info.shed2];
              const hasAnyCatch = shedNums.some(n => (catchMap[n] ?? []).length > 0);
              if (!hasAnyCatch) return null;
              return (
                <div style={{ borderTop: "1px solid #e8f0ec", background: "#f8fdf9", padding: "10px 18px" }}>
                  <div style={{ fontWeight: 700, fontSize: 11, color: "var(--pm-primary)", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 8 }}>🏭 Catch Summary</div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {shedNums.map((shedNum, si) => {
                      const rows = catchMap[shedNum] ?? [];
                      if (rows.length === 0) return null;
                      const birdCount = si === 0 ? info.birds1 : info.birds2;
                      const totalCaught = rows.reduce((a, r) => a + (parseFloat(r.birds) || 0), 0);
                      const totalWgtKg  = rows.reduce((a, r) => {
                        const tw = parseFloat(r.totalWgt);
                        const bw = (parseFloat(r.birds) || 0) * (parseFloat(r.aveWgt) || 0);
                        return a + (tw > 0 ? tw * 1000 : bw);
                      }, 0);
                      const aveWgt = totalCaught > 0 ? totalWgtKg / totalCaught : 0;
                      const mortPct = birdCount > 0 && totalCaught > 0 ? ((birdCount - totalCaught) / birdCount * 100) : null;
                      return (
                        <div key={shedNum} style={{ background: "#fff", border: "1px solid #d4ead8", borderRadius: 8, padding: "8px 14px", minWidth: 180, flex: 1 }}>
                          <div style={{ fontWeight: 800, fontSize: 13, color: "var(--pm-primary)", marginBottom: 5 }}>{shedNames[si]} — Shed {shedNum}</div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                            {[
                              { label: "Birds Caught",   val: totalCaught > 0 ? totalCaught.toLocaleString() : "—" },
                              { label: "Avg Weight",     val: aveWgt > 0 ? `${aveWgt.toFixed(3)} kg` : "—" },
                              { label: "Total Live",     val: totalWgtKg > 0 ? `${Math.round(totalWgtKg).toLocaleString()} kg` : "—" },
                              { label: "Catches",        val: String(rows.length) },
                              { label: "Mortality %",    val: mortPct != null ? `${mortPct.toFixed(2)}%` : "—" },
                              { label: "Placed",         val: birdCount > 0 ? birdCount.toLocaleString() : "—" },
                            ].map(({ label, val }) => (
                              <div key={label}>
                                <div style={{ fontSize: 9, color: "#aaa", textTransform: "uppercase" as const, letterSpacing: 0.4 }}>{label}</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>{val}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [sheets, setSheets] = useState<SheetParsed[]>([]);
  const [active, setActive] = useState(0);
  const [activeView, setActiveView] = useState<null | "summary" | "batchResults" | "morts" | "history" | "flockForecast" | "eggProduction" | "bodyWeight">(null);
  const [batchResultsSummary, setBatchResultsSummary] = useState<BatchSummary | null>(null);
  const [batchKey, setBatchKey] = useState(0);
  const [batchCleared, setBatchCleared] = useState<boolean>(() => localStorage.getItem("silo-batch-cleared") === "1");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [edits, setEdits] = useState<Map<string, string>[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [farmConfig, setFarmConfig] = useState<FarmConfigData>(readFarmConfig);
  const [mortsLog, setMortsLog] = useState<MortsLog>(() => {
    try { return JSON.parse(localStorage.getItem(MORTS_LOG_KEY) || "{}"); } catch { return {}; }
  });
  const [cullsLog, setCullsLog] = useState<MortsLog>(() => {
    try { return JSON.parse(localStorage.getItem(CULLS_LOG_KEY) || "{}"); } catch { return {}; }
  });
  const [catchMap, setCatchMap] = useState<CatchMap>(() => {
    try { return JSON.parse(localStorage.getItem(BATCH_CATCHES_KEY) || "{}"); } catch { return {}; }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showFeedAlert, setShowFeedAlert] = useState(false);
  const [autoSaveFlash, setAutoSaveFlash] = useState(false);
  const [settingsFarmName, setSettingsFarmName] = useState("");
  const [settingsBatchNum, setSettingsBatchNum] = useState("");
  const t = useMemo(() => createTranslator(farmConfig.language), [farmConfig.language]);
  const workbookRef = useRef<WorkBook | null>(null);
  const rawBufferRef = useRef<ArrayBuffer | null>(null);
  const seedDoneRef = useRef(false);
  const deliverySeedDoneRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

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

  // Initialize and sync dark-mode class with Silo Tracker
  useEffect(() => {
    const applyDark = (t: string | null) => {
      document.documentElement.classList.toggle("dark", t === "dark");
    };
    applyDark(localStorage.getItem("silo-theme"));
    const onThemeStorage = (e: StorageEvent) => {
      if (e.key === "silo-theme") applyDark(e.newValue);
    };
    window.addEventListener("storage", onThemeStorage);
    return () => window.removeEventListener("storage", onThemeStorage);
  }, []);

  // Apply colour theme CSS variables whenever farmConfig.theme changes
  useEffect(() => { applyTheme(getTheme(farmConfig.theme)); }, [farmConfig.theme]);

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
      .then(async ([buf, styleData]: [ArrayBuffer, Record<string, Record<string, RichStyle>>]) => {
        rawBufferRef.current = buf;
        const wb = await parseXlsxBuffer(buf, { cellStyles: true, cellDates: true });
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

          if (/^SHED\s+3\s*&\s*4$/i.test(trimmedName.trim())) {
            startIdx = result.length;
          }
          result.push(parsed);
        });

        setSheets(result);

        // Seed initial edits: cascade Feed Alloc (col G=6) from cream row down
        // for each shed sheet, using whatever Feed Usage (col H=7) values exist.
        // G(r) = G(r-1) - H(r) starting from the cream row allocation at r=11.
        // Also seeds Feed Ordered (E) and Silo readings (K/L/M) from the spreadsheet
        // template so they are preserved when importing an old spreadsheet.
        const initialEdits = result.map(buildInitialEditsForSheet);

        // Restore any auto-saved edits from the previous session and merge them
        // on top of the template defaults so nothing is lost on refresh.
        try {
          const saved = localStorage.getItem(EDITS_AUTOSAVE_KEY);
          if (saved) {
            const savedMaps = deserializeEdits(saved);
            for (let i = 0; i < Math.min(initialEdits.length, savedMaps.length); i++) {
              const savedMap = savedMaps[i];
              if (savedMap && savedMap.size > 0) {
                const merged = new Map(initialEdits[i]);
                savedMap.forEach((v, k) => merged.set(k, v));
                initialEdits[i] = merged;
              }
            }
          }
        } catch { /* corrupt data — ignore and start fresh */ }

        setEdits(initialEdits);
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

  const captureAndSaveBatchHistory = () => {
    const eobIdx = sheets.findIndex(s => s.name.trim().toLowerCase() === "end of batch");
    const getCell = (si: number, r: number, c: number) => {
      const m = edits[si];
      const v = m?.has(`${r},${c}`) ? m.get(`${r},${c}`) : String(sheets[si]?.cells.get(`${r},${c}`)?.value ?? "");
      return parseFloat((v ?? "").replace(/,/g, "")) || 0;
    };
    const batchNum = eobIdx >= 0 ? getCell(eobIdx, 1, 2) : 0;
    let totalBirds = 0, totalFeedKg = 0, shedCount = 0;
    for (let i = 0; i < sheets.length; i++) {
      const name = sheets[i].name.trim().toUpperCase();
      if (!name.includes("SHED")) continue;
      const shedGroupId = SHED_SHEET_ORDER[shedCount++] ?? shedCount;
      const groupCfg = farmConfig.shedGroups?.find(g => g.shedGroupId === shedGroupId);
      const active = groupCfg ? groupCfg.active !== false : shedGroupId <= 6;
      if (!active) continue;
      totalBirds += getCell(i, 3, 2) + getCell(i, 4, 2);
      for (let r = 12; r <= 71; r++) { const f = getCell(i, r, 4); if (f) totalFeedKg += f; }
    }
    const entry: BatchHistoryEntry = {
      batchNum,
      date: new Date().toISOString(),
      totalBirds,
      totalFeedKg,
      fcr:         batchResultsSummary?.fcr         ?? null,
      cfcr:        batchResultsSummary?.cfcr        ?? null,
      cage:        batchResultsSummary?.cage        ?? null,
      mortalityPct:batchResultsSummary?.mortalityPct ?? null,
      aveWeight:   batchResultsSummary?.aveWeight   ?? null,
    };
    try {
      const existing: BatchHistoryEntry[] = JSON.parse(localStorage.getItem(BATCH_HISTORY_KEY) ?? "[]");
      localStorage.setItem(BATCH_HISTORY_KEY, JSON.stringify([entry, ...existing].slice(0, 10)));
    } catch {}
  };

  const importSpreadsheet = async (file: File) => {
    try {
      // Save current batch to history before wiping it, then reset the API
      // (deliveries + silo readings) so the new file starts with a clean slate —
      // equivalent to pressing "Start New Batch" + loading a file in one step.
      captureAndSaveBatchHistory();
      try { await fetch("/api/batch/reset", { method: "DELETE" }); } catch { /* best effort */ }

      // Load file + app style theme in parallel
      const [buf, styleData] = await Promise.all([
        file.arrayBuffer(),
        fetch(`${BASE}style-data.json`).then(r => r.ok ? r.json() : {}).catch(() => ({})) as Promise<Record<string, Record<string, RichStyle>>>,
      ]);

      const wb = await parseXlsxBuffer(buf, { cellStyles: true, cellDates: true });
      rawBufferRef.current = buf;
      workbookRef.current = wb;
      seedDoneRef.current = false;
      deliverySeedDoneRef.current = false;

      // Build trimmed-name → richStyles lookup from app theme
      const styleByTrimmed = new Map<string, Record<string, RichStyle>>();
      Object.entries(styleData).forEach(([rawName, cellMap]) => {
        styleByTrimmed.set(rawName.trim(), cellMap);
      });

      const result: SheetParsed[] = [];
      wb.SheetNames.forEach((rawName, idx) => {
        const ws = wb.Sheets[rawName];
        if (!ws) return;
        const trimmedName = rawName.trim();
        const tabColor = wb.Workbook?.Sheets?.[idx]?.TabColor;
        const tabArgb = tabColor?.rgb ? `#${tabColor.rgb}` : undefined;
        // Apply app's rich styles wherever sheet names match — keeps the green theme
        const richStyles = styleByTrimmed.get(trimmedName);
        result.push(parseSheet(ws, trimmedName, rawName, tabArgb, richStyles));
      });

      // Seed initial edits — cascade Feed Alloc (col G=6) from cream row down.
      // Also seeds Feed Ordered (E) and Silo readings (K/L/M) from the spreadsheet
      // template so they are preserved when importing an old spreadsheet.
      const initialEdits = result.map(buildInitialEditsForSheet);

      setSheets(result);
      setEdits(initialEdits);
      setActive(0);
      setActiveView(null);
      setEditingCell(null);
      setHasChanges(false);

      // Clear morts/culls logs — they belong to the old batch
      const emptyLog: MortsLog = {};
      setMortsLog(emptyLog);
      setCullsLog(emptyLog);
      localStorage.removeItem(MORTS_LOG_KEY);
      localStorage.removeItem(CULLS_LOG_KEY);

      // Clear catch data, batch identifiers, and auto-saved edits (new file = new batch)
      setBatchResultsSummary(null);
      setBatchCleared(false);
      localStorage.removeItem("silo-batch-cleared");
      setCatchMap({});
      localStorage.removeItem("silo-batch-catches");
      localStorage.removeItem("silo-batch-num");
      localStorage.removeItem("silo-batch-farm-name");
      localStorage.removeItem(EDITS_AUTOSAVE_KEY);
      setBatchKey(k => k + 1);

      setShowSettings(false);
    } catch (err) {
      alert(`Failed to import spreadsheet: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  const resetForNewBatch = async () => {
    if (!confirm(
      "Start New Batch?\n\nThis will clear ALL delivery and silo reading records from the app, and reset the spreadsheet to its base state.\n\nThis cannot be undone."
    )) return;
    captureAndSaveBatchHistory();
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
        // Total birds: row 2 (r1,c2)
        m.set("1,2", "");
        // Placement date: row 3 (r2,c2)
        m.set("2,2", "");
        // Birds per shed: row 4 (r3,c2) and row 5 (r4,c2)
        m.set("3,2", "");
        m.set("4,2", "");

        // Cream totals row (0-based r=11) — zero the starting Feed On Hand & Silo Total
        // so the cascade in data rows begins from zero for the new batch
        m.set("11,8",  "0"); // col I – Feed On Hand (starting point for cascade)
        m.set("11,9",  "0"); // col J – Silo Total

        // Data rows 13–72 (0-based 12–71):
        const sheet = sheets[i];
        const getCell = (r: number, c: number): number =>
          parseFloat(sheet?.cells.get(`${r},${c}`)?.value ?? "0") || 0;

        // Re-seed Feed Alloc (G) cascade from cream row, and restore Feed On Hand (I)
        // from xlsx values — both are wiped by clearing but must remain visible.
        let gPrev = getCell(11, COL_G); // cream row starting allocation
        for (let r = 12; r <= 71; r++) {
          m.set(`${r},3`,  ""); // col D – Feed Del (hidden but must be cleared)
          m.set(`${r},4`,  ""); // col E – Feed Ordered
          m.set(`${r},5`,  ""); // col F – Silo (letter)
          // Re-seed Feed Alloc: G(r) = G(r-1) - H(r)
          const h = getCell(r, COL_H);
          const g = gPrev - h;
          m.set(`${r},${COL_G}`, String(Math.round(g * 100) / 100));
          gPrev = g;
          // Restore Feed On Hand from xlsx (cleared edits would blank it out)
          const foh = sheet?.cells.get(`${r},${COL_I}`)?.value ?? "";
          if (foh !== "") m.set(`${r},${COL_I}`, String(foh));
          m.set(`${r},9`,  ""); // col J – Silo Total
          m.set(`${r},10`, ""); // col K – Silo A
          m.set(`${r},11`, ""); // col L – Silo B
          m.set(`${r},12`, ""); // col M – Silo C
          m.set(`${r},13`, ""); // col N – Catch Morts
          m.set(`${r},14`, ""); // col O – Birds Left
        }
        return m;
      }

      if (i !== eobIdx) return m;

      // ── "end of batch" sheet — clear batch data only ────────────────────────
      // Preserve structural rows 0-5 (farm info, batch header, feed-type labels
      // STARTER/GROWER/FINISHER/WITHDRAWL, column-header row Date/Docket/Tonnes)
      // and column V (col 21) which holds the permanent shed-number list.
      const eobSheet = sheets[eobIdx];
      const shouldSkip = (key: string) => {
        const parts = key.split(",");
        const r = parseInt(parts[0]);
        const c = parseInt(parts[1]);
        return r < 6 || c === 21;
      };
      if (eobSheet) {
        // Clear base xlsx cell values
        for (const [key, info] of eobSheet.cells) {
          if (shouldSkip(key)) continue;
          if (info.value !== "" && info.value !== undefined) {
            m.set(key, "");
          }
        }
        // Also clear any user-typed edits (these only exist in the edits layer,
        // not in eobSheet.cells, so the loop above would miss them)
        const existingEobEdits = edits[eobIdx];
        if (existingEobEdits) {
          for (const [key] of existingEobEdits) {
            if (shouldSkip(key)) continue;
            m.set(key, "");
          }
        }
      }

      // Zero formula/total cells that display sums (so they show 0, not blank)
      m.set("36,3",  "0");  // D37 – STARTER total
      m.set("36,8",  "0");  // I37 – GROWER total
      m.set("36,12", "0");  // M37 – FINISHER total
      m.set("36,16", "0");  // Q37 – WITHDRAWL total
      m.set("11,18", "0");  // S12 – Total Feed Purchased
      m.set("18,18", "0");  // S19 – Feed Used
      m.set("21,23", "0");  // X22 – Total feed use
      m.set("16,23", "0");  // X17 – Total birds catched
      m.set("16,24", "0");  // Y17 – Total actual morts

      return m;
    });

    setEdits(newEdits);

    // Clear the morts and culls logs — they belong to the old batch
    const emptyLog: MortsLog = {};
    setMortsLog(emptyLog);
    setCullsLog(emptyLog);
    localStorage.removeItem(MORTS_LOG_KEY);
    localStorage.removeItem(CULLS_LOG_KEY);

    // Clear Batch Results summary, catch data, batch identifiers, and auto-saved edits
    setBatchResultsSummary(null);
    setBatchCleared(true);
    localStorage.setItem("silo-batch-cleared", "1");
    setCatchMap({});
    localStorage.removeItem("silo-batch-catches");
    localStorage.removeItem("silo-batch-num");
    localStorage.removeItem("silo-batch-farm-name");
    localStorage.removeItem(EDITS_AUTOSAVE_KEY);
    setBatchKey(k => k + 1);

    setHasChanges(false);
  };

  // ── Auto-save edits to localStorage ─────────────────────────────────────────
  // Debounced: waits 2 s after the last change before writing.
  // Cleared on import / new-batch so stale edits never bleed into a new batch.
  useEffect(() => {
    if (sheets.length === 0) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(EDITS_AUTOSAVE_KEY, serializeEdits(edits));
        setAutoSaveFlash(true);
        setTimeout(() => setAutoSaveFlash(false), 2500);
      } catch { /* storage full — silently skip */ }
    }, 2000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [edits, sheets.length]);

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
        const addr = encodeCell({ r, c });
        xml = updateCellInXml(xml!, addr, newVal);
      });
      zip.file(xmlPath, xml!);
    }

    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 3 } });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "feed-program.xlsx";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setHasChanges(false);
  };

  // Scan all shed sheets for low/critical Feed On Hand in their most recent data row
  // IMPORTANT: must be before early returns to satisfy Rules of Hooks
  const feedAlertInfo = useMemo(() => {
    const alerts: { name: string; status: 'critical' | 'warning' }[] = [];
    for (let si = 0; si < sheets.length; si++) {
      const sheet = sheets[si];
      if (!sheet.rawName?.toUpperCase().includes("SHED")) continue;
      const sheetEdits = edits[si] ?? new Map<string, string>();
      const getVal = (r: number, c: number): string => {
        const key = `${r},${c}`;
        return sheetEdits.has(key) ? sheetEdits.get(key)! : String(sheet.cells?.get(key)?.value ?? "");
      };
      // Dynamic data start
      let dataStart = 12;
      for (let r = 9; r <= 16; r++) {
        if (getVal(r, 0).trim() === "1" || getVal(r, 1).trim() === "1") { dataStart = r; break; }
      }
      // Find last row with a numeric FOH value (col 8)
      let lastFoh: number | null = null;
      let lastUsage = 0;
      for (let r = dataStart; r < dataStart + 60; r++) {
        const foh = parseFloat(getVal(r, 8).replace(/,/g, ""));
        if (!isNaN(foh) && isFinite(foh)) {
          lastFoh = foh;
          lastUsage = parseFloat(getVal(r, 7).replace(/,/g, "")) || 0;
        }
      }
      if (lastFoh === null) continue;
      if (lastFoh <= 0) {
        alerts.push({ name: sheet.rawName, status: 'critical' });
      } else if (lastUsage > 0 && lastFoh <= lastUsage * 2) {
        alerts.push({ name: sheet.rawName, status: 'warning' });
      }
    }
    return alerts;
  }, [sheets, edits]);

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

  const hasCritical = feedAlertInfo.some(a => a.status === 'critical');

  const current = sheets[active];

  const appTheme = getTheme(farmConfig.theme);
  return (
    <LanguageContext.Provider value={t}>
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-zinc-900" style={{
      "--pm-primary": appTheme.primary,
      "--pm-primary-mid": appTheme.mid,
      "--pm-primary-pale": appTheme.pale,
      "--pm-primary-border": appTheme.border,
      "--pm-primary-soft": appTheme.soft,
      "--pm-primary-dim": appTheme.dim,
    } as React.CSSProperties}>
      {/* Bell-ring keyframe */}
      <style>{`
        @keyframes bell-wiggle {
          0%,100% { transform: rotate(0deg); }
          15%     { transform: rotate(-18deg); }
          30%     { transform: rotate(18deg); }
          45%     { transform: rotate(-12deg); }
          60%     { transform: rotate(12deg); }
          75%     { transform: rotate(0deg); }
        }
        .bell-icon-wiggle { animation: bell-wiggle 2.5s ease infinite; display: inline-block; transform-origin: top center; }
        .bell-icon-still  { display: inline-block; }
        :root {
          --pm-primary: ${appTheme.primary};
          --pm-primary-mid: ${appTheme.mid};
          --pm-primary-pale: ${appTheme.pale};
          --pm-primary-border: ${appTheme.border};
          --pm-primary-soft: ${appTheme.soft};
          --pm-primary-dim: ${appTheme.dim};
        }
      `}</style>
      {/* Header */}
      <div className="text-white px-4 py-2 flex items-center gap-3 shadow-md shrink-0" style={{ background: "var(--pm-primary)" }}>
        <span className="text-lg font-bold tracking-wide">{farmConfig.farmName ?? "Double B Farm"} — {(farmConfig.farmType ?? "broiler") === "breeder" ? "Breeder Program" : "Feed Program"}</span>
        <div className="ml-auto flex items-center gap-2">
          {autoSaveFlash
            ? <span style={{ color: "#86efac", fontSize: 12, fontWeight: 600 }}>✓ Auto-saved</span>
            : hasChanges && <span style={{ color: "#fde68a", fontSize: 12, fontWeight: 600 }}>● Saving…</span>
          }
          {(() => {
            const isGood = feedAlertInfo.length === 0;
            const bg    = isGood ? "#16a34a" : hasCritical ? "#dc2626" : "#f59e0b";
            const fg    = isGood ? "#fff"    : hasCritical ? "#fff"    : "#7c2d12";
            const shadow = isGood ? "0 0 0 2px #86efac" : hasCritical ? "0 0 0 2px #fca5a5" : "0 0 0 2px #fde68a";
            const label = isGood ? "Feed OK" : `${feedAlertInfo.length} Feed Alert${feedAlertInfo.length > 1 ? "s" : ""}`;
            const title = isGood ? "All sheds have sufficient feed" : `${feedAlertInfo.length} shed${feedAlertInfo.length > 1 ? "s" : ""} with low feed — click for details`;
            return (
              <button
                onClick={() => setShowFeedAlert(true)}
                title={title}
                style={{ background: bg, color: fg, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, boxShadow: shadow }}
              >
                <span className={isGood ? "bell-icon-still" : "bell-icon-wiggle"} style={{ fontSize: 16 }}>🔔</span>
                {label}
              </button>
            );
          })()}
          <button
            onClick={() => { setSettingsFarmName(farmConfig.farmName ?? ""); setSettingsBatchNum(localStorage.getItem("silo-batch-num") ?? ""); setShowSettings(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-semibold bg-white/10 hover:bg-white/20 transition-colors text-white border border-white/30"
            title={t("settings")}
          >
            ⚙ {t("settings")}
          </button>
          <button
            onClick={downloadFile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-semibold transition-colors"
            style={{ background: hasChanges ? "#f59e0b" : "#2d8653", color: hasChanges ? "#000" : "#fff" }}
          >
            ⬇ {t("saveDownload")}
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
      <div className="dark:bg-zinc-800 border-b border-green-200 dark:border-zinc-700 px-4 py-1 text-xs text-green-800 dark:text-green-300 shrink-0" style={{ background: "var(--pm-primary-pale)" }}>
        Double-click any cell to edit. <kbd className="bg-white dark:bg-zinc-700 border border-green-300 dark:border-zinc-600 rounded px-1">Enter</kbd> / <kbd className="bg-white dark:bg-zinc-700 border border-green-300 dark:border-zinc-600 rounded px-1">↑↓</kbd> move between rows · <kbd className="bg-white dark:bg-zinc-700 border border-green-300 dark:border-zinc-600 rounded px-1">Tab</kbd> moves columns · <kbd className="bg-white dark:bg-zinc-700 border border-green-300 dark:border-zinc-600 rounded px-1">Esc</kbd> cancels
      </div>

      {/* Sheet tabs */}
      <div className="flex items-end gap-0.5 px-3 pt-2 overflow-x-auto shrink-0" style={{ background: "#154d2c" }}>
        {/* Summary tab */}
        <button
          onClick={() => setActiveView("summary")}
          className="px-3 py-2.5 text-xs font-semibold rounded-t border border-b-0 whitespace-nowrap transition-all"
          style={{
            backgroundColor: activeView === "summary" ? "#fff" : "#2d9e5f",
            color: activeView === "summary" ? "var(--pm-primary)" : "#fff",
            borderColor: activeView === "summary" ? "#ccc" : "#27885200",
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
            // If config found: use stored active flag.
            // If no config: groups 1–6 (sheds 1–12) active by default; 7+ inactive.
            const groupActive = groupCfg ? groupCfg.active !== false : (shedGroupId != null && shedGroupId <= 6);
            if (!groupActive) return null;
          }

          const isActive = i === active;
          const hasEdits = edits[i]?.size > 0;
          const tabAlert = feedAlerts.find(a => a.sheetIdx === i);
          const alertDotColor = tabAlert?.urgency === "critical" ? "#c0392b" : tabAlert?.urgency === "warning" ? "#e67e22" : tabAlert ? "#f39c12" : null;
          return (
            <button
              key={i}
              onClick={() => { setActive(i); setActiveView(null); }}
              className="px-3 py-2.5 text-xs font-semibold rounded-t border border-b-0 whitespace-nowrap transition-all"
              style={{
                backgroundColor: isActive ? "#fff" : "#C9A227",
                color: isActive ? "#7a5b00" : "#2a1f00",
                borderColor: isActive ? "#ccc" : alertDotColor ?? "#a88020",
                borderWidth: alertDotColor ? 2 : 1,
                transform: isActive ? "translateY(1px)" : "translateY(3px)",
              }}
            >
              {alertDotColor && <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: alertDotColor, marginRight: 5, verticalAlign: "middle", animation: tabAlert?.urgency === "critical" ? "pulse 1.2s infinite" : "none" }} />}
              {s.name}{hasEdits ? " •" : ""}
            </button>
          );
        });
        })()}
        {/* ── Broiler-only tabs ── */}
        {(farmConfig.farmType ?? "broiler") === "broiler" && (<>
          <button onClick={() => setActiveView("batchResults")}
            className="px-3 py-2.5 text-xs font-semibold rounded-t border border-b-0 whitespace-nowrap transition-all"
            style={{ backgroundColor: activeView === "batchResults" ? "#fff" : "#2d9e5f", color: activeView === "batchResults" ? "var(--pm-primary)" : "#fff", borderColor: activeView === "batchResults" ? "#ccc" : "#27885200", transform: activeView === "batchResults" ? "translateY(1px)" : "translateY(3px)", marginLeft: 4 }}>
            📊 Batch Results
          </button>
          <button onClick={() => setActiveView("flockForecast")}
            className="px-3 py-2.5 text-xs font-semibold rounded-t border border-b-0 whitespace-nowrap transition-all"
            style={{ backgroundColor: activeView === "flockForecast" ? "#fff" : "#8b3fc8", color: activeView === "flockForecast" ? "#4e1a6e" : "#fff", borderColor: activeView === "flockForecast" ? "#ccc" : "#6a2faa00", transform: activeView === "flockForecast" ? "translateY(1px)" : "translateY(3px)", marginLeft: 4 }}>
            🔮 Flock Forecast
          </button>
        </>)}

        {/* ── Breeder-only tabs ── */}
        {(farmConfig.farmType ?? "broiler") === "breeder" && (<>
          <button onClick={() => setActiveView("eggProduction")}
            className="px-3 py-2.5 text-xs font-semibold rounded-t border border-b-0 whitespace-nowrap transition-all"
            style={{ backgroundColor: activeView === "eggProduction" ? "#fff" : "#c9950e", color: activeView === "eggProduction" ? "#7a5500" : "#fff", borderColor: activeView === "eggProduction" ? "#ccc" : "#a8780000", transform: activeView === "eggProduction" ? "translateY(1px)" : "translateY(3px)", marginLeft: 4 }}>
            🥚 Egg Production
          </button>
          <button onClick={() => setActiveView("bodyWeight")}
            className="px-3 py-2.5 text-xs font-semibold rounded-t border border-b-0 whitespace-nowrap transition-all"
            style={{ backgroundColor: activeView === "bodyWeight" ? "#fff" : "#7a52aa", color: activeView === "bodyWeight" ? "#4a2880" : "#fff", borderColor: activeView === "bodyWeight" ? "#ccc" : "#5a3e7a00", transform: activeView === "bodyWeight" ? "translateY(1px)" : "translateY(3px)", marginLeft: 4 }}>
            ⚖️ Body Weight
          </button>
        </>)}

        {/* ── Shared tabs ── */}
        <button onClick={() => setActiveView("morts")}
          className="px-3 py-2.5 text-xs font-semibold rounded-t border border-b-0 whitespace-nowrap transition-all"
          style={{ backgroundColor: activeView === "morts" ? "#fff" : "#d93025", color: activeView === "morts" ? "#8b1a1a" : "#fff", borderColor: activeView === "morts" ? "#ccc" : "#b0201800", transform: activeView === "morts" ? "translateY(1px)" : "translateY(3px)", marginLeft: 4 }}>
          💀 Morts
        </button>
        <button onClick={() => setActiveView("history")}
          className="px-3 py-2.5 text-xs font-semibold rounded-t border border-b-0 whitespace-nowrap transition-all"
          style={{ backgroundColor: activeView === "history" ? "#fff" : "#2d9e5f", color: activeView === "history" ? "var(--pm-primary)" : "#fff", borderColor: activeView === "history" ? "#ccc" : "#27885200", transform: activeView === "history" ? "translateY(1px)" : "translateY(3px)", marginLeft: 4 }}>
          📈 History
        </button>
      </div>

      {/* Feed Alert Banner */}
      <FeedAlertBanner
        alerts={feedAlerts}
        onGoToShed={(sheetIdx) => { setActive(sheetIdx); setActiveView(null); }}
      />

      {/* Spreadsheet / Summary */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-zinc-900 border-t-2" style={{ borderColor: "var(--pm-primary-mid)" }}>
        {activeView === "eggProduction" ? (
          <div className="flex-1 overflow-auto">
            <EggProductionView farmConfig={farmConfig} shedPlacement={shedPlacement} />
          </div>
        ) : activeView === "bodyWeight" ? (
          <div className="flex-1 overflow-auto">
            <BodyWeightView farmConfig={farmConfig} shedPlacement={shedPlacement} />
          </div>
        ) : activeView === "flockForecast" ? (
          <div className="flex-1 overflow-auto">
            <FlockForecastView sheets={sheets} edits={edits} farmConfig={farmConfig} catchMap={catchMap} />
          </div>
        ) : activeView === "history" ? (
          <div className="flex-1 overflow-auto">
            <HistoryView />
          </div>
        ) : activeView === "summary" ? (
          <div className="flex-1 overflow-auto">
            <SummaryView sheets={sheets} edits={edits} handleEdit={handleEdit} farmConfig={farmConfig} />
          </div>
        ) : activeView === "morts" ? (
          <div className="flex-1 overflow-auto">
            <MortsView sheets={sheets} edits={edits} handleEdit={handleEdit} farmConfig={farmConfig} mortsLog={mortsLog} setMortsLog={setMortsLog} cullsLog={cullsLog} setCullsLog={setCullsLog} />
          </div>
        ) : activeView === "batchResults" ? (
          <div className="flex-1 overflow-auto">
            <BatchResultsView
              key={batchKey}
              sheets={sheets}
              edits={edits}
              farmConfig={farmConfig}
              shedPlacement={shedPlacement}
              cleared={batchCleared}
              onSummaryLoaded={s => {
                setBatchResultsSummary(s);
                setBatchCleared(false);
                localStorage.removeItem("silo-batch-cleared");
              }}
              onCatchMapChange={setCatchMap}
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
                {isEob ? (
                  <EndOfBatchContent
                    sheet={current}
                    edits={activeEdits}
                    onEdit={(key, val) => handleEdit(active, key, val)}
                  />
                ) : (
                  <SheetView
                    sheet={current}
                    sheetIdx={active}
                    edits={activeEdits}
                    onEdit={(key, val) => handleEdit(active, key, val)}
                    editingCell={editingCell}
                    setEditingCell={setEditingCell}
                    startRow={isShed ? 7 : undefined}
                    isShedSheet={isShed}
                    isEobSheet={false}
                    mortsLog={mortsLog}
                    cullsLog={cullsLog}
                    showExtraShedCols={farmConfig.showExtraShedCols ?? false}
                  />
                )}
              </div>
            </>
          );
        })()}
      </div>

      {/* ── Hidden import file input ── */}
      <input
        ref={importFileRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) importSpreadsheet(f); }}
      />

      {/* ── Feed Alert Modal ── */}
      {showFeedAlert && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowFeedAlert(false); }}
        >
          <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 8px 40px rgba(0,0,0,0.25)", width: 360, maxWidth: "92vw", overflow: "hidden" }}>
            <div style={{ background: hasCritical ? "#dc2626" : "#f59e0b", color: hasCritical ? "#fff" : "#7c2d12", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 800, fontSize: 16 }}>🔔 Feed On Hand Alerts</span>
              <button onClick={() => setShowFeedAlert(false)} style={{ background: "none", border: "none", color: "inherit", fontSize: 22, cursor: "pointer", lineHeight: 1, opacity: 0.8 }}>×</button>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <p style={{ fontSize: 13, color: "#555", marginBottom: 12 }}>
                Based on the most recent data row per shed:
              </p>
              {feedAlertInfo.map((a) => (
                <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "10px 14px", borderRadius: 8, background: a.status === 'critical' ? "#fee2e2" : "#fef3c7", border: `1px solid ${a.status === 'critical' ? "#fca5a5" : "#fde68a"}` }}>
                  <span style={{ fontSize: 20 }}>{a.status === 'critical' ? "🔴" : "🟠"}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: a.status === 'critical' ? "#7f1d1d" : "#78350f" }}>{a.name}</div>
                    <div style={{ fontSize: 12, color: a.status === 'critical' ? "#b91c1c" : "#92400e" }}>
                      {a.status === 'critical' ? "FEED RUN OUT — order immediately!" : "Less than 2 days of feed remaining — order soon"}
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 4, padding: "10px 14px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: 12, color: "#166534" }}>
                <strong>Colour guide:</strong> 🔴 Run out &nbsp;|&nbsp; 🟠 &lt; 2 days &nbsp;|&nbsp; 🟡 &lt; 4 days &nbsp;|&nbsp; No colour = plenty of feed
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Settings Panel ── */}
      {showSettings && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", justifyContent: "flex-end" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}
        >
          <div style={{ width: 340, maxWidth: "100vw", height: "100%", background: "#fff", boxShadow: "-4px 0 24px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
            {/* Header */}
            <div style={{ background: "var(--pm-primary)", color: "#fff", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 800, fontSize: 17 }}>⚙ {t("settings")}</span>
              <button onClick={() => setShowSettings(false)} style={{ background: "none", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: "20px 20px 32px", flex: 1, display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Farm Name */}
              <div>
                <label style={{ display: "block", fontWeight: 700, fontSize: 13, color: "var(--pm-primary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("farmName")}</label>
                <input
                  value={settingsFarmName}
                  onChange={e => setSettingsFarmName(e.target.value)}
                  placeholder="e.g. Double B Farm"
                  style={{ width: "100%", border: "1.5px solid #c8d8c8", borderRadius: 6, padding: "8px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                />
              </div>

              {/* Batch Number */}
              <div>
                <label style={{ display: "block", fontWeight: 700, fontSize: 13, color: "var(--pm-primary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Batch Number</label>
                <input
                  type="number"
                  min="1"
                  value={settingsBatchNum}
                  onChange={e => setSettingsBatchNum(e.target.value)}
                  placeholder="e.g. 42"
                  style={{ width: "100%", border: "1.5px solid #c8d8c8", borderRadius: 6, padding: "8px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                />
                <p style={{ fontSize: 12, color: "#666", marginTop: 5 }}>Shown in Batch Results and End of Batch reports. Shared with Silo Mate.</p>
              </div>

              {/* Farm Type */}
              <div>
                <label style={{ display: "block", fontWeight: 700, fontSize: 13, color: "var(--pm-primary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("farmType")}</label>
                <p style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>Switches the app between broiler grow-out and breeder (parent stock) modes.</p>
                <div style={{ display: "flex", gap: 10 }}>
                  {(["broiler", "breeder"] as const).map(ft => {
                    const label  = ft === "broiler" ? "🐔 Broiler" : "🥚 Breeder";
                    const sub    = ft === "broiler" ? "Grow-out / FCR / Catch" : "Eggs / Body Weight / HDP";
                    const active = (farmConfig.farmType ?? "broiler") === ft;
                    return (
                      <button key={ft} onClick={() => { const u = { ...farmConfig, farmType: ft }; saveFarmConfig(u); setFarmConfig(u); }}
                        style={{ flex: 1, padding: "10px 8px", borderRadius: 8, cursor: "pointer", border: `2px solid ${active ? "var(--pm-primary)" : "#ddd"}`, background: active ? "var(--pm-primary-soft)" : "#f9f9f9", color: active ? "var(--pm-primary)" : "#666", fontWeight: 700, fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <span>{label}</span>
                        <span style={{ fontWeight: 400, fontSize: 10, opacity: 0.8 }}>{sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Processor / Integrator — broiler only */}
              {(farmConfig.farmType ?? "broiler") === "broiler" && (
              <div>
                <label style={{ display: "block", fontWeight: 700, fontSize: 13, color: "var(--pm-primary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Processor / Integrator</label>
                <p style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>Selects which performance metric is highlighted in the shed comparison chart.</p>
                <div style={{ display: "flex", gap: 10 }}>
                  {(["baiada", "ingham"] as const).map(p => {
                    const label   = p === "baiada" ? "Baiada" : "Ingham";
                    const metric  = p === "baiada" ? "cFCR + Cage" : "FCR + Cage";
                    const active  = (farmConfig.processor ?? "baiada") === p;
                    return (
                      <button
                        key={p}
                        onClick={() => {
                          const updated = { ...farmConfig, processor: p };
                          saveFarmConfig(updated);
                          setFarmConfig(updated);
                        }}
                        style={{
                          flex: 1, padding: "10px 8px", borderRadius: 8, cursor: "pointer", border: `2px solid ${active ? "var(--pm-primary)" : "#ddd"}`,
                          background: active ? "var(--pm-primary-soft)" : "#f9f9f9",
                          color: active ? "var(--pm-primary)" : "#666", fontWeight: 700, fontSize: 13,
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                        }}
                      >
                        <span>{label}</span>
                        <span style={{ fontWeight: 400, fontSize: 10, opacity: 0.8 }}>{metric}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              )}

              {/* Active Sheds */}
              <div>
                <label style={{ display: "block", fontWeight: 700, fontSize: 13, color: "var(--pm-primary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("activeSheds")}</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {SHED_SHEET_ORDER.map(shedGroupId => {
                    const shedNums = `Shed ${shedGroupId * 2 - 1} & ${shedGroupId * 2}`;
                    const existing = farmConfig.shedGroups?.find(g => g.shedGroupId === shedGroupId);
                    const isActive = existing ? existing.active !== false : true;
                    return (
                      <label key={shedGroupId} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", padding: "8px 12px", borderRadius: 7, background: isActive ? "var(--pm-primary-soft)" : "#f5f5f5", border: `1.5px solid ${isActive ? "var(--pm-primary)" : "#ddd"}` }}>
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={() => {
                            const groups = SHED_SHEET_ORDER.map(id => {
                              const ex = farmConfig.shedGroups?.find(g => g.shedGroupId === id);
                              const act = ex ? ex.active !== false : id <= 6;
                              return { shedGroupId: id, active: id === shedGroupId ? !act : act, silos: ex?.silos ?? [] };
                            });
                            const updated = { ...farmConfig, shedGroups: groups };
                            saveFarmConfig(updated);
                            setFarmConfig(updated);
                          }}
                          style={{ width: 17, height: 17, accentColor: "var(--pm-primary)", cursor: "pointer" }}
                        />
                        <span style={{ fontWeight: 600, fontSize: 14, color: isActive ? "var(--pm-primary)" : "#888" }}>{shedNums}</span>
                        {isActive && <span style={{ marginLeft: "auto", fontSize: 11, color: "#2d8653", fontWeight: 700 }}>{t("active")}</span>}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Extra Shed Columns Toggle */}
              <div>
                <label style={{ display: "block", fontWeight: 700, fontSize: 13, color: "var(--pm-primary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("shedExtraColumns")}</label>
                <p style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>Show or hide the extra columns after BIRDS LEFT (Shed #, Diff, Discrepancy) on shed tabs.</p>
                <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                  <span style={{ fontSize: 14, color: "#333", flex: 1 }}>{t("showExtraColumns")}</span>
                  <div
                    onClick={() => {
                      const updated = { ...farmConfig, showExtraShedCols: !(farmConfig.showExtraShedCols ?? false) };
                      saveFarmConfig(updated);
                      setFarmConfig(updated);
                    }}
                    style={{
                      width: 46, height: 26, borderRadius: 13, cursor: "pointer",
                      background: (farmConfig.showExtraShedCols ?? false) ? "var(--pm-primary)" : "#ccc",
                      position: "relative", transition: "background 0.2s", flexShrink: 0,
                    }}
                  >
                    <div style={{
                      position: "absolute", top: 3, left: (farmConfig.showExtraShedCols ?? false) ? 23 : 3,
                      width: 20, height: 20, borderRadius: "50%", background: "#fff",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.25)", transition: "left 0.2s",
                    }} />
                  </div>
                </label>
              </div>

              {/* Theme Picker */}
              <div>
                <label style={{ display: "block", fontWeight: 700, fontSize: 13, color: "var(--pm-primary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("themeLabel")}</label>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {APP_THEMES.map(t => {
                    const active = (farmConfig.theme ?? "forest") === t.id;
                    return (
                      <button
                        key={t.id}
                        title={t.name}
                        onClick={() => {
                          const updated = { ...farmConfig, theme: t.id };
                          setFarmConfig(updated);
                          localStorage.setItem(FARM_CONFIG_KEY, JSON.stringify(updated));
                        }}
                        style={{
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                          border: active ? `2px solid ${t.primary}` : "2px solid #ddd",
                          borderRadius: 10, padding: "8px 10px", cursor: "pointer",
                          background: active ? t.pale : "#fff",
                          boxShadow: active ? `0 0 0 2px ${t.primary}44` : "none",
                          transition: "all 0.15s",
                        }}
                      >
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg, ${t.primary} 0%, ${t.mid} 100%)`, border: "2px solid rgba(0,0,0,0.08)" }} />
                        <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? t.primary : "#666" }}>{t.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Language */}
              <div>
                <label style={{ display: "block", fontWeight: 700, fontSize: 13, color: "var(--pm-primary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("language")}</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {LANGUAGES.map(lang => {
                    const active = (farmConfig.language ?? "en") === lang.code;
                    return (
                      <button
                        key={lang.code}
                        onClick={() => {
                          const updated = { ...farmConfig, language: lang.code };
                          saveFarmConfig(updated);
                          setFarmConfig(updated);
                        }}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 7, cursor: "pointer",
                          border: `1.5px solid ${active ? "var(--pm-primary)" : "#ddd"}`,
                          background: active ? "var(--pm-primary-soft)" : "#f9f9f9",
                          fontWeight: active ? 700 : 500, fontSize: 14,
                          color: active ? "var(--pm-primary)" : "#444",
                        }}
                      >
                        <span style={{ fontSize: 20 }}>{lang.flag}</span>
                        <span style={{ flex: 1, textAlign: "left" }}>{lang.name}</span>
                        {active && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--pm-primary)" }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Import Spreadsheet */}
              <div>
                <label style={{ display: "block", fontWeight: 700, fontSize: 13, color: "var(--pm-primary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("importFeedProgram")}</label>
                <p style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>Load your own spreadsheet to replace the current program. Your batch history is kept.</p>
                <div style={{ fontSize: 11, color: "#555", background: "var(--pm-primary-soft)", border: "1px solid #c8ddc8", borderRadius: 6, padding: "8px 10px", marginBottom: 10, lineHeight: 1.6 }}>
                  <strong>Excel / Windows:</strong> open your file, save as .xlsx<br/>
                  <strong>Google Sheets:</strong> File → Download → Microsoft Excel (.xlsx)<br/>
                  <strong>Mac Numbers:</strong> File → Export To → Excel (.xlsx)
                </div>
                <button
                  onClick={() => importFileRef.current?.click()}
                  style={{ width: "100%", background: "var(--pm-primary)", color: "#fff", border: "none", borderRadius: 7, padding: "10px 0", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                >
                  <span style={{ fontSize: 16 }}>⬆</span> {t("importXlsxBtn")}
                </button>
              </div>

              {/* New Batch */}
              <div>
                <label style={{ display: "block", fontWeight: 700, fontSize: 13, color: "var(--pm-primary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("startNewBatch")}</label>
                <p style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>Clears all delivery and silo records and resets the spreadsheet to its base state. This cannot be undone.</p>
                <button
                  onClick={() => { setShowSettings(false); resetForNewBatch(); }}
                  style={{ width: "100%", background: "#c0392b", color: "#fff", border: "none", borderRadius: 7, padding: "10px 0", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                >
                  {t("newBatchBtn")}
                </button>
              </div>
            </div>

            {/* Save button */}
            <div style={{ padding: "16px 20px", borderTop: "1px solid #e5e5e5", display: "flex", gap: 10 }}>
              <button
                onClick={() => {
                  const updated = { ...farmConfig, farmName: settingsFarmName.trim() || undefined };
                  saveFarmConfig(updated);
                  setFarmConfig(updated);
                  const parsed = parseInt(settingsBatchNum, 10);
                  if (!isNaN(parsed) && parsed > 0) {
                    localStorage.setItem("silo-batch-num", String(parsed));
                  } else {
                    localStorage.removeItem("silo-batch-num");
                  }
                  setShowSettings(false);
                }}
                style={{ flex: 1, background: "var(--pm-primary)", color: "#fff", border: "none", borderRadius: 7, padding: "10px 0", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
              >
                {t("saveClose")}
              </button>
              <button
                onClick={() => setShowSettings(false)}
                style={{ flex: 1, background: "#f5f5f5", color: "#333", border: "1px solid #ddd", borderRadius: 7, padding: "10px 0", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </LanguageContext.Provider>
  );
}
