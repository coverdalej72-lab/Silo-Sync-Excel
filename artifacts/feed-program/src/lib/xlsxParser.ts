/**
 * Minimal OOXML (.xlsx) parser built on JSZip + DOMParser.
 * Produces a SheetJS-compatible WorkBook/WorkSheet object structure so that
 * existing App.tsx code continues to work without the vulnerable xlsx package.
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

// ── XML helpers ───────────────────────────────────────────────────────────────

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function attr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

// ── Date helpers ──────────────────────────────────────────────────────────────

// Built-in date numFmt IDs in OOXML
const DATE_NUMFMT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function isDateFormatStr(fmt: string): boolean {
  // Strip quoted strings and bracketed codes, then look for date/time tokens
  const stripped = fmt.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
  return /[yYdD]/.test(stripped);
}

function excelDateToJs(serial: number): Date {
  // Excel epoch: serial 1 = Jan 1 1900 (with the 1900 leap-year bug)
  const MS_PER_DAY = 86400000;
  const epoch = new Date(1899, 11, 30).getTime(); // Dec 30, 1899
  return new Date(epoch + serial * MS_PER_DAY);
}

// ── Main parser ───────────────────────────────────────────────────────────────

export async function parseXlsxBuffer(
  buf: ArrayBuffer,
  options: { cellDates?: boolean; cellStyles?: boolean; raw?: boolean } = {}
): Promise<WorkBook> {
  const zip = await JSZip.loadAsync(buf);

  // ── 1. Shared strings ───────────────────────────────────────────────────────
  const sharedStrings: string[] = [];
  const ssXml = await zip.file("xl/sharedStrings.xml")?.async("string") ?? "";
  if (ssXml) {
    const doc = parseXml(ssXml);
    for (const si of Array.from(doc.getElementsByTagName("si"))) {
      const parts: string[] = [];
      for (const t of Array.from(si.getElementsByTagName("t"))) {
        parts.push(t.textContent ?? "");
      }
      sharedStrings.push(parts.join(""));
    }
  }

  // ── 2. Styles ───────────────────────────────────────────────────────────────
  const fills: StyleFill[] = [];
  const fonts: StyleFont[] = [];
  const cellXfs: StyleXf[] = [];
  const numFmts = new Map<number, string>([
    [14, "m/d/yyyy"], [15, "d-mmm-yy"], [16, "d-mmm"], [17, "mmm-yy"],
    [18, "h:mm AM/PM"], [19, "h:mm:ss AM/PM"], [20, "h:mm"], [21, "h:mm:ss"],
    [22, "m/d/yy h:mm"], [45, "mm:ss"], [46, "[h]:mm:ss"], [47, "mmss.0"],
  ]);

  const stylesXml = await zip.file("xl/styles.xml")?.async("string") ?? "";
  if (stylesXml) {
    const doc = parseXml(stylesXml);

    // Custom numFmts
    for (const nf of Array.from(doc.getElementsByTagName("numFmt"))) {
      const id = parseInt(attr(nf, "numFmtId") ?? "0", 10);
      numFmts.set(id, attr(nf, "formatCode") ?? "");
    }

    // Fills — skip the <fills> container, iterate all <fill> children
    const fillsEl = doc.getElementsByTagName("fills")[0];
    for (const fill of Array.from(fillsEl?.getElementsByTagName("fill") ?? [])) {
      const pf = fill.getElementsByTagName("patternFill")[0];
      const patternType = attr(pf, "patternType") ?? undefined;
      const fgEl = pf?.getElementsByTagName("fgColor")[0];
      const fgRgb = (fgEl && attr(fgEl, "rgb")) ?? undefined;
      fills.push({ patternType, fgColor: fgRgb ? { rgb: fgRgb } : undefined });
    }

    // Fonts
    const fontsEl = doc.getElementsByTagName("fonts")[0];
    for (const font of Array.from(fontsEl?.getElementsByTagName("font") ?? [])) {
      const bold = font.getElementsByTagName("b").length > 0;
      const italic = font.getElementsByTagName("i").length > 0;
      const szEl = font.getElementsByTagName("sz")[0];
      const sz = szEl ? parseFloat(attr(szEl, "val") ?? "11") : undefined;
      const colorEl = font.getElementsByTagName("color")[0];
      const colorRgb = (colorEl && attr(colorEl, "rgb")) ?? undefined;
      fonts.push({ bold, italic, sz, color: colorRgb ? { rgb: colorRgb } : undefined });
    }

    // cellXfs
    const cellXfsEl = doc.getElementsByTagName("cellXfs")[0];
    for (const xf of Array.from(cellXfsEl?.getElementsByTagName("xf") ?? [])) {
      cellXfs.push({
        fontId: parseInt(attr(xf, "fontId") ?? "0", 10),
        fillId: parseInt(attr(xf, "fillId") ?? "0", 10),
        numFmtId: parseInt(attr(xf, "numFmtId") ?? "0", 10),
      });
    }
  }

  // ── 3. Workbook & relationships ─────────────────────────────────────────────
  const wbXml = await zip.file("xl/workbook.xml")?.async("string") ?? "";
  const wbRelsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string") ?? "";
  const wbDoc = parseXml(wbXml);
  const wbRelsDoc = parseXml(wbRelsXml);

  const ridToTarget = new Map<string, string>();
  for (const rel of Array.from(wbRelsDoc.getElementsByTagName("Relationship"))) {
    ridToTarget.set(attr(rel, "Id") ?? "", attr(rel, "Target") ?? "");
  }

  const sheetDefs: Array<{ name: string; rId: string }> = [];
  for (const sheet of Array.from(wbDoc.getElementsByTagName("sheet"))) {
    const name = attr(sheet, "name") ?? "";
    const rId =
      attr(sheet, "r:id") ??
      sheet.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "id"
      ) ??
      "";
    sheetDefs.push({ name, rId });
  }

  // ── 4. Worksheets ───────────────────────────────────────────────────────────
  const SheetNames: string[] = [];
  const Sheets: { [name: string]: WorkSheet } = {};
  const wbSheets: Array<{ TabColor?: { rgb?: string } }> = [];

  for (const { name, rId } of sheetDefs) {
    const target = ridToTarget.get(rId) ?? "";
    if (!target) continue;
    const filePath = target.startsWith("worksheets/") ? `xl/${target}` : target;
    const wsXml = await zip.file(filePath)?.async("string") ?? "";
    if (!wsXml) continue;

    SheetNames.push(name);
    const ws: WorkSheet = {};
    const wsDoc = parseXml(wsXml);

    // Tab color
    const tabColorEl = wsDoc.getElementsByTagName("tabColor")[0];
    const tabArgbRaw = (tabColorEl && attr(tabColorEl, "rgb")) ?? undefined;
    // Strip leading alpha if ARGB (8 chars)
    const tabRgb = tabArgbRaw
      ? (tabArgbRaw.length === 8 ? tabArgbRaw.slice(2) : tabArgbRaw)
      : undefined;
    wbSheets.push({ TabColor: tabRgb ? { rgb: tabRgb } : undefined });

    // Column widths
    const cols: Array<{ wpx?: number; wch?: number } | undefined> = [];
    for (const colEl of Array.from(wsDoc.getElementsByTagName("col"))) {
      const min = parseInt(attr(colEl, "min") ?? "1", 10) - 1;
      const max = parseInt(attr(colEl, "max") ?? "1", 10) - 1;
      const width = parseFloat(attr(colEl, "width") ?? "0");
      for (let c = min; c <= max; c++) {
        cols[c] = { wch: width };
      }
    }
    ws["!cols"] = cols;

    // Rows & cells
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    const rowHeights: Array<{ hpx?: number; hpt?: number } | undefined> = [];

    for (const rowEl of Array.from(wsDoc.getElementsByTagName("row"))) {
      const rowNum = parseInt(attr(rowEl, "r") ?? "0", 10) - 1;
      const ht = attr(rowEl, "ht");
      if (ht) rowHeights[rowNum] = { hpt: parseFloat(ht) };

      for (const cEl of Array.from(rowEl.getElementsByTagName("c"))) {
        const addrStr = attr(cEl, "r") ?? "";
        if (!addrStr) continue;

        const cellRef = decodeCell(addrStr);
        const r = cellRef.r;
        const c = cellRef.c;
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
        minC = Math.min(minC, c); maxC = Math.max(maxC, c);

        const t = attr(cEl, "t") ?? "n";
        const sIdx = parseInt(attr(cEl, "s") ?? "0", 10);

        const vEl = cEl.getElementsByTagName("v")[0];
        const vText = vEl?.textContent ?? "";
        const isEl = cEl.getElementsByTagName("is")[0];
        const isText = isEl
          ? Array.from(isEl.getElementsByTagName("t"))
              .map((e) => e.textContent ?? "")
              .join("")
          : "";

        let cellT: CellObject["t"] = "z";
        let cellV: CellObject["v"];
        let cellW: string | undefined;

        if (t === "s") {
          // Shared string
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
          // Formula string result
          cellT = "s"; cellV = vText; cellW = vText;
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
    for (const mergeEl of Array.from(wsDoc.getElementsByTagName("mergeCell"))) {
      const ref = attr(mergeEl, "ref") ?? "";
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

    Sheets[name] = ws;
  }

  return {
    SheetNames,
    Sheets,
    Workbook: { Sheets: wbSheets },
    Styles: { Fonts: fonts, Fills: fills, CellXf: cellXfs },
  };
}
