import React, { useState } from "react";

interface CellInfo {
  value: string;
  isDateCell?: boolean;
}

interface SheetParsed {
  name: string;
  cells: Map<string, CellInfo>;
}

interface Props {
  sheet: SheetParsed;
  edits: Map<string, string>;
  onEdit: (key: string, val: string) => void;
}

function excelDateToStr(serial: number): string {
  if (!serial || isNaN(serial) || serial < 40000) return String(serial);
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  const day   = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year  = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function fmtNum(v: string): string {
  const n = parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) || v === "" ? "—" : n.toLocaleString();
}

export function EndOfBatchContent({ sheet, edits, onEdit }: Props) {
  const { cells } = sheet;
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue]   = useState("");

  const g = (r: number, c: number): string => {
    const key = `${r},${c}`;
    const e = edits.get(key);
    if (e !== undefined) return e;
    return String(cells.get(key)?.value ?? "");
  };

  const startEdit = (key: string, raw: string) => { setEditingKey(key); setEditValue(raw); };
  const commit    = () => { if (editingKey) { onEdit(editingKey, editValue); setEditingKey(null); } };
  const cancel    = () => setEditingKey(null);

  function Cell({ r, c, isDate = false, align = "left", muted = false }: {
    r: number; c: number; isDate?: boolean; align?: "left" | "right" | "center"; muted?: boolean;
  }) {
    const key = `${r},${c}`;
    const raw = g(r, c);
    const display = isDate && raw && !isNaN(Number(raw)) && Number(raw) > 40000
      ? excelDateToStr(Number(raw))
      : raw;

    if (editingKey === key) {
      return (
        <input
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
          style={{ width: "100%", border: "none", outline: "2px solid #217346", borderRadius: 3,
            padding: "2px 6px", fontSize: "inherit", textAlign: align, background: "#f0fdf4",
            boxSizing: "border-box" }}
        />
      );
    }
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={() => startEdit(key, raw)}
        onKeyDown={e => { if (e.key === "Enter") startEdit(key, raw); }}
        style={{ cursor: "text", display: "block", width: "100%", textAlign: align,
          padding: "3px 6px", borderRadius: 3, color: muted && !raw ? "#cbd5e1" : "inherit",
          fontStyle: muted && !raw ? "italic" : "normal",
          transition: "background 0.1s" }}
        onMouseEnter={e => (e.currentTarget.style.background = "#f0fdf4")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        {display || (muted ? "—" : "")}
      </span>
    );
  }

  const feedTypes: { name: string; cols: [number, number, number]; totalRow: number; color: string; bg: string }[] = [
    { name: "Starter",    cols: [1,  2,  3],  totalRow: 36, color: "#16a34a", bg: "#f0fdf4" },
    { name: "Grower",     cols: [6,  7,  8],  totalRow: 36, color: "#2563eb", bg: "#eff6ff" },
    { name: "Finisher",   cols: [10, 11, 12], totalRow: 36, color: "#7c3aed", bg: "#f5f3ff" },
    { name: "Withdrawl",  cols: [14, 15, 16], totalRow: 36, color: "#dc2626", bg: "#fef2f2" },
  ];

  function getDeliveryRows(dateCol: number): number[] {
    const rows: number[] = [];
    for (let r = 6; r <= 35; r++) {
      const v = g(r, dateCol);
      if (v && v !== "" && v !== "0") rows.push(r);
    }
    const next = rows.length > 0 ? rows[rows.length - 1] + 1 : 6;
    if (next <= 35) rows.push(next);
    return rows;
  }

  const birdRows: number[] = [];
  for (let r = 4; r <= 20; r++) {
    const v = g(r, 21);
    if (v && v !== "" && !isNaN(Number(v)) && Number(v) > 0) birdRows.push(r);
  }

  const lastBatchLeft  = g(7,  18);
  const totalPurchased = g(11, 18);
  const feedUsed       = g(18, 18);
  const feedLeft       = g(15, 18);
  const totalCatched   = g(16, 23);
  const totalMorts     = g(16, 24);

  const thStyle: React.CSSProperties = {
    padding: "6px 10px", fontWeight: 600, fontSize: 11, color: "#64748b",
    textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap",
    borderBottom: "1px solid #e2e8f0",
  };

  return (
    <div style={{ padding: "16px 18px 24px", background: "#f8fafc", minHeight: "100%", boxSizing: "border-box" }}>

      {/* ── Feed Deliveries ───────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: "#94a3b8" }}>
          Feed Deliveries
        </span>
        <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginBottom: 18 }}>
        {feedTypes.map(({ name, cols, totalRow, color, bg }) => {
          const rows  = getDeliveryRows(cols[0]);
          const total = parseFloat(g(totalRow, cols[2]).replace(/,/g, "")) || 0;
          return (
            <div key={name} style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0",
              overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ background: color, padding: "8px 12px", display: "flex",
                justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 13, letterSpacing: 0.3 }}>{name}</span>
                {total > 0 && (
                  <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: 600 }}>
                    {total.toLocaleString()} kg
                  </span>
                )}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: bg }}>
                    <th style={{ ...thStyle, textAlign: "left" }}>Date</th>
                    <th style={{ ...thStyle, textAlign: "left" }}>Docket #</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>kg</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r} style={{ borderBottom: "1px solid #f1f5f9",
                      background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "1px 0" }}><Cell r={r} c={cols[0]} isDate muted /></td>
                      <td style={{ padding: "1px 0" }}><Cell r={r} c={cols[1]} muted /></td>
                      <td style={{ padding: "1px 0" }}><Cell r={r} c={cols[2]} align="right" muted /></td>
                    </tr>
                  ))}
                </tbody>
                {total > 0 && (
                  <tfoot>
                    <tr style={{ background: bg, borderTop: "2px solid #e2e8f0" }}>
                      <td colSpan={2} style={{ padding: "5px 10px", fontSize: 11, fontWeight: 700,
                        color, textTransform: "uppercase", letterSpacing: 0.5 }}>Total</td>
                      <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 700, color, fontSize: 12 }}>
                        {total.toLocaleString()} kg
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          );
        })}
      </div>

      {/* ── Bird Summary + Feed Summary ───────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: "#94a3b8" }}>
          Batch Summary
        </span>
        <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "start" }}>

        {/* Bird Summary table */}
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0",
          overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <div style={{ background: "#1a5c36", padding: "8px 14px", display: "flex",
            alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>Bird Summary</span>
            {(totalCatched || totalMorts) && (
              <div style={{ display: "flex", gap: 14 }}>
                {totalCatched && (
                  <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 11 }}>
                    <strong style={{ color: "#fff" }}>{fmtNum(totalCatched)}</strong> catched
                  </span>
                )}
                {totalMorts && (
                  <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 11 }}>
                    <strong style={{ color: "#fca5a5" }}>{fmtNum(totalMorts)}</strong> morts
                  </span>
                )}
              </div>
            )}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f0fdf4" }}>
                <th style={{ ...thStyle, textAlign: "center" }}>Shed</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Birds Placed</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Birds Catched</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Morts</th>
              </tr>
            </thead>
            <tbody>
              {birdRows.map((r, i) => {
                const morts = parseFloat(g(r, 24)) || 0;
                return (
                  <tr key={r} style={{ borderBottom: "1px solid #f1f5f9",
                    background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "3px 12px", textAlign: "center", fontWeight: 600, color: "#1a5c36", fontSize: 12 }}>
                      {g(r, 21)}
                    </td>
                    <td style={{ padding: "1px 0" }}><Cell r={r} c={22} align="right" muted /></td>
                    <td style={{ padding: "1px 0" }}><Cell r={r} c={23} align="right" muted /></td>
                    <td style={{ padding: "1px 0" }}>
                      <span style={{ display: "block", color: morts > 0 ? "#dc2626" : undefined, fontWeight: morts > 500 ? 700 : 400 }}>
                        <Cell r={r} c={24} align="right" muted />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {(totalCatched || totalMorts) && (
              <tfoot>
                <tr style={{ background: "#f0fdf4", borderTop: "2px solid #e2e8f0" }}>
                  <td style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, color: "#1a5c36",
                    textTransform: "uppercase", letterSpacing: 0.5 }}>Total</td>
                  <td style={{ padding: "5px 10px", textAlign: "right" }}></td>
                  <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 700, color: "#1a5c36", fontSize: 12 }}>
                    {fmtNum(totalCatched)}
                  </td>
                  <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 700, color: "#dc2626", fontSize: 12 }}>
                    {fmtNum(totalMorts)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Feed Summary card */}
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0",
          overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", minWidth: 220 }}>
          <div style={{ background: "#C9A227", padding: "8px 14px" }}>
            <span style={{ color: "#1a1a00", fontWeight: 700, fontSize: 13 }}>Feed Summary</span>
          </div>
          <div style={{ padding: "4px 0" }}>
            {[
              { label: "Last Batch Left",   val: lastBatchLeft,  accent: false },
              { label: "Total Purchased",   val: totalPurchased, accent: false },
              { label: "Total Used",        val: feedUsed,       accent: false },
              { label: "Feed Left",         val: feedLeft,       accent: true  },
            ].map(({ label, val, accent }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between",
                alignItems: "baseline", padding: "7px 14px", borderBottom: "1px solid #f1f5f9" }}>
                <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500, whiteSpace: "nowrap" }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: accent ? "#16a34a" : "#1e293b",
                  marginLeft: 16 }}>
                  {val ? `${fmtNum(val)} kg` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
