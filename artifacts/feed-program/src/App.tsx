import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
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
import { useRegisterSW } from "virtual:pwa-register/react";

function PwaUpdateBanner() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, display: "flex", alignItems: "center", gap: 12,
      background: "#1a5c36", color: "#fff", borderRadius: 12,
      padding: "12px 20px", boxShadow: "0 4px 24px rgba(0,0,0,0.28)",
      fontSize: 14, fontWeight: 600, whiteSpace: "nowrap",
    }}>
      <span>🔄 Update available</span>
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          background: "#C9A227", color: "#000", border: "none", borderRadius: 7,
          padding: "6px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer",
        }}
      >
        Refresh now
      </button>
    </div>
  );
}

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

interface FarmShedConfig { shedGroupId: number; active: boolean; silos: { letter: string }[]; customName?: string; floorAreaM2?: number }
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
// v2: renamed from "feedmate-edits-autosave" to invalidate stale date-column
//     saves from the old code that wrote wrong placement dates for SHED 9 & 10.
const EDITS_AUTOSAVE_KEY   = "feedmate-edits-autosave-v2";

function serializeEdits(edits: Map<string, string>[]): string {
  return JSON.stringify(edits.map(m => [...m.entries()]));
}
function deserializeEdits(json: string): Map<string, string>[] {
  const arr = JSON.parse(json) as [string, string][][];
  return arr.map(pairs => new Map(pairs));
}
const FLOCK_WEIGHIN_KEY   = "feedmate-flock-weighins";
const FLOCK_BREEDS_KEY    = "feedmate-flock-breeds";
const FEED_ORDERS_KEY     = "feedmate-feed-orders";
const DENSITY_BREAKS_KEY  = "feedmate-density-breaks";
const SHED_FLOOR_AREAS_KEY = "feedmate-shed-floor-areas";

interface DensityBreak { targetWeightKg: string; birdsToRemovePct: string; plannedDate: string; completed: boolean; actualWeightKg?: string; actualDate?: string }
type DensityPlanMap = Record<number, DensityBreak[]>;
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
// Supports up to 20 shed groups (40 sheds). Index = position of SHED sheet in workbook, value = shedGroupId.
const SHED_SHEET_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
// Shed groups listed here are completely hidden (tab bar + settings) pending bug fixes.
const DISABLED_SHED_GROUPS = new Set<number>([]); // empty — all sheds enabled

// Cobb 500 grams per bird per day (day 1 → day 54)
const COBB500_GRAMS = [22,24,26,28,30,32,34,36,40,45,50,55,60,65,74,75,80,87,93,97,103,107,113,118,122,128,134,139,140,142,149,153,158,163,165,168,171,174,176,178,180,181,188,190,192,193,194,195,196,197,197,197,198,197];

// Cobb 500 average live weight per bird (kg) at each day (day 1 → day 56)
const COBB_WEIGHT_KG = [0.042,0.055,0.071,0.090,0.112,0.138,0.169,0.205,0.246,0.293,0.346,0.406,0.472,0.545,0.626,0.714,0.810,0.914,1.026,1.145,1.272,1.405,1.546,1.693,1.846,2.005,2.170,2.339,2.513,2.691,2.872,3.056,3.242,3.430,3.618,3.807,3.996,4.184,4.371,4.556,4.739,4.920,5.098,5.272,5.443,5.609,5.770,5.926,6.076,6.220,6.358,6.489,6.613,6.730,6.840,6.942];

const MONTH_NAMES = ["january","february","march","april","may","june","july","august","september","october","november","december"];

function parseDateInput(str: string): Date | null {
  if (!str) return null;
  const s = str.trim();
  // DD/MM/YYYY or D/M/YYYY
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]));
  // YYYY-MM-DD (ISO)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
  // DD-MM-YYYY or D-M-YYYY
  const dmy2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy2) return new Date(parseInt(dmy2[3]), parseInt(dmy2[2]) - 1, parseInt(dmy2[1]));
  // Long format produced by parseSheet for date cells:
  // "Monday, 12 March 2025" or "12 March 2025" or "12 March, 2025"
  const ausLong = s.match(/(?:\w+,\s+)?(\d{1,2})\s+(\w+)[,\s]+(\d{4})/);
  if (ausLong) {
    const mo = MONTH_NAMES.indexOf(ausLong[2].toLowerCase());
    if (mo >= 0) {
      const d = new Date(parseInt(ausLong[3]), mo, parseInt(ausLong[1]));
      if (!isNaN(d.getTime())) return d;
    }
  }
  // Excel serial number (Windows 1900-epoch: days since Dec 30 1899)
  // Values 40000–60000 correspond roughly to 2009–2064.
  // Excel stores dates as floats (e.g. "45290.0" for midnight, "45290.5" for noon)
  // so we parse as float, floor to get the day count, and accept any numeric string.
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serialFloat = parseFloat(s);
    const serial = Math.floor(serialFloat);
    if (serial > 40000 && serial < 60000) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      epoch.setUTCDate(epoch.getUTCDate() + serial);
      return new Date(epoch.getUTCFullYear(), epoch.getUTCMonth(), epoch.getUTCDate());
    }
  }
  // Natural language fallback
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Parse a date from a TEXT string only — no Excel serial-number parsing.
// Used when reading from user edits or header cell text to avoid misidentifying
// large integer bird counts (e.g. 46900 birds) as date serials.
function parseDateString(str: string): Date | null {
  if (!str) return null;
  const s = str.trim();
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const mo = parseInt(dmy[2]) - 1;
    if (mo >= 0 && mo <= 11) return new Date(parseInt(dmy[3]), mo, parseInt(dmy[1]));
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
  const dmy2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy2) return new Date(parseInt(dmy2[3]), parseInt(dmy2[2]) - 1, parseInt(dmy2[1]));
  const ausLong = s.match(/(?:\w+,\s+)?(\d{1,2})\s+(\w+)[,\s]+(\d{4})/);
  if (ausLong) {
    const mo = MONTH_NAMES.indexOf(ausLong[2].toLowerCase());
    if (mo >= 0) {
      const d = new Date(parseInt(ausLong[3]), mo, parseInt(ausLong[1]));
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

// Find the placement date in a shed sheet.
//
// Strategy (in priority order):
//   1. Check the canonical edit at "2,2" — written by buildInitialEditsForSheet
//      so all downstream readers use one consistent value.
//   2. Find the first data row (col A = "1") and read its COL_B date cell.
//      This is the most reliable source because the spreadsheet formula
//      (=C3 or similar) already computes the correct placement date and
//      the xlsxParser marks it as isDateCell=true.
//   3. Scan header rows 0-6 for any cell marked isDateCell=true.
//      Only accepts cells the parser already identified as dates — avoids
//      misidentifying bird counts (e.g. 46,900 birds ≈ serial for 2028)
//      as placement dates.
//   4. Scan any per-cell edits in rows 0-8 using text-only parsing.
//
function findPlacementDate(
  sheet: Pick<SheetParsed, "cells">,
  edits?: Map<string, string>
): { date: Date; row: number } | null {
  const ok = (d: Date | null) => d && d.getFullYear() >= 2010 && d.getFullYear() <= 2040;

  // 1. Canonical edit position
  const canonical = edits?.get("2,2");
  if (canonical) {
    const d = parseDateString(canonical);
    if (ok(d)) return { date: d!, row: 2 };
  }

  // 2. Day-1 data row → COL_B (index 1) date cell
  for (let r = 6; r <= 20; r++) {
    const dayKey = `${r},0`;
    const dayVal = String(edits?.get(dayKey) ?? sheet.cells.get(dayKey)?.value ?? "").trim();
    if (dayVal !== "1") continue;
    // Check edits for date column first, then original cell
    const dateKey = `${r},${COL_B}`;
    const editDate = edits?.get(dateKey);
    if (editDate) {
      const d = parseDateString(editDate);
      if (ok(d)) return { date: d!, row: 2 };
    }
    const cell = sheet.cells.get(dateKey);
    if (cell?.isDateCell) {
      const d = parseDateInput(cell.value);
      if (ok(d)) return { date: d!, row: 2 };
    }
    break; // found day-1 row — don't keep scanning
  }

  // 3. Scan header rows for Excel-identified date cells (isDateCell=true)
  //    Limit to rows 0-6 to avoid rows 7-8 which can have allocation quantities
  //    formatted as dates from prior batches.
  for (let r = 0; r <= 6; r++) {
    for (let c = 0; c <= 15; c++) {
      const key = `${r},${c}`;
      const editVal = edits?.get(key);
      if (editVal !== undefined) {
        const d = parseDateString(editVal);
        if (ok(d)) return { date: d!, row: r };
        continue;
      }
      const cell = sheet.cells.get(key);
      if (!cell?.isDateCell) continue;
      const d = parseDateInput(cell.value);
      if (ok(d)) return { date: d!, row: r };
    }
  }

  return null;
}

// Build the initial edits map for a shed sheet by seeding values from the
// spreadsheet template that should be treated as app-level edits:
//   • Feed Alloc (COL_G) — cascaded from the allocation header row
//   • Feed Ordered (COL_E) — preserved so deliveries in old spreadsheets survive
//   • Silo A/B/C (COL_K/L/M) — preserved so silo readings in old spreadsheets survive
// After seeding, the FOH cascade is run so Feed On Hand reflects all of these.
//
// For the "end of batch" sheet the only job is to blank out all data rows
// (row ≥ 4) so that delivery records and bird counts from the previous batch
// that are baked into the xlsx template never bleed into a new batch.
// Rows 0-3 (farm/batch header, section labels, column headers) and col 21
// (permanent shed-number list) are always preserved.
// NOTE: shed data rows start at row 4, so clearing must begin there —
// rows 4-5 contain the first two shed pairs' bird counts which must be wiped.
const EOB_DATA_START_ROW = 4;
function buildInitialEditsForSheet(sheet: SheetParsed): Map<string, string> {
  const m = new Map<string, string>();

  const isEob = /end.{0,4}batch/i.test(sheet.name.trim());
  if (isEob) {
    for (const key of sheet.cells.keys()) {
      const parts = key.split(",");
      const r = parseInt(parts[0]);
      const c = parseInt(parts[1]);
      if (r >= EOB_DATA_START_ROW && c !== 21) m.set(key, "");
    }
    // Keep totals visible as zero rather than blank
    m.set("36,3",  "0");
    m.set("36,8",  "0");
    m.set("36,12", "0");
    m.set("36,16", "0");
    m.set("11,18", "0");
    m.set("18,18", "0");
    m.set("21,23", "0");
    m.set("16,23", "0");
    m.set("16,24", "0");
    return m;
  }

  const isShed = sheet.name.toUpperCase().includes("SHED") &&
                 !sheet.name.toUpperCase().includes("WEEKLY");
  if (!isShed) return m;

  const getCellNum = (r: number, c: number): number => {
    const cell = sheet.cells.get(`${r},${c}`);
    if (!cell) return 0;
    // Prefer rawNum when the parser detected a date-formatted numeric cell
    // (e.g. SHED 9&10 daily feed-usage column has "d-mmm" numFmt applied)
    if (cell.numericValue !== undefined) return cell.numericValue;
    return parseFloat(cell.value ?? "0") || 0;
  };
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

  // Seed Feed Ordered (COL_E) from the template so delivery/allocation values
  // from an imported xlsx are preserved.
  //
  // Silo reading columns (K/L/M/J) are intentionally NOT seeded from the template.
  // The template always retains the previous batch's cached silo values — seeding
  // them would drive a spurious FOH cascade using last-batch data.  Readings only
  // ever enter the app through live Farm Buddy sync or manual cell edits, both of
  // which go through handleEdit → autosave, so they survive page reloads correctly.
  let minSeedRow = sheet.maxRow + 1;
  for (let r = 12; r <= 71; r++) {
    const e = getCellStr(r, COL_E);
    if (e !== "" && parseFloat(e) !== 0) {
      m.set(`${r},${COL_E}`, e);
      if (r < minSeedRow) minSeedRow = r;
    }
    // Col F (5) is the silo letter column — valid values are A/B/C only.
    // Spreadsheets often have formula artefacts here that resolve to numbers.
    // Suppress those so only actual letters show through on shed data rows.
    const fLetter = getCellStr(r, 5);
    if (fLetter !== "" && !isNaN(parseFloat(fLetter))) {
      m.set(`${r},5`, "");
    }
    // If the feed-usage cell (COL_H) was parsed as a date-formatted number
    // (e.g. SHED 9&10 where "d-mmm" numFmt is applied to daily usage cells),
    // seed its real numeric value so the grid shows kg instead of a date string.
    const hCell = sheet.cells.get(`${r},${COL_H}`);
    if (hCell?.numericValue !== undefined) {
      m.set(`${r},${COL_H}`, String(Math.round(hCell.numericValue)));
    }
  }

  // Blank Feed On Hand (COL_I) and all silo reading columns (J/K/L/M) for every
  // data row.  FOH and silo readings are derived from live Farm Buddy sync or
  // manual entry only — seeding them from the xlsx would leak stale
  // previous-batch values into a new batch.  Explicitly setting them in the
  // edits map prevents getCell() from falling back to the raw cell values in
  // the imported file, which is what caused "other users see old silo data".
  for (let r = 12; r <= 71; r++) {
    m.set(`${r},${COL_I}`, "");  // Feed On Hand
    m.set(`${r},9`,  "");        // J – Silo Total
    m.set(`${r},10`, "");        // K – Silo A
    m.set(`${r},11`, "");        // L – Silo B
    m.set(`${r},12`, "");        // M – Silo C
  }

  // Seed date column (COL_B) from the placement date, seeding "2,2" into edits
  // so the green header panel and tab labels always read the canonical value.
  //
  // Strategy: read the placement date from the day-1 data row's COL_B date cell.
  // That cell is set by an Excel formula (=C3 or similar) whose cached value is
  // the placement date serial.  xlsxParser converts it to a Date and marks it
  // isDateCell=true, so we can safely use parseDateInput on the formatted string
  // without risk of misidentifying a bird-count integer (e.g. 46,900 birds)
  // as an Excel date serial.
  //
  // Fallback: scan header rows 0-6 for isDateCell=true cells — same guard.
  let dataStart = 12;
  for (let r = 6; r <= 20; r++) {
    const v = String(sheet.cells.get(`${r},0`)?.value ?? "").trim();
    if (v === "1") { dataStart = r; break; }
  }
  let placementParsed: Date | null = null;
  // Primary: day-1 row COL_B date cell
  {
    const dateCell = sheet.cells.get(`${dataStart},${COL_B}`);
    if (dateCell?.isDateCell) {
      const d = parseDateInput(dateCell.value);
      if (d && d.getFullYear() >= 2010 && d.getFullYear() <= 2040) placementParsed = d;
    }
  }
  // Fallback: scan header rows for isDateCell=true (avoids serial mis-parsing)
  if (!placementParsed) {
    outer: for (let r = 0; r <= 6; r++) {
      for (let c = 0; c <= 15; c++) {
        const cell = sheet.cells.get(`${r},${c}`);
        if (!cell?.isDateCell) continue;
        const d = parseDateInput(cell.value);
        if (d && d.getFullYear() >= 2010 && d.getFullYear() <= 2040) { placementParsed = d; break outer; }
      }
    }
  }
  if (placementParsed) {
    // Normalise to the canonical "2,2" position so every forward-scan call
    // (ShedInfoPanel, tab labels, recalculate) reads the right date.
    const placementStr = placementParsed.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
    m.set("2,2", placementStr);
    for (let r = dataStart; r <= dataStart + 65; r++) {
      const dayVal = String(sheet.cells.get(`${r},0`)?.value ?? "").trim();
      const age = parseInt(dayVal, 10);
      if (isNaN(age) || age < 1) continue;
      // Always derive the date column from the placement date.
      // The date column is never user-entered — it's purely a function of
      // placement date + age. Stale dates from a previous batch must be
      // overwritten so the new batch shows correct dates (e.g. Sheds 9 & 10
      // after a new placement date is set).
      const d = new Date(placementParsed.getFullYear(), placementParsed.getMonth(), placementParsed.getDate() + (age - 1));
      m.set(`${r},${COL_B}`, d.toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" }));
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
    const cell = cells.get(key);
    if (!cell) return 0;
    // Prefer rawNum for date-formatted numeric cells (e.g. SHED 9&10 feed-usage column)
    if (cell.numericValue !== undefined) return cell.numericValue;
    return parseFloat(cell.value ?? "0") || 0;
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
    // Cascade daily feed usage using Cobb 500 table: H = grams[age-1] × birds / 1000.
    // IMPORTANT: Only iterate actual data rows. Header/allocation rows 0-11 contain
    // numeric values in col A (e.g. 12, 16, 19) that must NOT be treated as ages —
    // doing so would overwrite the allocation totals (rows 1-4) set above.
    let dataStart = 12;
    for (let dr = 6; dr <= 20; dr++) {
      if (cells.get(`${dr},0`)?.value?.trim() === "1") { dataStart = dr; break; }
    }
    for (let r = dataStart; r <= maxRow; r++) {
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
      // Only iterate actual data rows — header/allocation rows 0-11 contain
      // numeric col A values that must NOT be treated as ages for date derivation.
      let dataStart = 12;
      for (let dr = 6; dr <= 20; dr++) {
        if (cells.get(`${dr},0`)?.value?.trim() === "1") { dataStart = dr; break; }
      }
      for (let r = dataStart; r <= maxRow; r++) {
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
    // Set J if the template has silo columns for this row OR if edits (autosave/live
    // sync) have introduced readings.  Template-only rows without readings produce
    // j=0 which is a correct default.  Without this check, autosaved readings on
    // rows where the template stored those cells as blank would never update J.
    const hasKLMJ = cells.has(`${r},${COL_K}`) || cells.has(`${r},${COL_L}`)
      || cells.has(`${r},${COL_M}`) || cells.has(`${r},${COL_J}`)
      || newEdits.has(`${r},${COL_K}`) || newEdits.has(`${r},${COL_L}`)
      || newEdits.has(`${r},${COL_M}`);
    if (hasKLMJ) {
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
  /** Raw Excel serial preserved when the cell has a date numFmt but the underlying
   *  value is actually a number (e.g. a kg allocation formatted as "d-mmm" by mistake).
   *  Use this instead of `value` whenever you need the real numeric figure. */
  numericValue?: number;
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
      const numericValue: number | undefined = (cell as any)?.rawNum as number | undefined;
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
        numericValue,
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

  // Always derive shed number from the sheet name — G1 cell data can be stale
  // if the sheet was copied from another shed (e.g. Shed 9&10 copied from Shed 7&8).
  const shedNum = (() => {
    const m = sheet.name.match(/(\d+\s*&\s*\d+)/);
    return m ? m[1].replace(/\s*&\s*/, " & ").trim() : sheet.name.replace(/SHED\s*/i, "").trim();
  })();
  const totalBirdsRaw = g(1, 2);
  // Scan rows 0-8 for the placement date to handle sheets where the date isn't at the standard C3 position
  const placementDateObj = findPlacementDate(sheet, safeEdits);
  const placement  = placementDateObj ? placementDateObj.date.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : g(2, 2);
  const shed1Name  = g(3, 1);  const shed1Birds = g(3, 2);
  const shed2Name  = g(4, 1);  const shed2Birds = g(4, 2);
  // For allocation cells prefer rawNum (stored when parser encounters a date-formatted
  // numeric cell) so that H3-H5 with "d-mmm" numFmt show kg values, not date strings.
  // Only trust an edit value if it parses as a valid positive number — date strings that
  // were accidentally autosaved by a previous buggy version must be ignored here.
  const getAllocRaw = (r: number) => {
    const editKey = `${r},7`;
    const edited = safeEdits.get(editKey);
    if (edited !== undefined && !isNaN(parseFloat(edited.replace(/,/g, "")))) return edited;
    const cell = cells.get(editKey);
    if (!cell) return "";
    if (cell.numericValue !== undefined) return String(Math.round(cell.numericValue));
    return cell.value;
  };
  const strAlloc   = getAllocRaw(1);
  const gwrAlloc   = getAllocRaw(2);
  const finAlloc   = getAllocRaw(3);
  const wdwAlloc   = getAllocRaw(4);

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

  const _batchNumSheet = g(1, 2);
  const _batchNumLS    = localStorage.getItem("silo-batch-num");
  const batchNum       = _batchNumLS ? _batchNumLS : _batchNumSheet;
  const feedLeft       = g(15, 18);
  const lastBatchLeft  = g(7, 18);

  // Live-compute total purchased — formula cell at row 11, col 18 won't recalculate in-app
  const eobDeliveryKgCols = [3, 8, 12, 16];
  let liveTotalPurchased = 0;
  for (let r = 6; r <= 35; r++) {
    for (const col of eobDeliveryKgCols) {
      const v = parseFloat(g(r, col).replace(/,/g, ""));
      if (!isNaN(v) && v > 0) liveTotalPurchased += v;
    }
  }
  const totalPurchased = liveTotalPurchased > 0 ? String(liveTotalPurchased) : g(11, 18);

  // Bird totals — EOB totals row (row 16, 0-indexed); col 22=placed, 23=catched, 24=morts
  const totalBirdsPlaced  = g(16, 22);
  const totalBirdsCatched = g(16, 23);
  const totalMorts        = g(16, 24);
  const placedNum  = parseFloat(totalBirdsPlaced.replace(/,/g, ""))  || 0;
  const catchedNum = parseFloat(totalBirdsCatched.replace(/,/g, "")) || 0;
  const mortsNum   = parseFloat(totalMorts.replace(/,/g, ""))        || 0;
  const balanceNum = placedNum - catchedNum - mortsNum;
  const balanceStr = placedNum > 0 ? String(balanceNum) : "";

  // Total feed in = last batch left-over + all delivered this batch
  const lastBatchLeftNum  = parseFloat(lastBatchLeft.replace(/,/g, ""))  || 0;
  const totalPurchasedNum = parseFloat(totalPurchased.replace(/,/g, "")) || 0;
  const feedLeftNum       = parseFloat(feedLeft.replace(/,/g, ""))       || 0;
  const totalFeedInNum    = lastBatchLeftNum + totalPurchasedNum;
  const totalFeedInStr    = totalFeedInNum > 0 ? String(totalFeedInNum) : "";
  // Net consumed this batch = total in − feed left on hand
  const netConsumedNum    = totalFeedInNum - feedLeftNum;
  const netConsumedStr    = netConsumedNum > 0 ? String(netConsumedNum) : "";

  const shareEmail = () => {
    const subject = encodeURIComponent(`${farmName} — Batch ${batchNum} End of Batch Summary`);
    const body = encodeURIComponent([
      `${farmName} — Batch ${batchNum} End of Batch Summary`,
      ``,
      `FEED SUMMARY`,
      `─────────────────────────────────`,
      `Last Batch Feed Left : ${lastBatchLeft ? fmt(lastBatchLeft) + " kg" : "—"}`,
      `Total Feed Delivered : ${totalPurchased ? fmt(totalPurchased) + " kg" : "—"}`,
      `Total Feed In        : ${totalFeedInStr ? fmt(totalFeedInStr) + " kg" : "—"}`,
      `Feed Left This Batch : ${feedLeft ? fmt(feedLeft) + " kg" : "—"}`,
      `Net Consumed         : ${netConsumedStr ? fmt(netConsumedStr) + " kg" : "—"}`,
      ``,
      `BIRD SUMMARY`,
      `─────────────────────────────────`,
      `Birds Placed  : ${totalBirdsPlaced  ? fmt(totalBirdsPlaced)  : "—"}`,
      `Birds Caught  : ${totalBirdsCatched ? fmt(totalBirdsCatched) : "—"}`,
      `Mortalities   : ${totalMorts        ? fmt(totalMorts)        : "—"}`,
      `Balance       : ${balanceStr        ? fmt(balanceStr)        : "—"}`,
      ``,
      `Generated by Farm Buddy`,
    ].join("\n"));
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  };

  const feedStats: [string, string, string][] = [
    ["LAST BATCH LEFT", lastBatchLeft,  "kg"],
    ["DELIVERED",       totalPurchased, "kg"],
    ["TOTAL IN",        totalFeedInStr, "kg"],
    ["FEED LEFT",       feedLeft,       "kg"],
    ["NET CONSUMED",    netConsumedStr, "kg"],
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
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {feedStats.map(([label, value, unit]) => (
          <div key={label} style={{ background: "rgba(201,162,39,0.25)", border: "1px solid rgba(201,162,39,0.45)", borderRadius: 5, padding: "4px 12px", textAlign: "center", fontSize: 12, minWidth: 90 }}>
            <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
            <div style={{ fontWeight: 700 }}>{value ? `${fmt(value)} ${unit}` : "—"}</div>
          </div>
        ))}
      </div>
      {/* Row 3: Bird pills */}
      {placedNum > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "Birds Placed", value: fmt(totalBirdsPlaced), color: "rgba(255,255,255,0.15)", border: "rgba(255,255,255,0.25)" },
            { label: "Birds Caught", value: catchedNum > 0 ? fmt(totalBirdsCatched) : "—", color: "rgba(255,255,255,0.15)", border: "rgba(255,255,255,0.25)" },
            { label: "Mortality",    value: mortsNum   > 0 ? fmt(totalMorts)        : "—", color: "rgba(220,38,38,0.25)",    border: "rgba(220,38,38,0.45)" },
            { label: "Balance",      value: balanceStr ? fmt(balanceStr) : "—",
              color:  balanceNum === 0 ? "rgba(255,255,255,0.15)" : "rgba(220,38,38,0.25)",
              border: balanceNum === 0 ? "rgba(255,255,255,0.25)" : "rgba(220,38,38,0.45)" },
          ].map(({ label, value, color, border }) => (
            <div key={label} style={{ background: color, border: `1px solid ${border}`, borderRadius: 5, padding: "4px 12px", textAlign: "center", fontSize: 12, minWidth: 90 }}>
              <div style={{ fontSize: 9, opacity: 0.75, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
              <div style={{ fontWeight: 700 }}>{value}</div>
            </div>
          ))}
        </div>
      )}
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

    // Placement date — scan rows 0-8 of col C to handle varying sheet layouts
    const placementDate: Date | null = findPlacementDate({ cells }, edits)?.date ?? null;

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

  // Detect which row corresponds to today in this shed sheet
  const todayRow = useMemo(() => {
    if (!isShedSheet) return null;
    const pd = findPlacementDate({ cells }, edits)?.date ?? null;
    if (!pd) return null;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const dayNum = Math.floor((now.getTime() - pd.getTime()) / 86400000) + 1;
    if (dayNum < 1 || dayNum > 65) return null;
    return shedDataStartRow + dayNum - 1;
  }, [isShedSheet, cells, edits, shedDataStartRow]);

  // Which col has the day number? Scan shedDataStartRow to find "1"
  const dayNumCol = useMemo(() => {
    if (!isShedSheet) return 0;
    const v0 = String(cells.get(`${shedDataStartRow},0`)?.value ?? "").trim();
    return v0 === "1" ? 0 : 1;
  }, [isShedSheet, cells, shedDataStartRow]);

  // Clip shed rendering: 60 data rows + 5 rows for summary (Total Morts, Total Birds Caught)
  // Hides junk formula rows that extend past the template's useful area
  const shedDisplayEndRow = useMemo(() => {
    if (!isShedSheet) return maxRow;
    return Math.min(maxRow, shedDataStartRow + 64);
  }, [isShedSheet, shedDataStartRow, maxRow]);

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
    <table className="sheet-table" style={{ borderCollapse: "collapse", fontFamily: "Calibri,'Segoe UI',sans-serif", tableLayout: "fixed", width: "100%", minWidth: "max-content" }}>
      <colgroup>
        {Array.from({ length: displayMaxCol - minCol + 1 }, (_, i) => {
          const c = minCol + i;
          if (isShedSheet && c === 3) return null;
          // DATE column (c=2) on shed sheets: no fixed width so it absorbs leftover space
          const rawW = colWidths[c] ?? 80;
          const colW = (isShedSheet && c === 2) ? undefined : (isShedSheet && c === 0) ? Math.max(rawW, 40) : rawW;
          return <col key={c} style={{ width: colW, minWidth: c === 2 ? 80 : 24 }} />;
        })}
      </colgroup>
      <tbody>
        {Array.from({ length: (isShedSheet ? shedDisplayEndRow : maxRow) - effectiveStart + 1 }, (_, ri) => {
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
          const isTodayRow    = isShedData && todayRow !== null && r === todayRow;
          const rowBg = isAnyHeader
            ? "var(--pm-primary)"
            : isShedSpacer
            ? "#ffffff"
            : isTodayRow
            ? "#fff9c4"
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
            <tr key={r} data-row={r} style={{ height: rowH, background: rowBg }}>
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
                  : (isAnyHeader && rawVal !== "" && !isNaN(Number(rawVal)) && !/[A-Za-z]/.test(rawVal)) ? ""
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
                      overflow: isAnyHeader ? "visible" : "hidden",
                      textOverflow: (isAnyHeader || isEditing) ? "clip" : "ellipsis",
                      padding: isEditing ? 0 : isAnyHeader ? "2px 5px" : "1px 3px",
                      borderTop: isAnyHeader ? "none" : isTodayRow ? "1px solid #f97316" : (info.borderTop ?? borderStyle),
                      borderBottom: isAnyHeader ? "none" : isTodayRow ? "1px solid #f97316" : (info.borderBottom ?? borderStyle),
                      borderLeft: isAnyHeader ? borderStyle : (isTodayRow && c === minCol) ? "3px solid #f97316" : (info.borderLeft ?? borderStyle),
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
                    ) : (isTodayRow && c === dayNumCol) ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                        <span>{displayVal}</span>
                        <span style={{ background: "#f97316", color: "#fff", fontSize: 8, borderRadius: 3, padding: "1px 4px", fontWeight: 800, letterSpacing: 0.3, lineHeight: 1.5, flexShrink: 0 }}>TODAY</span>
                      </span>
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

// Convert any recognised date value → "DD/MM/YYYY" for display/editing.
function toDisplayDate(raw: string): string {
  if (!raw) return "";
  const d = parseDateString(raw) ?? parseDateInput(raw);
  if (!d || isNaN(d.getTime())) return raw;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Normalise a user-typed date string to "DD/MM/YYYY" for storage.
// Accepts DD/MM/YYYY, D/M/YYYY, DD-MM-YYYY, long formats, etc.
// Returns the original string unchanged if it can't be parsed as a date.
function normaliseDateInput(raw: string): string {
  const display = toDisplayDate(raw);
  return display || raw;
}

function SummaryInputField({ label, value, onSave, wide, isDate }: { label: string; value: string; onSave: (v: string) => void; wide?: boolean; isDate?: boolean }) {
  const t = useT();
  const [editing, setEditing] = useState(false);

  // For date fields show DD/MM/YYYY when not editing; seed draft the same way.
  const displayValue = isDate ? toDisplayDate(value) || value : value;
  const [draft, setDraft] = useState(displayValue);
  useEffect(() => { if (!editing) setDraft(displayValue); }, [value, editing]);

  const commit = (raw: string) => {
    const normalised = isDate ? normaliseDateInput(raw) : raw;
    onSave(normalised);
    setEditing(false);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
      <span style={{ fontSize: 11, color: "#555", minWidth: wide ? 0 : 80, flexShrink: 0 }}>{label}</span>
      {editing ? (
        <input
          autoFocus
          value={draft}
          placeholder={isDate ? "DD/MM/YYYY" : undefined}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={e => {
            if (e.key === "Enter") commit(draft);
            if (e.key === "Escape") { setDraft(displayValue); setEditing(false); }
          }}
          style={{ flex: 1, border: "2px solid var(--pm-primary)", borderRadius: 4, padding: "3px 7px", fontSize: 13, outline: "none", minWidth: 0 }}
        />
      ) : (
        <div
          onClick={() => { setDraft(displayValue); setEditing(true); }}
          style={{ flex: 1, background: "#f5f5f5", borderRadius: 4, padding: "3px 7px", fontSize: 13, cursor: "pointer", minHeight: 22, color: displayValue ? "#000" : "#aaa", minWidth: 0 }}
        >
          {displayValue || (isDate ? "DD/MM/YYYY" : t("tapToEdit"))}
        </div>
      )}
    </div>
  );
}

// ── Feed Alert System ────────────────────────────────────────────────────────

const FEED_ORDER_LEAD_DAYS = 7; // days needed to receive a feed order

interface FeedAlert {
  shedGroupName: string;
  feedOnHand: number;
  dailyUsage: number;
  daysRemaining: number;
  urgency: "critical" | "warning" | "watch";
  sheetIdx: number;
  currentAge: number;
  daysToCAatch: number | null; // null if batch end can't be determined
}
const ALERT_SNOOZE_KEY = "feedmate-alert-snooze";

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
    const hasConfig = (farmConfig.shedGroups?.length ?? 0) > 0;
    const groupActive = groupCfg ? groupCfg.active !== false : !hasConfig;
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

    // Find current age and planned end-of-batch age
    const currentAge = getV(latestRow, 0);
    let totalCatchAge = 0;
    for (let r = maxRow; r >= 3; r--) {
      const a = getV(r, 0);
      if (a >= 1) { totalCatchAge = a; break; }
    }
    const daysToCAatch = totalCatchAge > 0 && currentAge > 0
      ? Math.max(0, totalCatchAge - currentAge)
      : null;

    // KEY IMPROVEMENT: If feed will outlast the batch (+1 day buffer), suppress the alert.
    // This eliminates false alarms for sheds that are close to catch day.
    if (daysToCAatch !== null && daysRemaining > daysToCAatch + 1) continue;

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
      currentAge,
      daysToCAatch,
    });
  }

  return alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

function FeedAlertBanner({ alerts, onGoToShed }: { alerts: FeedAlert[]; onGoToShed: (sheetIdx: number) => void }) {
  if (alerts.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: "auto", paddingBottom: 4, flexShrink: 0 }}>
      {alerts.map((a, i) => {
        const bg = a.urgency === "critical" ? "#c0392b" : a.urgency === "warning" ? "#e67e22" : "#d4a017";
        const pulse = a.urgency === "critical";
        return (
          <button
            key={i}
            onClick={() => onGoToShed(a.sheetIdx)}
            title={a.urgency === "critical" ? "FEED CRITICAL — click to go to shed" : a.urgency === "warning" ? "Feed low — click to go to shed" : "Feed watch — click to go to shed"}
            style={{
              background: bg,
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "3px 8px",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              animation: pulse ? "pulse 1.2s infinite" : "none",
              whiteSpace: "nowrap",
            }}
          >
            {a.urgency === "critical" ? "🚨" : a.urgency === "warning" ? "⚠️" : "📋"}
            {a.shedGroupName} · {a.daysRemaining.toFixed(1)}d
          </button>
        );
      })}
    </div>
  );
}

function fmtAllocValue(raw: string): string {
  if (!raw) return raw;
  const stripped = raw.replace(/,/g, "");
  const n = parseFloat(stripped);
  // If the value doesn't parse as a positive number (e.g. it's a date string like
  // "20/03/2026" that leaked from an adjacent cell), suppress it entirely so the
  // Summary card never shows a date where a kg figure should appear.
  if (isNaN(n) || n <= 0) return "";
  // Round to nearest whole number so all sheds show clean figures (e.g. 26,000 not 26,260.5)
  return Math.round(n).toLocaleString();
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
  // Always derive shed number from the sheet name — G1 cell data can be stale
  // if the sheet was copied from another shed (e.g. Shed 9&10 copied from Shed 7&8).
  const shedNum = (() => {
    const m = sheet.name.match(/(\d+\s*&\s*\d+)/);
    return m ? m[1].replace(/\s*&\s*/, " & ").trim() : sheet.name.replace(/SHED\s*/i, "").trim();
  })();
  const placement = getCell(sheetIdx, 2, 2);
  // Individual shed names — prefer the spreadsheet label, fall back to "SHED {n}" from the sheet name
  const shed1Name = getCell(sheetIdx, 3, 1) || `SHED ${shed1Num}`;
  const shed2Name = getCell(sheetIdx, 4, 1) || `SHED ${shed2Num}`;
  const shed1Birds = getCell(sheetIdx, 3, 2);
  const shed2Birds = getCell(sheetIdx, 4, 2);
  // For allocation cells, prefer the raw numeric value stored by the parser over the
  // formatted cell string — some sheds have "d-mmm" date format applied to H3-H5 in the
  // template which converts the kg number into a date string (e.g. "2154 May"). Using
  // numericValue bypasses this and always returns the actual kg figure.
  const getAllocRaw = (r: number): string => {
    const editKey = `${r},7`;
    const edited = edits.get(editKey);
    // Only trust an edit if it parses as a valid number — date strings accidentally
    // autosaved by a previous buggy version must be bypassed here.
    if (edited !== undefined && !isNaN(parseFloat(edited.replace(/,/g, "")))) return edited;
    const cell = sheet.cells.get(editKey);
    if (!cell) return "";
    if (cell.numericValue !== undefined) return String(cell.numericValue);
    return cell.value;
  };
  const strAlloc  = fmtAllocValue(getAllocRaw(1));
  const gwrAlloc  = fmtAllocValue(getAllocRaw(2));
  const finAlloc  = fmtAllocValue(getAllocRaw(3));
  const wdwAlloc  = fmtAllocValue(getAllocRaw(4));

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
        <SummaryInputField label={t("placement")} value={placement} onSave={v => onEdit(sheetIdx, "2,2", v)} isDate />
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
    const hasConfig = (farmConfig.shedGroups?.length ?? 0) > 0;
    const groupActive = groupCfg ? groupCfg.active !== false : !hasConfig;
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
      const hasConfig = (farmConfig.shedGroups?.length ?? 0) > 0;
      const groupActive = groupCfg ? groupCfg.active !== false : !hasConfig;
      if (groupActive) shedItems.push({ sheetIdx: i, shedGroupId });
      shedCount++;
    }
  }

  const _batchNumSheet2 = eobIdx >= 0 ? (parseFloat(getCell(eobIdx, 1, 2)) || null) : null;
  const _batchNumLS2    = localStorage.getItem("silo-batch-num");
  const batchNum = _batchNumLS2 ? (parseInt(_batchNumLS2, 10) || null) : _batchNumSheet2;

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
  // Bird/weight metrics in column AH (col 34), feed metrics in column AL (col 38),
  // FCR/cage metrics in column AN (col 40).
  const farmName   = String(gv(1, 2) ?? "");
  const batchNum   = num(gv(1, 7));
  const totalPlaced    = num(gv(3, 34));   // AH3  — total birds placed
  const totalOut       = num(gv(6, 34));   // AH6  — total birds caught
  const mortalityPct   = num(gv(4, 34)) * 100; // AH4 — mortality fraction → %
  const aveWeight      = num(gv(8, 34));   // AH8  — average live weight (kg)
  const fcr            = num(gv(8, 38));   // AL8  — FCR
  const cfcr           = num(gv(4, 40));   // AN4  — cFCR
  const cage           = num(gv(5, 40));   // AN5  — cage FCR
  const actualAge      = num(gv(10, 34));  // AH10 — actual age (days) at catch
  const correctedAge   = num(gv(11, 34));  // AH11 — corrected age to 2.45 kg standard
  const feedOnHand     = num(gv(5, 38));   // AL5  — feed on hand (kg)
  const feedDelivered  = num(gv(4, 38));   // AL4  — total feed delivered (kg)
  const feedConsumed   = num(gv(6, 38));   // AL6  — total feed consumed (kg)

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
const WEIGH_PLAN_KEY    = "silo-weigh-plan";    // weigh-sheet catches — feed planning only, never shown in Catches tab
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
interface WeighImportRow  { shedNum: number; date: string; age: string; birds: string; empty?: boolean; }

async function parseWeighSheetBuffer(buffer: ArrayBuffer): Promise<WeighImportRow[]> {
  const XLSX = await import("xlsx");
  // cellStyles:true lets us read fill colours to detect red (empty) rows
  const wb   = XLSX.read(new Uint8Array(buffer), { type: "array", cellStyles: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];

  // Detect whether a cell has a red-dominant fill
  function isRedCell(rowIdx: number, colIdx: number): boolean {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: colIdx })] as any;
      if (!cell?.s) return false;
      // fgColor is the pattern fill colour; bgColor is the background
      const raw: string = cell.s.fgColor?.rgb ?? cell.s.bgColor?.rgb
                       ?? cell.s.fgColor?.argb ?? cell.s.bgColor?.argb ?? "";
      // Strip optional 2-char alpha prefix (ARGB → RGB)
      const rgb = raw.length === 8 ? raw.slice(2) : raw;
      if (rgb.length !== 6) return false;
      const r = parseInt(rgb.slice(0, 2), 16);
      const g = parseInt(rgb.slice(2, 4), 16);
      const b = parseInt(rgb.slice(4, 6), 16);
      // Red dominant: r is the highest channel and significantly exceeds g and b
      return r >= g && r >= b && r > 160 && (r - g) + (r - b) > 60;
    } catch { return false; }
  }

  // Find row that has "MONDAY" / "TUESDAY" etc.
  let hdrIdx = -1;
  for (let i = 0; i < data.length; i++) {
    if ((data[i] as string[]).some(c => typeof c === "string" && c.toUpperCase().includes("MONDAY"))) {
      hdrIdx = i; break;
    }
  }
  if (hdrIdx === -1) return [];

  const dateRow = data[hdrIdx + 1] as unknown[];
  // Collect columns where Excel serial dates live
  const dayCols: { col: number; date: string }[] = [];
  dateRow.forEach((v, col) => {
    if (typeof v === "number" && v > 40000) {
      const d = XLSX.SSF.parse_date_code(v);
      dayCols.push({ col, date: `${String(d.d).padStart(2,"0")}/${String(d.m).padStart(2,"0")}/${d.y}` });
    }
  });
  if (dayCols.length === 0) return [];

  const results: WeighImportRow[] = [];
  for (let i = hdrIdx + 2; i < data.length; i++) {
    const row = data[i] as unknown[];
    const col1 = String(row[1] ?? "");
    if (!/\d+\s*\(/.test(col1)) continue;           // must be like "3(CB)"
    const shedNum = parseInt(col1.replace(/\D.*/, ""), 10);
    if (!shedNum) continue;

    // A red-highlighted shed name cell means the shed is empty
    const shedIsEmpty = isRedCell(i, 1) || isRedCell(i, 0);

    if (shedIsEmpty) {
      // Record as empty using the first date column — one entry per shed
      const firstDay = dayCols[0];
      results.push({ shedNum, date: firstDay?.date ?? "", age: "", birds: "0", empty: true });
    } else {
      dayCols.forEach(({ col, date }) => {
        const birds = row[col + 5];                  // birds count is at offset +5
        const age   = row[col];
        if (typeof birds === "number" && birds > 0) {
          results.push({ shedNum, date, age: typeof age === "number" ? String(age) : "", birds: String(birds) });
        }
      });
    }
  }
  return results;
}


function parseEmailCatchText(text: string): ParsedEmailRow[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const splitRow = (line: string) =>
    line.includes('\t') ? line.split('\t').map(c => c.trim()) : line.split(/\s{2,}/).map(c => c.trim());

  function buildResults(headerCols: string[], dataStart: number, getDataRow: (i: number) => string[]): ParsedEmailRow[] {
    const upper = headerCols.map(c => c.toUpperCase());
    const findCol = (kw: string) => upper.findIndex(c => c.includes(kw));
    const shedIdx   = findCol('SHED');
    const ageIdx    = upper.findIndex(c => c === 'AGE');
    const birdIdx   = findCol('BIRD');
    const actualIdx = upper.findIndex(c => c === 'ACTUAL');
    const totalIdx  = findCol('TOTAL');
    if (shedIdx === -1 || birdIdx === -1) return [];
    const results: ParsedEmailRow[] = [];
    let i = dataStart;
    while (true) {
      const cols = getDataRow(i);
      if (!cols || cols.length === 0) break;
      i++;
      const shedNum = parseInt((cols[shedIdx] ?? '').replace(/[^\d]/g, ''), 10);
      const birds   = parseInt((cols[birdIdx]  ?? '').replace(/,/g, ''), 10);
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

  // ── Standard format: header + data on same row (tab or 2+ spaces) ──
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i].toUpperCase();
    if (upper.includes('SHED') && (upper.includes('BIRD') || upper.includes('AGE')) && upper.includes('ACTUAL')) {
      headerIdx = i; break;
    }
  }
  if (headerIdx >= 0) {
    const headerCols = splitRow(lines[headerIdx]);
    let rowIdx = headerIdx + 1;
    const results = buildResults(headerCols, 0, () => {
      if (rowIdx >= lines.length) return [];
      return splitRow(lines[rowIdx++]);
    });
    if (results.length > 0) return results;
  }

  // ── Fallback: one column per line (email renders each cell on its own line) ──
  // Detect by finding a run of header-like lines near the top:
  // e.g. GROWER / SHED # / AGE / BIRD # / ESTIMATE / ACTUAL / TOTAL KG each on their own line.
  const HEADER_KEYWORDS = ['GROWER', 'SHED', 'AGE', 'BIRD', 'ESTIMATE', 'ACTUAL', 'TOTAL'];
  let colPerLineStart = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const upper = lines[i].toUpperCase();
    if (HEADER_KEYWORDS.some(kw => upper.includes(kw))) { colPerLineStart = i; break; }
  }
  if (colPerLineStart >= 0) {
    // Collect consecutive header lines
    const headerCols: string[] = [];
    let i = colPerLineStart;
    while (i < lines.length) {
      const upper = lines[i].toUpperCase();
      // Stop when we hit a line that looks like data (a pure number, or "Double B" type farm name that comes after headers)
      // We'll just collect until we see a line that contains none of the header keywords AND isn't "#"
      const isHeaderLike = HEADER_KEYWORDS.some(kw => upper.includes(kw)) || upper === '#' || upper === 'SHED #';
      if (!isHeaderLike && headerCols.length >= 3) break;
      if (isHeaderLike) headerCols.push(lines[i]);
      i++;
    }
    if (headerCols.length >= 4) {
      const numCols = headerCols.length;
      const dataLines = lines.slice(i);
      let dataIdx = 0;
      const results = buildResults(headerCols, 0, () => {
        if (dataIdx + numCols > dataLines.length) return [];
        const row = dataLines.slice(dataIdx, dataIdx + numCols);
        dataIdx += numCols;
        return row;
      });
      if (results.length > 0) return results;
    }
  }

  return [];
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
  const [weighRows, setWeighRows]   = useState<WeighImportRow[] | null>(null);
  const [weighError, setWeighError] = useState("");
  const [weighParsing, setWeighParsing] = useState(false);
  const weighFileRef = useRef<HTMLInputElement>(null);
  const todayDateStr = () => { const d = new Date(); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`; };
  const [emailCatchDate, setEmailCatchDate] = useState(todayDateStr);
  const [batchHistory]  = useState<BatchHistoryEntry[]>(readBatchHistory);

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

  // Sync batch number from Silo Base Mate (and vice versa) via storage events
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

  // Weigh-plan map — stored separately, only used for shed feed planning tabs
  const [weighPlanMap, setWeighPlanMap] = useState<CatchMap>(() => {
    try { return JSON.parse(localStorage.getItem(WEIGH_PLAN_KEY) || "{}"); } catch { return {}; }
  });
  const saveWeighPlanMap = (next: CatchMap) => {
    setWeighPlanMap(next);
    localStorage.setItem(WEIGH_PLAN_KEY, JSON.stringify(next));
    // Notify main App so FlockForecastView stays in sync (custom event within same tab)
    window.dispatchEvent(new CustomEvent("weighPlanUpdated"));
  };

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
    const hasConfig = (farmConfig.shedGroups?.length ?? 0) > 0;
    return cfg ? cfg.active !== false : !hasConfig;
  };

  // All active shed numbers (union of xlsx sheds + live placement + any catch data entered + configured shed groups)
  const xlShedNums = new Set(xlSheds.map(s => s.shedNum));
  const allShedNums = new Set([...xlShedNums]);
  shedPlacement.forEach((_, n) => allShedNums.add(n));
  Object.keys(catchMap).forEach(k => { const n = parseInt(k, 10); if (!isNaN(n) && n > 0) allShedNums.add(n); });
  // Seed shed numbers to show:
  // - If the user has configured shed groups: only their active groups.
  // - If no config yet (first use): every shed tab found in the loaded file.
  const hasConfig = (farmConfig.shedGroups?.length ?? 0) > 0;
  if (!hasConfig) {
    let tabGroupCount = 0;
    sheets.forEach(s => { if (s.name.trim().toUpperCase().includes("SHED")) tabGroupCount++; });
    for (let gid = 1; gid <= tabGroupCount; gid++) {
      allShedNums.add(gid * 2 - 1);
      allShedNums.add(gid * 2);
    }
  }
  // Add any explicitly configured active shed groups
  farmConfig.shedGroups?.forEach(g => {
    if (g.active !== false) {
      allShedNums.add(g.shedGroupId * 2 - 1);
      allShedNums.add(g.shedGroupId * 2);
    }
  });
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
        <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Weigh sheet upload button — changes appearance when catches already exist */}
            {(() => {
              const shedsWithCatches = Object.keys(weighPlanMap).filter(k => (weighPlanMap[Number(k)]?.length ?? 0) > 0).length;
              const hasData = shedsWithCatches > 0;
              return (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <button
                    onClick={() => weighFileRef.current?.click()}
                    disabled={weighParsing}
                    style={{
                      background: hasData ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.15)",
                      border: hasData ? "2px solid #fff" : "1px solid rgba(255,255,255,0.4)",
                      color: hasData ? "var(--pm-primary)" : "#fff",
                      borderRadius: 7, padding: "6px 14px", fontWeight: 700, fontSize: 13,
                      cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                      opacity: weighParsing ? 0.7 : 1
                    }}
                    title="Upload a weigh sheet Excel file to import catch bird numbers"
                  >
                    {weighParsing ? "⏳ Reading…" : hasData ? "📂 Re-upload Weigh Sheet" : "📂 Upload Weigh Sheet"}
                  </button>
                  {hasData && (
                    <div style={{ background: "#22c55e", color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 0.3 }}>
                      ✓ {shedsWithCatches} shed{shedsWithCatches !== 1 ? "s" : ""} loaded
                    </div>
                  )}
                  {!hasData && !weighParsing && (
                    <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 600 }}>
                      ← needed to plan catches
                    </div>
                  )}
                </div>
              );
            })()}
            <input
              ref={weighFileRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                setWeighError(""); setWeighParsing(true);
                try {
                  const buf = await file.arrayBuffer();
                  const rows = await parseWeighSheetBuffer(buf);
                  if (rows.length === 0) setWeighError("No catch data found — make sure this is a Weigh Sheet file.");
                  else setWeighRows(rows);
                } catch { setWeighError("Could not read file. Please try again."); }
                finally { setWeighParsing(false); e.target.value = ""; }
              }}
            />
            <button
              onClick={() => { setEmailText(""); setEmailParsed(null); setEmailParseError(""); setEmailCatchDate(todayDateStr()); setShowEmailImport(true); }}
              style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.4)", color: "#fff", borderRadius: 7, padding: "6px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
              title="Import catch data from a Baiada weighbridge email"
            >
              📧 Email Catches
            </button>
          </div>
          {weighError && <div style={{ color: "#ffcccc", fontSize: 12 }}>{weighError}</div>}
        </div>
      </div>

      {/* ── Sub-tab bar ──────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid #e0e8e4" }}>
        {([
          { id: "catches", label: "🎯 Catches", color: "var(--pm-primary)" },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => {}}
            style={{
              padding: "9px 20px", fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer",
              background: "#fff", color: tab.color,
              borderBottom: `3px solid ${tab.color}`,
              marginBottom: -2, borderRadius: "6px 6px 0 0", transition: "all 0.15s",
            }}
          >{tab.label}</button>
        ))}
      </div>


      {/* ── Catches content ── */}
      <div>

      {/* ── Shed Summary Table ───────────────────────────────────── */}
      {(() => {
        if (shedStats.length === 0) return null;

        const processor = farmConfig.processor ?? "baiada";
        const isBaiada  = processor === "baiada";

        const rows = shedStats.map(({ shedNum, placement, totalCaught, aveWgt, mortPct }) => {
          const xl   = xlSheds.find(s => s.shedNum === shedNum);
          const fcr  = xl?.fcr  && xl.fcr  > 0 ? xl.fcr  : null;
          const cfcr = xl?.cfcr && xl.cfcr > 0 ? xl.cfcr : null;
          const wgt  = aveWgt > 0 ? aveWgt : (xl?.aveWeight && xl.aveWeight > 0 ? xl.aveWeight : null);
          const efficiencyVal = isBaiada ? cfcr : fcr;
          return { shedNum, placement, totalCaught, wgt, mortPct, efficiencyVal };
        });

        const colHd: React.CSSProperties = {
          padding: "8px 12px", fontWeight: 800, fontSize: 11,
          textTransform: "uppercase", letterSpacing: 0.8, color: "#fff",
          background: "var(--pm-primary)", textAlign: "center" as const, whiteSpace: "nowrap",
        };
        const cell: React.CSSProperties = {
          padding: "10px 12px", fontSize: 13, textAlign: "center" as const,
          borderBottom: "1px solid #f0f0f0",
        };

        return (
          <div style={{ background: "#fff", border: "1px solid #e0e8e4", borderRadius: 12, marginBottom: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", overflow: "hidden" }}>
            <div style={{ background: "var(--pm-primary)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>📋 ALL SHEDS — RESULTS SUMMARY</span>
              <span style={{ background: isBaiada ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.2)", color: "#fff", borderRadius: 5, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                {isBaiada ? "BAIADA" : "INGHAM"}
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...colHd, textAlign: "left" as const }}>Shed</th>
                    <th style={colHd}>Birds Placed</th>
                    <th style={colHd}>Birds Out</th>
                    <th style={colHd}>Mortality</th>
                    <th style={colHd}>Ave Weight</th>
                    <th style={colHd}>{isBaiada ? "cFCR" : "FCR"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ shedNum, placement, totalCaught, wgt, mortPct, efficiencyVal }, i) => (
                    <tr key={shedNum} style={{ background: i % 2 === 0 ? "#fafafa" : "#fff" }}>
                      <td style={{ ...cell, textAlign: "left" as const, fontWeight: 700, color: "var(--pm-primary)" }}>Shed {shedNum}</td>
                      <td style={cell}>{placement > 0 ? placement.toLocaleString() : "—"}</td>
                      <td style={cell}>{totalCaught > 0 ? totalCaught.toLocaleString() : "—"}</td>
                      <td style={{ ...cell, color: mortPct > 5 ? "#c0392b" : mortPct > 3 ? "#e67e22" : "#27ae60", fontWeight: 700 }}>
                        {mortPct > 0 ? `${mortPct.toFixed(2)}%` : "—"}
                      </td>
                      <td style={cell}>{wgt != null ? `${wgt.toFixed(2)} kg` : "—"}</td>
                      <td style={{ ...cell, fontWeight: 700, color: "#16a085" }}>{efficiencyVal != null ? efficiencyVal.toFixed(3) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
        <div style={cardStyle("#2980b9")}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#2980b9" }}>{summary && summary.fcr > 0 ? summary.fcr.toFixed(3) : "—"}</div>
          <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>FCR</div>
        </div>
        <div style={cardStyle("#16a085")}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#16a085" }}>{summary && summary.cfcr > 0 ? summary.cfcr.toFixed(3) : "—"}</div>
          <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>CFCR</div>
        </div>
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
        {(() => {
          const cageFcr    = summary && summary.cage > 0 ? summary.cage : null;
          const totalCages = Object.values(catchMap).reduce((s, rows) => s + rows.length, 0);
          return (
            <div style={cardStyle("#7f8c8d")}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#7f8c8d" }}>
                {cageFcr != null
                  ? cageFcr.toFixed(3)
                  : totalCages > 0
                    ? <>{totalCages} <span style={{ fontSize: 13 }}>cages</span></>
                    : "—"}
              </div>
              <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>
                {cageFcr != null ? "Cage FCR" : "Cage"}
              </div>
            </div>
          );
        })()}
      </div>

      {/* FCR / CFCR trend across batches */}
      {(() => {
        // Build trend: history entries (oldest→newest) + current batch appended
        const currentBatchNum = overrideBatchNum ?? summary?.batchNum ?? 0;
        // history is stored newest-first, so reverse for chart
        const histEntries = [...batchHistory].reverse();
        const currentEntry = summary && (summary.fcr > 0 || summary.cfcr > 0) ? {
          batchNum:    currentBatchNum,
          date:        new Date().toISOString(),
          totalBirds:  0,
          totalFeedKg: summary.feedDelivered > 0 ? summary.feedDelivered : 0,
          fcr:         summary.fcr  > 0 ? summary.fcr  : null,
          cfcr:        summary.cfcr > 0 ? summary.cfcr : null,
          cage:        null, mortalityPct: null, aveWeight: null,
        } : null;

        // Combine: exclude current batch number from history to avoid duplicate
        const combined: BatchHistoryEntry[] = [
          ...histEntries.filter(e => e.batchNum !== currentBatchNum),
          ...(currentEntry ? [currentEntry] : []),
        ].slice(-10); // last 10 batches

        const hasFcr   = combined.some(e => e.fcr   != null && e.fcr   > 0);
        const hasCfcr  = combined.some(e => e.cfcr  != null && e.cfcr  > 0);
        const hasFeed  = combined.some(e => e.totalFeedKg > 0);
        if (combined.length < 2 || (!hasFcr && !hasCfcr)) return null;

        const trendData = combined.map(e => ({
          label:    e.batchNum > 0 ? `Batch ${e.batchNum}` : "Current",
          fcr:      e.fcr  != null && e.fcr  > 0 ? parseFloat(e.fcr.toFixed(3))  : null,
          cfcr:     e.cfcr != null && e.cfcr > 0 ? parseFloat(e.cfcr.toFixed(3)) : null,
          feedTons: e.totalFeedKg > 0 ? parseFloat((e.totalFeedKg / 1000).toFixed(1)) : null,
        }));

        // Highlight current (last) point
        const isCurrentIdx = trendData.length - 1;

        const TrendTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
          if (!active || !payload?.length) return null;
          return (
            <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: "10px 14px", fontSize: 12, boxShadow: "0 3px 10px rgba(0,0,0,0.12)" }}>
              <div style={{ fontWeight: 800, marginBottom: 6, color: "#333" }}>{label}</div>
              {payload.map(p => (
                <div key={p.name} style={{ display: "flex", justifyContent: "space-between", gap: 20, color: p.color, marginBottom: 2 }}>
                  <span>{p.name}</span>
                  <span style={{ fontWeight: 700 }}>{p.name === "Feed (t)" ? `${p.value} t` : p.value.toFixed(3)}</span>
                </div>
              ))}
            </div>
          );
        };

        // Custom dot: highlight current batch in gold
        const CustomDot = (key: string, color: string) => (props: { cx?: number; cy?: number; index?: number }) => {
          const { cx = 0, cy = 0, index = 0 } = props;
          const isCurrent = index === isCurrentIdx;
          return <circle cx={cx} cy={cy} r={isCurrent ? 7 : 4} fill={isCurrent ? "#C9A227" : color} stroke="#fff" strokeWidth={2} />;
        };

        return (
          <div style={{ background: "#fff", border: "1px solid #e0e8e4", borderRadius: 12, padding: "16px 20px", marginBottom: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <div style={{ background: "#1a3a5c", color: "#fff", borderRadius: 7, padding: "3px 14px", fontWeight: 800, fontSize: 13 }}>📈 FCR · CFCR TREND</div>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>{combined.length} batches — current highlighted in gold</span>
              <div style={{ display: "flex", gap: 14, marginLeft: "auto", flexWrap: "wrap" }}>
                {hasFcr  && <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#2980b9" }}><span style={{ width: 12, height: 3, background: "#2980b9", display: "inline-block", borderRadius: 2 }} />FCR</span>}
                {hasCfcr && <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#16a085" }}><span style={{ width: 12, height: 3, background: "#16a085", display: "inline-block", borderRadius: 2 }} />CFCR</span>}
                {hasFeed && <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#e0a020" }}><span style={{ width: 12, height: 10, background: "#e0a02022", border: "1.5px solid #e0a020", display: "inline-block", borderRadius: 2 }} />Feed (t)</span>}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={trendData} margin={{ top: 8, right: hasFeed ? 48 : 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 600 }} />
                <YAxis yAxisId="fcr" domain={["auto", "auto"]} tick={{ fontSize: 11 }} tickFormatter={v => v.toFixed(2)}
                  label={{ value: "FCR / CFCR", angle: -90, position: "insideLeft", fontSize: 10, fill: "#555" }} />
                {hasFeed && <YAxis yAxisId="feed" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `${v}t`}
                  label={{ value: "Feed (t)", angle: 90, position: "insideRight", fontSize: 10, fill: "#e0a020" }} />}
                <Tooltip content={<TrendTooltip />} />
                {hasFeed && <Bar yAxisId="feed" dataKey="feedTons" name="Feed (t)" fill="#e0a02018" stroke="#e0a020" strokeWidth={1} radius={[3,3,0,0]} maxBarSize={36} />}
                {hasFcr  && <Line yAxisId="fcr" type="monotone" dataKey="fcr"  name="FCR"  stroke="#2980b9" strokeWidth={2.5} dot={CustomDot("fcr",  "#2980b9")} connectNulls />}
                {hasCfcr && <Line yAxisId="fcr" type="monotone" dataKey="cfcr" name="CFCR" stroke="#16a085" strokeWidth={2.5} dot={CustomDot("cfcr", "#16a085")} connectNulls />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {/* Ross 308 FF As-Hatched standard comparison at actual age */}
      {summary && summary.actualAge > 0 && (() => {
        const std = getRoss308Standard(summary.actualAge);
        if (!std) return null;
        const actualWgtKg = summary.aveWeight;
        const actualFcr   = summary.fcr;
        const stdWgtKg    = std.weight / 1000;
        const wgtDelta    = actualWgtKg > 0 ? actualWgtKg - stdWgtKg : null;
        const fcrDelta    = actualFcr   > 0 ? actualFcr   - std.fcr  : null;
        const wgtPct      = wgtDelta !== null ? (wgtDelta / stdWgtKg) * 100 : null;
        const fcrPct      = fcrDelta !== null ? (fcrDelta / std.fcr)  * 100 : null;
        const isExtrapolated = summary.actualAge > 33;

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
                As-Hatched · {Math.round(summary.actualAge)} day{Math.round(summary.actualAge) !== 1 ? "s" : ""}
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
        // Read from the same cells as the green header (col 18) for consistency
        const fsLastBatchLeft = getEobNum(7, 18);
        const fsFeedLeft      = getEobNum(15, 18);
        // Live-compute total delivered (same logic as EobInfoPanel)
        const fsDelivCols = [3, 8, 12, 16];
        let fsLiveDelivered = 0;
        for (let r = 6; r <= 35; r++) {
          for (const col of fsDelivCols) {
            const v = getEobNum(r, col);
            if (v > 0) fsLiveDelivered += v;
          }
        }
        const fsDelivered   = fsLiveDelivered > 0 ? fsLiveDelivered : getEobNum(11, 18);
        const fsTotalIn     = fsLastBatchLeft + fsDelivered;
        const fsNetConsumed = fsTotalIn - fsFeedLeft;
        const fromEob = fsTotalIn > 0;
        return (
          <div style={{ background: "var(--pm-primary-soft)", border: "1px solid var(--pm-primary-border)", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.5 }}>Feed Summary</div>
              {fromEob && <div style={{ fontSize: 10, color: "#888", background: "var(--pm-primary-pale)", borderRadius: 4, padding: "2px 7px" }}>from End of Batch</div>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
              {[
                { label: "Last Batch Left", value: fsLastBatchLeft > 0 ? fmtN(fsLastBatchLeft) + " kg" : "—" },
                { label: "Delivered",       value: fsDelivered     > 0 ? fmtN(fsDelivered)     + " kg" : "—" },
                { label: "Total In",        value: fsTotalIn       > 0 ? fmtN(fsTotalIn)       + " kg" : "—" },
                { label: "Feed Left",       value: fsFeedLeft      > 0 ? fmtN(fsFeedLeft)      + " kg" : "—" },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--pm-primary-mid)" }}>{value}</div>
                </div>
              ))}
            </div>
            {/* Net consumed — highlighted bar */}
            {fsNetConsumed > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--pm-primary-border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--pm-primary)", borderRadius: 8, padding: "10px 14px" }}>
                  <div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>Net Consumed This Batch</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 1 }}>Total In − Feed Left</div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>{fmtN(fsNetConsumed)} <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.8 }}>kg</span></div>
                </div>
              </div>
            )}
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
            {shedStats.map(({ shedNum, placement, rows, totalCaught: sc, totalWgtKg, aveWgt, morts, mortPct }) => {
              const xl = xlSheds.find(s => s.shedNum === shedNum);
              const shedFcr  = xl?.fcr  && xl.fcr  > 0 ? xl.fcr  : null;
              const shedCfcr = xl?.cfcr && xl.cfcr > 0 ? xl.cfcr : null;
              const cageCount = rows.length;
              return (
              <div key={shedNum} style={{ background: "#fff", borderRadius: 10, border: "1px solid #dde8e0", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>

                {/* Card header */}
                <div style={{ background: "linear-gradient(135deg, var(--pm-primary) 0%, var(--pm-primary-mid) 100%)", color: "#fff", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                  {/* FCR / CFCR / Cage row */}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 6 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "rgba(255,255,255,0.12)", borderRadius: 6, padding: "3px 10px", minWidth: 52 }}>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>{shedFcr !== null ? shedFcr.toFixed(3) : "—"}</div>
                      <div style={{ fontSize: 8, opacity: 0.75, textTransform: "uppercase", letterSpacing: 0.8 }}>FCR</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "rgba(255,255,255,0.12)", borderRadius: 6, padding: "3px 10px", minWidth: 52 }}>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>{shedCfcr !== null ? shedCfcr.toFixed(3) : "—"}</div>
                      <div style={{ fontSize: 8, opacity: 0.75, textTransform: "uppercase", letterSpacing: 0.8 }}>CFCR</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "rgba(201,162,39,0.3)", borderRadius: 6, padding: "3px 10px", minWidth: 52 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#C9A227" }}>{cageCount > 0 ? cageCount : "—"}</div>
                      <div style={{ fontSize: 8, opacity: 0.75, textTransform: "uppercase", letterSpacing: 0.8 }}>Cages</div>
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
            );
          })}
          </div>
        </div>
      )}

      {activeShedNums.length === 0 && (
        <div style={{ textAlign: "center", color: "#888", padding: "40px 20px", fontSize: 14 }}>
          No active sheds configured. Add catch rows once sheds are set up.
        </div>
      )}

      </div>{/* end catches tab wrapper */}

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
                <span style={{ color: "#666", fontSize: 12 }}>Works with the Baiada format: GROWER · SHED # · AGE · BIRD # · ESTIMATE · ACTUAL · TOTAL KG</span><br/>
                <span style={{ color: "#666", fontSize: 12 }}>✓ Supports tab-separated, space-separated, and one-value-per-line formats (all work automatically)</span>
              </div>

              {/* Catch date */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontWeight: 700, fontSize: 12, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5 }}>
                  Catch Date
                </label>
                <input
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={emailCatchDate}
                  onChange={e => setEmailCatchDate(e.target.value)}
                  style={{ width: "100%", border: "1.5px solid var(--pm-primary-border)", borderRadius: 8, padding: "9px 12px", fontSize: 14, fontWeight: 600, outline: "none", boxSizing: "border-box", color: "#222" }}
                />
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
                          const newCatch: EditableCatch = { date: emailCatchDate.trim(), age: row.age, birds: row.birds, aveWgt: row.aveWgt, totalWgt: row.totalWgt };
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

      {/* ── Weigh Sheet Import Modal ─────────────────────────────────────── */}
      {weighRows && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setWeighRows(null)}>
          <div style={{ background: "#fff", borderRadius: 14, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 12px 50px rgba(0,0,0,0.35)" }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ background: "var(--pm-primary)", padding: "16px 20px", borderRadius: "14px 14px 0 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>📂 Weigh Sheet — Catch Data</div>
                <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 }}>
                  Found {weighRows.length} catch{weighRows.length !== 1 ? "es" : ""} across {new Set(weighRows.map(r => r.shedNum)).size} sheds
                </div>
              </div>
              <button onClick={() => setWeighRows(null)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>

            <div style={{ padding: "18px 20px" }}>
              {/* Preview table */}
              {(() => {
                const catchRows  = weighRows.filter(r => !r.empty);
                const emptyRows  = weighRows.filter(r => r.empty);
                const newCount   = catchRows.filter(r => !(weighPlanMap[r.shedNum] ?? []).some(c => c.date === r.date)).length;
                const updateCount = catchRows.length - newCount;
                return (
                  <>
                    {/* Summary pills */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                      {newCount > 0 && (
                        <span style={{ background: "#dcfce7", color: "#166534", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>
                          ＋{newCount} new
                        </span>
                      )}
                      {updateCount > 0 && (
                        <span style={{ background: "#dbeafe", color: "#1e40af", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>
                          ↻ {updateCount} update{updateCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      {emptyRows.length > 0 && (
                        <span style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>
                          🔴 {emptyRows.length} shed{emptyRows.length !== 1 ? "s" : ""} empty
                        </span>
                      )}
                      {newCount === 0 && updateCount === 0 && emptyRows.length === 0 && (
                        <span style={{ background: "#f3f4f6", color: "#6b7280", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>
                          No changes
                        </span>
                      )}
                    </div>

                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: "#f3f4f6" }}>
                            <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "#374151", borderBottom: "1px solid #e5e7eb" }}>Shed</th>
                            <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, color: "#374151", borderBottom: "1px solid #e5e7eb" }}>Date</th>
                            <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, color: "#374151", borderBottom: "1px solid #e5e7eb" }}>Age</th>
                            <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "#374151", borderBottom: "1px solid #e5e7eb" }}>Birds Out</th>
                            <th style={{ padding: "8px 8px", textAlign: "center", fontWeight: 700, color: "#374151", borderBottom: "1px solid #e5e7eb" }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {weighRows.map((r, i) => {
                            if (r.empty) {
                              return (
                                <tr key={i} style={{ background: "#fff5f5", borderBottom: "1px solid #fecaca" }}>
                                  <td style={{ padding: "9px 12px", fontWeight: 700, color: "#991b1b" }}>Shed {r.shedNum}</td>
                                  <td colSpan={3} style={{ padding: "9px 12px", textAlign: "center", color: "#b91c1c", fontWeight: 600, fontSize: 12 }}>
                                    — shed is empty (highlighted red in weigh sheet) —
                                  </td>
                                  <td style={{ padding: "9px 8px", textAlign: "center" }}>
                                    <span style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>🔴 EMPTY</span>
                                  </td>
                                </tr>
                              );
                            }
                            const isUpdate = (weighPlanMap[r.shedNum] ?? []).some(c => c.date === r.date);
                            const existingBirds = (weighPlanMap[r.shedNum] ?? []).find(c => c.date === r.date)?.birds;
                            const changed = isUpdate && existingBirds !== r.birds;
                            return (
                              <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                                <td style={{ padding: "9px 12px", fontWeight: 700, color: "var(--pm-primary)" }}>Shed {r.shedNum}</td>
                                <td style={{ padding: "9px 12px", textAlign: "center", color: "#374151" }}>{r.date}</td>
                                <td style={{ padding: "9px 12px", textAlign: "center", color: "#6b7280" }}>{r.age || "—"}</td>
                                <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 600, color: "#111827" }}>
                                  {parseInt(r.birds).toLocaleString()}
                                  {changed && existingBirds && (
                                    <span style={{ display: "block", fontSize: 10, color: "#6b7280", fontWeight: 400 }}>
                                      was {parseInt(existingBirds).toLocaleString()}
                                    </span>
                                  )}
                                </td>
                                <td style={{ padding: "9px 8px", textAlign: "center" }}>
                                  {isUpdate
                                    ? <span style={{ background: changed ? "#dbeafe" : "#f3f4f6", color: changed ? "#1e40af" : "#9ca3af", borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{changed ? "↻ UPDATE" : "= SAME"}</span>
                                    : <span style={{ background: "#dcfce7", color: "#166534", borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>＋ NEW</span>
                                  }
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {emptyRows.length > 0 && (
                      <div style={{ background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#991b1b", marginBottom: 10 }}>
                        🔴 <strong>{emptyRows.length} shed{emptyRows.length !== 1 ? "s are" : " is"} empty</strong> — highlighted red in the weigh sheet. These sheds will be marked as having no birds remaining so feed planning skips them.
                      </div>
                    )}
                    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#1e40af", marginBottom: 16 }}>
                      ℹ️ <strong>Safe to re-upload.</strong> Rows marked <em>UPDATE</em> replace the existing entry for that shed and date. <em>SAME</em> rows are unchanged. Upload the same sheet twice — nothing changes.
                    </div>
                  </>
                );
              })()}

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setWeighRows(null)}
                  style={{ flex: 1, background: "#f0f0f0", border: "none", borderRadius: 8, padding: "11px 0", fontWeight: 700, fontSize: 14, cursor: "pointer", color: "#333" }}>
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const next = { ...weighPlanMap };
                    weighRows.forEach(({ shedNum, date, age, birds }) => {
                      const entry: EditableCatch = { date, age, birds, aveWgt: "", totalWgt: "" };
                      const existing = next[shedNum] ?? [];
                      const idx = existing.findIndex(c => c.date === date);
                      if (idx >= 0) {
                        // Amendment: replace the existing entry for this shed+date
                        const updated = [...existing];
                        updated[idx] = { ...updated[idx], birds, age };
                        next[shedNum] = updated;
                      } else {
                        // New catch date: append
                        next[shedNum] = [...existing, entry];
                      }
                    });
                    saveWeighPlanMap(next);
                    setWeighRows(null);
                  }}
                  style={{ flex: 2, background: "var(--pm-primary)", color: "#fff", border: "none", borderRadius: 8, padding: "11px 0", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
                >
                  ✅ Import {weighRows.length} Catch{weighRows.length !== 1 ? "es" : ""} into All Sheds
                </button>
              </div>
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

  // Build a shed-name lookup from loaded sheets
  const sheetNameForGroup = new Map<number, string>();
  {
    let sc = 0;
    for (const s of sheets) {
      const tabName = s.name.trim().toUpperCase();
      if (!tabName.includes("SHED") || tabName.includes("WEEKLY") || tabName.includes("CONSUMPTION")) continue;
      const sgId = SHED_SHEET_ORDER[sc] ?? (sc + 1);
      sc++;
      sheetNameForGroup.set(sgId, s.name);
    }
  }
  // Show only sheds matching the user's configured groups (or all sheet tabs if no config yet)
  const mortHasConfig = (farmConfig.shedGroups?.length ?? 0) > 0;
  const maxMortsGroup = sheetNameForGroup.size > 0 ? Math.max(...sheetNameForGroup.keys()) : 0;
  const activeShedNums: number[] = [];
  for (let sgId = 1; sgId <= maxMortsGroup; sgId++) {
    const grpCfg = farmConfig.shedGroups?.find(g => g.shedGroupId === sgId);
    const grpActive = grpCfg ? grpCfg.active !== false : !mortHasConfig;
    if (!grpActive) continue;
    const sheetName = sheetNameForGroup.get(sgId);
    const nm = sheetName?.match(/(\d+)\s*&\s*(\d+)/);
    const odd  = nm ? parseInt(nm[1]) : sgId * 2 - 1;
    const even = nm ? parseInt(nm[2]) : sgId * 2;
    activeShedNums.push(odd, even);
  }
  const shedNums = activeShedNums.length > 0
    ? activeShedNums
    : Array.from({ length: 24 }, (_, i) => i + 1);

  const days = getWeekDays(weekOffset);
  const weekLabel = `${days[0].toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`;

  const placementDate = useMemo((): Date | null => {
    const si = sheets.findIndex(s => /shed/i.test(s.name) && !/end/i.test(s.name));
    if (si < 0) return null;
    return findPlacementDate(sheets[si], edits[si])?.date ?? null;
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

// ── DensityView ───────────────────────────────────────────────────────────────
function DensityView({ shedPlacement, farmConfig }: { shedPlacement: Map<number, number>; farmConfig: FarmConfigData }) {
  const [floorAreas, setFloorAreas] = useState<Record<number, number>>(() => {
    try { return JSON.parse(localStorage.getItem(SHED_FLOOR_AREAS_KEY) ?? "{}"); } catch { return {}; }
  });
  const [weighIns, setWeighIns] = useState<Record<number, Record<number, number>>>(() => {
    try { return JSON.parse(localStorage.getItem(FLOCK_WEIGHIN_KEY) ?? "{}"); } catch { return {}; }
  });
  // Catch map: Record<shedNum, {date,age,birds,aveWgt,totalWgt}[]>
  const [catchMap, setCatchMap] = useState<Record<number, { birds: string; aveWgt: string; totalWgt: string; date: string; age: string }[]>>(() => {
    try { return JSON.parse(localStorage.getItem(BATCH_CATCHES_KEY) ?? "{}"); } catch { return {}; }
  });

  useEffect(() => {
    const handler = (e: StorageEvent | null) => {
      if (!e || e.key === FLOCK_WEIGHIN_KEY || e.key === null)
        try { setWeighIns(JSON.parse(localStorage.getItem(FLOCK_WEIGHIN_KEY) ?? "{}")); } catch { /* noop */ }
      if (!e || e.key === BATCH_CATCHES_KEY || e.key === null)
        try { setCatchMap(JSON.parse(localStorage.getItem(BATCH_CATCHES_KEY) ?? "{}")); } catch { /* noop */ }
    };
    handler(null); // sync on mount
    window.addEventListener("storage", handler as EventListener);
    return () => window.removeEventListener("storage", handler as EventListener);
  }, []);

  const saveFloorArea = (shedNum: number, val: number) => {
    const next = { ...floorAreas, [shedNum]: val };
    setFloorAreas(next);
    localStorage.setItem(SHED_FLOOR_AREAS_KEY, JSON.stringify(next));
  };

  const isGroupActive = (shedNum: number) => {
    const groupId = Math.ceil(shedNum / 2);
    const cfg = farmConfig.shedGroups?.find(g => g.shedGroupId === groupId);
    return cfg ? cfg.active !== false : groupId <= 6;
  };

  const activeShedNums = [...shedPlacement.keys()].filter(isGroupActive).sort((a, b) => a - b);

  return (
    <div style={{ padding: "20px 16px 40px", fontFamily: "Inter,'Segoe UI',sans-serif", overflowY: "auto", height: "100%" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #7b3fc4 0%, #5a2da0 100%)", color: "#fff", borderRadius: 10, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ background: "#C9A227", color: "#000", borderRadius: 7, padding: "3px 14px", fontWeight: 800, fontSize: 15 }}>DENSITY</div>
        <span style={{ fontSize: 13, opacity: 0.85 }}>kg/m² live weight · {activeShedNums.length} active shed{activeShedNums.length !== 1 ? "s" : ""}</span>
      </div>

      {activeShedNums.length === 0 ? (
        <div style={{ textAlign: "center", color: "#888", padding: "40px 20px", fontSize: 14 }}>
          No active sheds found. Load a spreadsheet and check shed settings.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {activeShedNums.map(shedNum => {
            const groupId = Math.ceil(shedNum / 2);
            const placed = shedPlacement.get(shedNum) ?? 0;
            const floorArea = floorAreas[shedNum] ?? 0;

            // Subtract caught birds from this shed to get current live count
            const shedCatches = catchMap[shedNum] ?? [];
            const totalCaught = shedCatches.reduce((sum, c) => sum + (parseInt(String(c.birds), 10) || 0), 0);
            const currentBirds = Math.max(0, placed - totalCaught);
            const hasCatches = totalCaught > 0;

            // Latest catch weight (kg) — from the most recent catch row with aveWgt recorded
            const catchesWithWgt = shedCatches.filter(c => parseFloat(String(c.aveWgt)) > 0);
            const latestCatchWgtKg = catchesWithWgt.length > 0
              ? parseFloat(String(catchesWithWgt[catchesWithWgt.length - 1].aveWgt))
              : null;

            // Bird density based on CURRENT birds in shed
            const birdDensity = floorArea > 0 && currentBirds > 0 ? currentBirds / floorArea : null;

            // Weigh-in data (from Broiler app Bird Weigh view OR Silo Mate AI camera weigh)
            const groupWeigh = weighIns[groupId] ?? {};
            const allAges = Object.keys(groupWeigh).map(Number).filter(a => !isNaN(a));
            const latestAge = allAges.length > 0 ? Math.max(...allAges) : null;
            const latestGrams = latestAge != null ? groupWeigh[latestAge] : null;
            const latestWeighInKg = latestGrams != null ? latestGrams / 1000 : null;

            // Best weight: prefer live weigh-in; fall back to latest catch weight
            const latestKg = latestWeighInKg ?? latestCatchWgtKg;
            const weightSource: "weighin" | "catch" | null = latestWeighInKg != null ? "weighin" : latestCatchWgtKg != null ? "catch" : null;

            const liveWtDensity = birdDensity != null && latestKg != null ? birdDensity * latestKg : null;

            // Primary metric: kg/m² live weight density (requires both floor area and weigh-in)
            // Secondary metric: birds/m² at placement (requires only floor area)
            const maxGauge = 45; // kg/m²
            const primaryVal  = liveWtDensity;   // kg/m² — main metric
            const pctFill = primaryVal != null ? Math.min((primaryVal / maxGauge) * 100, 100)
              : birdDensity != null ? Math.min((birdDensity / 20) * 100, 100) : 0;
            const densityColor = primaryVal != null
              ? (primaryVal < 30 ? "#27ae60" : primaryVal < 36 ? "#f39c12" : "#e74c3c")
              : birdDensity != null
                ? (birdDensity < 10 ? "#27ae60" : birdDensity < 14 ? "#f39c12" : "#e74c3c")
                : "#aaa";

            return (
              <div key={shedNum} style={{
                background: "#fff",
                border: `1.5px solid ${densityColor}44`,
                borderTop: `4px solid ${densityColor}`,
                borderRadius: 12,
                padding: 16,
                boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
                display: "flex", flexDirection: "column", gap: 12,
              }}>
                {/* Card header */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 800, fontSize: 16, color: "#222", flex: 1 }}>Shed {shedNum}</span>
                  {currentBirds > 0 && (
                    <span style={{ fontSize: 11, background: "#f0f7f3", borderRadius: 5, padding: "2px 8px", color: "#1a5c36", fontWeight: 700 }}>
                      🐔 {currentBirds.toLocaleString()} in shed
                    </span>
                  )}
                  {hasCatches && (
                    <span style={{ fontSize: 11, background: "#fff3e0", borderRadius: 5, padding: "2px 8px", color: "#b05000", fontWeight: 700 }}>
                      −{totalCaught.toLocaleString()} caught
                    </span>
                  )}
                </div>

                {/* Primary: kg/m² live weight density */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 34, fontWeight: 900, color: densityColor, lineHeight: 1 }}>
                    {primaryVal != null ? primaryVal.toFixed(1) : "—"}
                  </span>
                  <span style={{ fontSize: 13, color: "#777", fontWeight: 600 }}>kg/m²</span>
                  {birdDensity != null && (
                    <span style={{ fontSize: 12, color: "#1a5c36", fontWeight: 700, background: "#f0fdf4", borderRadius: 5, padding: "2px 8px" }}>
                      {birdDensity.toFixed(1)} birds/m²
                    </span>
                  )}
                </div>

                {/* Gauge bar — kg/m² scale */}
                {floorArea > 0 && (
                  <div>
                    <div style={{ background: "#f0f0f0", borderRadius: 99, height: 10, position: "relative", overflow: "hidden" }}>
                      {/* green zone 0-30, amber 30-36, red 36+ */}
                      <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${(30/maxGauge)*100}%`, background: "#27ae6018", borderRight: "2px dashed #27ae6055" }} />
                      <div style={{ position: "absolute", left: `${(30/maxGauge)*100}%`, top: 0, height: "100%", width: `${((36-30)/maxGauge)*100}%`, background: "#f39c1218", borderRight: "2px dashed #f39c1255" }} />
                      <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pctFill}%`, background: densityColor, borderRadius: 99, transition: "width 0.5s ease" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#aaa", marginTop: 3 }}>
                      <span>0</span>
                      <span style={{ color: "#27ae60" }}>30 ✓</span>
                      <span style={{ color: "#f39c12" }}>36 ⚡</span>
                      <span style={{ color: "#e74c3c" }}>36+ ⚠</span>
                    </div>
                  </div>
                )}

                {/* Weight info */}
                {weightSource === "weighin" && latestWeighInKg != null && (
                  <span style={{ fontSize: 12, background: "#f5eeff", borderRadius: 6, padding: "4px 10px", fontWeight: 600, color: "#7b3fc4", alignSelf: "flex-start" }}>
                    ⚖️ {latestWeighInKg.toFixed(3)} kg avg · day {latestAge}
                  </span>
                )}
                {weightSource === "catch" && latestCatchWgtKg != null && (
                  <span style={{ fontSize: 12, background: "#fff3e0", borderRadius: 6, padding: "4px 10px", fontWeight: 600, color: "#b05000", alignSelf: "flex-start" }}>
                    ⚖️ {latestCatchWgtKg.toFixed(3)} kg (catch weight)
                  </span>
                )}
                {latestKg == null && floorArea > 0 && currentBirds > 0 && (
                  <span style={{ fontSize: 11, color: "#a07030" }}>
                    ⚠ Weigh birds to get kg/m² — showing birds/m² only
                  </span>
                )}

                {/* Floor area input */}
                <div>
                  <div style={{ fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Shed Size (m²)</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="e.g. 1500"
                      value={floorArea || ""}
                      onChange={e => saveFloorArea(shedNum, parseFloat(e.target.value) || 0)}
                      style={{
                        flex: 1, border: `1.5px solid ${floorArea ? "#27ae6066" : "#e0e0e0"}`,
                        borderRadius: 7, padding: "6px 10px", fontSize: 14, fontWeight: 600,
                        color: "#333", background: floorArea ? "#f0f7f3" : "#fafafa",
                        outline: "none", boxSizing: "border-box",
                      }}
                    />
                    <span style={{ fontSize: 12, color: "#888", fontWeight: 700 }}>m²</span>
                  </div>
                  {!floorArea && placed > 0 && (
                    <div style={{ fontSize: 11, color: "#a07030", marginTop: 4 }}>⚠ Enter shed size to show density</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── HistoryView ───────────────────────────────────────────────────────────────
function BarChart({ entries, getValue, label, format, color, lowerIsBetter = false }: {
  entries: BatchHistoryEntry[];
  getValue: (e: BatchHistoryEntry) => number | null;
  label: string;
  format: (n: number) => string;
  color: string;
  lowerIsBetter?: boolean;
}) {
  const vals = entries.map(getValue);
  const defined = vals.filter((v): v is number => v !== null);
  const max = Math.max(...defined, 0.001);
  const W = 52, H = 88, gap = 8;
  const PAD_TOP = 20;
  const totalW = entries.length * (W + gap) - gap;

  // Trend line: (x, y) for each bar with a value
  const pts = vals.map((v, i) => {
    if (v === null) return null;
    const x = i * (W + gap) + W / 2;
    const y = PAD_TOP + H - Math.max((v / max) * H, 2);
    return { x, y };
  }).filter((p): p is { x: number; y: number } => p !== null);

  // Direction: compare last defined to first defined
  const first = defined[0];
  const last  = defined[defined.length - 1];
  const delta = defined.length >= 2 ? last - first : null;
  const goingUp   = delta !== null && delta > 0;
  const improving = delta === null ? null : lowerIsBetter ? !goingUp : goingUp;
  const trendColor = improving === null ? "#bbb" : improving ? "#27ae60" : "#e74c3c";
  const arrow = delta === null ? null : goingUp ? "↑" : "↓";
  const trendWord = improving === null ? "" : improving ? "Improving" : "Worsening";

  const polyline = pts.length >= 2 ? pts.map(p => `${p.x},${p.y}`).join(" ") : null;

  return (
    <div style={{ background: "#fff", borderRadius: 10, border: `1px solid ${improving === false ? "#fce4e4" : "#e5e5e5"}`, padding: "12px 14px 8px", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 11, color: "var(--pm-primary)", textTransform: "uppercase" as const, letterSpacing: 0.4 }}>{label}</div>
        {arrow && (
          <div style={{ fontSize: 11, fontWeight: 700, color: trendColor, display: "flex", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: 13 }}>{arrow}</span> {trendWord}
          </div>
        )}
      </div>
      <svg width={totalW} height={PAD_TOP + H + 22} style={{ display: "block", overflow: "visible" }}>
        {vals.map((v, i) => {
          const x = i * (W + gap);
          const pct = v !== null ? v / max : 0;
          const barH = Math.max(pct * H, 2);
          const barY = PAD_TOP + H - barH;
          const isLatest = i === vals.length - 1;
          const bn = entries[i].batchNum;
          return (
            <g key={i}>
              <rect x={x} y={barY} width={W} height={barH} rx={4}
                fill={v !== null ? color : "#e5e5e5"}
                opacity={isLatest ? 1 : 0.45 + (i / Math.max(vals.length - 1, 1)) * 0.35} />
              {isLatest && v !== null && (
                <rect x={x - 1} y={barY - 1} width={W + 2} height={barH + 2} rx={5}
                  fill="none" stroke={color} strokeWidth={1.5} />
              )}
              {v !== null && (
                <text x={x + W / 2} y={barY - 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#333">{format(v)}</text>
              )}
              {v === null && (
                <text x={x + W / 2} y={PAD_TOP + H / 2 + 5} textAnchor="middle" fontSize={10} fill="#aaa">—</text>
              )}
              <text x={x + W / 2} y={PAD_TOP + H + 16} textAnchor="middle" fontSize={10} fill={isLatest ? "#333" : "#888"} fontWeight={isLatest ? 800 : 600}>#{bn || "?"}</text>
            </g>
          );
        })}
        {polyline && (
          <polyline points={polyline} fill="none" stroke={trendColor} strokeWidth={2}
            strokeDasharray="5 3" strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
        )}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={trendColor} stroke="#fff" strokeWidth={1.5} />
        ))}
      </svg>
      <div style={{ fontSize: 9, color: "#bbb", marginTop: 1, textAlign: "right" }}>
        {lowerIsBetter ? "Lower = better" : "Higher = better"}
      </div>
    </div>
  );
}

// Detect factors that helped or hurt a batch vs the rest of history
function detectFactors(latest: BatchHistoryEntry, history: BatchHistoryEntry[]): { label: string; impact: "hurting" | "helping"; detail: string }[] {
  const others = history.filter(e => e.batchNum !== latest.batchNum);
  if (others.length === 0) return [];

  const avg = <K extends keyof BatchHistoryEntry>(key: K) => {
    const vals = others.map(e => e[key] as number | null).filter((v): v is number => v !== null);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const factors: { label: string; impact: "hurting" | "helping"; detail: string }[] = [];

  const avgCage  = avg("cage");
  const avgMort  = avg("mortalityPct");
  const avgWgt   = avg("aveWeight");
  const avgCfcr  = avg("cfcr");

  // Cage age: catching early reduces liveweight → hurts cFCR; too late = poor conversion too
  if (latest.cage !== null && avgCage !== null) {
    const diff = latest.cage - avgCage;
    if (diff < -0.7) {
      factors.push({
        label: `Early catch (${latest.cage.toFixed(1)}d vs ${avgCage.toFixed(1)}d avg)`,
        impact: "hurting",
        detail: `Birds were caught ${Math.abs(diff).toFixed(1)} days earlier than your usual average. Catching early means less liveweight per bird — more feed used per kg of meat, which pushes cFCR up.`,
      });
    } else if (diff > 1.2) {
      factors.push({
        label: `Later catch (${latest.cage.toFixed(1)}d vs ${avgCage.toFixed(1)}d avg)`,
        impact: "hurting",
        detail: `Birds were caught ${diff.toFixed(1)} days later than usual. Older birds convert feed less efficiently, which can increase FCR even with good weights.`,
      });
    }
  }

  // Catch weight: low weight means more feed per kg out
  if (latest.aveWeight !== null && avgWgt !== null) {
    const diff = latest.aveWeight - avgWgt;
    if (diff < -0.06) {
      factors.push({
        label: `Low catch weight (${latest.aveWeight.toFixed(2)} kg vs ${avgWgt.toFixed(2)} kg avg)`,
        impact: "hurting",
        detail: `Average bird weight was ${Math.abs(diff).toFixed(2)} kg below your usual. Lighter birds at catch means more feed was consumed per kg of saleable meat — a direct hit to cFCR.`,
      });
    } else if (diff > 0.06) {
      factors.push({
        label: `Good catch weight (${latest.aveWeight.toFixed(2)} kg vs ${avgWgt.toFixed(2)} kg avg)`,
        impact: "helping",
        detail: `Birds averaged ${diff.toFixed(2)} kg heavier than usual at catch — more meat per bird for the feed consumed improves FCR efficiency.`,
      });
    }
  }

  // Mortality: dead birds consumed feed but weren't caught
  if (latest.mortalityPct !== null && avgMort !== null) {
    const diff = latest.mortalityPct - avgMort;
    if (diff > 0.4) {
      factors.push({
        label: `Higher mortality (${latest.mortalityPct.toFixed(1)}% vs ${avgMort.toFixed(1)}% avg)`,
        impact: "hurting",
        detail: `Mortality was ${diff.toFixed(1)}% above your average. Every bird that died still consumed feed but didn't contribute to liveweight — this inflates your FCR and cFCR.`,
      });
    } else if (diff < -0.4) {
      factors.push({
        label: `Lower mortality (${latest.mortalityPct.toFixed(1)}% vs ${avgMort.toFixed(1)}% avg)`,
        impact: "helping",
        detail: `Mortality dropped ${Math.abs(diff).toFixed(1)}% vs your average — fewer losses means more birds converting feed into saleable weight.`,
      });
    }
  }

  // cFCR overall vs history average
  if (latest.cfcr !== null && avgCfcr !== null) {
    const diff = latest.cfcr - avgCfcr;
    if (diff > 0.015) {
      factors.push({
        label: `cFCR above average (${latest.cfcr.toFixed(3)} vs ${avgCfcr.toFixed(3)} avg)`,
        impact: "hurting",
        detail: `This batch used ${diff.toFixed(3)} more feed per kg of meat than your typical result. Check cage age, catch weight and mortality above for the likely cause.`,
      });
    } else if (diff < -0.015) {
      factors.push({
        label: `cFCR below average (${latest.cfcr.toFixed(3)} vs ${avgCfcr.toFixed(3)} avg)`,
        impact: "helping",
        detail: `cFCR was ${Math.abs(diff).toFixed(3)} better than your average — overall feed efficiency improved this batch.`,
      });
    }
  }

  return factors;
}

function HistoryView() {
  const [history, setHistory] = useState<BatchHistoryEntry[]>(readBatchHistory);
  const recent = history.slice(0, 6).reverse(); // oldest → newest so chart reads left to right

  const fmtNum  = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
  const fmtFeed = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}t` : `${n}kg`;
  const fmtDec  = (n: number) => n.toFixed(3);
  const fmtMort = (n: number) => `${n.toFixed(1)}%`;
  const fmtKg   = (n: number) => `${n.toFixed(2)} kg`;

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

  // Factor analysis on the most recent batch
  const latestBatch = recent[recent.length - 1];
  const factors = recent.length >= 2 ? detectFactors(latestBatch, recent) : [];

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

      {/* ── Performance Factors panel (latest batch vs average) ── */}
      {factors.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e5e5", padding: "16px 18px", marginBottom: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ background: "var(--pm-primary)", color: "#fff", borderRadius: 7, padding: "3px 14px", fontWeight: 800, fontSize: 13 }}>
              PERFORMANCE FACTORS — Batch #{latestBatch.batchNum || "?"}
            </div>
            <span style={{ fontSize: 12, color: "#888" }}>What hurt or helped your last batch vs history</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {factors.map((f, i) => (
              <div key={i} style={{
                display: "flex", gap: 12, alignItems: "flex-start",
                background: f.impact === "hurting" ? "#fff5f5" : "#f0faf4",
                border: `1px solid ${f.impact === "hurting" ? "#fbc9c9" : "#a8dfc0"}`,
                borderLeft: `4px solid ${f.impact === "hurting" ? "#e74c3c" : "#27ae60"}`,
                borderRadius: 8, padding: "10px 14px",
              }}>
                <div style={{ fontSize: 18, lineHeight: 1, marginTop: 1 }}>
                  {f.impact === "hurting" ? "⚠" : "✓"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: f.impact === "hurting" ? "#c0392b" : "#1a7a42", marginBottom: 3 }}>
                    {f.label}
                  </div>
                  <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>{f.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Table */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e5e5", overflow: "auto", marginBottom: 24 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 620 }}>
          <thead>
            <tr style={{ background: "var(--pm-primary)", color: "#fff" }}>
              {["Batch", "Date", "Birds Placed", "Feed (kg)", "FCR", "cFCR", "Cage Age", "Ave. Weight", "Mortality", ""].map(h => (
                <th key={h} style={{ padding: "9px 10px", textAlign: "center", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...recent].reverse().map((e, i) => {
              const prev = [...recent].reverse()[i + 1];
              const cfcrDelta = e.cfcr !== null && prev?.cfcr !== null && prev?.cfcr !== undefined ? e.cfcr - prev.cfcr : null;
              const date = e.date ? new Date(e.date).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "—";
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? "#f9f9f9" : "#fff", borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "9px 10px", textAlign: "center", fontWeight: 800, color: "var(--pm-primary)" }}>#{e.batchNum || "?"}</td>
                  <td style={{ padding: "9px 10px", textAlign: "center", color: "#555" }}>{date}</td>
                  <td style={{ padding: "9px 10px", textAlign: "center", fontWeight: 700 }}>{e.totalBirds > 0 ? e.totalBirds.toLocaleString() : "—"}</td>
                  <td style={{ padding: "9px 10px", textAlign: "center" }}>{e.totalFeedKg > 0 ? e.totalFeedKg.toLocaleString() : "—"}</td>
                  <td style={{ padding: "9px 10px", textAlign: "center" }}>{e.fcr !== null ? e.fcr.toFixed(3) : "—"}</td>
                  <td style={{ padding: "9px 10px", textAlign: "center", fontWeight: 700 }}>
                    <span style={{ color: cfcrDelta === null ? "#333" : cfcrDelta > 0.005 ? "#c0392b" : cfcrDelta < -0.005 ? "#27ae60" : "#333" }}>
                      {e.cfcr !== null ? e.cfcr.toFixed(3) : "—"}
                    </span>
                    {cfcrDelta !== null && Math.abs(cfcrDelta) > 0.005 && (
                      <span style={{ fontSize: 10, marginLeft: 3, color: cfcrDelta > 0 ? "#c0392b" : "#27ae60" }}>
                        {cfcrDelta > 0 ? "↑" : "↓"}{Math.abs(cfcrDelta).toFixed(3)}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "9px 10px", textAlign: "center" }}>{e.cage !== null ? `${e.cage.toFixed(1)}d` : "—"}</td>
                  <td style={{ padding: "9px 10px", textAlign: "center" }}>{e.aveWeight !== null ? `${e.aveWeight.toFixed(2)} kg` : "—"}</td>
                  <td style={{ padding: "9px 10px", textAlign: "center", color: e.mortalityPct !== null && e.mortalityPct > 5 ? "#c0392b" : "inherit" }}>{e.mortalityPct !== null ? `${e.mortalityPct.toFixed(2)}%` : "—"}</td>
                  <td style={{ padding: "9px 8px", textAlign: "center" }}>
                    <button onClick={() => deleteEntry(i)} title={`Remove Batch #${e.batchNum || "?"}`}
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

      {/* Trend Charts */}
      <div style={{ fontWeight: 700, fontSize: 12, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
        Batch Trends — dashed line shows direction, latest batch highlighted
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <BarChart entries={recent} getValue={e => e.cfcr}             label="cFCR"              format={fmtDec}  color="#8e44ad" lowerIsBetter />
        <BarChart entries={recent} getValue={e => e.cage}             label="Cage Age (days)"   format={v => `${v.toFixed(1)}d`} color="#C9A227" lowerIsBetter />
        <BarChart entries={recent} getValue={e => e.mortalityPct}     label="Mortality %"       format={fmtMort} color="#c0392b" lowerIsBetter />
        <BarChart entries={recent} getValue={e => e.aveWeight}        label="Ave. Catch Weight" format={fmtKg}   color="#16a085" />
        <BarChart entries={recent} getValue={e => e.fcr}              label="FCR"               format={fmtDec}  color="#2980b9" lowerIsBetter />
        <BarChart entries={recent} getValue={e => e.totalBirds || null} label="Birds Placed"   format={fmtNum}  color="var(--pm-primary)" />
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

// ── Feed Delivery Strip ───────────────────────────────────────────────────────
interface FeedOrder {
  id: string;
  ration: string;
  deliveryDate: string;   // YYYY-MM-DD
  totalTons: number;
  allocations: { sgId: number; tons: number }[];
  emergency: boolean;
  notes: string;
}

function loadFeedOrders(): FeedOrder[] {
  try { return JSON.parse(localStorage.getItem(FEED_ORDERS_KEY) ?? "[]"); } catch { return []; }
}
function saveFeedOrders(orders: FeedOrder[]) {
  localStorage.setItem(FEED_ORDERS_KEY, JSON.stringify(orders));
}
function getThursdayStart(ref: Date): Date {
  const d = new Date(ref); d.setHours(0, 0, 0, 0);
  const back = (d.getDay() + 3) % 7; // Thu=0, Fri=1, …, Wed=6
  d.setDate(d.getDate() - back);
  return d;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(d.getDate() + n); return r;
}
function toYMD(d: Date) { return d.toISOString().slice(0, 10); }
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const RATION_COLOURS: Record<string, string> = {
  "STARTER":    "#2980b9",
  "GROWER":     "#27ae60",
  "FINISHER":   "#8e44ad",
  "WITHDRAWAL": "#c0392b",
  "EMERGENCY":  "#e67e22",
};
function rationColour(ration: string) {
  const up = ration.toUpperCase();
  for (const [k, v] of Object.entries(RATION_COLOURS)) if (up.includes(k)) return v;
  return "#555";
}

function FeedOrderStrip({ farmConfig }: { farmConfig: FarmConfigData }) {
  const [orders, setOrders]       = useState<FeedOrder[]>(loadFeedOrders);
  const [cycleOff, setCycleOff]   = useState(0);     // 0 = this week, 1 = next, -1 = last
  const [modal, setModal]         = useState<{ date: string; order?: FeedOrder } | null>(null);
  const [showAll, setShowAll]     = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parsedRows, setParsedRows] = useState<FeedOrder[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Current cycle: 7 days from Thursday
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const baseThur = getThursdayStart(today);
  const cycleStart = addDays(baseThur, cycleOff * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(cycleStart, i));

  const ordersOnDay = (d: Date) => orders.filter(o => o.deliveryDate === toYMD(d));

  // Modal state
  const [mDate,      setMDate]      = useState("");
  const [mRation,    setMRation]    = useState("");
  const [mTons,      setMTons]      = useState("");
  const [mEmergency, setMEmergency] = useState(false);
  const [mNotes,     setMNotes]     = useState("");
  const [mAllocs,    setMAllocs]    = useState<{ sgId: number; tons: string }[]>([]);

  const shedGroups = farmConfig.shedGroups?.filter(g => g.active !== false) ?? [];

  const openModal = (date: string, order?: FeedOrder) => {
    setMDate(date);
    setMRation(order?.ration ?? "");
    setMTons(order ? String(order.totalTons) : "");
    setMEmergency(order?.emergency ?? false);
    setMNotes(order?.notes ?? "");
    const allocs = shedGroups.map(g => ({
      sgId: g.shedGroupId,
      tons: String(order?.allocations.find(a => a.sgId === g.shedGroupId)?.tons ?? ""),
    }));
    setMAllocs(allocs.length ? allocs : [{ sgId: 1, tons: "" }]);
    setModal({ date, order });
  };
  const closeModal = () => setModal(null);

  const saveOrder = () => {
    if (!mDate || !mRation || !mTons) return;
    const allocs = mAllocs
      .filter(a => parseFloat(a.tons) > 0)
      .map(a => ({ sgId: a.sgId, tons: parseFloat(a.tons) }));
    const newOrder: FeedOrder = {
      id: modal?.order?.id ?? `fo-${Date.now()}`,
      ration: mRation.trim(),
      deliveryDate: mDate,
      totalTons: parseFloat(mTons),
      allocations: allocs,
      emergency: mEmergency,
      notes: mNotes.trim(),
    };
    const updated = modal?.order
      ? orders.map(o => o.id === modal.order!.id ? newOrder : o)
      : [...orders, newOrder];
    setOrders(updated);
    saveFeedOrders(updated);
    closeModal();
  };

  const deleteOrder = (id: string) => {
    const updated = orders.filter(o => o.id !== id);
    setOrders(updated);
    saveFeedOrders(updated);
    closeModal();
  };

  // ── GeniusFOM paste parser ──
  const parseGeniusFOM = (text: string) => {
    setParseError(null);
    setParsedRows(null);
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    const rows: FeedOrder[] = [];

    // Helper: parse one block of columns (index: 0=order#, 1=farm, 2=ration, 3=delivery, 4=ordered, 5=emergency, 6=tons)
    const parseBlock = (cols: string[], idx: number): FeedOrder | null => {
      const ration = cols[2]?.trim();
      const deliveryRaw = cols[3]?.trim();
      const emergencyRaw = cols[5]?.trim() ?? "";
      const tonsRaw = cols[6]?.trim();
      if (!ration || !deliveryRaw || !tonsRaw) return null;
      const dm = deliveryRaw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (!dm) return null;
      const deliveryDate = `${dm[3]}-${dm[2].padStart(2,"0")}-${dm[1].padStart(2,"0")}`;
      const totalTons = parseFloat(tonsRaw.replace(/,/g,""));
      if (isNaN(totalTons)) return null;
      return {
        id: `fo-paste-${Date.now()}-${idx}`,
        ration,
        deliveryDate,
        totalTons,
        allocations: [],
        emergency: emergencyRaw.toUpperCase() === "Y",
        notes: "",
      };
    };

    // Format A: tab-separated (one row per order)
    const tabLines = lines.filter(l => l.includes("\t"));
    if (tabLines.length > 0) {
      for (const line of tabLines) {
        const cols = line.split(/\t/);
        if (cols.length < 7) continue;
        const row = parseBlock(cols, rows.length);
        if (row) rows.push(row);
      }
    } else {
      // Format B: vertical (8 lines per order — order#, farm, ration, delivery, ordered, emergency, tons, flag)
      // Find order boundaries: lines starting with # followed by digits
      const orderStarts: number[] = [];
      lines.forEach((l, i) => { if (/^#\d+/.test(l.trim())) orderStarts.push(i); });

      if (orderStarts.length > 0) {
        for (let s = 0; s < orderStarts.length; s++) {
          const start = orderStarts[s];
          const end = orderStarts[s + 1] ?? lines.length;
          const block = lines.slice(start, end);
          // block[0]=order#, [1]=farm, [2]=ration, [3]=delivery, [4]=ordered, [5]=emergency, [6]=tons, [7]=flag
          const row = parseBlock(block, rows.length);
          if (row) rows.push(row);
        }
      } else {
        // Fallback: try every 8 consecutive lines as a block
        for (let i = 0; i + 6 < lines.length; i += 8) {
          const block = lines.slice(i, i + 8);
          const row = parseBlock(block, rows.length);
          if (row) rows.push(row);
        }
      }
    }

    if (rows.length === 0) {
      setParseError("Could not find any valid order rows. Try copying the full table rows from GeniusFOM, including the order # column.");
      return;
    }
    setParsedRows(rows);
  };

  const importParsed = () => {
    if (!parsedRows) return;
    // Merge: skip duplicates with same deliveryDate + ration
    const existing = orders;
    const toAdd = parsedRows.filter(p =>
      !existing.some(e => e.deliveryDate === p.deliveryDate && e.ration === p.ration)
    );
    const updated = [...existing, ...toAdd];
    setOrders(updated);
    saveFeedOrders(updated);
    setShowPaste(false);
    setPasteText("");
    setParsedRows(null);
    setShowAll(true); // open orders panel so user can see what was imported
  };

  const totalAllocd = mAllocs.reduce((s, a) => s + (parseFloat(a.tons) || 0), 0);
  const allocWarning = mTons && Math.abs(totalAllocd - parseFloat(mTons)) > 0.5;

  // Upcoming orders (next 30 days) for the "All Orders" panel
  const upcomingOrders = [...orders]
    .filter(o => o.deliveryDate >= toYMD(today))
    .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));

  const cycleLabel = `${DAY_NAMES[cycleStart.getDay()]} ${cycleStart.getDate()} ${MONTH_SHORT[cycleStart.getMonth()]} → ${DAY_NAMES[addDays(cycleStart,6).getDay()]} ${addDays(cycleStart,6).getDate()} ${MONTH_SHORT[addDays(cycleStart,6).getMonth()]}`;

  return (
    <>
      {/* ── Strip ── */}
      <div style={{ background: "#0f3d23", borderBottom: "2px solid #C9A227", padding: "4px 0 0", userSelect: "none", flexShrink: 0 }}>
        {/* Cycle header row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 10px 3px" }}>
          <button onClick={() => setCycleOff(v => v - 1)} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", borderRadius: 4, padding: "1px 7px", cursor: "pointer", fontSize: 13 }}>‹</button>
          <span style={{ fontSize: 10, color: "#a8d5b5", fontWeight: 700, letterSpacing: 0.4, flex: 1, textAlign: "center" }}>{cycleLabel}</span>
          <button onClick={() => setCycleOff(v => v + 1)} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", borderRadius: 4, padding: "1px 7px", cursor: "pointer", fontSize: 13 }}>›</button>
          <button onClick={() => { setCycleOff(0); }} style={{ background: cycleOff === 0 ? "#C9A227" : "rgba(255,255,255,0.12)", border: "none", color: cycleOff === 0 ? "#000" : "#fff", borderRadius: 4, padding: "1px 8px", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>Today</button>
          <button onClick={() => setShowAll(v => !v)} style={{ background: showAll ? "#C9A227" : "rgba(255,255,255,0.12)", border: "none", color: showAll ? "#000" : "#fff", borderRadius: 4, padding: "1px 8px", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>📋 Orders</button>
          <button onClick={() => { setShowPaste(true); setPasteText(""); setParsedRows(null); setParseError(null); }} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", borderRadius: 4, padding: "1px 8px", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>📋 Paste GeniusFOM</button>
        </div>

        {/* Day columns */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, padding: "0 6px 6px" }}>
          {days.map(day => {
            const ymd = toYMD(day);
            const isToday = ymd === toYMD(today);
            const isThur = day.getDay() === 4;
            const dayOrders = ordersOnDay(day);
            return (
              <div
                key={ymd}
                style={{
                  background: isToday ? "rgba(201,162,39,0.18)" : "rgba(255,255,255,0.05)",
                  border: isToday ? "1.5px solid #C9A227" : isThur ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 6,
                  padding: "3px 4px",
                  minHeight: 56,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  cursor: "pointer",
                }}
                onClick={() => openModal(ymd)}
              >
                {/* Day label */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: isToday ? "#C9A227" : isThur ? "#a8d5b5" : "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 0.3 }}>
                    {DAY_NAMES[day.getDay()]}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: isToday ? "#C9A227" : "#fff" }}>{day.getDate()}</span>
                </div>
                {/* Delivery pills */}
                {dayOrders.map(o => (
                  <div
                    key={o.id}
                    onClick={e => { e.stopPropagation(); openModal(ymd, o); }}
                    style={{
                      background: rationColour(o.ration),
                      borderRadius: 3,
                      padding: "1px 4px",
                      fontSize: 9,
                      fontWeight: 700,
                      color: "#fff",
                      lineHeight: 1.3,
                      cursor: "pointer",
                    }}
                    title={`${o.ration} — ${o.totalTons}T${o.emergency ? " ⚡ EMERGENCY" : ""}`}
                  >
                    {o.totalTons}T
                    <span style={{ fontWeight: 400, opacity: 0.85, marginLeft: 2 }}>
                      {o.ration.replace(/\d+\s*/,"").split(" ").map(w => w[0]).join("").slice(0,3)}
                    </span>
                    {o.emergency && <span style={{ marginLeft: 2 }}>⚡</span>}
                  </div>
                ))}
                {/* Add hint */}
                {dayOrders.length === 0 && (
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", textAlign: "center", marginTop: "auto" }}>＋</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── All Orders panel ── */}
      {showAll && (
        <div style={{ background: "#fff", borderBottom: "2px solid var(--pm-primary-border)", padding: "10px 12px", flexShrink: 0, maxHeight: 220, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.4 }}>
              Upcoming Deliveries ({upcomingOrders.length})
            </span>
            <button
              onClick={() => openModal(toYMD(today))}
              style={{ background: "var(--pm-primary)", color: "#fff", border: "none", borderRadius: 6, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              + Add Order
            </button>
          </div>
          {upcomingOrders.length === 0 ? (
            <p style={{ fontSize: 12, color: "#aaa", margin: 0 }}>No upcoming deliveries logged. Click any day in the strip above to add one.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f5f5f5" }}>
                  {["Delivery Date","Ration","Tons","Sheds","Emergency","Notes"].map(h => (
                    <th key={h} style={{ padding: "4px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: 0.4, borderBottom: "1px solid #e5e5e5" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {upcomingOrders.map(o => {
                  const d = new Date(o.deliveryDate + "T00:00:00");
                  return (
                    <tr key={o.id} onClick={() => openModal(o.deliveryDate, o)} style={{ cursor: "pointer", borderBottom: "1px solid #eee" }} className="hover:bg-green-50">
                      <td style={{ padding: "5px 8px", fontWeight: 700, color: "var(--pm-primary)", whiteSpace: "nowrap" }}>
                        {DAY_NAMES[d.getDay()]} {d.getDate()} {MONTH_SHORT[d.getMonth()]}
                      </td>
                      <td style={{ padding: "5px 8px" }}>
                        <span style={{ background: rationColour(o.ration), color: "#fff", borderRadius: 4, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{o.ration}</span>
                      </td>
                      <td style={{ padding: "5px 8px", fontWeight: 800 }}>{o.totalTons}T</td>
                      <td style={{ padding: "5px 8px", color: "#555", fontSize: 11 }}>
                        {o.allocations.length > 0 ? o.allocations.map(a => `Shed ${a.sgId*2-1}&${a.sgId*2}: ${a.tons}T`).join(", ") : "—"}
                      </td>
                      <td style={{ padding: "5px 8px", textAlign: "center" }}>{o.emergency ? "⚡ Yes" : "—"}</td>
                      <td style={{ padding: "5px 8px", color: "#777", fontStyle: "italic" }}>{o.notes || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Add / Edit Order Modal ── */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 999, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={closeModal}>
          <div style={{ background: "#fff", borderRadius: "14px 14px 0 0", width: "100%", maxWidth: 520, padding: "20px 18px 28px", boxSizing: "border-box", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: "var(--pm-primary)" }}>{modal.order ? "Edit" : "Add"} Feed Order</span>
              <button onClick={closeModal} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>✕</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Date */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.4 }}>Delivery Date</label>
                <input type="date" value={mDate} onChange={e => setMDate(e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: 4, border: "1.5px solid var(--pm-primary-border)", borderRadius: 8, padding: "9px 10px", fontSize: 14, boxSizing: "border-box" }} />
              </div>

              {/* Ration */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.4 }}>Ration</label>
                <input
                  type="text" placeholder="e.g. 130 BROILER WITHDRAWAL" value={mRation} onChange={e => setMRation(e.target.value)}
                  list="ration-list"
                  style={{ display: "block", width: "100%", marginTop: 4, border: "1.5px solid var(--pm-primary-border)", borderRadius: 8, padding: "9px 10px", fontSize: 14, boxSizing: "border-box" }} />
                <datalist id="ration-list">
                  {["120 BROILER STARTER","130 BROILER GROWER","120 BROILER FINISHER","130 BROILER FINISHER","120 BROILER WITHDRAWAL","130 BROILER WITHDRAWAL"].map(r => <option key={r} value={r} />)}
                </datalist>
              </div>

              {/* Total Tons */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.4 }}>Total Tons Ordered</label>
                <input type="number" min={1} max={999} step={0.5} placeholder="e.g. 132" value={mTons} onChange={e => setMTons(e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: 4, border: "1.5px solid var(--pm-primary-border)", borderRadius: 8, padding: "9px 10px", fontSize: 14, boxSizing: "border-box" }} />
              </div>

              {/* Shed Allocations */}
              {shedGroups.length > 0 && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.4 }}>Split Across Sheds</label>
                    {mTons && (
                      <span style={{ fontSize: 11, color: allocWarning ? "#c0392b" : "#27ae60", fontWeight: 700 }}>
                        {totalAllocd.toFixed(1)}T / {mTons}T {allocWarning ? "⚠ doesn't match" : "✓"}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {mAllocs.map((a, i) => (
                      <div key={a.sgId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#333", minWidth: 80 }}>
                          Shed {a.sgId * 2 - 1} & {a.sgId * 2}
                        </span>
                        <input type="number" min={0} max={999} step={0.5} placeholder="Tons" value={a.tons}
                          onChange={e => setMAllocs(prev => prev.map((x, j) => j === i ? { ...x, tons: e.target.value } : x))}
                          style={{ flex: 1, border: "1.5px solid var(--pm-primary-border)", borderRadius: 6, padding: "7px 8px", fontSize: 13 }} />
                        <span style={{ fontSize: 12, color: "#888" }}>T</span>
                      </div>
                    ))}
                  </div>
                  {/* Quick-split helper */}
                  {mTons && mAllocs.length > 1 && (
                    <button
                      onClick={() => {
                        const each = (parseFloat(mTons) / mAllocs.length).toFixed(1);
                        setMAllocs(prev => prev.map(a => ({ ...a, tons: each })));
                      }}
                      style={{ marginTop: 6, background: "#eee", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
                    >
                      Split evenly ({(parseFloat(mTons) / mAllocs.length).toFixed(1)}T each)
                    </button>
                  )}
                </div>
              )}

              {/* Emergency */}
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={mEmergency} onChange={e => setMEmergency(e.target.checked)} style={{ width: 18, height: 18 }} />
                <span style={{ fontSize: 14, fontWeight: 600 }}>⚡ Emergency Order</span>
              </label>

              {/* Notes */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.4 }}>Notes</label>
                <textarea rows={2} placeholder="e.g. split load, delivery before 7am" value={mNotes} onChange={e => setMNotes(e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: 4, border: "1.5px solid var(--pm-primary-border)", borderRadius: 8, padding: "9px 10px", fontSize: 13, boxSizing: "border-box", resize: "vertical" }} />
              </div>

              {/* Buttons */}
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                {modal.order && (
                  <button onClick={() => deleteOrder(modal.order!.id)}
                    style={{ flex: 1, background: "#fee2e2", color: "#c0392b", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 0", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                    Delete
                  </button>
                )}
                <button onClick={saveOrder} disabled={!mDate || !mRation || !mTons}
                  style={{ flex: 2, background: (!mDate || !mRation || !mTons) ? "#ccc" : "var(--pm-primary)", color: "#fff", border: "none", borderRadius: 8, padding: "12px 0", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
                  {modal.order ? "Save Changes" : "Add Delivery"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Paste GeniusFOM Modal ── */}
      {showPaste && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setShowPaste(false)}>
          <div style={{ background: "#fff", borderRadius: "14px 14px 0 0", width: "100%", maxWidth: 560, padding: "20px 18px 32px", boxSizing: "border-box", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: "var(--pm-primary)" }}>Import from GeniusFOM</span>
              <button onClick={() => setShowPaste(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>✕</button>
            </div>

            {/* Instructions */}
            <div style={{ background: "#f0f9f4", border: "1px solid #b7e0c8", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#1a5c35", marginBottom: 14, lineHeight: 1.6 }}>
              <strong>How to copy from GeniusFOM:</strong><br />
              1. Open your GeniusFOM Orders page<br />
              2. Select all the order rows — on desktop hold <kbd style={{ background: "#fff", border: "1px solid #ccc", borderRadius: 3, padding: "0 4px" }}>Shift</kbd>+click; on mobile just long-press and drag<br />
              3. Copy (<kbd style={{ background: "#fff", border: "1px solid #ccc", borderRadius: 3, padding: "0 4px" }}>Ctrl+C</kbd> or tap Copy)<br />
              4. Paste below — works whether the data pastes as one line per order or one field per line
            </div>

            {/* Textarea */}
            <textarea
              rows={6}
              placeholder={"Paste your GeniusFOM order rows here…\n\nWorks with both formats:\n• One line per order (tab-separated)\n• One field per line starting with #31601…"}
              value={pasteText}
              onChange={e => { setPasteText(e.target.value); setParsedRows(null); setParseError(null); }}
              style={{ width: "100%", border: "1.5px solid var(--pm-primary-border)", borderRadius: 8, padding: "10px 12px", fontSize: 12, fontFamily: "monospace", boxSizing: "border-box", resize: "vertical" }}
            />

            {/* Parse button */}
            {!parsedRows && (
              <button
                onClick={() => parseGeniusFOM(pasteText)}
                disabled={!pasteText.trim()}
                style={{ marginTop: 10, width: "100%", background: pasteText.trim() ? "var(--pm-primary)" : "#ccc", color: "#fff", border: "none", borderRadius: 8, padding: "11px 0", fontWeight: 800, fontSize: 14, cursor: pasteText.trim() ? "pointer" : "default" }}
              >
                🔍 Read Orders
              </button>
            )}

            {/* Parse error */}
            {parseError && (
              <div style={{ marginTop: 10, background: "#fff0f0", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#c0392b" }}>
                ⚠️ {parseError}
              </div>
            )}

            {/* Preview */}
            {parsedRows && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--pm-primary)", marginBottom: 8 }}>
                  Found {parsedRows.length} order{parsedRows.length !== 1 ? "s" : ""} — ready to import:
                </div>
                <div style={{ border: "1px solid #e5e5e5", borderRadius: 8, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#f5f5f5" }}>
                        {["Delivery Date", "Ration", "Tons", "Emergency"].map(h => (
                          <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: 0.4, borderBottom: "1px solid #e5e5e5" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.map((r, i) => {
                        const d = new Date(r.deliveryDate + "T00:00:00");
                        const isDupe = orders.some(e => e.deliveryDate === r.deliveryDate && e.ration === r.ration);
                        return (
                          <tr key={i} style={{ borderTop: "1px solid #eee", background: isDupe ? "#fffbe6" : "#fff" }}>
                            <td style={{ padding: "6px 10px", fontWeight: 700, color: "var(--pm-primary)", whiteSpace: "nowrap" }}>
                              {DAY_NAMES[d.getDay()]} {d.getDate()} {MONTH_SHORT[d.getMonth()]}
                            </td>
                            <td style={{ padding: "6px 10px" }}>
                              <span style={{ background: rationColour(r.ration), color: "#fff", borderRadius: 4, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{r.ration}</span>
                            </td>
                            <td style={{ padding: "6px 10px", fontWeight: 800 }}>{r.totalTons}T</td>
                            <td style={{ padding: "6px 10px", textAlign: "center" }}>
                              {r.emergency ? "⚡ Yes" : "—"}
                              {isDupe && <span style={{ marginLeft: 6, fontSize: 10, color: "#a07000", fontWeight: 700 }}>already exists</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button onClick={() => { setParsedRows(null); setPasteText(""); }} style={{ flex: 1, background: "#eee", color: "#333", border: "none", borderRadius: 8, padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    Clear & Re-paste
                  </button>
                  <button onClick={importParsed} style={{ flex: 2, background: "var(--pm-primary)", color: "#fff", border: "none", borderRadius: 8, padding: "11px 0", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                    ✅ Import {parsedRows.filter(r => !orders.some(e => e.deliveryDate === r.deliveryDate && e.ration === r.ration)).length} New Orders
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Bird Weighing (AI Camera) ─────────────────────────────────────────────────
interface WeighAiResult {
  estimatedWeightKg: number | null;
  confidenceLevel: "low" | "medium" | "high";
  weightRangeMin: number;
  weightRangeMax: number;
  visualCues: string;
  notes: string;
}
interface WeighSessionEntry {
  shedLabel: string;
  sgId: number;
  age: number;
  weightKg: number;
  confidence: string;
  time: string;
  logged: boolean;
}

function BirdWeighView({ farmConfig }: { farmConfig: FarmConfigData }) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [mode,          setMode]          = useState<"camera" | "manual">("camera");
  const [cameraActive,  setCameraActive]  = useState(false);
  const [cameraError,   setCameraError]   = useState<string | null>(null);
  const [capturedImg,   setCapturedImg]   = useState<string | null>(null);
  const [analyzing,     setAnalyzing]     = useState(false);
  const [aiResult,      setAiResult]      = useState<WeighAiResult | null>(null);
  const [aiError,       setAiError]       = useState<string | null>(null);
  const [sessionLog,    setSessionLog]    = useState<WeighSessionEntry[]>([]);
  const [manualWeightKg, setManualWeightKg] = useState("");

  // Shed + age selection
  const shedGroups = farmConfig.shedGroups?.filter(g => g.active !== false) ?? [];
  const totalSheds = shedGroups.length > 0 ? shedGroups.length * 2 : 20;
  const [selectedShedNum, setSelectedShedNum] = useState(1);
  const [manualAge,       setManualAge]       = useState("");

  // Stop camera on unmount
  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCameraActive(true);
      setCapturedImg(null);
      setAiResult(null);
    } catch {
      setCameraError("Camera access was denied or is unavailable. Please allow camera access and try again.");
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current, c = canvasRef.current;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    setCapturedImg(c.toDataURL("image/jpeg", 0.85));
    setAiResult(null); setAiError(null);
    stopCamera();
  };

  const retake = () => { setCapturedImg(null); setAiResult(null); setAiError(null); startCamera(); };

  const analysePhoto = async () => {
    if (!capturedImg) return;
    setAnalyzing(true); setAiError(null);
    try {
      const res = await fetch("/api/weigh-bird", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: capturedImg, ageDays: parseInt(manualAge) || undefined, shedNum: selectedShedNum }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setAiResult(data);
    } catch (err) {
      setAiError(String(err));
    } finally {
      setAnalyzing(false);
    }
  };

  const logToForecast = () => {
    if (!aiResult?.estimatedWeightKg || !manualAge) return;
    const age   = parseInt(manualAge);
    const grams = Math.round(aiResult.estimatedWeightKg * 1000);
    const sgId  = Math.ceil(selectedShedNum / 2);
    const existing: WeighInData = (() => { try { return JSON.parse(localStorage.getItem(FLOCK_WEIGHIN_KEY) ?? "{}"); } catch { return {}; } })();
    if (!existing[sgId]) existing[sgId] = {};
    const cur = existing[sgId][age];
    existing[sgId][age] = cur ? Math.round((cur + grams) / 2) : grams;
    localStorage.setItem(FLOCK_WEIGHIN_KEY, JSON.stringify(existing));
    const shedLabel = `Shed ${selectedShedNum}`;
    setSessionLog(prev => [...prev, {
      shedLabel, sgId, age,
      weightKg: aiResult.estimatedWeightKg!,
      confidence: aiResult.confidenceLevel,
      time: new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }),
      logged: true,
    }]);
    setCapturedImg(null); setAiResult(null); setAiError(null);
    startCamera();
  };

  const logManualWeight = () => {
    const kg = parseFloat(manualWeightKg);
    if (isNaN(kg) || kg <= 0 || !manualAge) return;
    const age   = parseInt(manualAge);
    const grams = Math.round(kg * 1000);
    const sgId  = Math.ceil(selectedShedNum / 2);
    const existing: WeighInData = (() => { try { return JSON.parse(localStorage.getItem(FLOCK_WEIGHIN_KEY) ?? "{}"); } catch { return {}; } })();
    if (!existing[sgId]) existing[sgId] = {};
    const cur = existing[sgId][age];
    existing[sgId][age] = cur ? Math.round((cur + grams) / 2) : grams;
    localStorage.setItem(FLOCK_WEIGHIN_KEY, JSON.stringify(existing));
    const shedLabel = `Shed ${selectedShedNum}`;
    setSessionLog(prev => [...prev, {
      shedLabel, sgId, age,
      weightKg: kg,
      confidence: "manual",
      time: new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }),
      logged: true,
    }]);
    setManualWeightKg("");
  };

  const confColor = (c: string) => c === "high" ? "#27ae60" : c === "medium" ? "#e67e22" : c === "manual" ? "#2980b9" : "#c0392b";
  const confBg    = (c: string) => c === "high" ? "#eafaf1" : c === "medium" ? "#fef9ec" : c === "manual" ? "#eaf4fb" : "#fdf0ee";

  return (
    <div style={{ padding: "16px 16px 40px", fontFamily: "Inter,'Segoe UI',sans-serif", overflowY: "auto", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,var(--pm-primary) 0%,var(--pm-primary-mid) 100%)", color: "#fff", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: "3px solid #C9A227" }}>
        <div style={{ background: "#C9A227", color: "#000", borderRadius: 7, padding: "3px 14px", fontWeight: 800, fontSize: 14 }}>AI BIRD WEIGH</div>
        <span style={{ fontSize: 12, opacity: 0.85 }}>Take a photo — AI estimates live weight</span>
      </div>

      {/* Mode toggle */}
      <div style={{ display: "flex", background: "#f0f0f0", borderRadius: 9, padding: 3, gap: 3 }}>
        {(["camera", "manual"] as const).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); setCapturedImg(null); setAiResult(null); setAiError(null); if (m === "manual") stopCamera(); }}
            style={{ flex: 1, border: "none", borderRadius: 7, padding: "9px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", transition: "background 0.15s, color 0.15s",
              background: mode === m ? "var(--pm-primary)" : "transparent",
              color: mode === m ? "#fff" : "#666" }}
          >
            {m === "camera" ? "📷 AI Camera" : "✏️ Manual Entry"}
          </button>
        ))}
      </div>

      {/* Tip banner — camera only */}
      {mode === "camera" && (
        <div style={{ background: "#fffde7", border: "1px solid #ffe082", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#555", lineHeight: 1.55 }}>
          <strong>Tip for best results:</strong> Hold the bird steady against a plain background. Include your hand or a reference object (feed bag, crate) in frame so the AI has a size reference. Accuracy improves with age entered below.
        </div>
      )}

      {/* Shed + Age selectors */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 130 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Shed</label>
          <select
            value={selectedShedNum}
            onChange={e => setSelectedShedNum(parseInt(e.target.value))}
            style={{ width: "100%", border: "1.5px solid var(--pm-primary-border)", borderRadius: 8, padding: "9px 10px", fontSize: 14, fontWeight: 600, outline: "none", background: "#fff" }}
          >
            {Array.from({ length: totalSheds }, (_, i) => (
              <option key={i + 1} value={i + 1}>Shed {i + 1}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 100 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Bird Age (days)</label>
          <input
            type="number" min={1} max={70} placeholder="e.g. 42"
            value={manualAge}
            onChange={e => setManualAge(e.target.value)}
            style={{ width: "100%", border: "1.5px solid var(--pm-primary-border)", borderRadius: 8, padding: "9px 10px", fontSize: 14, fontWeight: 600, outline: "none", boxSizing: "border-box" }}
          />
        </div>
      </div>

      {/* Manual entry panel */}
      {mode === "manual" && (
        <div style={{ background: "#fff", border: "2px solid var(--pm-primary-border)", borderRadius: 12, padding: "20px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 13, color: "#555", lineHeight: 1.5 }}>
            Enter the weight from your scale. Each reading is averaged with existing readings for that shed and age.
          </div>

          {/* Weight input */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
              Live Weight (kg)
            </label>
            <input
              type="number" step="0.001" min="0.1" max="15"
              placeholder="e.g. 1.850"
              value={manualWeightKg}
              onChange={e => setManualWeightKg(e.target.value)}
              style={{ width: "100%", border: "1.5px solid var(--pm-primary-border)", borderRadius: 8, padding: "13px 14px", fontSize: 22, fontWeight: 800, outline: "none", boxSizing: "border-box", textAlign: "center", letterSpacing: 1 }}
              autoFocus
            />
            {manualWeightKg && !isNaN(parseFloat(manualWeightKg)) && parseFloat(manualWeightKg) > 0 && (
              <div style={{ textAlign: "center", fontSize: 13, color: "#888", marginTop: 5 }}>
                = {Math.round(parseFloat(manualWeightKg) * 1000)} g
              </div>
            )}
          </div>

          {/* Log button */}
          <button
            onClick={logManualWeight}
            disabled={!manualWeightKg || isNaN(parseFloat(manualWeightKg)) || parseFloat(manualWeightKg) <= 0 || !manualAge}
            style={{
              background: (manualWeightKg && parseFloat(manualWeightKg) > 0 && manualAge) ? "#27ae60" : "#ccc",
              color: "#fff", border: "none", borderRadius: 8, padding: "14px 0", fontWeight: 800, fontSize: 16,
              cursor: (manualWeightKg && parseFloat(manualWeightKg) > 0 && manualAge) ? "pointer" : "default"
            }}
            title={!manualAge ? "Enter bird age above to log" : ""}
          >
            ✅ Log Weight{manualAge && manualWeightKg && parseFloat(manualWeightKg) > 0
              ? ` — ${parseFloat(manualWeightKg).toFixed(3)} kg at day ${manualAge}`
              : !manualAge ? " (enter age above)" : ""}
          </button>
        </div>
      )}

      {/* Camera area */}
      {mode === "camera" && (
      <div style={{ background: "#111", borderRadius: 12, overflow: "hidden", position: "relative", aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <canvas ref={canvasRef} style={{ display: "none" }} />

        {/* Live video */}
        <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", display: cameraActive ? "block" : "none" }} />

        {/* Captured photo */}
        {capturedImg && !cameraActive && (
          <img src={capturedImg} alt="Captured" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}

        {/* Idle placeholder */}
        {!cameraActive && !capturedImg && (
          <div style={{ textAlign: "center", color: "#888" }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>📷</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Tap Start Camera</div>
          </div>
        )}

        {/* Capture button overlay */}
        {cameraActive && (
          <button
            onClick={capturePhoto}
            style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "#fff", border: "4px solid var(--pm-primary)", borderRadius: "50%", width: 64, height: 64, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 3px 12px rgba(0,0,0,0.35)" }}
            title="Capture photo"
          >📸</button>
        )}
      </div>
      )} {/* end mode === camera wrapper for camera div */}

      {/* Camera error */}
      {mode === "camera" && cameraError && (
        <div style={{ background: "#fff0f0", border: "1px solid #fbc9c9", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#c0392b" }}>⚠️ {cameraError}</div>
      )}

      {/* Action buttons — camera mode only */}
      {mode === "camera" && (
        <div style={{ display: "flex", gap: 10 }}>
          {!cameraActive && !capturedImg && (
            <button onClick={startCamera} style={{ flex: 1, background: "var(--pm-primary)", color: "#fff", border: "none", borderRadius: 8, padding: "13px 0", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
              📷 Start Camera
            </button>
          )}
          {cameraActive && (
            <button onClick={stopCamera} style={{ flex: 1, background: "#888", color: "#fff", border: "none", borderRadius: 8, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Cancel
            </button>
          )}
          {capturedImg && !cameraActive && (
            <>
              <button onClick={retake} style={{ flex: 1, background: "#888", color: "#fff", border: "none", borderRadius: 8, padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                🔄 Retake
              </button>
              {!aiResult && (
                <button onClick={analysePhoto} disabled={analyzing} style={{ flex: 2, background: analyzing ? "#aaa" : "#C9A227", color: "#000", border: "none", borderRadius: 8, padding: "13px 0", fontWeight: 800, fontSize: 15, cursor: analyzing ? "default" : "pointer" }}>
                  {analyzing ? "⏳ Analysing…" : "🤖 Analyse Bird"}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* AI error */}
      {mode === "camera" && aiError && (
        <div style={{ background: "#fff0f0", border: "1px solid #fbc9c9", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#c0392b" }}>⚠️ {aiError}</div>
      )}

      {/* AI Result — camera mode only */}
      {mode === "camera" && aiResult && (
        <div style={{ background: "#fff", border: "2px solid var(--pm-primary-border)", borderRadius: 12, overflow: "hidden" }}>
          {/* Weight display */}
          <div style={{ background: "linear-gradient(135deg,var(--pm-primary) 0%,var(--pm-primary-mid) 100%)", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Estimated Live Weight</div>
              {aiResult.estimatedWeightKg ? (
                <div style={{ color: "#fff", fontSize: 36, fontWeight: 900, lineHeight: 1 }}>
                  {aiResult.estimatedWeightKg.toFixed(2)} <span style={{ fontSize: 18, fontWeight: 600 }}>kg</span>
                </div>
              ) : (
                <div style={{ color: "#ffcc00", fontSize: 18, fontWeight: 700 }}>Could not estimate</div>
              )}
              {aiResult.weightRangeMin > 0 && (
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 3 }}>
                  Range: {aiResult.weightRangeMin.toFixed(2)}–{aiResult.weightRangeMax.toFixed(2)} kg
                </div>
              )}
            </div>
            <div style={{ background: confBg(aiResult.confidenceLevel), color: confColor(aiResult.confidenceLevel), border: `1px solid ${confColor(aiResult.confidenceLevel)}`, borderRadius: 8, padding: "6px 14px", fontWeight: 800, fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {aiResult.confidenceLevel} confidence
            </div>
          </div>

          {/* Details */}
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {aiResult.visualCues && (
              <div style={{ fontSize: 12, color: "#555", background: "#f8f9fa", borderRadius: 6, padding: "8px 12px" }}>
                <strong style={{ color: "#333" }}>AI observed:</strong> {aiResult.visualCues}
              </div>
            )}
            {aiResult.notes && (
              <div style={{ fontSize: 12, color: "#777", fontStyle: "italic" }}>{aiResult.notes}</div>
            )}

            {/* Log button */}
            {aiResult.estimatedWeightKg && (
              <button
                onClick={logToForecast}
                disabled={!manualAge}
                style={{ background: manualAge ? "#27ae60" : "#ccc", color: "#fff", border: "none", borderRadius: 8, padding: "12px 0", fontWeight: 800, fontSize: 14, cursor: manualAge ? "pointer" : "default", marginTop: 4 }}
                title={!manualAge ? "Enter bird age above to log" : ""}
              >
                ✅ Log to Flock Forecast {!manualAge ? "(enter age first)" : `— ${aiResult.estimatedWeightKg.toFixed(2)} kg at day ${manualAge}`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Session log */}
      {sessionLog.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e5e5", overflow: "hidden" }}>
          <div style={{ background: "var(--pm-primary)", color: "#fff", padding: "8px 14px", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
            This Session — {sessionLog.length} weigh{sessionLog.length !== 1 ? "s" : ""} logged
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                {["Time", "Shed", "Age", "Weight", "Source"].map(h => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: 0.4 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...sessionLog].reverse().map((e, i) => (
                <tr key={i} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: "7px 10px", textAlign: "center", color: "#888", fontSize: 12 }}>{e.time}</td>
                  <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: 700, color: "var(--pm-primary)" }}>{e.shedLabel}</td>
                  <td style={{ padding: "7px 10px", textAlign: "center" }}>{e.age}d</td>
                  <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: 800 }}>{e.weightKg.toFixed(3)} kg</td>
                  <td style={{ padding: "7px 10px", textAlign: "center" }}>
                    {e.confidence === "manual"
                      ? <span style={{ background: "#eaf4fb", color: "#2980b9", border: "1px solid #aad4f0", borderRadius: 5, padding: "2px 7px", fontWeight: 700, fontSize: 10 }}>MANUAL</span>
                      : <span style={{ color: confColor(e.confidence), fontWeight: 700, fontSize: 11 }}>{e.confidence}</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

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

  // Live silo readings — re-read from localStorage each render so it picks up Silo Sync updates
  type SiloReading = { shedGroupId: number; shedGroupName: string; silos: { letter: string; amountRemaining: number | null; unit: string }[] };
  const [siloLive, setSiloLive] = useState<SiloReading[]>(() => {
    try { return JSON.parse(localStorage.getItem("silo-fp-last-readings") || "[]"); } catch { return []; }
  });
  // Refresh silo data whenever the user navigates here
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("silo-fp-last-readings");
      if (raw) setSiloLive(JSON.parse(raw));
    } catch { /* noop */ }
  }, []);

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
    const grpHasConfig = (farmConfig.shedGroups?.length ?? 0) > 0;
    const grpActive = grpCfg ? grpCfg.active !== false : !grpHasConfig;
    if (!grpActive) continue;

    const shed1  = gcv(i, 3, 1) || `Shed ${sgId * 2 - 1}`;
    const shed2  = gcv(i, 4, 1) || `Shed ${sgId * 2}`;
    const birds1 = gcn(i, 3, 2);
    const birds2 = gcn(i, 4, 2);
    const birds  = birds1 + birds2;
    // Morts: row 3/4 col 4 (column D) holds cumulative morts per shed if available
    const morts1 = gcn(i, 3, 4);
    const morts2 = gcn(i, 4, 4);
    const pd     = findPlacementDate(sheets[i], edits[i])?.date ?? null;
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

              {/* Right — Full forecast dashboard */}
              {(() => {
                // ── Actual daily feed rate (last 7 days avg) ──────────────────
                const dailyRates: number[] = [];
                for (let r = Math.max(12, 11 + info.age - 7); r <= Math.min(71, 11 + info.age - 1); r++) {
                  const usage = parseFloat(gcv(info.si, r, COL_H).replace(/,/g, ""));
                  if (!isNaN(usage) && usage > 0) dailyRates.push(usage);
                }
                const avgDailyKg = dailyRates.length > 0 ? dailyRates.reduce((a, b) => a + b, 0) / dailyRates.length : 0;
                const daysLeft   = Math.max(0, targetAge - info.age);
                const feedStillNeeded = avgDailyKg > 0 && daysLeft > 0 ? Math.round(avgDailyKg * daysLeft) : p.feedNeeded;

                // ── Silo data for this shed group ─────────────────────────────
                const siloData   = siloLive.find(s => s.shedGroupId === info.sgId);
                const siloTotalKg = siloData ? siloData.silos.reduce((a, s) => {
                  if (s.amountRemaining == null) return a;
                  return a + (s.unit === "t" ? s.amountRemaining * 1000 : s.amountRemaining);
                }, 0) : null;
                const siloNeeded  = feedStillNeeded > 0 ? feedStillNeeded : p.feedNeeded;
                const siloBuffer  = siloTotalKg != null && siloNeeded > 0 ? siloTotalKg - siloNeeded : null;
                const siloOk      = siloBuffer != null ? siloBuffer >= 0 : null;
                const siloFillPct = siloTotalKg != null && siloNeeded > 0 ? Math.min(100, (siloTotalKg / siloNeeded) * 100) : null;

                return (
                <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>

                  {/* ── Projected catch weight ── */}
                  <div style={{ background: "linear-gradient(135deg, var(--pm-primary-soft) 0%, #f0fdf5 100%)", border: "1.5px solid var(--pm-primary-border)", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>📊 Projected Catch — Day {targetAge}</div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 30, fontWeight: 900, color: "var(--pm-primary)", lineHeight: 1 }}>{p.projWt > 0 ? `${p.projWt.toLocaleString()}g` : "—"}</div>
                        {p.projWt > 0 && (
                          <div style={{ fontSize: 11, color: "#666", marginTop: 3 }}>
                            Std: {p.stdWt.toLocaleString()}g &nbsp;
                            <span style={{ fontWeight: 800, color: p.ratio >= 1 ? "#1a7a40" : "#c0392b" }}>
                              {p.ratio >= 1 ? "▲" : "▼"} {Math.abs((p.ratio - 1) * 100).toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </div>
                      {info.birds > 0 && p.projWt > 0 && (
                        <div style={{ marginLeft: "auto", textAlign: "right" }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--pm-primary)" }}>~{((p.projWt / 1000) * info.birds / 1000).toFixed(1)}t</div>
                          <div style={{ fontSize: 10, color: "#aaa" }}>Total live weight</div>
                        </div>
                      )}
                    </div>
                    {p.latestAge && (
                      <div style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 5, background: "#fff8e0", border: "1px solid #e8d070", borderRadius: 5, padding: "2px 9px", fontSize: 11, fontWeight: 700, color: "#7a6000" }}>
                        📍 Last weigh-in: Day {p.latestAge} ({((weighIns[info.sgId]?.[p.latestAge] ?? 0) / 1000).toFixed(3)} kg)
                      </div>
                    )}
                    {!p.latestAge && (
                      <div style={{ marginTop: 6, fontSize: 11, color: "#bbb" }}>
                        No weigh-ins yet — use the ⚖️ camera tab on your phone to log bird weights
                      </div>
                    )}
                  </div>

                  {/* ── FCR panel ── */}
                  <div style={{ background: "var(--pm-primary-soft)", border: "1px solid var(--pm-primary-border)", borderRadius: 10, padding: "11px 14px" }}>
                    <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 7, fontWeight: 700 }}>⚡ FCR</div>
                    <div style={{ display: "flex", gap: 10 }}>
                      {[
                        { label: "Actual", val: p.actFCR ? p.actFCR.toFixed(2) : "—", color: p.actFCR ? (p.actFCR <= p.stdFCR ? "#1a7a40" : "#c0392b") : "#bbb", size: 24 },
                        { label: "Projected", val: (p.actFCR ? p.projFCR : p.stdFCR).toFixed(2), color: "var(--pm-primary)", size: 22 },
                        { label: "Standard", val: p.stdFCR.toFixed(2), color: "#bbb", size: 18 },
                      ].map(({ label, val, color, size }) => (
                        <div key={label} style={{ flex: 1, textAlign: "center", background: "#fff", borderRadius: 7, padding: "7px 5px" }}>
                          <div style={{ fontSize: size, fontWeight: 900, color }}>{val}</div>
                          <div style={{ fontSize: 9, color: "#aaa", marginTop: 2, textTransform: "uppercase" as const, letterSpacing: 0.3 }}>{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Actual daily rate + feed still needed ── */}
                  <div style={{ background: "#fffdf0", border: "1.5px solid #e8d56a", borderRadius: 10, padding: "11px 14px" }}>
                    <div style={{ fontSize: 10, color: "#8a7000", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 7, fontWeight: 700 }}>🌾 Actual Feed Rate</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      <div style={{ textAlign: "center", background: "#fff", borderRadius: 7, padding: "8px 4px" }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: "#9a7a00" }}>{avgDailyKg > 0 ? `${Math.round(avgDailyKg).toLocaleString()}` : "—"}</div>
                        <div style={{ fontSize: 9, color: "#bbb", marginTop: 2, textTransform: "uppercase" as const }}>kg/day avg</div>
                      </div>
                      <div style={{ textAlign: "center", background: "#fff", borderRadius: 7, padding: "8px 4px" }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: "#555" }}>{daysLeft}</div>
                        <div style={{ fontSize: 9, color: "#bbb", marginTop: 2, textTransform: "uppercase" as const }}>days left</div>
                      </div>
                      <div style={{ textAlign: "center", background: "#fff3e0", borderRadius: 7, padding: "8px 4px", border: "1px solid #ffd180" }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: "#c0392b" }}>{feedStillNeeded > 0 ? `${Math.round(feedStillNeeded / 1000).toFixed(1)}t` : "—"}</div>
                        <div style={{ fontSize: 9, color: "#bbb", marginTop: 2, textTransform: "uppercase" as const }}>still needed</div>
                      </div>
                    </div>
                    {avgDailyKg > 0 && (
                      <div style={{ marginTop: 7, fontSize: 11, color: "#8a7000" }}>
                        Based on last {dailyRates.length} day{dailyRates.length !== 1 ? "s" : ""} actual usage
                      </div>
                    )}
                  </div>

                  {/* ── Silo levels from Silo Sync ── */}
                  <div style={{ background: siloOk === null ? "#f9f9f9" : siloOk ? "#f0faf4" : "#fff5f5", border: `1.5px solid ${siloOk === null ? "#e0e0e0" : siloOk ? "#a8ddb8" : "#f0b0b0"}`, borderRadius: 10, padding: "11px 14px" }}>
                    <div style={{ fontSize: 10, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 7, fontWeight: 700, color: siloOk === null ? "#aaa" : siloOk ? "#1a7a40" : "#c0392b" }}>🏗️ Silo Levels — Silo Sync</div>
                    {siloData ? (
                      <>
                        {/* Silo bars */}
                        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                          {siloData.silos.map(s => {
                            const kg = s.amountRemaining != null ? (s.unit === "t" ? s.amountRemaining * 1000 : s.amountRemaining) : null;
                            const display = kg != null ? kg >= 1000 ? `${(kg / 1000).toFixed(1)}t` : `${Math.round(kg)}kg` : "—";
                            const pct = kg != null && siloTotalKg! > 0 ? (kg / siloTotalKg!) * 100 : 0;
                            return (
                              <div key={s.letter} style={{ flex: 1, textAlign: "center" }}>
                                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--pm-primary)", marginBottom: 3 }}>{display}</div>
                                <div style={{ height: 8, background: "#e8f0ec", borderRadius: 4, overflow: "hidden", marginBottom: 3 }}>
                                  <div style={{ height: "100%", width: `${pct}%`, background: "var(--pm-primary)", borderRadius: 4, transition: "width 0.4s" }} />
                                </div>
                                <div style={{ fontSize: 9, color: "#aaa", textTransform: "uppercase" as const }}>Silo {s.letter}</div>
                              </div>
                            );
                          })}
                        </div>
                        {/* Total vs needed */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                          <div style={{ textAlign: "center", background: "#fff", borderRadius: 7, padding: "7px 5px" }}>
                            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--pm-primary)" }}>{siloTotalKg! >= 1000 ? `${(siloTotalKg! / 1000).toFixed(1)}t` : `${Math.round(siloTotalKg!)}kg`}</div>
                            <div style={{ fontSize: 9, color: "#aaa", textTransform: "uppercase" as const, marginTop: 2 }}>In Silos Now</div>
                          </div>
                          <div style={{ textAlign: "center", background: siloOk ? "#f0faf4" : "#fff5f5", borderRadius: 7, padding: "7px 5px", border: `1px solid ${siloOk ? "#a8ddb8" : "#f0b0b0"}` }}>
                            <div style={{ fontSize: 20, fontWeight: 900, color: siloOk ? "#1a7a40" : "#c0392b" }}>
                              {siloBuffer != null ? (siloBuffer >= 0 ? `+${Math.abs(siloBuffer) >= 1000 ? (Math.abs(siloBuffer) / 1000).toFixed(1) + "t" : Math.round(Math.abs(siloBuffer)) + "kg"}` : `-${Math.abs(siloBuffer) >= 1000 ? (Math.abs(siloBuffer) / 1000).toFixed(1) + "t" : Math.round(Math.abs(siloBuffer)) + "kg"}`) : "—"}
                            </div>
                            <div style={{ fontSize: 9, color: "#aaa", textTransform: "uppercase" as const, marginTop: 2 }}>{siloOk ? "Buffer" : "Shortfall"}</div>
                          </div>
                        </div>
                        {/* Progress bar — silo vs needed */}
                        {siloFillPct != null && siloNeeded > 0 && (
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#aaa", marginBottom: 3 }}>
                              <span>0</span>
                              <span style={{ fontWeight: 700, color: siloOk ? "#1a7a40" : "#c0392b" }}>{siloOk ? "✅ Covered" : "⚠️ Short"}</span>
                              <span>{siloNeeded >= 1000 ? `${(siloNeeded / 1000).toFixed(1)}t needed` : `${Math.round(siloNeeded)}kg needed`}</span>
                            </div>
                            <div style={{ height: 10, background: "#e8f0ec", borderRadius: 5, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.min(100, siloFillPct)}%`, background: siloOk ? "var(--pm-primary)" : "#e74c3c", borderRadius: 5, transition: "width 0.5s" }} />
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", padding: "8px 0" }}>
                        No silo data — run a Silo Sync to see live levels here
                      </div>
                    )}
                  </div>

                  {/* ── Days to catch chip ── */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {daysLeft > 0 && info.age > 0 && (
                      <div style={{ background: "var(--pm-primary-pale)", border: "1px solid var(--pm-primary-border)", borderRadius: 6, padding: "5px 11px", fontSize: 12, fontWeight: 700, color: "var(--pm-primary)" }}>
                        🗓 {daysLeft} day{daysLeft !== 1 ? "s" : ""} to catch
                      </div>
                    )}
                    {!info.placementDate && (
                      <div style={{ fontSize: 12, color: "#bbb" }}>Set a placement date on the Summary tab to enable age calculations.</div>
                    )}
                  </div>

                </div>
                );
              })()}
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
  const [activeView, setActiveView] = useState<null | "summary" | "batchResults" | "morts" | "history" | "density" | "flockForecast" | "eggProduction" | "bodyWeight" | "weighBirds">(null);
  const isTouchDevice = navigator.maxTouchPoints > 0;
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
  // Weigh-sheet plan data — kept separate from catchMap, merged only for feed planning tabs
  const [weighPlanMap, setWeighPlanMap] = useState<CatchMap>(() => {
    try { return JSON.parse(localStorage.getItem(WEIGH_PLAN_KEY) || "{}"); } catch { return {}; }
  });
  useEffect(() => {
    // BatchResultsView dispatches this custom event (same tab) when it saves a new weigh plan
    const handler = () => {
      try { setWeighPlanMap(JSON.parse(localStorage.getItem(WEIGH_PLAN_KEY) ?? "{}")); } catch { /* noop */ }
    };
    window.addEventListener("weighPlanUpdated", handler);
    return () => window.removeEventListener("weighPlanUpdated", handler);
  }, []);
  // Merge weighPlanMap + catchMap for FlockForecastView (shed feed planning tabs).
  // Rule: catchMap (actual Weighbridge email data) always overrides weighPlanMap (planned
  // weigh-sheet data) for the same shed+date — so pasting the email after a catch
  // automatically corrects the planned numbers without any manual deletion.
  const planningCatchMap: CatchMap = (() => {
    const merged: CatchMap = {};
    // 1. Start with planned weigh-sheet entries
    Object.entries(weighPlanMap).forEach(([k, rows]) => {
      merged[Number(k)] = [...rows];
    });
    // 2. Overlay actual email entries — for any date present in catchMap, drop the
    //    corresponding weigh-plan entry and use the actual data instead
    Object.entries(catchMap).forEach(([k, rows]) => {
      const n = Number(k);
      const actualDates = new Set(rows.map(r => r.date).filter(Boolean));
      const planRows = (merged[n] ?? []).filter(r => !actualDates.has(r.date));
      merged[n] = [...planRows, ...rows];
    });
    return merged;
  })();
  const [showSettings, setShowSettings] = useState(false);
  const [newBatchLocked, setNewBatchLocked] = useState(true);
  const [showFeedAlert, setShowFeedAlert] = useState(false);
  const [alertSnooze, setAlertSnooze] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem(ALERT_SNOOZE_KEY) ?? "{}"); } catch { return {}; }
  });
  const snoozeAlert = (name: string, hours: number) => {
    const next = { ...alertSnooze, [name]: Date.now() + hours * 3600000 };
    setAlertSnooze(next);
    localStorage.setItem(ALERT_SNOOZE_KEY, JSON.stringify(next));
  };
  const isSnoozed = (name: string) => {
    const exp = alertSnooze[name];
    return exp != null && exp > Date.now();
  };
  const [showSiloSync, setShowSiloSync] = useState(false);
  const [siloSyncReadings, setSiloSyncReadings] = useState<{ shedGroupId: number; shedGroupName: string; allSaved: boolean; silos: { letter: string; amountRemaining: number | null; saved: boolean; unit: string }[] }[]>([]);
  const [siloSyncDay, setSiloSyncDay] = useState("");
  const [siloSyncLoading, setSiloSyncLoading] = useState(false);
  const [siloSyncError, setSiloSyncError] = useState("");
  const [siloSyncMode, setSiloSyncMode] = useState<"next" | "correct">("next");
  const [siloSyncUnitOverride, setSiloSyncUnitOverride] = useState<"as-saved" | "t">(() => {
    // Default to "as-saved" so each reading's stored unit is respected.
    // Only default to "t" if the user has explicitly set their recording unit to tonnes.
    const defUnit = localStorage.getItem("silo-default-unit") || "kg";
    return defUnit === "t" ? "t" : "as-saved";
  });
  const [pendingScrollRow, setPendingScrollRow] = useState<number | null>(null);
  const [autoSync, setAutoSync] = useState(() => localStorage.getItem("silo-auto-sync") !== "off");
  const [lastAutoSyncTs, setLastAutoSyncTs] = useState<number | null>(() => { const v = localStorage.getItem("silo-fp-last-sync"); return v ? parseInt(v, 10) : null; });
  // Intentionally NOT restoring hash from localStorage on init: this forces the
  // auto-sync to re-apply current Farm Buddy readings on every page reload, which
  // ensures K/L/M and J are correct even if nothing changed since the last session.
  const lastSyncHashRef = useRef("");
  const [autoSaveFlash, setAutoSaveFlash] = useState(false);
  const [settingsFarmName, setSettingsFarmName] = useState("");
  const [settingsBatchNum, setSettingsBatchNum] = useState("");
  const [settingsDefaultUnit, setSettingsDefaultUnit] = useState<"kg"|"t">("kg");
  const t = useMemo(() => createTranslator(farmConfig.language), [farmConfig.language]);
  const workbookRef = useRef<WorkBook | null>(null);
  const rawBufferRef = useRef<ArrayBuffer | null>(null);
  const seedDoneRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const sheetsRef = useRef(sheets);
  const editsRef = useRef(edits);
  sheetsRef.current = sheets;
  editsRef.current = edits;

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

  // ── Farm Buddy sync ──────────────────────────────────────────────────────────
  const toKg = (amount: number, unit: string | null | undefined): number => {
    const u = (unit ?? "kg").trim().toLowerCase();
    if (u === "t" || u === "tonne" || u === "tonnes" || u === "ton" || u === "tons") return amount * 1000;
    return amount;
  };

  // ── Shared helper: find the first SHED sheet's start row ──────────────────
  const findShedStartRow = (currentSheets: typeof sheets): { sheetIdx: number; startRow: number } => {
    for (let i = 0; i < currentSheets.length; i++) {
      const tab = currentSheets[i].name.trim().toUpperCase();
      if (tab === "WEEKLY STOCK TAKE" || tab === "CONSUMPTION GUIDE") continue;
      if (!tab.includes("SHED")) continue;
      const cells = currentSheets[i].cells;
      let startRow = 12;
      for (let r = 9; r <= 16; r++) {
        const v0 = String(cells.get(`${r},0`)?.value ?? "").trim();
        const v1 = String(cells.get(`${r},1`)?.value ?? "").trim();
        if (v0 === "1" || v1 === "1") { startRow = r; break; }
      }
      return { sheetIdx: i, startRow };
    }
    return { sheetIdx: -1, startRow: 12 };
  };

  // ── Find the batch day number by matching today's date in the spreadsheet ──
  // Compares the formatted date cell (col 1) against today using multiple formats.
  // Returns 1-based day number, or null if no match found.
  const detectDayByDate = (
    targetDate: Date,
    currentSheets: typeof sheets
  ): number | null => {
    const { sheetIdx, startRow } = findShedStartRow(currentSheets);
    if (sheetIdx === -1) return null;
    const cells = currentSheets[sheetIdx].cells;
    // Build candidate strings for today
    const targetIso = targetDate.toISOString().slice(0, 10); // "2026-04-10"
    const targetEnAU = targetDate.toLocaleDateString("en-AU", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    }); // "Thursday, 10 April 2026"
    const targetShort = targetDate.toLocaleDateString("en-AU"); // "10/04/2026"

    const isSameDay = (cellVal: string): boolean => {
      const v = cellVal.trim();
      if (!v) return false;
      if (v === targetEnAU || v === targetIso || v === targetShort) return true;
      // Try parsing the cell value as a date and compare
      const parsed = parseDateInput(v);
      if (parsed) {
        return parsed.getFullYear() === targetDate.getFullYear() &&
               parsed.getMonth() === targetDate.getMonth() &&
               parsed.getDate() === targetDate.getDate();
      }
      return false;
    };

    for (let r = startRow; r < startRow + 65; r++) {
      const dateVal = String(cells.get(`${r},1`)?.value ?? "");
      if (isSameDay(dateVal)) return r - startRow + 1;
    }
    return null;
  };

  // Detect the CURRENT day (today's row by date, fallback: last row with real silo data)
  const detectCurrentSyncDay = (currentSheets: typeof sheets, currentEdits: typeof edits): number => {
    const byDate = detectDayByDate(new Date(), currentSheets);
    if (byDate !== null) return byDate;
    // Fallback: last row with a non-empty silo edit
    const { sheetIdx, startRow } = findShedStartRow(currentSheets);
    if (sheetIdx === -1) return 1;
    const cells = currentSheets[sheetIdx].cells;
    const sheetEdits = currentEdits[sheetIdx];
    let lastSiloRow = -1;
    for (let r = startRow; r < startRow + 65; r++) {
      const kVal = sheetEdits?.get(`${r},${COL_K}`) ?? "";
      const lVal = sheetEdits?.get(`${r},${COL_L}`) ?? "";
      const mVal = sheetEdits?.get(`${r},${COL_M}`) ?? "";
      const hasReal = [kVal, lVal, mVal].some(v => v !== "" && v !== "0" && !isNaN(Number(v)) && Number(v) > 0);
      if (hasReal) lastSiloRow = r;
    }
    if (lastSiloRow === -1) {
      // Fallback: check original cells (non-zero values only)
      for (let r = startRow; r < startRow + 65; r++) {
        const kRaw = String(cells.get(`${r},${COL_K}`)?.value ?? "");
        const lRaw = String(cells.get(`${r},${COL_L}`)?.value ?? "");
        const mRaw = String(cells.get(`${r},${COL_M}`)?.value ?? "");
        const hasReal = [kRaw, lRaw, mRaw].some(v => v !== "" && v !== "0" && !isNaN(Number(v)) && Number(v) > 0);
        if (hasReal) lastSiloRow = r;
      }
    }
    return lastSiloRow < 0 ? 1 : lastSiloRow - startRow + 1;
  };

  // Detect next day (day AFTER today, or first empty row after last real silo data)
  const detectNextSyncDay = (currentSheets: typeof sheets, currentEdits: typeof edits): number => {
    return detectCurrentSyncDay(currentSheets, currentEdits) + 1;
  };

  // Core apply: writes sheds data into edits for a given batch day
  // unitOverride "t" → treat ALL reading values as tonnes regardless of stored unit
  const doApplyReadings = (
    sheds: typeof siloSyncReadings,
    day: number,
    currentSheets: typeof sheets,
    currentEdits: typeof edits,
    unitOverride?: "t" | null,
    isCorrection?: boolean
  ): typeof edits => {
    const effectiveUnit = (silo: { unit: string | null | undefined }) =>
      unitOverride === "t" ? "t" : (silo.unit ?? "kg");
    const next = [...currentEdits];
    let shedCount = 0;
    const today = new Date();
    for (let i = 0; i < currentSheets.length; i++) {
      const tab = currentSheets[i].name.trim().toUpperCase();
      if (tab === "WEEKLY STOCK TAKE" || tab === "CONSUMPTION GUIDE") continue;
      if (!tab.includes("SHED")) continue;
      const shedGroupId = SHED_SHEET_ORDER[shedCount] ?? (shedCount + 1);
      shedCount++;
      const shedData = sheds.find(s => s.shedGroupId === shedGroupId);
      if (!shedData) continue;
      const cells = currentSheets[i].cells;
      let startRow = 12;
      for (let r = 9; r <= 16; r++) {
        const v0 = String(cells.get(`${r},0`)?.value ?? "").trim();
        const v1 = String(cells.get(`${r},1`)?.value ?? "").trim();
        if (v0 === "1" || v1 === "1") { startRow = r; break; }
      }
      // ── Per-shed target row resolution ──────────────────────────────────────
      // Priority 1: today's date exists in this shed's date column → use that row
      // Priority 2: last row with a silo value in this shed + 1 (or same row for corrections)
      // Priority 3: global day-offset fallback (only if shed has no silo data at all)

      // Priority 1 — date-column scan
      let targetRow = -1;
      for (let r = startRow; r < startRow + 65; r++) {
        const dv = String(cells.get(`${r},1`)?.value ?? "").trim();
        if (!dv) continue;
        const parsed = parseDateInput(dv);
        if (parsed &&
            parsed.getFullYear() === today.getFullYear() &&
            parsed.getMonth() === today.getMonth() &&
            parsed.getDate() === today.getDate()) {
          targetRow = r; // today's exact row found
          break;
        }
      }

      if (targetRow === -1) {
        // Priority 2 — find the last row in this shed that already has a silo value.
        // Only check app-entered edits (not template cells), since the template may
        // contain stale readings from a previous batch which would place the new
        // reading at the wrong (too-far-forward) row.
        const sheetEditsNow = next[i] ?? new Map<string, string>();
        let lastSiloRow = -1;
        for (let r = startRow; r < startRow + 65; r++) {
          const hasK = !!(sheetEditsNow.get(`${r},${COL_K}`) ?? "").toString().trim();
          const hasL = !!(sheetEditsNow.get(`${r},${COL_L}`) ?? "").toString().trim();
          const hasM = !!(sheetEditsNow.get(`${r},${COL_M}`) ?? "").toString().trim();
          if (hasK || hasL || hasM) lastSiloRow = r;
        }
        if (lastSiloRow >= 0) {
          targetRow = isCorrection ? lastSiloRow : lastSiloRow + 1;
        } else {
          // Priority 3 — no silo data yet, use global day offset as best guess
          targetRow = startRow + (day - 1);
        }
      }
      const sheetEdits = new Map(next[i] ?? []);
      const siloA = shedData.silos.find(s => s.letter === "A");
      const siloB = shedData.silos.find(s => s.letter === "B");
      const siloC = shedData.silos.find(s => s.letter === "C");
      if (siloA?.saved && siloA.amountRemaining != null) sheetEdits.set(`${targetRow},${COL_K}`, String(toKg(siloA.amountRemaining, effectiveUnit(siloA))));
      if (siloB?.saved && siloB.amountRemaining != null) sheetEdits.set(`${targetRow},${COL_L}`, String(toKg(siloB.amountRemaining, effectiveUnit(siloB))));
      if (siloC?.saved && siloC.amountRemaining != null) sheetEdits.set(`${targetRow},${COL_M}`, String(toKg(siloC.amountRemaining, effectiveUnit(siloC))));
      next[i] = recalculate(cells, sheetEdits, targetRow, COL_K, currentSheets[i].maxRow);
    }
    return next;
  };

  // ── Auto-sync effect (polls every 2 minutes) ─────────────────────────────
  useEffect(() => {
    if (!autoSync) return;
    const todayStr = () => new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const run = async () => {
      try {
        const res = await fetch(`${window.location.origin}/api/readings/today`);
        if (!res.ok) return;
        const data = await res.json();
        const sheds: typeof siloSyncReadings = data.sheds ?? [];
        // Build change hash from saved readings
        const hash = sheds.map(s =>
          s.silos.filter(x => x.saved).map(x => `${x.letter}:${x.amountRemaining}:${x.unit}`).join(",")
        ).join("|");
        const anySaved = sheds.some(s => s.silos.some(x => x.saved));
        if (!anySaved || hash === lastSyncHashRef.current) return; // nothing new
        lastSyncHashRef.current = hash;
        localStorage.setItem("silo-fp-sync-hash", hash);
        // If we already synced today → overwrite same row (correction); otherwise new row
        const lastSyncDate = localStorage.getItem("silo-fp-last-sync-date");
        const isCorrection = lastSyncDate === todayStr();
        const day = isCorrection
          ? detectCurrentSyncDay(sheetsRef.current, editsRef.current)
          : detectNextSyncDay(sheetsRef.current, editsRef.current);
        const nextEdits = doApplyReadings(sheds, day, sheetsRef.current, editsRef.current, "t", isCorrection);
        setEdits(nextEdits);
        const now = Date.now();
        localStorage.setItem("silo-fp-last-sync", String(now));
        localStorage.setItem("silo-fp-last-sync-date", todayStr());
        localStorage.setItem("silo-fp-last-readings", JSON.stringify(sheds.map(s => ({ shedGroupId: s.shedGroupId, shedGroupName: s.shedGroupName, silos: s.silos.map(x => ({ letter: x.letter, amountRemaining: x.amountRemaining, unit: x.unit })) }))));
        setLastAutoSyncTs(now);
        setHasChanges(true);
      } catch { /* network unavailable — silently skip */ }
    };
    run(); // immediate first run
    const id = setInterval(run, 2 * 60 * 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSync]);

  const openSiloSync = async () => {
    setSiloSyncError("");
    setSiloSyncLoading(true);
    setShowSiloSync(true);
    // Default: "correct" if today's date exists in the spreadsheet, else "next"
    const todayInSheet = detectDayByDate(new Date(), sheets) !== null;
    setSiloSyncMode(todayInSheet ? "correct" : "next");
    setSiloSyncUnitOverride("t");
    try {
      const res = await fetch(`${window.location.origin}/api/readings/today`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setSiloSyncReadings(data.sheds ?? []);
    } catch {
      setSiloSyncError("Could not reach Silo Base Mate. Make sure you're connected.");
    } finally {
      setSiloSyncLoading(false);
    }
  };

  const clearAllSiloEdits = (currentEdits: typeof edits): typeof edits => {
    const next = [...currentEdits];
    for (let i = 0; i < sheets.length; i++) {
      const tab = sheets[i].name.trim().toUpperCase();
      if (!tab.includes("SHED")) continue;
      const sheetEdits = new Map(next[i] ?? []);
      for (let r = 9; r <= 80; r++) {
        sheetEdits.delete(`${r},${COL_K}`);
        sheetEdits.delete(`${r},${COL_L}`);
        sheetEdits.delete(`${r},${COL_M}`);
      }
      next[i] = sheetEdits;
    }
    return next;
  };


  const clearAndResync = () => {
    const confirmed = window.confirm(
      "⚠️ This will permanently delete ALL silo readings from every shed sheet and replace them with only today's reading.\n\nAre you sure? This cannot be undone."
    );
    if (!confirmed) return;
    const day = detectCurrentSyncDay(sheets, edits);
    const cleared = clearAllSiloEdits(edits);
    const nextEdits = doApplyReadings(siloSyncReadings, day, sheets, cleared, siloSyncUnitOverride === "t" ? "t" : null, true);
    setEdits(nextEdits);
    const hash = siloSyncReadings.map(s =>
      s.silos.filter(x => x.saved).map(x => `${x.letter}:${x.amountRemaining}:${x.unit}`).join(",")
    ).join("|");
    lastSyncHashRef.current = hash;
    localStorage.setItem("silo-fp-sync-hash", hash);
    const now = Date.now();
    localStorage.setItem("silo-fp-last-sync", String(now));
    setLastAutoSyncTs(now);
    setHasChanges(true);
    setShowSiloSync(false);
    const firstShed = sheets.find(s => s.name.trim().toUpperCase().includes("SHED"));
    if (firstShed) {
      let startRow = 12;
      for (let r = 9; r <= 16; r++) {
        const v0 = String(firstShed.cells.get(`${r},0`)?.value ?? "").trim();
        const v1 = String(firstShed.cells.get(`${r},1`)?.value ?? "").trim();
        if (v0 === "1" || v1 === "1") { startRow = r; break; }
      }
      setPendingScrollRow(startRow + (day - 1));
    }
  };

  const applySiloSync = () => {
    const day = siloSyncMode === "correct"
      ? detectCurrentSyncDay(sheets, edits)
      : detectNextSyncDay(sheets, edits);
    const nextEdits = doApplyReadings(siloSyncReadings, day, sheets, edits, siloSyncUnitOverride === "t" ? "t" : null, siloSyncMode === "correct");
    setEdits(nextEdits);
    const hash = siloSyncReadings.map(s =>
      s.silos.filter(x => x.saved).map(x => `${x.letter}:${x.amountRemaining}:${x.unit}`).join(",")
    ).join("|");
    lastSyncHashRef.current = hash;
    localStorage.setItem("silo-fp-sync-hash", hash);
    localStorage.setItem("silo-fp-last-readings", JSON.stringify(siloSyncReadings.map(s => ({ shedGroupId: s.shedGroupId, shedGroupName: s.shedGroupName, silos: s.silos.map(x => ({ letter: x.letter, amountRemaining: x.amountRemaining, unit: x.unit })) }))));
    const now = Date.now();
    localStorage.setItem("silo-fp-last-sync", String(now));
    setLastAutoSyncTs(now);
    setHasChanges(true);
    setShowSiloSync(false);
    // Compute the target row so we can scroll to it after render
    const firstShed = sheets.find(s => s.name.trim().toUpperCase().includes("SHED"));
    if (firstShed) {
      let startRow = 12;
      for (let r = 9; r <= 16; r++) {
        const v0 = String(firstShed.cells.get(`${r},0`)?.value ?? "").trim();
        const v1 = String(firstShed.cells.get(`${r},1`)?.value ?? "").trim();
        if (v0 === "1" || v1 === "1") { startRow = r; break; }
      }
      setPendingScrollRow(startRow + (day - 1));
    }
  };

  // After sync: scroll so today's row sits just below the sticky column headers
  useEffect(() => {
    if (pendingScrollRow === null) return;
    const raf = requestAnimationFrame(() => {
      const tr = document.querySelector<HTMLElement>(`tr[data-row="${pendingScrollRow}"]`);
      if (tr) {
        // Offset accounts for fixed top bar (~56px) + tab bar (~44px) + sticky table headers (~80px)
        const rect = tr.getBoundingClientRect();
        const target = window.scrollY + rect.top - 180;
        window.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      setPendingScrollRow(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingScrollRow]);

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
        // Also seeds Feed Ordered (E) from the template.
        // NOTE: Silo reading columns (K/L/M/J) are NOT seeded from the template —
        // they only enter via live Farm Buddy sync or manual handleEdit edits.
        const initialEdits = result.map(buildInitialEditsForSheet);

        // Restore any auto-saved edits from the previous session and merge them
        // on top of the template defaults so nothing is lost on refresh.
        //
        // IMPORTANT: certain cells are always derived fresh from the spreadsheet
        // by buildInitialEditsForSheet and must NOT be overridden by stale saved
        // edits (which may contain wrong dates from a previous buggy code version):
        //   • "2,2" — the canonical placement date position
        //   • any `"r,${COL_B}"` for r ≥ 12 — the data-row DATE column.
        //     The date column is never user-entered; it is always recomputed from
        //     the placement date + age.  Old saved values here are the root cause
        //     of SHED 9 & 10 (and any other shed) showing the wrong date.
        try {
          const saved = localStorage.getItem(EDITS_AUTOSAVE_KEY);
          if (saved) {
            const savedMaps = deserializeEdits(saved);
            for (let i = 0; i < Math.min(initialEdits.length, savedMaps.length); i++) {
              const savedMap = savedMaps[i];
              if (savedMap && savedMap.size > 0) {
                const merged = new Map(initialEdits[i]);
                const freshPlacementDate = merged.get("2,2");
                const hasValidFreshDate = !!(freshPlacementDate && parseDateString(freshPlacementDate));
                savedMap.forEach((v, k) => {
                  if (hasValidFreshDate) {
                    // Protect canonical placement-date edit
                    if (k === "2,2") return;
                    // Protect every data-row date cell (COL_B = 1, rows 12+)
                    const [rStr, cStr] = k.split(",");
                    if (cStr === String(COL_B) && parseInt(rStr) >= 12) return;
                  }
                  // Silo reading columns (K/L/M/J): restore non-empty values only.
                  // Non-empty values are either manually entered readings or values that
                  // were applied by a previous Farm Buddy sync — both are valid to keep.
                  // Empty values (cleared by buildInitialEditsForSheet) are skipped so we
                  // don't overwrite blank-column initialisation with stale empty strings.
                  // The live Farm Buddy auto-sync will overwrite these with current data
                  // when it runs after load.  New-batch imports clear the autosave
                  // entirely, so cross-batch bleed is not possible.
                  const cNum = parseInt(k.split(",")[1]);
                  if ((cNum === COL_K || cNum === COL_L || cNum === COL_M || cNum === COL_J) && !v) return;
                  // Skip stale date-string values that were accidentally autosaved into
                  // allocation cells (H2-H5 = rows 1-4, col 7).  These appear when a
                  // previous buggy version displayed a date-formatted kg value and the
                  // user clicked through the Summary card, causing onBlur to persist it.
                  const rNum = parseInt(k.split(",")[0]);
                  if (cNum === COL_H && rNum >= 1 && rNum <= 4 && isNaN(parseFloat(v))) return;
                  merged.set(k, v);
                });
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

  // ── Seed today's readings from the Farm Buddy app ─────────────────────────
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
          silos: Array<{ letter: string; saved: boolean; amountRemaining: number | null; unit: string | null }>;
        }>) {
          const nums = shed.shedGroupName.match(/\d+/g) ?? [];

          // Match shed numbers to sheet numbers (e.g. "1","2" → "SHED 1 & 2")
          const sheetIdx = sheets.findIndex(s => {
            const sNums: string[] = s.name.match(/\d+/g) ?? [];
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
            pairs.set(`${dateRow},${col}`, String(toKg(silo.amountRemaining, silo.unit)));
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


  const handleEdit = useCallback((sheetIdx: number, key: string, value: string) => {
    setEdits((prev) => {
      const next = [...prev];
      const m = new Map(next[sheetIdx]);
      m.set(key, value);
      const [r, c] = key.split(",").map(Number);
      const sheet = sheets[sheetIdx];
      const isEobSheet = sheet ? /end.{0,4}batch/i.test(sheet.name.trim()) : false;
      const recalculated = (sheet && !isEobSheet) ? recalculate(sheet.cells, m, r, c, sheet.maxRow) : m;

      // When the placement date ("2,2") changes, re-derive the date column
      // (COL_B) for all data rows so dates stay consistent in the current
      // session — e.g. after "Clear for New Batch" the user types a new date.
      if (key === "2,2" && sheet) {
        const parsedDate = parseDateInput(value.trim());
        // Find the row where Age = 1
        let dataStart = 12;
        for (let dr = 6; dr <= 20; dr++) {
          if (String(sheet.cells.get(`${dr},0`)?.value ?? "").trim() === "1") {
            dataStart = dr; break;
          }
        }
        if (parsedDate && parsedDate.getFullYear() >= 2010 && parsedDate.getFullYear() <= 2040) {
          for (let dr = dataStart; dr <= dataStart + 65; dr++) {
            const age = parseInt(String(sheet.cells.get(`${dr},0`)?.value ?? "").trim(), 10);
            if (isNaN(age) || age < 1) continue;
            const d = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate() + (age - 1));
            recalculated.set(`${dr},${COL_B}`, d.toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" }));
          }
        } else {
          // Blank placement date → also blank every date column cell so no
          // stale xlsx-template dates bleed through.
          for (let dr = dataStart; dr <= dataStart + 65; dr++) {
            recalculated.set(`${dr},${COL_B}`, "");
          }
        }
      }

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
        // Also blank the date column so stale cached xlsx dates never show after reset.
        let gPrev = getCell(11, COL_G); // cream row starting allocation
        for (let r = 12; r <= 71; r++) {
          m.set(`${r},${COL_B}`, ""); // col B – Date (blanked; re-seeded when user enters new placement date)
          m.set(`${r},3`,  ""); // col D – Feed Del (hidden but must be cleared)
          m.set(`${r},4`,  ""); // col E – Feed Ordered
          m.set(`${r},5`,  ""); // col F – Silo (letter)
          // Re-seed Feed Alloc: G(r) = G(r-1) - H(r)
          const h = getCell(r, COL_H);
          const g = gPrev - h;
          m.set(`${r},${COL_G}`, String(Math.round(g * 100) / 100));
          gPrev = g;
          // Blank Feed On Hand — stale xlsx values must not bleed into a new batch.
          // FOH is recomputed by the silo-readings cascade when readings are entered.
          m.set(`${r},${COL_I}`, "");
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
    // Reset sync hash so the next Farm Buddy sync re-applies readings from scratch
    lastSyncHashRef.current = "";
    localStorage.removeItem("silo-fp-sync-hash");
    localStorage.removeItem("silo-fp-last-sync-date");
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


  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-green-50">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-green-800 font-semibold">Loading Broiler Base Mate…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-screen bg-red-50">
      <p className="text-red-700 font-semibold">Failed to load: {error}</p>
    </div>
  );

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
      {/* Header — paddingTop accounts for iPhone notch */}
      <div className="text-white px-4 py-2 flex items-center gap-3 shadow-md shrink-0" style={{ background: "var(--pm-primary)", paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}>
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Silo Base Mate" style={{ height: 32, width: "auto", objectFit: "contain", flexShrink: 0 }} />
        <span className="text-lg font-bold tracking-wide">{farmConfig.farmName ?? "Double B Farm"} — {(farmConfig.farmType ?? "broiler") === "breeder" ? "Breeder Program" : "Broiler Base Mate"}</span>
        <div className="ml-auto flex items-center gap-2">
          {autoSaveFlash
            ? <span style={{ color: "#86efac", fontSize: 12, fontWeight: 600 }}>✓ Auto-saved</span>
            : hasChanges && <span style={{ color: "#fde68a", fontSize: 12, fontWeight: 600 }}>● Saving…</span>
          }
          {(() => {
            const activeAlerts = feedAlerts.filter(a => !isSnoozed(a.shedGroupName));
            const isGood = activeAlerts.length === 0;
            const hasCrit = activeAlerts.some(a => a.urgency === "critical");
            const bg    = isGood ? "#16a34a" : hasCrit ? "#dc2626" : "#f59e0b";
            const fg    = isGood ? "#fff"    : hasCrit ? "#fff"    : "#7c2d12";
            const shadow = isGood ? "0 0 0 2px #86efac" : hasCrit ? "0 0 0 2px #fca5a5" : "0 0 0 2px #fde68a";
            const snoozedCount = feedAlerts.length - activeAlerts.length;
            const label = isGood
              ? (snoozedCount > 0 ? `Feed OK (${snoozedCount} snoozed)` : "Feed OK")
              : `${activeAlerts.length} Feed Alert${activeAlerts.length > 1 ? "s" : ""}`;
            return (
              <button
                onClick={() => setShowFeedAlert(true)}
                title={isGood ? "All sheds have sufficient feed" : `${activeAlerts.length} shed(s) need attention`}
                style={{ background: bg, color: fg, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, boxShadow: shadow }}
              >
                <span className={isGood ? "bell-icon-still" : "bell-icon-wiggle"} style={{ fontSize: 16 }}>🔔</span>
                {label}
              </button>
            );
          })()}
          {/* Farm Buddy auto-sync indicator + toggle */}
          <div className="flex items-center gap-1 rounded border border-white/30 overflow-hidden" style={{ fontSize: 12 }}>
            <button
              onClick={openSiloSync}
              title="Manually sync Farm Buddy readings now"
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 transition-colors text-white font-semibold"
            >
              🔄
              {lastAutoSyncTs
                ? <span>{(() => { const d = Math.floor((Date.now() - lastAutoSyncTs) / 1000); return d < 60 ? "just now" : d < 3600 ? `${Math.floor(d/60)}m ago` : `${Math.floor(d/3600)}h ago`; })()}</span>
                : <span>Sync Silo Base Mate</span>
              }
            </button>
            <button
              onClick={() => setAutoSync(v => { const next = !v; localStorage.setItem("silo-auto-sync", next ? "on" : "off"); return next; })}
              title={autoSync ? "Auto-sync ON — click to disable" : "Auto-sync OFF — click to enable"}
              className="flex items-center px-2 py-1.5 transition-colors font-bold"
              style={{ background: autoSync ? "#16a34a" : "rgba(255,255,255,0.08)", color: autoSync ? "#fff" : "rgba(255,255,255,0.5)" }}
            >
              {autoSync ? "AUTO" : "OFF"}
            </button>
          </div>
          <button
            onClick={() => { setSettingsFarmName(farmConfig.farmName ?? ""); setSettingsBatchNum(localStorage.getItem("silo-batch-num") ?? ""); setSettingsDefaultUnit((localStorage.getItem("silo-default-unit") as "kg"|"t") || "kg"); setNewBatchLocked(true); setShowSettings(true); }}
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
            // Always hide disabled groups (e.g. Shed 9 & 10 pending bug fix)
            if (DISABLED_SHED_GROUPS.has(shedGroupId)) return null;
            const groupCfg = farmConfig.shedGroups?.find(g => g.shedGroupId === shedGroupId);
            // If user has configured any shed groups, unconfigured groups default to inactive.
            // If no config yet (first use), all shed tabs default to active.
            const tabHasConfig = (farmConfig.shedGroups?.length ?? 0) > 0;
            const groupActive = groupCfg ? groupCfg.active !== false : !tabHasConfig;
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
              {tabAlert && (() => {
                const bellColor = tabAlert.urgency === "critical" ? "#e53935" : tabAlert.urgency === "warning" ? "#f9a825" : "#43a047";
                return (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill={bellColor} style={{ marginRight: 4, verticalAlign: "middle", flexShrink: 0, animation: tabAlert.urgency === "critical" ? "pulse 1.2s infinite" : "none", display: "inline-block" }}>
                    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
                  </svg>
                );
              })()}
              {(() => {
                if (!tabName.includes("SHED")) return s.name;
                const pd = findPlacementDate(s, edits[i])?.date ?? null;
                if (!pd) return s.name;
                const dateLabel = pd.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
                return <>{dateLabel} · {s.name}</>;
              })()}{hasEdits ? " •" : ""}
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
          {isTouchDevice && (
            <button onClick={() => setActiveView("weighBirds")}
              className="px-3 py-2.5 text-xs font-semibold rounded-t border border-b-0 whitespace-nowrap transition-all"
              style={{ backgroundColor: activeView === "weighBirds" ? "#fff" : "#C9A227", color: activeView === "weighBirds" ? "#7a5500" : "#000", borderColor: activeView === "weighBirds" ? "#ccc" : "#a8780000", transform: activeView === "weighBirds" ? "translateY(1px)" : "translateY(3px)", marginLeft: 4 }}>
              ⚖️ Weigh Birds
            </button>
          )}
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
        <button onClick={() => setActiveView("density")}
          className="px-3 py-2.5 text-xs font-semibold rounded-t border border-b-0 whitespace-nowrap transition-all"
          style={{ backgroundColor: activeView === "density" ? "#fff" : "#7b3fc4", color: activeView === "density" ? "#5a2da0" : "#fff", borderColor: activeView === "density" ? "#ccc" : "#5a2da000", transform: activeView === "density" ? "translateY(1px)" : "translateY(3px)", marginLeft: 4 }}>
          🏠 Density
        </button>

      </div>

      {/* Feed Delivery Strip */}
      <FeedOrderStrip farmConfig={farmConfig} />

      {/* Spreadsheet / Summary */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-zinc-900 border-t-2" style={{ borderColor: "var(--pm-primary-mid)" }}>
        {activeView === "eggProduction" ? (
          <div className="flex-1 overflow-auto safe-bottom">
            <EggProductionView farmConfig={farmConfig} shedPlacement={shedPlacement} />
          </div>
        ) : activeView === "bodyWeight" ? (
          <div className="flex-1 overflow-auto safe-bottom">
            <BodyWeightView farmConfig={farmConfig} shedPlacement={shedPlacement} />
          </div>
        ) : activeView === "weighBirds" && isTouchDevice ? (
          <div className="flex-1 overflow-auto safe-bottom">
            <BirdWeighView farmConfig={farmConfig} />
          </div>
        ) : activeView === "flockForecast" ? (
          <div className="flex-1 overflow-auto safe-bottom">
            <FlockForecastView sheets={sheets} edits={edits} farmConfig={farmConfig} catchMap={planningCatchMap} />
          </div>
        ) : activeView === "history" ? (
          <div className="flex-1 overflow-auto safe-bottom">
            <HistoryView />
          </div>
        ) : activeView === "density" ? (
          <div className="flex-1 overflow-auto safe-bottom">
            <DensityView shedPlacement={shedPlacement} farmConfig={farmConfig} />
          </div>
        ) : activeView === "summary" ? (
          <div className="flex-1 overflow-auto safe-bottom">
            <SummaryView sheets={sheets} edits={edits} handleEdit={handleEdit} farmConfig={farmConfig} />
          </div>
        ) : activeView === "morts" ? (
          <div className="flex-1 overflow-auto safe-bottom">
            <MortsView sheets={sheets} edits={edits} handleEdit={handleEdit} farmConfig={farmConfig} mortsLog={mortsLog} setMortsLog={setMortsLog} cullsLog={cullsLog} setCullsLog={setCullsLog} />
          </div>
        ) : activeView === "batchResults" ? (
          <div className="flex-1 overflow-auto safe-bottom">
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
              onCatchMapChange={(next: CatchMap) => {
                setCatchMap(next);
                // Build shedNum → sheet index map (same logic as shedPlacement)
                const shedSheetIdx = new Map<number, number>();
                let _sc = 0;
                for (let i = 0; i < sheets.length; i++) {
                  const tab = sheets[i].name.trim().toUpperCase();
                  if (tab === "WEEKLY STOCK TAKE" || tab === "CONSUMPTION GUIDE") continue;
                  if (tab.includes("SHED")) {
                    const gid = SHED_SHEET_ORDER[_sc] ?? (_sc + 1);
                    shedSheetIdx.set(gid * 2 - 1, i);
                    shedSheetIdx.set(gid * 2, i);
                    _sc++;
                  }
                }
                // Compute ages to write (new) and ages to clear (removed from old)
                const toWrite = new Map<number, Map<number, number>>(); // sheetIdx → age → birds sum
                const toClear = new Map<number, Set<number>>();         // sheetIdx → ages to clear
                Object.entries(catchMap).forEach(([sn, rows]) => {
                  const si = shedSheetIdx.get(Number(sn)); if (si === undefined) return;
                  if (!toClear.has(si)) toClear.set(si, new Set());
                  rows.forEach(r => { const age = parseInt(r.age, 10); if (age > 0) toClear.get(si)!.add(age); });
                });
                Object.entries(next).forEach(([sn, rows]) => {
                  const si = shedSheetIdx.get(Number(sn)); if (si === undefined) return;
                  if (!toWrite.has(si)) toWrite.set(si, new Map());
                  const ageMap = toWrite.get(si)!;
                  rows.forEach(r => { const age = parseInt(r.age, 10); const birds = parseFloat(r.birds) || 0; if (age > 0 && birds > 0) ageMap.set(age, (ageMap.get(age) ?? 0) + birds); });
                });
                // Apply edits to shed sheets
                new Set([...toWrite.keys(), ...toClear.keys()]).forEach(si => {
                  const sh = sheets[si]; if (!sh) return;
                  let ds = 12;
                  for (let r = 9; r <= 16; r++) {
                    const v0 = String(sh.cells.get(`${r},0`)?.value ?? "").trim();
                    const v1 = String(sh.cells.get(`${r},1`)?.value ?? "").trim();
                    if (v0 === "1" || v1 === "1") { ds = r; break; }
                  }
                  const ageMap = toWrite.get(si);
                  toClear.get(si)?.forEach(age => { if (!ageMap?.has(age)) handleEdit(si, `${ds + age - 1},13`, ""); });
                  ageMap?.forEach((birds, age) => handleEdit(si, `${ds + age - 1},13`, String(Math.round(birds))));
                });
              }}
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
              <div className="flex-1 overflow-auto safe-bottom">
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

      {/* ── Farm Buddy Sync Modal ── */}
      {showSiloSync && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowSiloSync(false); }}
        >
          <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 8px 40px rgba(0,0,0,0.28)", width: 420, maxWidth: "94vw", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ background: "var(--pm-primary)", color: "#fff", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>🔄 Sync from Silo Base Mate</div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
              </div>
              <button onClick={() => setShowSiloSync(false)} style={{ background: "none", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: "18px 20px 20px", fontFamily: "Inter,'Segoe UI',sans-serif" }}>
              {siloSyncLoading ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "#666", fontSize: 14 }}>Loading today's readings…</div>
              ) : siloSyncError && siloSyncReadings.length === 0 ? (
                <div style={{ color: "#dc2626", fontSize: 14, padding: "12px 0" }}>{siloSyncError}</div>
              ) : (
                <>
                  {/* Unit note — always tonnes */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f0f7f3", border: "1px solid #b2d8c6", borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>
                    <span style={{ fontSize: 16 }}>⚖️</span>
                    <span style={{ fontSize: 12, color: "#1a6644", fontWeight: 600 }}>Auto-converting tonnes → kg &nbsp;(×1000)</span>
                    <span style={{ fontSize: 11, color: "#555" }}>e.g. 20 t → 20,000 kg</span>
                  </div>

                  {/* Readings grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "6px 8px", marginBottom: 16, fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: "#888", textTransform: "uppercase", fontSize: 11 }}>Shed</div>
                    <div style={{ fontWeight: 700, color: "#FF3C00", textAlign: "center" }}>Silo A</div>
                    <div style={{ fontWeight: 700, color: "#3b82f6", textAlign: "center" }}>Silo B</div>
                    <div style={{ fontWeight: 700, color: "#f59e0b", textAlign: "center" }}>Silo C</div>
                    {siloSyncReadings.filter(s => {
                      const farmCfg = farmConfig.shedGroups?.find(g => g.shedGroupId === s.shedGroupId);
                      return farmCfg ? farmCfg.active !== false : true;
                    }).map(shed => {
                      const a = shed.silos.find(s => s.letter === "A");
                      const b = shed.silos.find(s => s.letter === "B");
                      const c = shed.silos.find(s => s.letter === "C");
                      const fmt = (silo: typeof a) => {
                        if (!silo?.saved || silo.amountRemaining == null) return <span style={{ color: "#ccc" }}>—</span>;
                        const eu = siloSyncUnitOverride === "t" ? "t" : (silo.unit ?? "kg");
                        const kg = toKg(silo.amountRemaining, eu);
                        const isTonne = eu.trim().toLowerCase() !== "kg";
                        return <span>{kg.toLocaleString()} kg{isTonne && <span style={{ color: "#888", fontSize: 10 }}> ({silo.amountRemaining}t)</span>}</span>;
                      };
                      return (
                        <>
                          <div style={{ fontWeight: 600, color: "#333", fontSize: 12 }}>{shed.shedGroupName}</div>
                          <div style={{ textAlign: "center", color: a?.saved ? "#111" : "#ccc" }}>{fmt(a)}</div>
                          <div style={{ textAlign: "center", color: b?.saved ? "#111" : "#ccc" }}>{fmt(b)}</div>
                          <div style={{ textAlign: "center", color: c?.saved ? "#111" : "#ccc" }}>{fmt(c)}</div>
                        </>
                      );
                    })}
                  </div>

                  {siloSyncError && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 10 }}>{siloSyncError}</div>}

                  {/* Mode selector */}
                  <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1.5px solid #e0e0e0", marginBottom: 14 }}>
                    <button
                      onClick={() => setSiloSyncMode("correct")}
                      style={{ flex: 1, padding: "8px 10px", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: siloSyncMode === "correct" ? "#dc2626" : "#f5f5f5", color: siloSyncMode === "correct" ? "#fff" : "#666", transition: "all 0.15s" }}
                    >
                      ✏ Correct today's entry
                    </button>
                    <button
                      onClick={() => setSiloSyncMode("next")}
                      style={{ flex: 1, padding: "8px 10px", border: "none", borderLeft: "1.5px solid #e0e0e0", fontSize: 12, fontWeight: 700, cursor: "pointer", background: siloSyncMode === "next" ? "var(--pm-primary)" : "#f5f5f5", color: siloSyncMode === "next" ? "#fff" : "#666", transition: "all 0.15s" }}
                    >
                      ➕ Add as new day
                    </button>
                  </div>
                  <p style={{ fontSize: 11, color: "#888", marginBottom: 12, marginTop: -8 }}>
                    {siloSyncMode === "correct"
                      ? "Overwrites today's silo kg values (use this to fix a mistake)"
                      : "Writes to the next empty row in the spreadsheet"}
                  </p>

                  {/* Clear & Resync */}
                  <div style={{ background: "#fff8f0", border: "1.5px solid #f5cba7", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#b05a00", marginBottom: 4 }}>🧹 Readings scattered across rows?</div>
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>This wipes ALL silo values from the spreadsheet and writes only today's reading to the correct row.</div>
                    <button
                      onClick={clearAndResync}
                      style={{ width: "100%", padding: "8px", borderRadius: 7, border: "none", background: "#e67e22", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                    >
                      🧹 Clear All Silo Readings & Sync Today Only
                    </button>
                  </div>


                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button onClick={() => setShowSiloSync(false)} style={{ padding: "8px 18px", borderRadius: 7, border: "1.5px solid #ddd", background: "#f5f5f5", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      Cancel
                    </button>
                    <button onClick={applySiloSync} style={{ padding: "8px 22px", borderRadius: 7, border: "none", background: siloSyncMode === "correct" ? "#dc2626" : "var(--pm-primary)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      {siloSyncMode === "correct" ? "Overwrite & Correct" : "Apply to Spreadsheet"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Feed Alert Modal ── */}
      {showFeedAlert && (() => {
        const activeAlerts = feedAlerts.filter(a => !isSnoozed(a.shedGroupName));
        const snoozedAlerts = feedAlerts.filter(a => isSnoozed(a.shedGroupName));
        const allGood = feedAlerts.length === 0;
        const hasCrit = activeAlerts.some(a => a.urgency === "critical");
        return (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowFeedAlert(false); }}
        >
          <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 8px 40px rgba(0,0,0,0.25)", width: 420, maxWidth: "96vw", maxHeight: "88vh", overflowY: "auto", display: "flex", flexDirection: "column" }}>

            {/* Header */}
            <div style={{ background: allGood ? "#16a34a" : hasCrit ? "#dc2626" : "#f59e0b", color: allGood || hasCrit ? "#fff" : "#7c2d12", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: "14px 14px 0 0", flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>🔔 Feed On Hand</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>
                  {allGood ? "All sheds have enough feed through to catch" : `${activeAlerts.length} shed${activeAlerts.length !== 1 ? "s" : ""} need attention`}
                </div>
              </div>
              <button onClick={() => setShowFeedAlert(false)} style={{ background: "none", border: "none", color: "inherit", fontSize: 22, cursor: "pointer", lineHeight: 1, opacity: 0.8 }}>×</button>
            </div>

            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>

              {/* All clear */}
              {allGood && (
                <div style={{ textAlign: "center", padding: "20px 0", color: "#16a34a" }}>
                  <div style={{ fontSize: 36, marginBottom: 6 }}>✅</div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>All sheds are covered</div>
                  <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>Feed on hand will last past each shed's estimated catch day.</div>
                </div>
              )}

              {/* Active alerts */}
              {activeAlerts.map(a => {
                const urgBg  = a.urgency === "critical" ? "#fee2e2" : a.urgency === "warning" ? "#fff7ed" : "#fefce8";
                const urgBdr = a.urgency === "critical" ? "#fca5a5" : a.urgency === "warning" ? "#fdba74" : "#fde68a";
                const urgClr = a.urgency === "critical" ? "#7f1d1d" : a.urgency === "warning" ? "#78350f" : "#713f12";
                const icon   = a.urgency === "critical" ? "🔴" : a.urgency === "warning" ? "🟠" : "🟡";
                const catchCtx = a.daysToCAatch != null
                  ? (a.daysToCAatch <= 0 ? "catch day reached" : `catch in ~${Math.round(a.daysToCAatch)} day${Math.round(a.daysToCAatch) !== 1 ? "s" : ""}`)
                  : null;
                return (
                  <div key={a.shedGroupName} style={{ background: urgBg, border: `1.5px solid ${urgBdr}`, borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: urgClr, marginBottom: 2 }}>{a.shedGroupName}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 12, background: "rgba(0,0,0,0.07)", borderRadius: 4, padding: "2px 7px", fontWeight: 600, color: urgClr }}>
                            {a.daysRemaining.toFixed(1)} days of feed left
                          </span>
                          <span style={{ fontSize: 12, background: "rgba(0,0,0,0.07)", borderRadius: 4, padding: "2px 7px", color: "#555" }}>
                            {(a.feedOnHand / 1000).toFixed(1)} t on hand
                          </span>
                          <span style={{ fontSize: 12, background: "rgba(0,0,0,0.07)", borderRadius: 4, padding: "2px 7px", color: "#555" }}>
                            {(a.dailyUsage / 1000).toFixed(1)} t/day usage
                          </span>
                          {catchCtx && (
                            <span style={{ fontSize: 12, background: "#e0f2fe", borderRadius: 4, padding: "2px 7px", color: "#0369a1", fontWeight: 600 }}>
                              📅 {catchCtx}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: urgClr, fontWeight: 700, marginBottom: 10 }}>
                          {a.urgency === "critical"
                            ? "⚠ CRITICAL — Feed may run out before catch. Order now."
                            : a.urgency === "warning"
                            ? "Order needed within next 24–48 hours to avoid shortage."
                            : "Feed is low — monitor and plan your next order."}
                        </div>
                        {/* Snooze buttons */}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: "#888", alignSelf: "center" }}>Snooze:</span>
                          {[8, 24, 48].map(h => (
                            <button key={h} onClick={() => snoozeAlert(a.shedGroupName, h)}
                              style={{ background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 5, padding: "3px 9px", fontSize: 11, fontWeight: 700, color: "#374151", cursor: "pointer" }}>
                              {h}h
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Snoozed alerts */}
              {snoozedAlerts.length > 0 && (
                <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 10 }}>
                  <div style={{ fontSize: 11, color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Snoozed</div>
                  {snoozedAlerts.map(a => {
                    const expMs = alertSnooze[a.shedGroupName];
                    const minsLeft = Math.ceil((expMs - Date.now()) / 60000);
                    const label = minsLeft < 60 ? `${minsLeft}m` : `${Math.ceil(minsLeft/60)}h`;
                    return (
                      <div key={a.shedGroupName} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, background: "#f9fafb", border: "1px solid #e5e7eb", marginBottom: 6 }}>
                        <span style={{ fontSize: 14 }}>😴</span>
                        <span style={{ flex: 1, fontSize: 13, color: "#555", fontWeight: 600 }}>{a.shedGroupName}</span>
                        <span style={{ fontSize: 11, color: "#aaa" }}>wakes in {label}</span>
                        <button onClick={() => snoozeAlert(a.shedGroupName, 0)}
                          style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 5, padding: "2px 8px", fontSize: 11, color: "#374151", cursor: "pointer" }}>
                          Wake
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* How it works note */}
              <div style={{ padding: "10px 14px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: 12, color: "#166534", marginTop: 4 }}>
                <strong>Smart filtering:</strong> Alerts are automatically suppressed when feed will last past the shed's estimated catch day. Only genuine shortfalls are shown.
              </div>
            </div>
          </div>
        </div>
        );
      })()}

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
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <label style={{ display: "block", fontWeight: 700, fontSize: 13, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.5 }}>{t("farmName")}</label>
                  <span style={{ fontSize: 10, fontWeight: 700, background: "var(--pm-primary-soft)", color: "var(--pm-primary)", borderRadius: 20, padding: "1px 8px", border: "1px solid var(--pm-primary)", letterSpacing: 0.3 }}>Synced with Silo Base Mate</span>
                </div>
                <input
                  value={settingsFarmName}
                  onChange={e => setSettingsFarmName(e.target.value)}
                  placeholder="e.g. Double B Farm"
                  style={{ width: "100%", border: "1.5px solid #c8d8c8", borderRadius: 6, padding: "8px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                />
              </div>

              {/* Batch Number */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <label style={{ display: "block", fontWeight: 700, fontSize: 13, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.5 }}>Batch Number</label>
                  <span style={{ fontSize: 10, fontWeight: 700, background: "var(--pm-primary-soft)", color: "var(--pm-primary)", borderRadius: 20, padding: "1px 8px", border: "1px solid var(--pm-primary)", letterSpacing: 0.3 }}>Synced with Silo Base Mate</span>
                </div>
                <input
                  type="number"
                  min="1"
                  value={settingsBatchNum}
                  onChange={e => setSettingsBatchNum(e.target.value)}
                  placeholder="e.g. 42"
                  style={{ width: "100%", border: "1.5px solid #c8d8c8", borderRadius: 6, padding: "8px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                />
                <p style={{ fontSize: 12, color: "#666", marginTop: 5 }}>Shown in Batch Results and End of Batch reports.</p>
              </div>

              {/* Default Recording Unit */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <label style={{ display: "block", fontWeight: 700, fontSize: 13, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.5 }}>Default Silo Unit</label>
                  <span style={{ fontSize: 10, fontWeight: 700, background: "var(--pm-primary-soft)", color: "var(--pm-primary)", borderRadius: 20, padding: "1px 8px", border: "1px solid var(--pm-primary)", letterSpacing: 0.3 }}>Synced with Silo Base Mate</span>
                </div>
                <p style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>Default unit used when recording silo readings in Silo Base Mate.</p>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["kg", "t"] as const).map(u => (
                    <button
                      key={u}
                      onClick={() => setSettingsDefaultUnit(u)}
                      style={{
                        flex: 1, padding: "9px 0", borderRadius: 7, fontWeight: 700, fontSize: 14, cursor: "pointer",
                        border: `2px solid ${settingsDefaultUnit === u ? "var(--pm-primary)" : "#ddd"}`,
                        background: settingsDefaultUnit === u ? "var(--pm-primary-soft)" : "#f9f9f9",
                        color: settingsDefaultUnit === u ? "var(--pm-primary)" : "#888",
                      }}
                    >
                      {u === "kg" ? "kg  (kilograms)" : "t  (tonnes)"}
                    </button>
                  ))}
                </div>
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
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <label style={{ display: "block", fontWeight: 700, fontSize: 13, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.5 }}>{t("activeSheds")}</label>
                  <span style={{ fontSize: 10, fontWeight: 700, background: "var(--pm-primary-soft)", color: "var(--pm-primary)", borderRadius: 20, padding: "1px 8px", border: "1px solid var(--pm-primary)", letterSpacing: 0.3 }}>Synced with Silo Base Mate</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(() => {
                    // Build a map from shedGroupId → sheet name for sheets that exist in the workbook.
                    const sheetNameByGid = new Map<number, string>();
                    let sc = 0;
                    for (const s of sheets) {
                      const n = s.name.trim().toUpperCase();
                      if (!n.includes("SHED") || n.includes("WEEKLY") || n.includes("CONSUMPTION")) continue;
                      const gid = SHED_SHEET_ORDER[sc] ?? (sc + 1);
                      sc++;
                      if (!DISABLED_SHED_GROUPS.has(gid)) sheetNameByGid.set(gid, s.name);
                    }
                    // Show only groups that have an actual shed sheet in the loaded file.
                    // If no file loaded yet, fall back to 12 groups so the user can pre-configure.
                    const maxGid = sheetNameByGid.size > 0
                      ? Math.max(...sheetNameByGid.keys())
                      : 12;
                    const groupIds: number[] = [];
                    for (let id = 1; id <= maxGid; id++) {
                      if (!DISABLED_SHED_GROUPS.has(id) && (sheetNameByGid.has(id) || sheetNameByGid.size === 0)) groupIds.push(id);
                    }

                    return groupIds.map(shedGroupId => {
                      const sheetName = sheetNameByGid.get(shedGroupId);
                      const existing = farmConfig.shedGroups?.find(g => g.shedGroupId === shedGroupId);
                      // Derive default name: from sheet name if available, else from formula.
                      const m = sheetName?.match(/(\d+)\s*&\s*(\d+)/);
                      const defaultName = m
                        ? `Shed ${m[1]} & ${m[2]}`
                        : sheetName
                          ? sheetName.replace(/SHED\s*/i, "Shed ").trim()
                          : `Shed ${shedGroupId * 2 - 1} & ${shedGroupId * 2}`;
                      const customName = (existing as any)?.customName ?? "";
                      const isActive = existing ? existing.active !== false : true;
                      const hasSheet = sheetNameByGid.has(shedGroupId);

                      const saveGroup = (patch: { active?: boolean; customName?: string; floorAreaM2?: number }) => {
                        // Only save groups that exist in the loaded file (or all if no file loaded).
                        const idsToSave = sheetNameByGid.size > 0 ? [...sheetNameByGid.keys()] : SHED_SHEET_ORDER;
                        const groups = idsToSave.map(id => {
                          const ex = farmConfig.shedGroups?.find(g => g.shedGroupId === id);
                          const act = ex ? ex.active !== false : true;
                          const cn  = ex?.customName ?? "";
                          const fa  = ex?.floorAreaM2 ?? 0;
                          if (id === shedGroupId) {
                            return { shedGroupId: id, active: patch.active ?? act, customName: patch.customName ?? cn, floorAreaM2: patch.floorAreaM2 !== undefined ? patch.floorAreaM2 : fa, silos: ex?.silos ?? [] };
                          }
                          return { shedGroupId: id, active: act, customName: cn, floorAreaM2: fa, silos: ex?.silos ?? [] };
                        });
                        const updated = { ...farmConfig, shedGroups: groups };
                        saveFarmConfig(updated);
                        setFarmConfig(updated);
                      };

                      return (
                        <div key={shedGroupId} style={{ borderRadius: 8, background: isActive ? "var(--pm-primary-soft)" : "#f5f5f5", border: `1.5px solid ${isActive ? "var(--pm-primary)" : "#ddd"}`, opacity: hasSheet ? 1 : 0.6, padding: "8px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <input
                              type="checkbox"
                              checked={isActive}
                              onChange={() => saveGroup({ active: !isActive })}
                              style={{ width: 17, height: 17, accentColor: "var(--pm-primary)", cursor: "pointer", flexShrink: 0 }}
                            />
                            <input
                              type="text"
                              value={customName}
                              placeholder={defaultName}
                              onChange={e => saveGroup({ customName: e.target.value })}
                              style={{ flex: 1, border: "1px solid", borderColor: isActive ? "rgba(26,92,54,0.3)" : "#ddd", borderRadius: 5, padding: "3px 8px", fontSize: 13, fontWeight: 600, color: isActive ? "var(--pm-primary)" : "#888", background: "transparent", outline: "none", minWidth: 0 }}
                            />
                            {isActive && hasSheet && <span style={{ fontSize: 11, color: "#2d8653", fontWeight: 700, whiteSpace: "nowrap" }}>{t("active")}</span>}
                            {!hasSheet && <span style={{ fontSize: 10, color: "#aaa", whiteSpace: "nowrap" }}>no sheet</span>}
                          </div>
                          {isActive && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
                              <span style={{ fontSize: 11, color: "#888", whiteSpace: "nowrap" }}>Floor area:</span>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                placeholder="0"
                                value={existing?.floorAreaM2 ?? ""}
                                onChange={e => saveGroup({ floorAreaM2: parseFloat(e.target.value) || 0 })}
                                style={{ width: 72, border: "1px solid", borderColor: "rgba(26,92,54,0.3)", borderRadius: 5, padding: "3px 7px", fontSize: 13, fontWeight: 600, color: "var(--pm-primary)", background: "transparent", outline: "none", textAlign: "right" }}
                              />
                              <span style={{ fontSize: 12, color: "#666", fontWeight: 600 }}>m²</span>
                              {(existing?.floorAreaM2 ?? 0) > 0 && (
                                <span style={{ fontSize: 10, color: "#7b3fc4", background: "#f5eeff", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>
                                  {existing!.floorAreaM2!.toLocaleString()} m² set
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
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
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <label style={{ display: "block", fontWeight: 700, fontSize: 13, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.5 }}>{t("themeLabel")}</label>
                  <span style={{ fontSize: 10, fontWeight: 700, background: "var(--pm-primary-soft)", color: "var(--pm-primary)", borderRadius: 20, padding: "1px 8px", border: "1px solid var(--pm-primary)", letterSpacing: 0.3 }}>Synced with Silo Base Mate</span>
                </div>
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

              {/* Send to Phone — QR Code */}
              <div>
                <label style={{ display: "block", fontWeight: 700, fontSize: 13, color: "var(--pm-primary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Send to Phone</label>
                <p style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>Scan with your phone camera to open Silo Base Mate on your phone.</p>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <div style={{ padding: 10, background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.10)" }}>
                    <QRCodeSVG value={`${window.location.origin}/silo-tracker/`} size={170} level="M" includeMargin={false} />
                  </div>
                  <p style={{ fontSize: 11, color: "#999", textAlign: "center", maxWidth: 200 }}>
                    After opening on your phone, tap Settings → Add to Home Screen to install it.
                  </p>
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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <label style={{ fontWeight: 700, fontSize: 13, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.5 }}>{t("startNewBatch")}</label>
                  <button
                    onClick={() => setNewBatchLocked(l => !l)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, border: "1.5px solid", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                      background: newBatchLocked ? "#fff3cd" : "#d4edda",
                      color: newBatchLocked ? "#856404" : "#155724",
                      borderColor: newBatchLocked ? "#ffc107" : "#28a745" }}
                  >
                    {newBatchLocked ? "🔒 Locked" : "🔓 Unlocked"}
                  </button>
                </div>
                <p style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>
                  {newBatchLocked
                    ? "Unlock to enable starting a new batch. Clears all delivery and silo records — cannot be undone."
                    : "⚠️ Batch lock is OFF. Button below is now active — use with care."}
                </p>
                <button
                  onClick={() => { if (!newBatchLocked) { setShowSettings(false); resetForNewBatch(); } }}
                  disabled={newBatchLocked}
                  style={{ width: "100%", background: newBatchLocked ? "#e0e0e0" : "#c0392b", color: newBatchLocked ? "#999" : "#fff", border: "none", borderRadius: 7, padding: "10px 0", fontWeight: 700, fontSize: 14, cursor: newBatchLocked ? "not-allowed" : "pointer", transition: "all 0.2s" }}
                >
                  {newBatchLocked ? "🔒 " : ""}{t("newBatchBtn")}
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
                  localStorage.setItem("silo-default-unit", settingsDefaultUnit);
                  window.dispatchEvent(new StorageEvent("storage", { key: "silo-default-unit", newValue: settingsDefaultUnit }));
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
      <PwaUpdateBanner />
    </div>
    </LanguageContext.Provider>
  );
}
