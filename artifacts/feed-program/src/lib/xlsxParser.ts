/**
 * Minimal OOXML (.xlsx) parser built on JSZip + regex XML parsing.
 * Produces a SheetJS-compatible WorkBook/WorkSheet object structure so that
 * existing App.tsx code continues to work without the vulnerable xlsx package.
 *
 * Uses regex rather than DOMParser for fast parsing of large worksheet files.
 */
import JSZip from "jszip";

// ── Public types (mirror the SheetJS API surface used by App.tsx) ────────────

export interface CellObject {
  t: "s" | "n" | "d" | "b" | "e" | "z";
  v?: string | number | boolean | Date;
  w?: string;
  s?: CellStyle;
}

export interface CellStyle {
  patternType?: string;
  fgColor?: { rgb?: string };
  alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean };
  border?: {
    top?: BorderSide;
    bottom?: BorderSide;
    left?: BorderSide;
    right?: BorderSide;
  };
  bold?: boolean;
  sz?: number;
  italic?: boolean;
}

interface BorderSide {
  style?: string;
  color?: { rgb?: string };
}

export interface WorkSheet {
  "!ref"?: string;
  "!merges"?: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>;
  "!cols"?: Array<{ wpx?: number; wch?: number } | undefined>;
  "!rows"?: Array<{ hpx?: number; hpt?: number } | undefined>;
  [cellAddr: string]: unknown;
}

export interface WorkBook {
  SheetNames: string[];
  Sheets: { [name: string]: WorkSheet };
  Workbook?: {
    Sheets?: Array<{ TabColor?: { rgb?: string } }>;
  };
  Styles?: {
    Fonts?: StyleFont[];
    Fills?: StyleFill[];
    CellXf?: StyleXf[];
  };
}

interface StyleFont {
  bold?: boolean;
  sz?: number;
  italic?: boolean;
  color?: { rgb?: string };
}

interface StyleFill {
  patternType?: string;
  fgColor?: { rgb?: string };
}

interface StyleXf {
  fontId?: number;
  fillId?: number;
  numFmtId?: number;
}

// ── Utility functions (replacing XLSX.utils.*) ────────────────────────────────

export function encodeCell(cell: { r: number; c: number }): string {
  let col = cell.c;
  let colStr = "";
  while (col >= 0) {
    colStr = String.fromCharCode(65 + (col % 26)) + colStr;
    col = Math.floor(col / 26) - 1;
  }
  return colStr + (cell.r + 1);
}

export function decodeRange(ref: string): {
  s: { r: number; c: number };
  e: { r: number; c: number };
} {
  const parts = ref.split(":");
  return { s: decodeCell(parts[0]), e: decodeCell(parts[1] ?? parts[0]) };
}

function decodeCell(addr: string): { r: number; c: number } {
  const m = addr.match(/^([A-Z]+)(\d+)$/);
  if (!m) return { r: 0, c: 0 };
  const colStr = m[1];
  const rowNum = parseInt(m[2], 10) - 1;
  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }
  return { r: rowNum, c: col - 1 };
}

function encodeRange(minR: number, minC: number, maxR: number, maxC: number): string {
  return `${encodeCell({ r: minR, c: minC })}:${encodeCell({ r: maxR, c: maxC })}`;
}

// ── XML attribute helpers (regex-based, no DOMParser) ────────────────────────

/** Extract the value of a simple attribute from an XML opening tag string */
function getAttr(tag: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}="([^"]*)"`, "i");
  return tag.match(re)?.[1];
}

/** Decode XML entities in text content */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// ── Date helpers ──────────────────────────────────────────────────────────────

const DATE_NUMFMT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function isDateFormatStr(fmt: string): boolean {
  const stripped = fmt.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
  return /[yYdD]/.test(stripped);
}

function excelDateToJs(serial: number): Date {
  const MS_PER_DAY = 86400000;
  const epoch = new Date(1899, 11, 30).getTime();
  return new Date(epoch + serial * MS_PER_DAY);
}

// ── Shared strings parser ─────────────────────────────────────────────────────

function parseSharedStrings(xml: string): string[] {
  const result: string[] = [];
  // Each <si>...</si> is one shared string (may contain multiple <t> for rich text)
  for (const siMatch of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const siContent = siMatch[1];
    const parts: string[] = [];
    for (const tMatch of siContent.matchAll(/<t(?:[^>]*)>([^<]*)<\/t>/g)) {
      parts.push(decodeXmlEntities(tMatch[1]));
    }
    result.push(parts.join(""));
  }
  return result;
}

// ── Styles parser ─────────────────────────────────────────────────────────────

function parseStyles(xml: string): {
  fills: StyleFill[];
  fonts: StyleFont[];
  cellXfs: StyleXf[];
  numFmts: Map<number, string>;
} {
  const fills: StyleFill[] = [];
  const fonts: StyleFont[] = [];
  const cellXfs: StyleXf[] = [];
  const numFmts = new Map<number, string>([
    [14, "m/d/yyyy"], [15, "d-mmm-yy"], [16, "d-mmm"], [17, "mmm-yy"],
    [18, "h:mm AM/PM"], [19, "h:mm:ss AM/PM"], [20, "h:mm"], [21, "h:mm:ss"],
    [22, "m/d/yy h:mm"], [45, "mm:ss"], [46, "[h]:mm:ss"], [47, "mmss.0"],
  ]);

  // numFmts
  for (const m of xml.matchAll(/<numFmt\b([^/]*?)\/>/g)) {
    const id = parseInt(getAttr(m[1], "numFmtId") ?? "0", 10);
    const code = getAttr(m[1], "formatCode") ?? "";
    numFmts.set(id, code);
  }

  // fills
  const fillsBlock = xml.match(/<fills\b[^>]*>([\s\S]*?)<\/fills>/)?.[1] ?? "";
  for (const fillM of fillsBlock.matchAll(/<fill>([\s\S]*?)<\/fill>/g)) {
    const content = fillM[1];
    const pfM = content.match(/<patternFill\b([^>]*)>/);
    const patternType = pfM ? getAttr(pfM[1], "patternType") : undefined;
    const fgM = content.match(/<fgColor\b([^/]*?)\/>/);
    const fgRgb = fgM ? getAttr(fgM[1], "rgb") : undefined;
    fills.push({ patternType, fgColor: fgRgb ? { rgb: fgRgb } : undefined });
  }

  // fonts
  const fontsBlock = xml.match(/<fonts\b[^>]*>([\s\S]*?)<\/fonts>/)?.[1] ?? "";
  for (const fontM of fontsBlock.matchAll(/<font>([\s\S]*?)<\/font>/g)) {
    const content = fontM[1];
    const bold = /<b\s*\/>|<b>/.test(content);
    const italic = /<i\s*\/>|<i>/.test(content);
    const szM = content.match(/<sz\b([^/]*?)\/>/);
    const sz = szM ? parseFloat(getAttr(szM[1], "val") ?? "11") : undefined;
    const colorM = content.match(/<color\b([^/]*?)\/>/);
    const colorRgb = colorM ? getAttr(colorM[1], "rgb") : undefined;
    fonts.push({ bold, italic, sz, color: colorRgb ? { rgb: colorRgb } : undefined });
  }

  // cellXfs
  const cellXfsBlock = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "";
  for (const xfM of cellXfsBlock.matchAll(/<xf\b([^>]*?)(?:\/>|>[\s\S]*?<\/xf>)/g)) {
    const attrs = xfM[1];
    cellXfs.push({
      fontId: parseInt(getAttr(attrs, "fontId") ?? "0", 10),
      fillId: parseInt(getAttr(attrs, "fillId") ?? "0", 10),
      numFmtId: parseInt(getAttr(attrs, "numFmtId") ?? "0", 10),
    });
  }

  return { fills, fonts, cellXfs, numFmts };
}

// ── Workbook parser ───────────────────────────────────────────────────────────

function parseWorkbook(wbXml: string, wbRelsXml: string): Array<{ name: string; filePath: string }> {
  // Build rId → target map from relationships
  const ridToTarget = new Map<string, string>();
  for (const m of wbRelsXml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    ridToTarget.set(m[1], m[2]);
  }

  const sheets: Array<{ name: string; filePath: string }> = [];
  // Match <sheet .../> or <sheet ...></sheet> elements
  for (const m of wbXml.matchAll(/<sheet\b([^>]*?)(?:\/>|>[\s\S]*?<\/sheet>)/g)) {
    const attrs = m[1];
    const name = decodeXmlEntities(getAttr(attrs, "name") ?? "");
    // r:id attribute — try both formats
    const rId = getAttr(attrs, "r:id") ?? getAttr(attrs, "id") ?? "";
    const target = ridToTarget.get(rId) ?? "";
    if (!target) continue;
    const filePath = target.startsWith("worksheets/") ? `xl/${target}` : target;
    sheets.push({ name, filePath });
  }
  return sheets;
}

// ── Worksheet parser ──────────────────────────────────────────────────────────

interface ParsedWorksheet {
  ws: WorkSheet;
  tabRgb: string | undefined;
}

function parseWorksheet(
  wsXml: string,
  sharedStrings: string[],
  cellXfs: StyleXf[],
  fills: StyleFill[],
  fonts: StyleFont[],
  numFmts: Map<number, string>,
  options: { cellDates?: boolean; cellStyles?: boolean; raw?: boolean }
): ParsedWorksheet {
  const ws: WorkSheet = {};

  // Tab color
  const tabColorM = wsXml.match(/<tabColor\b([^/]*?)\/>/);
  const tabArgbRaw = tabColorM ? getAttr(tabColorM[1], "rgb") : undefined;
  const tabRgb = tabArgbRaw
    ? (tabArgbRaw.length === 8 ? tabArgbRaw.slice(2) : tabArgbRaw)
    : undefined;

  // Column widths
  const colsBlock = wsXml.match(/<cols\b[^>]*>([\s\S]*?)<\/cols>/)?.[1] ?? "";
  const cols: Array<{ wpx?: number; wch?: number } | undefined> = [];
  for (const colM of colsBlock.matchAll(/<col\b([^/]*?)\/>/g)) {
    const attrs = colM[1];
    const min = parseInt(getAttr(attrs, "min") ?? "1", 10) - 1;
    const max = parseInt(getAttr(attrs, "max") ?? "1", 10) - 1;
    const width = parseFloat(getAttr(attrs, "width") ?? "0");
    for (let c = min; c <= max; c++) {
      cols[c] = { wch: width };
    }
  }
  ws["!cols"] = cols;

  // Process sheetData row by row
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  const rowHeights: Array<{ hpx?: number; hpt?: number } | undefined> = [];

  // Extract sheetData block for cell parsing
  const sheetDataBlock = wsXml.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/)?.[1] ?? "";

  // Process each row
  for (const rowM of sheetDataBlock.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttrs = rowM[1];
    const rowContent = rowM[2];
    const rowNum = parseInt(getAttr(rowAttrs, "r") ?? "0", 10) - 1;
    const ht = getAttr(rowAttrs, "ht");
    if (ht) rowHeights[rowNum] = { hpt: parseFloat(ht) };

    // Process each cell in this row
    // Match self-closing <c .../> or <c ...>...</c>
    for (const cM of rowContent.matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const cAttrs = cM[1];
      const cContent = cM[2] ?? "";

      const addrStr = getAttr(cAttrs, "r") ?? "";
      if (!addrStr) continue;

      const cellRef = decodeCell(addrStr);
      const r = cellRef.r;
      const c = cellRef.c;
      minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      minC = Math.min(minC, c); maxC = Math.max(maxC, c);

      const t = getAttr(cAttrs, "t") ?? "n";
      const sIdx = parseInt(getAttr(cAttrs, "s") ?? "0", 10);

      // Extract <v>...</v> content
      const vText = cContent.match(/<v>([^<]*)<\/v>/)?.[1] ?? "";
      // Extract <is><t>...</t></is> inline string content
      const isText = (cContent.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? "")
        .replace(/<t>([^<]*)<\/t>/g, (_, s) => decodeXmlEntities(s));

      let cellT: CellObject["t"] = "z";
      let cellV: CellObject["v"];
      let cellW: string | undefined;

      if (t === "s") {
        const ssIdx = parseInt(vText, 10);
        const str = sharedStrings[ssIdx] ?? "";
        cellT = "s"; cellV = str; cellW = str;
      } else if (t === "inlineStr") {
        cellT = "s"; cellV = isText; cellW = isText;
      } else if (t === "b") {
        const bv = vText === "1" || vText === "true";
        cellT = "b"; cellV = bv; cellW = bv ? "TRUE" : "FALSE";
      } else if (t === "e") {
        cellT = "e"; cellV = vText;
      } else if (t === "str") {
        cellT = "s"; cellV = decodeXmlEntities(vText); cellW = decodeXmlEntities(vText);
      } else {
        // Numeric (default)
        const num = parseFloat(vText);
        if (!isNaN(num)) {
          const xf = cellXfs[sIdx];
          const numFmtId = xf?.numFmtId ?? 0;
          const fmtStr = numFmts.get(numFmtId) ?? "";
          const isDate =
            options.cellDates &&
            (DATE_NUMFMT_IDS.has(numFmtId) || isDateFormatStr(fmtStr));

          if (isDate) {
            const d = excelDateToJs(num);
            cellT = "d"; cellV = d;
            cellW = d.toLocaleDateString("en-AU");
          } else {
            cellT = "n"; cellV = num;
            cellW = options.raw ? vText : String(num);
          }
        }
      }

      if (cellT === "z") continue;

      // Style (fallback — richStyles from style-data.json is the primary source)
      let s: CellStyle | undefined;
      if (options.cellStyles && cellXfs.length > 0) {
        const xf = cellXfs[sIdx];
        if (xf) {
          const fill = fills[xf.fillId ?? 0];
          const font = fonts[xf.fontId ?? 0];
          s = {
            patternType: fill?.patternType,
            fgColor: fill?.fgColor,
            bold: font?.bold ?? false,
            sz: font?.sz ?? 11,
            italic: font?.italic ?? false,
          };
        }
      }

      ws[addrStr] = { t: cellT, v: cellV, w: cellW, s } as CellObject;
    }
  }

  ws["!rows"] = rowHeights;

  // Merges
  const merges: WorkSheet["!merges"] = [];
  const mergesBlock = wsXml.match(/<mergeCells\b[^>]*>([\s\S]*?)<\/mergeCells>/)?.[1] ?? "";
  for (const mergeM of mergesBlock.matchAll(/<mergeCell\b([^/]*?)\/>/g)) {
    const ref = getAttr(mergeM[1], "ref") ?? "";
    if (ref.includes(":")) {
      const rng = decodeRange(ref);
      merges.push(rng);
      minR = Math.min(minR, rng.s.r); maxR = Math.max(maxR, rng.e.r);
      minC = Math.min(minC, rng.s.c); maxC = Math.max(maxC, rng.e.c);
    }
  }
  ws["!merges"] = merges;

  if (minR !== Infinity) {
    ws["!ref"] = encodeRange(minR, minC, maxR, maxC);
  }

  return { ws, tabRgb };
}

// ── Main parser ───────────────────────────────────────────────────────────────

export async function parseXlsxBuffer(
  buf: ArrayBuffer,
  options: { cellDates?: boolean; cellStyles?: boolean; raw?: boolean } = {}
): Promise<WorkBook> {
  const zip = await JSZip.loadAsync(buf);

  const readFile = async (path: string): Promise<string> =>
    (await zip.file(path)?.async("string")) ?? "";

  // ── 1. Shared strings ───────────────────────────────────────────────────────
  const ssXml = await readFile("xl/sharedStrings.xml");
  const sharedStrings = ssXml ? parseSharedStrings(ssXml) : [];

  // ── 2. Styles ───────────────────────────────────────────────────────────────
  const stylesXml = await readFile("xl/styles.xml");
  const { fills, fonts, cellXfs, numFmts } = stylesXml
    ? parseStyles(stylesXml)
    : { fills: [], fonts: [], cellXfs: [], numFmts: new Map<number, string>() };

  // ── 3. Workbook & relationships ─────────────────────────────────────────────
  const [wbXml, wbRelsXml] = await Promise.all([
    readFile("xl/workbook.xml"),
    readFile("xl/_rels/workbook.xml.rels"),
  ]);
  const sheetDefs = parseWorkbook(wbXml, wbRelsXml);

  // ── 4. Worksheets ───────────────────────────────────────────────────────────
  const SheetNames: string[] = [];
  const Sheets: { [name: string]: WorkSheet } = {};
  const wbSheets: Array<{ TabColor?: { rgb?: string } }> = [];

  for (const { name, filePath } of sheetDefs) {
    const wsXml = await readFile(filePath);
    if (!wsXml) continue;

    SheetNames.push(name);
    const { ws, tabRgb } = parseWorksheet(wsXml, sharedStrings, cellXfs, fills, fonts, numFmts, options);
    wbSheets.push({ TabColor: tabRgb ? { rgb: tabRgb } : undefined });
    Sheets[name] = ws;
  }

  return {
    SheetNames,
    Sheets,
    Workbook: { Sheets: wbSheets },
    Styles: { Fonts: fonts, Fills: fills, CellXf: cellXfs },
  };
}
