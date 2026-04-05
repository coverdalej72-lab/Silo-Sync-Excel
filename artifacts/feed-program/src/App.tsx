import { useEffect, useState, useRef } from "react";
import * as XLSX from "xlsx";

interface SheetData {
  name: string;
  tabColor?: string;
  html: string;
}

const BASE = import.meta.env.BASE_URL;

function rgbFromArgb(argb?: string): string | undefined {
  if (!argb || argb.length < 8) return undefined;
  return `#${argb.slice(2)}`;
}

function contrastColor(hex?: string): string {
  if (!hex) return "#000";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? "#000000" : "#ffffff";
}

export default function App() {
  const [sheets, setSheets] = useState<SheetData[]>([]);
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
          cellHTML: false,
          dense: false,
        });

        const result: SheetData[] = [];
        let startIdx = 0;

        wb.SheetNames.forEach((name, idx) => {
          const ws = wb.Sheets[name];
          if (!ws) return;

          // Get tab color from workbook props
          const tabColor = wb.Workbook?.Sheets?.[idx]?.TabColor;
          const tabArgb = tabColor?.rgb ? `#${tabColor.rgb}` : undefined;

          // Convert to HTML preserving styles
          const html = XLSX.utils.sheet_to_html(ws, {
            id: `sheet-${idx}`,
            editable: false,
          });

          // Mark starting sheet (Shed 3 & 4)
          if (name.trim().toUpperCase().includes("3") && name.trim().toUpperCase().includes("4")) {
            startIdx = result.length;
          }

          result.push({ name: name.trim(), tabColor: tabArgb, html });
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
          const fg = contrastColor(s.tabColor ?? "#217346");
          return (
            <button
              key={i}
              onClick={() => setActive(i)}
              className="px-3 py-1.5 text-xs font-semibold rounded-t border border-b-0 whitespace-nowrap transition-all"
              style={{
                backgroundColor: isActive ? bg : `${bg}99`,
                color: isActive ? fg : contrastColor(s.tabColor ?? "#217346"),
                borderColor: bg,
                boxShadow: isActive ? `0 -2px 0 0 ${bg}` : "none",
                opacity: isActive ? 1 : 0.75,
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
        {current && (
          <div
            className="p-1"
            style={{ minWidth: "max-content" }}
            dangerouslySetInnerHTML={{ __html: current.html }}
          />
        )}
      </div>
    </div>
  );
}
