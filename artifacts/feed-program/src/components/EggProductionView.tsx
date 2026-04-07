import React, { useState, useMemo } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────
export interface EggRecord {
  date: string;
  totalEggs: string;
  floorEggs: string;
  brokenEggs: string;
  settableEggs: string;
  notes: string;
}
export type EggLog = Record<number, EggRecord[]>;

interface FarmShedConfig { shedGroupId: number; active: boolean; silos: { letter: string }[] }
interface FarmConfigData { farmName?: string; shedGroups?: FarmShedConfig[]; farmType?: "broiler" | "breeder" }

interface Props {
  farmConfig: FarmConfigData;
  shedPlacement: Map<number, number>;
}

// ── Storage ────────────────────────────────────────────────────────────────
export const EGG_LOG_KEY = "silo-egg-production";

function readEggLog(): EggLog {
  try { return JSON.parse(localStorage.getItem(EGG_LOG_KEY) || "{}"); } catch { return {}; }
}

function blankRecord(): EggRecord {
  return { date: "", totalEggs: "", floorEggs: "", brokenEggs: "", settableEggs: "", notes: "" };
}

const n = (s: string) => parseFloat(s.replace(/,/g, "")) || 0;
const fmt = (v: number, dp = 0) => v === 0 ? "—" : dp > 0 ? v.toFixed(dp) : v.toLocaleString();

// ── Component ──────────────────────────────────────────────────────────────
export default function EggProductionView({ farmConfig, shedPlacement }: Props) {
  const [eggLog, setEggLog] = useState<EggLog>(readEggLog);
  const [editCell, setEditCell] = useState<{ shedNum: number; rowIdx: number; field: keyof EggRecord } | null>(null);
  const [editVal, setEditVal] = useState("");

  const SHED_SHEET_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const isGroupActive = (shedNum: number) => {
    const gid = Math.ceil(shedNum / 2);
    const cfg = farmConfig.shedGroups?.find(g => g.shedGroupId === gid);
    return cfg ? cfg.active !== false : gid <= 6;
  };

  // All active individual sheds (1, 2, 3, 4 …)
  const activeShedNums = useMemo(() => {
    const nums: number[] = [];
    SHED_SHEET_ORDER.forEach(gid => {
      if (isGroupActive(gid * 2 - 1)) { nums.push(gid * 2 - 1); nums.push(gid * 2); }
    });
    // Also include sheds that have egg data but aren't in shed groups
    Object.keys(eggLog).forEach(k => {
      const n2 = parseInt(k, 10);
      if (!nums.includes(n2)) nums.push(n2);
    });
    return [...new Set(nums)].sort((a, b) => a - b);
  }, [farmConfig, eggLog]);

  const save = (log: EggLog) => {
    setEggLog(log);
    localStorage.setItem(EGG_LOG_KEY, JSON.stringify(log));
  };

  const addRow = (shedNum: number) => {
    const current = eggLog[shedNum] ?? [];
    save({ ...eggLog, [shedNum]: [...current, blankRecord()] });
  };

  const updateRow = (shedNum: number, idx: number, field: keyof EggRecord, val: string) => {
    const rows = [...(eggLog[shedNum] ?? [])];
    rows[idx] = { ...rows[idx], [field]: val };
    save({ ...eggLog, [shedNum]: rows });
  };

  const deleteRow = (shedNum: number, idx: number) => {
    const rows = (eggLog[shedNum] ?? []).filter((_, i) => i !== idx);
    save({ ...eggLog, [shedNum]: rows });
  };

  const commitEdit = () => {
    if (editCell) updateRow(editCell.shedNum, editCell.rowIdx, editCell.field, editVal);
    setEditCell(null);
  };

  const isEditing = (shedNum: number, rowIdx: number, field: keyof EggRecord) =>
    editCell?.shedNum === shedNum && editCell?.rowIdx === rowIdx && editCell?.field === field;

  const startEdit = (shedNum: number, rowIdx: number, field: keyof EggRecord, current: string) => {
    setEditCell({ shedNum, rowIdx, field });
    setEditVal(current);
  };

  // Per-shed stats
  const shedStats = useMemo(() => activeShedNums.map(shedNum => {
    const placement = shedPlacement.get(shedNum) ?? 0;
    const rows = eggLog[shedNum] ?? [];
    const totalEggs    = rows.reduce((a, r) => a + n(r.totalEggs),    0);
    const floorEggs    = rows.reduce((a, r) => a + n(r.floorEggs),    0);
    const brokenEggs   = rows.reduce((a, r) => a + n(r.brokenEggs),   0);
    const settableEggs = rows.reduce((a, r) => a + n(r.settableEggs), 0);
    const days = rows.filter(r => n(r.totalEggs) > 0).length;
    const hdp = placement > 0 && days > 0
      ? (totalEggs / (placement * days)) * 100 : 0;
    const floorPct = totalEggs > 0 ? (floorEggs / totalEggs) * 100 : 0;
    const settablePct = totalEggs > 0 ? (settableEggs / totalEggs) * 100 : 0;
    return { shedNum, placement, rows, totalEggs, floorEggs, brokenEggs, settableEggs, days, hdp, floorPct, settablePct };
  }), [activeShedNums, eggLog, shedPlacement]);

  // Trend chart: HDP% per date across all sheds
  const trendData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number>>();
    shedStats.forEach(({ shedNum, placement, rows }) => {
      if (placement === 0) return;
      rows.forEach(r => {
        if (!r.date || !n(r.totalEggs)) return;
        const entry = dateMap.get(r.date) ?? {};
        entry[`Shed ${shedNum}`] = (n(r.totalEggs) / placement) * 100;
        dateMap.set(r.date, entry);
      });
    });
    return [...dateMap.entries()]
      .sort(([a], [b]) => {
        const p = (d: string) => { const [dd, mm, yy] = d.split("/"); return new Date(`${yy}-${mm}-${dd}`).getTime(); };
        return p(a) - p(b);
      })
      .map(([date, vals]) => ({ date, ...vals }));
  }, [shedStats]);

  const LINE_COLORS = ["#2980b9", "#16a085", "#e67e22", "#8e44ad", "#c0392b", "#27ae60", "#d35400", "#2c3e50", "#1abc9c", "#e74c3c"];

  const inputStyle: React.CSSProperties = {
    width: "100%", border: "1px solid var(--pm-primary-border)", borderRadius: 4,
    padding: "2px 4px", fontSize: 12, background: "#fffde7", textAlign: "right", outline: "none",
  };

  const farmLabel = farmConfig.farmName || "Farm";

  return (
    <div style={{ padding: "20px 20px 40px", fontFamily: "Inter,'Segoe UI',sans-serif", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, var(--pm-primary) 0%, var(--pm-primary-mid) 100%)", color: "#fff", borderRadius: 10, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderBottom: "3px solid #C9A227" }}>
        <div style={{ background: "#C9A227", color: "#000", borderRadius: 7, padding: "3px 14px", fontWeight: 800, fontSize: 15 }}>EGG PRODUCTION</div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{farmLabel}</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{fmt(shedStats.reduce((a, s) => a + s.totalEggs, 0))}</div>
            <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.8 }}>Total Eggs</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{fmt(shedStats.reduce((a, s) => a + s.settableEggs, 0))}</div>
            <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.8 }}>Settable</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              {(() => {
                const placed = shedStats.reduce((a, s) => a + s.placement, 0);
                const days   = Math.max(...shedStats.map(s => s.days), 0);
                const total  = shedStats.reduce((a, s) => a + s.totalEggs, 0);
                return placed > 0 && days > 0 ? ((total / (placed * days)) * 100).toFixed(1) + "%" : "—";
              })()}
            </div>
            <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.8 }}>Avg HDP%</div>
          </div>
        </div>
      </div>

      {/* Trend chart */}
      {trendData.length > 1 && (
        <div style={{ background: "#fff", border: "1px solid #e0e8e4", borderRadius: 12, padding: "16px 20px", marginBottom: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: "var(--pm-primary)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>📈 Hen Day Production % — All Sheds</div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={trendData} margin={{ top: 4, right: 20, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 100]} tickFormatter={v => v + "%"} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => v.toFixed(1) + "%"} />
              <Legend />
              {activeShedNums.map((sn, i) => (
                <Line key={sn} type="monotone" dataKey={`Shed ${sn}`} stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={2} dot={{ r: 3 }} connectNulls />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-shed cards */}
      {shedStats.length === 0 ? (
        <div style={{ textAlign: "center", color: "#888", padding: "60px 20px", fontSize: 14 }}>
          No active sheds configured. Check Settings → Active Sheds.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
          {shedStats.map(({ shedNum, placement, rows, totalEggs, floorEggs, brokenEggs, settableEggs, days, hdp, floorPct, settablePct }) => (
            <div key={shedNum} style={{ background: "#fff", borderRadius: 10, border: "1px solid #dde8e0", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>

              {/* Card header */}
              <div style={{ background: "linear-gradient(135deg, var(--pm-primary) 0%, var(--pm-primary-mid) 100%)", color: "#fff", padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ background: "#C9A227", color: "#000", borderRadius: 5, padding: "2px 10px", fontWeight: 800, fontSize: 14 }}>SHED {shedNum}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{placement > 0 ? placement.toLocaleString() + " hens" : "Placement not set"}</div>
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
                  {[
                    { label: "Total Eggs", val: fmt(totalEggs) },
                    { label: "Settable",   val: fmt(settableEggs) },
                    { label: "HDP%",       val: hdp > 0 ? hdp.toFixed(1) + "%" : "—" },
                    { label: "Floor%",     val: floorPct > 0 ? floorPct.toFixed(1) + "%" : "—" },
                    { label: "Settable%",  val: settablePct > 0 ? settablePct.toFixed(1) + "%" : "—" },
                  ].map(({ label, val }) => (
                    <div key={label} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>{val}</div>
                      <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Entry table */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--pm-primary-soft)" }}>
                    {[
                      { k: "date",         label: "Date",     w: "20%", align: "left"  },
                      { k: "totalEggs",    label: "Total",    w: "14%", align: "right" },
                      { k: "floorEggs",    label: "Floor",    w: "12%", align: "right" },
                      { k: "brokenEggs",   label: "Broken",   w: "12%", align: "right" },
                      { k: "settableEggs", label: "Settable", w: "14%", align: "right" },
                      { k: "notes",        label: "Notes",    w: "20%", align: "left"  },
                    ].map(col => (
                      <th key={col.k} style={{ padding: "6px 8px", textAlign: col.align as "left" | "right", color: "var(--pm-primary)", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, width: col.w }}>
                        {col.label}
                      </th>
                    ))}
                    <th style={{ width: "8%" }} />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: "14px 8px", textAlign: "center", color: "#aaa", fontSize: 12 }}>
                        No entries yet — click + Add Day below
                      </td>
                    </tr>
                  )}
                  {rows.map((row, ci) => (
                    <tr key={ci} style={{ borderTop: "1px solid #eef3ef", background: ci % 2 === 0 ? "#fff" : "#f9fcfa" }}>
                      {(["date", "totalEggs", "floorEggs", "brokenEggs", "settableEggs", "notes"] as (keyof EggRecord)[]).map((field, fi) => {
                        const align = (field === "date" || field === "notes") ? "left" : "right";
                        const editing = isEditing(shedNum, ci, field);
                        return (
                          <td key={field} style={{ padding: "5px 8px", textAlign: align, cursor: "pointer", background: editing ? "#fffde7" : "transparent", color: "#333" }}
                            onClick={() => startEdit(shedNum, ci, field, row[field])}>
                            {editing ? (
                              <input
                                style={{ ...inputStyle, textAlign: align as "left" | "right" }}
                                value={editVal} autoFocus
                                onChange={e => setEditVal(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditCell(null); }}
                              />
                            ) : (
                              row[field] || <span style={{ color: "#ccc" }}>—</span>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ padding: "4px 6px", textAlign: "center" }}>
                        <button onClick={() => deleteRow(shedNum, ci)} title="Delete row"
                          style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Add row + per-shed HDP note */}
              <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, borderTop: "1px solid #eef3ef", background: "var(--pm-primary-soft)" }}>
                <button onClick={() => addRow(shedNum)}
                  style={{ background: "var(--pm-primary)", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  + Add Day
                </button>
                {placement === 0 && (
                  <span style={{ fontSize: 11, color: "#888" }}>Set bird count in Feed Program to calculate HDP%</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
