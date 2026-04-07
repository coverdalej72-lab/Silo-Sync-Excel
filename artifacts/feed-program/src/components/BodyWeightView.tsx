import React, { useState, useMemo } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────
export interface WeightRecord {
  date: string;
  ageWeeks: string;
  actualWeight: string;
  targetWeight: string;
  uniformity: string;
  notes: string;
}
export type BodyWeightLog = Record<number, WeightRecord[]>;  // shedNum → records

interface FarmShedConfig { shedGroupId: number; active: boolean; silos: { letter: string }[] }
interface FarmConfigData { farmName?: string; shedGroups?: FarmShedConfig[]; farmType?: "broiler" | "breeder" }

interface Props {
  farmConfig: FarmConfigData;
  shedPlacement: Map<number, number>;
}

// ── Storage ────────────────────────────────────────────────────────────────
export const BODY_WEIGHT_LOG_KEY = "silo-body-weight";

function readLog(): BodyWeightLog {
  try { return JSON.parse(localStorage.getItem(BODY_WEIGHT_LOG_KEY) || "{}"); } catch { return {}; }
}

function blank(): WeightRecord {
  return { date: "", ageWeeks: "", actualWeight: "", targetWeight: "", uniformity: "", notes: "" };
}

const n = (s: string) => parseFloat(s.replace(/,/g, "")) || 0;
const fmt = (v: number, dp = 0) => v === 0 ? "—" : dp > 0 ? v.toFixed(dp) : v.toLocaleString();

// ── Breeder target weight guideline (female, grams) — Cobb/Ross indicative ─
// Key: age in weeks. Value: grams.
const BREED_TARGETS: Record<string, Record<number, number>> = {
  "Ross 308 Breeder": { 4: 320, 8: 680, 12: 1050, 16: 1420, 20: 1780, 24: 2100, 28: 2320, 30: 2380, 35: 2420, 40: 2450, 50: 2480, 60: 2500 },
  "Cobb 500 Breeder": { 4: 310, 8: 660, 12: 1020, 16: 1400, 20: 1760, 24: 2080, 28: 2300, 30: 2360, 35: 2400, 40: 2430, 50: 2460, 60: 2480 },
};

function getBreedTarget(breed: string, ageWeeks: number): number {
  const targets = BREED_TARGETS[breed];
  if (!targets) return 0;
  const keys = Object.keys(targets).map(Number).sort((a, b) => a - b);
  if (ageWeeks <= keys[0]) return targets[keys[0]];
  if (ageWeeks >= keys[keys.length - 1]) return targets[keys[keys.length - 1]];
  // Linear interpolation between nearest keys
  for (let i = 0; i < keys.length - 1; i++) {
    if (ageWeeks >= keys[i] && ageWeeks <= keys[i + 1]) {
      const t = (ageWeeks - keys[i]) / (keys[i + 1] - keys[i]);
      return Math.round(targets[keys[i]] * (1 - t) + targets[keys[i + 1]] * t);
    }
  }
  return 0;
}

// ── Component ──────────────────────────────────────────────────────────────
export default function BodyWeightView({ farmConfig, shedPlacement }: Props) {
  const [log, setLog] = useState<BodyWeightLog>(readLog);
  const [editCell, setEditCell] = useState<{ shedNum: number; rowIdx: number; field: keyof WeightRecord } | null>(null);
  const [editVal, setEditVal] = useState("");
  const [selectedBreed, setSelectedBreed] = useState<string>("Ross 308 Breeder");

  const SHED_SHEET_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  const isGroupActive = (shedNum: number) => {
    const gid = Math.ceil(shedNum / 2);
    const cfg = farmConfig.shedGroups?.find(g => g.shedGroupId === gid);
    return cfg ? cfg.active !== false : gid <= 6;
  };

  const activeShedNums = useMemo(() => {
    const nums: number[] = [];
    SHED_SHEET_ORDER.forEach(gid => {
      if (isGroupActive(gid * 2 - 1)) { nums.push(gid * 2 - 1); nums.push(gid * 2); }
    });
    Object.keys(log).forEach(k => {
      const n2 = parseInt(k, 10);
      if (!nums.includes(n2)) nums.push(n2);
    });
    return [...new Set(nums)].sort((a, b) => a - b);
  }, [farmConfig, log]);

  const save = (l: BodyWeightLog) => { setLog(l); localStorage.setItem(BODY_WEIGHT_LOG_KEY, JSON.stringify(l)); };
  const addRow = (sn: number) => save({ ...log, [sn]: [...(log[sn] ?? []), blank()] });
  const deleteRow = (sn: number, idx: number) => save({ ...log, [sn]: (log[sn] ?? []).filter((_, i) => i !== idx) });
  const updateRow = (sn: number, idx: number, field: keyof WeightRecord, val: string) => {
    const rows = [...(log[sn] ?? [])];
    rows[idx] = { ...rows[idx], [field]: val };
    save({ ...log, [sn]: rows });
  };
  const commitEdit = () => { if (editCell) updateRow(editCell.shedNum, editCell.rowIdx, editCell.field, editVal); setEditCell(null); };
  const isEditing = (sn: number, ri: number, field: keyof WeightRecord) => editCell?.shedNum === sn && editCell?.rowIdx === ri && editCell?.field === field;
  const startEdit = (sn: number, ri: number, field: keyof WeightRecord, cur: string) => { setEditCell({ shedNum: sn, rowIdx: ri, field }); setEditVal(cur); };

  // Build chart data per shed — actual vs target over weeks
  const shedChartData = useMemo(() => {
    return activeShedNums.map(shedNum => {
      const rows = log[shedNum] ?? [];
      const data = rows
        .filter(r => n(r.ageWeeks) > 0)
        .sort((a, b) => n(a.ageWeeks) - n(b.ageWeeks))
        .map(r => {
          const age = n(r.ageWeeks);
          const actual = n(r.actualWeight);
          const target = n(r.targetWeight) > 0 ? n(r.targetWeight) : getBreedTarget(selectedBreed, age);
          const diff   = actual > 0 && target > 0 ? actual - target : undefined;
          const unif   = n(r.uniformity);
          return {
            week:     `Wk ${age}`,
            age,
            actual:   actual > 0 ? actual : undefined,
            target:   target > 0 ? target : undefined,
            diff,
            unif:     unif > 0 ? unif : undefined,
          };
        });
      const latest = [...data].reverse().find(d => d.actual != null);
      const latestTarget = latest ? getBreedTarget(selectedBreed, latest.age) : 0;
      const variance = latest?.actual && latestTarget > 0 ? latest.actual - latestTarget : null;
      return { shedNum, data, latest, latestTarget, variance };
    });
  }, [activeShedNums, log, selectedBreed]);

  const inputStyle: React.CSSProperties = {
    width: "100%", border: "1px solid var(--pm-primary-border)", borderRadius: 4,
    padding: "2px 4px", fontSize: 12, background: "#fffde7", textAlign: "right", outline: "none",
  };

  const farmLabel = farmConfig.farmName || "Farm";

  return (
    <div style={{ padding: "20px 20px 40px", fontFamily: "Inter,'Segoe UI',sans-serif", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, var(--pm-primary) 0%, var(--pm-primary-mid) 100%)", color: "#fff", borderRadius: 10, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderBottom: "3px solid #C9A227" }}>
        <div style={{ background: "#C9A227", color: "#000", borderRadius: 7, padding: "3px 14px", fontWeight: 800, fontSize: 15 }}>BODY WEIGHT</div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{farmLabel}</div>

        {/* Breed selector */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, opacity: 0.8 }}>Breed guide:</span>
          <select
            value={selectedBreed}
            onChange={e => setSelectedBreed(e.target.value)}
            style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            <option value="Ross 308 Breeder" style={{ color: "#000", background: "#fff" }}>Ross 308 Breeder</option>
            <option value="Cobb 500 Breeder" style={{ color: "#000", background: "#fff" }}>Cobb 500 Breeder</option>
            <option value="Manual" style={{ color: "#000", background: "#fff" }}>Manual (enter target)</option>
          </select>
        </div>
      </div>

      {activeShedNums.length === 0 ? (
        <div style={{ textAlign: "center", color: "#888", padding: "60px 20px", fontSize: 14 }}>
          No active sheds configured. Check Settings → Active Sheds.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {shedChartData.map(({ shedNum, data, latest, latestTarget, variance }) => {
            const rows = log[shedNum] ?? [];
            const latestRow = latest;
            return (
              <div key={shedNum} style={{ background: "#fff", borderRadius: 10, border: "1px solid #dde8e0", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>

                {/* Card header */}
                <div style={{ background: "linear-gradient(135deg, var(--pm-primary) 0%, var(--pm-primary-mid) 100%)", color: "#fff", padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ background: "#C9A227", color: "#000", borderRadius: 5, padding: "2px 10px", fontWeight: 800, fontSize: 14 }}>SHED {shedNum}</div>

                    {latestRow && (
                      <>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 14, fontWeight: 800 }}>{latestRow.actual?.toLocaleString() ?? "—"} g</div>
                          <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.5 }}>Latest Wt</div>
                        </div>
                        {latestTarget > 0 && (
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 14, fontWeight: 800 }}>{latestTarget.toLocaleString()} g</div>
                            <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.5 }}>Target</div>
                          </div>
                        )}
                        {variance !== null && (
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: variance >= 0 ? "#C9A227" : "#ff8a80" }}>
                              {variance >= 0 ? "+" : ""}{variance.toLocaleString()} g
                            </div>
                            <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.5 }}>vs Target</div>
                          </div>
                        )}
                        {latestRow.unif && (
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 14, fontWeight: 800 }}>{latestRow.unif.toFixed(1)}%</div>
                            <div style={{ fontSize: 9, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.5 }}>Uniformity</div>
                          </div>
                        )}
                      </>
                    )}
                    {!latestRow && <span style={{ fontSize: 12, opacity: 0.7 }}>No data entered yet</span>}
                  </div>
                </div>

                {/* Weight chart */}
                {data.length > 1 && (
                  <div style={{ padding: "14px 16px 4px", borderBottom: "1px solid #f0f0f0" }}>
                    <ResponsiveContainer width="100%" height={200}>
                      <ComposedChart data={data} margin={{ top: 4, right: 20, bottom: 4, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                        <YAxis tickFormatter={v => v >= 1000 ? (v / 1000).toFixed(1) + "k" : v} tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                        <Tooltip formatter={(v: number, name: string) => [v.toLocaleString() + " g", name]} />
                        <Legend />
                        {selectedBreed !== "Manual" && (
                          <Line type="monotone" dataKey="target" name="Target" stroke="#C9A227" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
                        )}
                        <Line type="monotone" dataKey="actual" name="Actual" stroke="var(--pm-primary)" strokeWidth={2.5}
                          dot={{ r: 4, fill: "var(--pm-primary)", stroke: "#fff", strokeWidth: 2 }} connectNulls />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Entry table */}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--pm-primary-soft)" }}>
                      {[
                        { k: "date",          label: "Date",           w: "17%", align: "left"  },
                        { k: "ageWeeks",      label: "Age (wks)",      w: "11%", align: "right" },
                        { k: "actualWeight",  label: "Actual (g)",     w: "14%", align: "right" },
                        { k: "targetWeight",  label: "Target (g)",     w: "14%", align: "right" },
                        { k: "uniformity",    label: "Uniformity %",   w: "14%", align: "right" },
                        { k: "notes",         label: "Notes",          w: "22%", align: "left"  },
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
                      <tr><td colSpan={7} style={{ padding: "14px 8px", textAlign: "center", color: "#aaa", fontSize: 12 }}>No entries — click + Add Week below</td></tr>
                    )}
                    {rows.map((row, ci) => {
                      const age = n(row.ageWeeks);
                      const autoTarget = selectedBreed !== "Manual" && age > 0 && !n(row.targetWeight)
                        ? getBreedTarget(selectedBreed, age) : 0;
                      return (
                        <tr key={ci} style={{ borderTop: "1px solid #eef3ef", background: ci % 2 === 0 ? "#fff" : "#f9fcfa" }}>
                          {(["date", "ageWeeks", "actualWeight", "targetWeight", "uniformity", "notes"] as (keyof WeightRecord)[]).map(field => {
                            const align = (field === "date" || field === "notes") ? "left" : "right";
                            const editing = isEditing(shedNum, ci, field);
                            let display: React.ReactNode = row[field] || <span style={{ color: "#ccc" }}>—</span>;
                            if (field === "targetWeight" && !n(row.targetWeight) && autoTarget > 0) {
                              display = <span style={{ color: "#C9A227" }}>{autoTarget.toLocaleString()} <span style={{ fontSize: 9, opacity: 0.7 }}>(guide)</span></span>;
                            }
                            return (
                              <td key={field} style={{ padding: "5px 8px", textAlign: align, cursor: "pointer", background: editing ? "#fffde7" : "transparent", color: "#333" }}
                                onClick={() => startEdit(shedNum, ci, field, row[field])}>
                                {editing ? (
                                  <input style={{ ...inputStyle, textAlign: align as "left" | "right" }} value={editVal} autoFocus
                                    onChange={e => setEditVal(e.target.value)}
                                    onBlur={commitEdit}
                                    onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditCell(null); }} />
                                ) : display}
                              </td>
                            );
                          })}
                          <td style={{ padding: "4px 6px", textAlign: "center" }}>
                            <button onClick={() => deleteRow(shedNum, ci)} title="Delete"
                              style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div style={{ padding: "10px 14px", borderTop: "1px solid #eef3ef", background: "var(--pm-primary-soft)" }}>
                  <button onClick={() => addRow(shedNum)}
                    style={{ background: "var(--pm-primary)", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    + Add Week
                  </button>
                  {selectedBreed !== "Manual" && (
                    <span style={{ marginLeft: 10, fontSize: 11, color: "#888" }}>Gold target values auto-filled from {selectedBreed} guide — override by typing in the cell</span>
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
