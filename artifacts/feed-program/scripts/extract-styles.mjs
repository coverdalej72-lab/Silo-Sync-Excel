/**
 * Extracts full cell style info (font color, bg color, bold, fontSize) from xlsx
 * by combining wb.Styles (fonts/fills/cellXf) with raw ZIP-parsed cell style indices.
 * Writes to public/style-data.json
 */
import { readFileSync, writeFileSync } from "fs";
import { inflateRawSync } from "zlib";
import XLSX from "xlsx";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const xlsxPath = join(__dir, "../public/feed-program.xlsx");
const outPath = join(__dir, "../public/style-data.json");

const buf = readFileSync(xlsxPath);

// === Parse XLSX Styles via SheetJS ===
const wb = XLSX.read(buf, { type: "buffer", cellStyles: true, cellDates: true });
const { Fonts = [], Fills = [], CellXf = [] } = wb.Styles || {};

// Build style index -> resolved style
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

// === Parse ZIP to get raw worksheet XMLs and cell s-attr ===
function readZipEntries(buf) {
  const entries = {};
  let offset = 0;
  while (offset < buf.length - 4) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) { offset++; continue; }

    const compression = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const filenameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const filename = buf.slice(offset + 30, offset + 30 + filenameLen).toString("utf8");
    const dataOffset = offset + 30 + filenameLen + extraLen;
    const compressedData = buf.slice(dataOffset, dataOffset + compressedSize);

    if (filename.startsWith("xl/worksheets/sheet") && filename.endsWith(".xml")) {
      try {
        const xml = compression === 0
          ? compressedData.toString("utf8")
          : inflateRawSync(compressedData).toString("utf8");
        entries[filename] = xml;
      } catch (e) {
        // skip if decompression fails
      }
    }

    offset = dataOffset + compressedSize;
  }
  return entries;
}

function parseCellStylesFromXml(xml) {
  // Extract <c ...> tags and parse r= and s= attributes from each
  const cellMap = {};
  const tagRegex = /<c\b([^>]*)>/g;
  let m;
  while ((m = tagRegex.exec(xml)) !== null) {
    const attrs = m[1];
    const rMatch = attrs.match(/\br="([A-Z]+\d+)"/);
    const sMatch = attrs.match(/\bs="(\d+)"/);
    if (rMatch) {
      const addr = rMatch[1];
      const styleIdx = sMatch ? parseInt(sMatch[1], 10) : 0;
      cellMap[addr] = styleIdx;
    }
  }
  return cellMap;
}

const zipEntries = readZipEntries(buf);

// Map sheet filenames to sheet names (xl/workbook.xml has order)
// SheetJS gives us sheet names in order matching sheet1.xml, sheet2.xml, etc.
const sheetNames = wb.SheetNames;

const output = {};

Object.entries(zipEntries).forEach(([filename, xml]) => {
  // filename: xl/worksheets/sheet1.xml -> index 0
  const match = filename.match(/sheet(\d+)\.xml$/);
  if (!match) return;
  const sheetIdx = parseInt(match[1], 10) - 1;
  const sheetName = sheetNames[sheetIdx];
  if (!sheetName) return;

  const cellStyleIndices = parseCellStylesFromXml(xml);
  const sheetStyles = {};

  Object.entries(cellStyleIndices).forEach(([addr, xfIdx]) => {
    const style = resolveStyle(xfIdx);
    if (style && (style.fontColor || style.bgColor || style.bold || style.fontSize !== 11)) {
      sheetStyles[addr] = style;
    }
  });

  output[sheetName] = sheetStyles;
});

writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`Wrote style-data.json — ${Object.keys(output).length} sheets, ${
  Object.values(output).reduce((n, s) => n + Object.keys(s).length, 0)
} styled cells`);
