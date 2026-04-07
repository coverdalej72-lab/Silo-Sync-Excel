/**
 * Extracts full cell style info (font color, bg color, bold, fontSize) from xlsx
 * by combining xl/styles.xml (fonts/fills/cellXf) with xl/worksheets/*.xml cell s-attr.
 * Writes to public/style-data.json
 *
 * Uses JSZip + regex XML parsing — no xlsx/SheetJS dependency.
 * Run: node scripts/extract-styles.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import JSZip from "jszip";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const xlsxPath = join(__dir, "../public/feed-program.xlsx");
const outPath = join(__dir, "../public/style-data.json");

const buf = readFileSync(xlsxPath);
const zip = await JSZip.loadAsync(buf);

// ── Helper: get all XML files matching a pattern ────────────────────────────
async function readZipFile(path) {
  const file = zip.file(path);
  return file ? await file.async("string") : "";
}

// ── Parse xl/styles.xml via regex ───────────────────────────────────────────
const stylesXml = await readZipFile("xl/styles.xml");

function parseStylesXml(xml) {
  const fills = [];
  const fonts = [];
  const cellXf = [];

  // Extract fills
  const fillsMatch = xml.match(/<fills[^>]*>([\s\S]*?)<\/fills>/);
  if (fillsMatch) {
    for (const fillM of fillsMatch[1].matchAll(/<fill>([\s\S]*?)<\/fill>/g)) {
      const fillContent = fillM[1];
      const pfM = fillContent.match(/<patternFill[^>]*patternType="([^"]*)"[^>]*>/);
      const patternType = pfM ? pfM[1] : undefined;
      const fgM = fillContent.match(/<fgColor[^>]*rgb="([0-9A-Fa-f]{6,8})"[^>]*\/?>/);
      const fgRgb = fgM ? fgM[1] : undefined;
      fills.push({ patternType, fgColor: fgRgb ? { rgb: fgRgb } : undefined });
    }
  }

  // Extract fonts
  const fontsMatch = xml.match(/<fonts[^>]*>([\s\S]*?)<\/fonts>/);
  if (fontsMatch) {
    for (const fontM of fontsMatch[1].matchAll(/<font>([\s\S]*?)<\/font>/g)) {
      const fontContent = fontM[1];
      const bold = /<b\s*\/>|<b>/.test(fontContent);
      const italic = /<i\s*\/>|<i>/.test(fontContent);
      const szM = fontContent.match(/<sz[^>]*val="([^"]+)"/);
      const sz = szM ? parseFloat(szM[1]) : 11;
      const colorM = fontContent.match(/<color[^>]*rgb="([0-9A-Fa-f]{6,8})"[^>]*\/?>/);
      const colorRgb = colorM ? colorM[1] : undefined;
      fonts.push({ bold, italic, sz, color: colorRgb ? { rgb: colorRgb } : undefined });
    }
  }

  // Extract cellXfs
  const cellXfsMatch = xml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/);
  if (cellXfsMatch) {
    for (const xfM of cellXfsMatch[1].matchAll(/<xf\b([^/]*?)(?:\/>|>[\s\S]*?<\/xf>)/g)) {
      const attrs = xfM[1];
      const fontIdM = attrs.match(/fontId="(\d+)"/);
      const fillIdM = attrs.match(/fillId="(\d+)"/);
      cellXf.push({
        fontId: fontIdM ? parseInt(fontIdM[1], 10) : 0,
        fillId: fillIdM ? parseInt(fillIdM[1], 10) : 0,
      });
    }
  }

  return { Fonts: fonts, Fills: fills, CellXf: cellXf };
}

const { Fonts, Fills, CellXf } = parseStylesXml(stylesXml);

function resolveStyle(xfIdx) {
  const xf = CellXf[xfIdx];
  if (!xf) return null;
  const font = Fonts[xf.fontId] || {};
  const fill = Fills[xf.fillId] || {};

  // Font color
  let fontColor = null;
  if (font.color?.rgb) {
    const raw = font.color.rgb;
    const hex = raw.length === 8 ? raw.slice(2) : raw;
    if (hex.toUpperCase() !== "000000") fontColor = `#${hex}`;
  }

  // Background color
  let bgColor = null;
  if (fill.patternType === "solid" && fill.fgColor?.rgb) {
    const raw = fill.fgColor.rgb;
    const hex = raw.length === 8 ? raw.slice(2) : raw;
    if (hex.toUpperCase() !== "FFFFFF" && hex !== "") bgColor = `#${hex}`;
  }

  return {
    fontColor,
    bgColor,
    bold: font.bold ? true : false,
    fontSize: font.sz || 11,
  };
}

// ── Parse xl/workbook.xml to get sheet name order ───────────────────────────
const wbXml = await readZipFile("xl/workbook.xml");
const sheetNames = [];
for (const m of wbXml.matchAll(/<sheet\b[^>]*name="([^"]+)"/g)) {
  sheetNames.push(m[1]);
}

// ── Parse each worksheet XML to extract cell style indices ──────────────────
function parseCellStylesFromXml(xml) {
  const cellMap = {};
  for (const m of xml.matchAll(/<c\b([^>]*)>/g)) {
    const attrs = m[1];
    const rMatch = attrs.match(/\br="([A-Z]+\d+)"/);
    const sMatch = attrs.match(/\bs="(\d+)"/);
    if (rMatch) {
      cellMap[rMatch[1]] = sMatch ? parseInt(sMatch[1], 10) : 0;
    }
  }
  return cellMap;
}

// ── Build workbook rels: rId -> sheet file ───────────────────────────────────
const wbRelsXml = await readZipFile("xl/_rels/workbook.xml.rels");
const ridToTarget = new Map();
for (const m of wbRelsXml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
  ridToTarget.set(m[1], m[2]);
}

// Get sheet entries in workbook order
const sheetEntries = [];
for (const m of wbXml.matchAll(/<sheet\b[^>]*r:id="([^"]+)"/g)) {
  const target = ridToTarget.get(m[1]) ?? "";
  const filePath = target.startsWith("worksheets/") ? `xl/${target}` : target;
  sheetEntries.push(filePath);
}

// ── Combine styles and worksheet cell data ───────────────────────────────────
const output = {};

for (let i = 0; i < sheetEntries.length; i++) {
  const filePath = sheetEntries[i];
  const sheetName = sheetNames[i];
  if (!sheetName || !filePath) continue;

  const wsXml = await readZipFile(filePath);
  if (!wsXml) continue;

  const cellStyleIndices = parseCellStylesFromXml(wsXml);
  const sheetStyles = {};

  for (const [addr, xfIdx] of Object.entries(cellStyleIndices)) {
    const style = resolveStyle(xfIdx);
    if (style && (style.fontColor || style.bgColor || style.bold || style.fontSize !== 11)) {
      sheetStyles[addr] = style;
    }
  }

  output[sheetName] = sheetStyles;
}

writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`Wrote style-data.json — ${Object.keys(output).length} sheets, ${
  Object.values(output).reduce((n, s) => n + Object.keys(s).length, 0)
} styled cells`);
