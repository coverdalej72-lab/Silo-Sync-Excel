import React, { useState, useEffect, useCallback, useRef } from "react";
import { EobQrScanner, type DocketData } from "./EobQrScanner";

const SYNCED_IDS_KEY   = "eob-synced-delivery-ids";
const RECIPIENTS_KEY   = "eob-email-recipients";

function loadSyncedIds(): Set<number> {
  try { return new Set(JSON.parse(localStorage.getItem(SYNCED_IDS_KEY) || "[]")); } catch { return new Set(); }
}
function saveSyncedIds(ids: Set<number>) {
  localStorage.setItem(SYNCED_IDS_KEY, JSON.stringify([...ids]));
}

interface Recipient { id: string; name: string; email: string; }
function loadRecipients(): Recipient[] {
  try { return JSON.parse(localStorage.getItem(RECIPIENTS_KEY) || "[]"); } catch { return []; }
}
function saveRecipients(r: Recipient[]) {
  localStorage.setItem(RECIPIENTS_KEY, JSON.stringify(r));
}

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

const GREEN = "#1a5c36";

export function EndOfBatchContent({ sheet, edits, onEdit }: Props) {
  const { cells } = sheet;
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue]   = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [pendingDocket, setPendingDocket] = useState<DocketData | null>(null);
  const [selectedFeedType, setSelectedFeedType] = useState<number | null>(null);
  const [docketDate, setDocketDate]     = useState("");
  const [docketDocNo, setDocketDocNo]   = useState("");
  const [docketKg, setDocketKg]         = useState("");
  const [syncBanner, setSyncBanner]     = useState<{ count: number; error?: string } | null>(null);
  const [syncing, setSyncing]           = useState(false);
  const syncedOnMount                   = useRef(false);

  // ── Recipients ────────────────────────────────────────────────────────────
  const [recipients, setRecipients]     = useState<Recipient[]>(loadRecipients);
  const [showSendModal, setShowSendModal]       = useState(false);
  const [showManageModal, setShowManageModal]   = useState(false);
  const [checkedIds, setCheckedIds]     = useState<Set<string>>(new Set());
  const [newName, setNewName]           = useState("");
  const [newEmail, setNewEmail]         = useState("");
  const [editRecipientId, setEditRecipientId]   = useState<string | null>(null);

  const persistRecipients = (list: Recipient[]) => { setRecipients(list); saveRecipients(list); };

  function addRecipient() {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    const already = recipients.find(r => r.email.toLowerCase() === email);
    if (already) { setNewName(""); setNewEmail(""); return; }
    const rec: Recipient = { id: Date.now().toString(), name: newName.trim() || email, email };
    persistRecipients([...recipients, rec]);
    setNewName(""); setNewEmail("");
  }

  function deleteRecipient(id: string) {
    persistRecipients(recipients.filter(r => r.id !== id));
    setCheckedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
  }

  function toggleChecked(id: string) {
    setCheckedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

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

  // ── Delivery auto-sync from Silo Tracker ─────────────────────────────────
  const syncDeliveries = useCallback(async (silent = false) => {
    setSyncing(true);
    try {
      const res = await fetch("/api/deliveries");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const deliveries: Array<{
        id: number; feedType: string; amount: number; unit: string;
        notes: string | null; deliveryDate: string;
      }> = await res.json();

      const syncedIds = loadSyncedIds();
      const unsynced  = deliveries.filter(d => !syncedIds.has(d.id));
      if (unsynced.length === 0) {
        if (!silent) setSyncBanner({ count: 0 });
        setSyncing(false);
        return;
      }

      // Map feedType label → feedTypes entry
      function resolveFt(raw: string) {
        const lo = raw.toLowerCase();
        return feedTypes.find(ft =>
          ft.name.toLowerCase() === lo ||
          ft.name.toLowerCase().startsWith(lo.slice(0, 4)) ||
          lo.startsWith(ft.name.toLowerCase().slice(0, 4))
        ) ?? feedTypes[0];
      }

      // Snapshot current used rows per dateCol (so we don't collide during the loop)
      const usedRows: Record<number, Set<number>> = {};
      for (const ft of feedTypes) {
        usedRows[ft.cols[0]] = new Set();
        for (let r = 6; r <= 35; r++) {
          const v = g(r, ft.cols[0]);
          if (v && v !== "" && v !== "0") usedRows[ft.cols[0]].add(r);
        }
      }

      let count = 0;
      for (const d of unsynced) {
        const ft      = resolveFt(d.feedType);
        const dateCol = ft.cols[0];

        // Find next free row
        let freeRow = -1;
        for (let r = 6; r <= 35; r++) {
          if (!usedRows[dateCol].has(r)) { freeRow = r; break; }
        }
        if (freeRow < 0) { syncedIds.add(d.id); continue; } // sheet full for this type

        usedRows[dateCol].add(freeRow);

        // Format date → DD/MM/YYYY
        const dt  = new Date(d.deliveryDate);
        const dd  = String(dt.getUTCDate()).padStart(2, "0");
        const mm  = String(dt.getUTCMonth() + 1).padStart(2, "0");
        const yyyy = dt.getUTCFullYear();
        const dateStr = `${dd}/${mm}/${yyyy}`;

        // Doc number from notes
        const docNo = d.notes ? d.notes.replace(/^Doc:\s*/i, "").trim() : "";

        // Amount in kg
        const kg = d.unit === "t" ? d.amount * 1000 : d.amount;

        onEdit(`${freeRow},${ft.cols[0]}`, dateStr);
        if (docNo) onEdit(`${freeRow},${ft.cols[1]}`, docNo);
        onEdit(`${freeRow},${ft.cols[2]}`, String(kg));

        syncedIds.add(d.id);
        count++;
      }

      saveSyncedIds(syncedIds);
      setSyncBanner({ count });
    } catch (err) {
      setSyncBanner({ count: 0, error: String(err) });
    } finally {
      setSyncing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, cells, onEdit]);

  // Auto-sync once on mount
  useEffect(() => {
    if (syncedOnMount.current) return;
    syncedOnMount.current = true;
    syncDeliveries(true);
  }, [syncDeliveries]);

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

  function getNextEmptyRow(dateCol: number): number {
    for (let r = 6; r <= 35; r++) {
      const v = g(r, dateCol);
      if (!v || v === "" || v === "0") return r;
    }
    return 35;
  }

  function todayStr(): string {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  }

  function handleQrResult(data: DocketData) {
    setPendingDocket(data);
    setShowScanner(false);
    // Pre-fill editable fields from scanned data
    setDocketDate(data.deliveryDate ?? todayStr());
    setDocketDocNo(data.docNumber ?? "");
    setDocketKg(data.amountKg != null ? String(data.amountKg) : "");
    // Auto-select feed type if detected from QR
    if (data.feedType) {
      const idx = feedTypes.findIndex(ft =>
        ft.name.toLowerCase().includes(data.feedType!.toLowerCase()) ||
        data.feedType!.toLowerCase().includes(ft.name.toLowerCase())
      );
      if (idx >= 0) setSelectedFeedType(idx);
    }
  }

  function applyDocket() {
    if (!pendingDocket || selectedFeedType === null) return;
    const ft = feedTypes[selectedFeedType];
    const nextRow = getNextEmptyRow(ft.cols[0]);
    // Always write date (editable field, defaults to today)
    onEdit(`${nextRow},${ft.cols[0]}`, docketDate || todayStr());
    if (docketDocNo.trim()) onEdit(`${nextRow},${ft.cols[1]}`, docketDocNo.trim());
    const kgNum = parseFloat(docketKg.replace(/,/g, ""));
    if (!isNaN(kgNum) && kgNum > 0) onEdit(`${nextRow},${ft.cols[2]}`, String(kgNum));
    setPendingDocket(null);
    setSelectedFeedType(null);
    setDocketDate("");
    setDocketDocNo("");
    setDocketKg("");
  }

  const birdRows: number[] = [];
  for (let r = 4; r <= 20; r++) {
    const v = g(r, 21);
    if (v && v !== "" && !isNaN(Number(v)) && Number(v) > 0) birdRows.push(r);
  }

  const lastBatchLeft  = g(7,  18);
  const feedUsed       = g(18, 18);
  const feedLeft       = g(15, 18);

  // Live-compute Total Purchased by summing all delivery kg columns (3, 8, 12, 16) rows 6-35.
  // The formula cell at row 11 col 18 doesn't recalculate in-app, so we derive it ourselves.
  const deliveryKgCols = [3, 8, 12, 16];
  let liveTotalPurchased = 0;
  for (let r = 6; r <= 35; r++) {
    for (const col of deliveryKgCols) {
      const v = parseFloat(g(r, col).replace(/,/g, ""));
      if (!isNaN(v) && v > 0) liveTotalPurchased += v;
    }
  }
  // Fall back to formula cell value if no deliveries have been entered yet
  const totalPurchased = liveTotalPurchased > 0 ? String(liveTotalPurchased) : g(11, 18);

  const totalBirdsPlaced = birdRows.reduce((sum, r) => {
    const v = parseFloat(g(r, 22).replace(/,/g, ""));
    return sum + (isNaN(v) ? 0 : v);
  }, 0);

  // Helper: catched for a row.
  // Excel formulas in the catched column (col 23) may cache the placed count as a default
  // before any catch is recorded. To avoid showing inflated numbers, we suppress the value
  // when it equals the placed count AND no explicit catch edit exists for that row.
  function getCatchedForRow(r: number): number {
    const catchedKey = `${r},23`;
    const placed = parseFloat(g(r, 22).replace(/,/g, "")) || 0;
    const hasEdit = edits.has(catchedKey);
    const v = parseFloat(g(r, 23).replace(/,/g, "")) || 0;
    if (!hasEdit && v > 0 && v === placed) return 0;
    return v;
  }

  // Live-compute Birds Caught total — formula cells don't recalculate in-app
  const totalBirdsCatched = birdRows.reduce((sum, r) => sum + getCatchedForRow(r), 0);

  // Morts for a row — only use the actual recorded value in col 24.
  // Never fall back to placed-caught: that gives wrong results because
  // some birds may still be alive in the shed and not yet caught.
  function getMortsForRow(r: number): number {
    const mortsCell = parseFloat(g(r, 24).replace(/,/g, ""));
    return (!isNaN(mortsCell) && mortsCell > 0) ? mortsCell : 0;
  }

  // Live-compute total morts
  const totalBirdsMorts = birdRows.reduce((sum, r) => sum + getMortsForRow(r), 0);

  // Balance per row = Placed - Morts - Caught (birds unaccounted / still in shed)
  function getBalanceForRow(r: number): number | null {
    const placed = parseFloat(g(r, 22).replace(/,/g, "")) || 0;
    if (placed === 0) return null;
    return placed - getMortsForRow(r) - getCatchedForRow(r);
  }

  const totalBalance = birdRows.reduce((sum, r) => {
    const b = getBalanceForRow(r);
    return sum + (b ?? 0);
  }, 0);

  // ── Email Report ─────────────────────────────────────────────────────────────
  function buildEmailBody(): string {
    const lines: string[] = [];
    lines.push(`END OF BATCH REPORT`);
    lines.push(`Batch: ${sheet.name}`);
    lines.push(`Generated: ${new Date().toLocaleDateString("en-AU")}`);
    lines.push(``);

    // Feed deliveries
    lines.push(`========================================`);
    lines.push(`FEED DELIVERIES`);
    lines.push(`========================================`);
    lines.push(``);
    let hasAnyDelivery = false;
    for (const ft of feedTypes) {
      const rows = getDeliveryRows(ft.cols[0]).filter(r => {
        const v = g(r, ft.cols[2]).replace(/,/g, "");
        return parseFloat(v) > 0;
      });
      const total = rows.reduce((sum, r) => {
        const v = parseFloat(g(r, ft.cols[2]).replace(/,/g, ""));
        return sum + (isNaN(v) ? 0 : v);
      }, 0);
      if (total === 0) continue;
      hasAnyDelivery = true;
      lines.push(`${ft.name.toUpperCase()}`);
      lines.push(`${"Date".padEnd(14)}${"Docket #".padEnd(18)}kg`);
      lines.push(`${"-".repeat(44)}`);
      for (const r of rows) {
        const rawDate = g(r, ft.cols[0]);
        const date = rawDate && !isNaN(Number(rawDate)) && Number(rawDate) > 40000
          ? excelDateToStr(Number(rawDate)) : rawDate;
        const docket = g(r, ft.cols[1]) || "—";
        const kgRaw = parseFloat(g(r, ft.cols[2]).replace(/,/g, ""));
        if (isNaN(kgRaw) || kgRaw <= 0) continue;
        lines.push(`${date.padEnd(14)}${docket.padEnd(18)}${kgRaw.toLocaleString()} kg`);
      }
      lines.push(`${"TOTAL".padEnd(32)}${total.toLocaleString()} kg`);
      lines.push(``);
    }
    if (!hasAnyDelivery) lines.push(`No deliveries recorded.`);
    lines.push(`TOTAL FEED PURCHASED: ${liveTotalPurchased > 0 ? liveTotalPurchased.toLocaleString() : (g(11, 18) || "—")} kg`);
    lines.push(``);

    // Bird summary
    lines.push(`========================================`);
    lines.push(`BIRD SUMMARY`);
    lines.push(`========================================`);
    lines.push(``);
    if (birdRows.length === 0) {
      lines.push(`No shed data recorded.`);
    } else {
      lines.push(`${"Shed".padEnd(12)}${"Placed".padEnd(12)}${"- Morts".padEnd(12)}${"- Caught".padEnd(12)}Balance`);
      lines.push(`${"-".repeat(60)}`);
      for (const r of birdRows) {
        const shed    = g(r, 21);
        const placed  = parseFloat(g(r, 22).replace(/,/g, "")) || 0;
        const morts   = getMortsForRow(r);
        const caught  = getCatchedForRow(r);
        const balance = getBalanceForRow(r) ?? 0;
        lines.push(
          `${shed.padEnd(12)}${placed.toLocaleString().padEnd(12)}${(morts > 0 ? `-${morts.toLocaleString()}` : "—").padEnd(12)}${(caught > 0 ? `-${caught.toLocaleString()}` : "—").padEnd(12)}${balance.toLocaleString()}`
        );
      }
      lines.push(`${"-".repeat(60)}`);
      lines.push(
        `${"TOTALS".padEnd(12)}${totalBirdsPlaced.toLocaleString().padEnd(12)}${(totalBirdsMorts > 0 ? `-${totalBirdsMorts.toLocaleString()}` : "—").padEnd(12)}${(totalBirdsCatched > 0 ? `-${totalBirdsCatched.toLocaleString()}` : "—").padEnd(12)}${totalBalance.toLocaleString()}`
      );
    }
    lines.push(``);

    // Feed summary
    lines.push(`========================================`);
    lines.push(`FEED SUMMARY`);
    lines.push(`========================================`);
    lines.push(``);
    lines.push(`Last Batch Left:    ${g(7,  18) || "—"} kg`);
    lines.push(`Total Delivered:    ${liveTotalPurchased > 0 ? liveTotalPurchased.toLocaleString() : (g(11, 18) || "—")} kg`);
    lines.push(`Total Used:         ${g(18, 18) || "—"} kg`);
    lines.push(`Feed Left:          ${g(15, 18) || "—"} kg`);
    lines.push(``);
    lines.push(`-- Report generated by Farm Buddy™`);
    return lines.join("\n");
  }

  function sendBatchEmail(toList: Recipient[]) {
    const subject = `End of Batch Report — ${sheet.name}`;
    const body    = buildEmailBody();
    const to      = toList.map(r => r.email).join(",");
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setShowSendModal(false);
  }

  const thStyle: React.CSSProperties = {
    padding: "6px 10px", fontWeight: 600, fontSize: 11, color: "#64748b",
    textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap",
    borderBottom: "1px solid #e2e8f0",
  };

  return (
    <div style={{ padding: "16px 18px 24px", background: "#f8fafc", minHeight: "100%", boxSizing: "border-box" }}>

      {showScanner && (
        <EobQrScanner
          onClose={() => setShowScanner(false)}
          onResult={handleQrResult}
        />
      )}

      {/* ── Send Report Modal ─────────────────────────────────────── */}
      {showSendModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "22px 22px 18px", width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>✉️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#111" }}>Send Report</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>Select who to email this batch report to</div>
              </div>
              <button onClick={() => setShowSendModal(false)} style={{ background: "none", border: "none", fontSize: 20, color: "#94a3b8", cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>

            {/* Select all / none */}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setCheckedIds(new Set(recipients.map(r => r.id)))}
                style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer" }}>
                Select All
              </button>
              <button onClick={() => setCheckedIds(new Set())}
                style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer" }}>
                Clear
              </button>
            </div>

            {/* Recipient checkboxes */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
              {recipients.map(r => (
                <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, border: `2px solid ${checkedIds.has(r.id) ? "#1a5c36" : "#e2e8f0"}`, background: checkedIds.has(r.id) ? "#f0fdf4" : "#fff", cursor: "pointer", transition: "all 0.15s" }}>
                  <input type="checkbox" checked={checkedIds.has(r.id)} onChange={() => toggleChecked(r.id)}
                    style={{ width: 18, height: 18, accentColor: "#1a5c36", cursor: "pointer" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.email}</div>
                  </div>
                </label>
              ))}
            </div>

            {/* Manage link */}
            <button onClick={() => { setShowSendModal(false); setShowManageModal(true); }}
              style={{ background: "none", border: "none", color: "#2563eb", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left", padding: 0 }}>
              + Manage recipients
            </button>

            {/* Send button */}
            <button
              onClick={() => sendBatchEmail(recipients.filter(r => checkedIds.has(r.id)))}
              disabled={checkedIds.size === 0}
              style={{ padding: "13px 0", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 15, cursor: checkedIds.size > 0 ? "pointer" : "not-allowed", background: checkedIds.size > 0 ? "#1a5c36" : "#d1d5db", color: "#fff" }}>
              ✉️ Open Email App {checkedIds.size > 0 ? `(${checkedIds.size})` : ""}
            </button>
          </div>
        </div>
      )}

      {/* ── Manage Recipients Modal ───────────────────────────────── */}
      {showManageModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "22px 22px 18px", width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>👥</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#111" }}>Manage Recipients</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>Saved contacts for batch reports</div>
              </div>
              <button onClick={() => setShowManageModal(false)} style={{ background: "none", border: "none", fontSize: 20, color: "#94a3b8", cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>

            {/* Saved list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
              {recipients.length === 0 && (
                <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", padding: "12px 0" }}>No recipients saved yet</div>
              )}
              {recipients.map(r => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.email}</div>
                  </div>
                  <button onClick={() => deleteRecipient(r.id)}
                    style={{ background: "none", border: "none", fontSize: 16, color: "#dc2626", cursor: "pointer", padding: "2px 4px", lineHeight: 1, borderRadius: 4 }}>🗑</button>
                </div>
              ))}
            </div>

            {/* Add new */}
            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Add New Recipient</div>
              <input
                placeholder="Name (e.g. Processing Co.)"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" }}
              />
              <input
                placeholder="Email address"
                type="email"
                inputMode="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addRecipient(); }}
                style={{ border: `1px solid ${newEmail ? "#1a5c36" : "#e2e8f0"}`, borderRadius: 8, padding: "9px 12px", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" }}
              />
              <button
                onClick={addRecipient}
                disabled={!newEmail.trim()}
                style={{ padding: "11px 0", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 14, cursor: newEmail.trim() ? "pointer" : "not-allowed", background: newEmail.trim() ? "#1a5c36" : "#d1d5db", color: "#fff" }}>
                + Add Recipient
              </button>
            </div>

            {recipients.length > 0 && (
              <button
                onClick={() => { setShowManageModal(false); setCheckedIds(new Set(recipients.map(r => r.id))); setShowSendModal(true); }}
                style={{ padding: "11px 0", borderRadius: 10, border: "1.5px solid #1a5c36", background: "#f0fdf4", color: "#1a5c36", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                ✉️ Send Report Now
              </button>
            )}
          </div>
        </div>
      )}

      {/* Feed type selector modal after scan */}
      {pendingDocket && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "22px 22px 18px", width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: "#111", marginBottom: 4 }}>
              {pendingDocket?.rawText ? "Docket Scanned ✓" : "Add Delivery"}
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>
              {pendingDocket?.rawText
                ? "Check or fill in the details below, then select the feed type"
                : "Enter delivery details and select the feed type"}
            </div>

            {/* Editable docket fields — pre-filled from QR, user can correct */}
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13, display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ color: "#64748b", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Delivery Date</span>
                <input
                  type="text"
                  placeholder="DD/MM/YYYY"
                  value={docketDate}
                  onChange={e => setDocketDate(e.target.value)}
                  style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "7px 10px", fontSize: 14, fontWeight: 600, background: docketDate ? "#fff" : "#fff8dc", outline: "none", width: "100%", boxSizing: "border-box" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ color: "#64748b", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Docket / Doc No</span>
                <input
                  type="text"
                  placeholder="e.g. DOC-12345 (optional)"
                  value={docketDocNo}
                  onChange={e => setDocketDocNo(e.target.value)}
                  style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "7px 10px", fontSize: 14, fontWeight: 600, background: "#fff", outline: "none", width: "100%", boxSizing: "border-box" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ color: "#64748b", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Kilograms</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 5000 (required)"
                  value={docketKg}
                  onChange={e => setDocketKg(e.target.value)}
                  style={{ border: `1px solid ${docketKg ? "#e2e8f0" : "#fbbf24"}`, borderRadius: 6, padding: "7px 10px", fontSize: 14, fontWeight: 600, background: docketKg ? "#fff" : "#fff8dc", outline: "none", width: "100%", boxSizing: "border-box" }}
                />
                {!docketKg && <span style={{ fontSize: 11, color: "#d97706" }}>Enter kg amount (not found in QR)</span>}
              </label>
            </div>

            {/* Feed type selector */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
              {feedTypes.map((ft, idx) => (
                <button
                  key={ft.name}
                  onClick={() => setSelectedFeedType(idx)}
                  style={{
                    padding: "12px 8px", borderRadius: 10, border: `2px solid ${selectedFeedType === idx ? ft.color : "#e2e8f0"}`,
                    background: selectedFeedType === idx ? ft.bg : "#fff",
                    color: selectedFeedType === idx ? ft.color : "#374151",
                    fontWeight: 700, fontSize: 14, cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {ft.name}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => { setPendingDocket(null); setSelectedFeedType(null); setDocketDate(""); setDocketDocNo(""); setDocketKg(""); }}
                style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={applyDocket}
                disabled={selectedFeedType === null || !docketKg.trim()}
                style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: selectedFeedType !== null && docketKg.trim() ? GREEN : "#d1d5db", color: "#fff", fontWeight: 700, fontSize: 14, cursor: selectedFeedType !== null && docketKg.trim() ? "pointer" : "not-allowed" }}
              >
                Add to {selectedFeedType !== null ? feedTypes[selectedFeedType].name : "…"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Feed Deliveries ───────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: syncBanner ? 8 : 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: "#94a3b8" }}>
          Feed Deliveries
        </span>
        <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
        <button
          onClick={() => syncDeliveries(false)}
          disabled={syncing}
          title="Sync deliveries from Silo Tracker"
          style={{ display: "flex", alignItems: "center", gap: 5, background: "#f0fdf4", color: GREEN, border: `1.5px solid ${GREEN}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: syncing ? "default" : "pointer", opacity: syncing ? 0.6 : 1, whiteSpace: "nowrap" }}
        >
          {syncing ? "⏳" : "🔄"} Sync
        </button>
        <button
          onClick={() => {
            setPendingDocket({ rawText: "" });
            setDocketDate(todayStr());
            setDocketDocNo("");
            setDocketKg("");
            setSelectedFeedType(null);
          }}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "#fff", color: GREEN, border: `1.5px solid ${GREEN}`, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
        >
          + Manual
        </button>
        <button
          onClick={() => setShowScanner(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: GREEN, color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
        >
          <span style={{ fontSize: 16 }}>⬛</span> Scan QR
        </button>
      </div>

      {/* Sync banner */}
      {syncBanner && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: syncBanner.error ? "#fef2f2" : syncBanner.count > 0 ? "#f0fdf4" : "#f8fafc",
          border: `1px solid ${syncBanner.error ? "#fca5a5" : syncBanner.count > 0 ? "#bbf7d0" : "#e2e8f0"}`,
          borderRadius: 8, padding: "7px 12px", marginBottom: 10, fontSize: 12,
          color: syncBanner.error ? "#dc2626" : syncBanner.count > 0 ? "#15803d" : "#64748b",
        }}>
          <span>
            {syncBanner.error
              ? `⚠️ Sync failed: ${syncBanner.error}`
              : syncBanner.count > 0
                ? `✅ Auto-synced ${syncBanner.count} new deliver${syncBanner.count === 1 ? "y" : "ies"} from Silo Tracker`
                : `✓ All deliveries up to date`}
          </span>
          <button
            onClick={() => setSyncBanner(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 14, padding: "0 2px", lineHeight: 1 }}
          >×</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginBottom: 18 }}>
        {feedTypes.map(({ name, cols, color, bg }) => {
          const rows  = getDeliveryRows(cols[0]);
          const total = rows.reduce((sum, r) => {
            const v = parseFloat(g(r, cols[2]).replace(/,/g, ""));
            return sum + (isNaN(v) ? 0 : v);
          }, 0);
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
        <button
          onClick={() => {
            if (recipients.length === 0) {
              setShowManageModal(true);
            } else {
              setCheckedIds(new Set(recipients.map(r => r.id)));
              setShowSendModal(true);
            }
          }}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "#1a5c36", color: "#fff", border: "none",
            borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700,
            cursor: "pointer", whiteSpace: "nowrap", letterSpacing: 0.3,
          }}
        >
          ✉️ Email Report
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "start" }}>

        {/* Bird Summary table */}
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0",
          overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <div style={{ background: "#1a5c36", padding: "8px 14px", display: "flex",
            alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>Bird Summary</span>
            {(totalBirdsPlaced > 0) && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {totalBirdsMorts > 0 && (
                  <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 11 }}>
                    <strong style={{ color: "#fca5a5" }}>−{totalBirdsMorts.toLocaleString()}</strong> morts
                  </span>
                )}
                {totalBirdsCatched > 0 && (
                  <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 11 }}>
                    <strong style={{ color: "#fff" }}>−{totalBirdsCatched.toLocaleString()}</strong> caught
                  </span>
                )}
                {(totalBirdsCatched > 0 || totalBirdsMorts > 0) && (
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: totalBalance === 0 ? "#86efac" : totalBalance > 0 ? "#fde68a" : "#fca5a5",
                    background: "rgba(0,0,0,0.25)", borderRadius: 5, padding: "1px 7px",
                  }}>
                    = {totalBalance.toLocaleString()} bal
                  </span>
                )}
              </div>
            )}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f0fdf4" }}>
                <th style={{ ...thStyle, textAlign: "center" }}>Shed</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Placed</th>
                <th style={{ ...thStyle, textAlign: "right", color: "#dc2626" }}>− Morts</th>
                <th style={{ ...thStyle, textAlign: "right" }}>− Caught</th>
                <th style={{ ...thStyle, textAlign: "right", color: "#1a5c36" }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {birdRows.map((r, i) => {
                const morts   = getMortsForRow(r);
                const caught  = getCatchedForRow(r);
                const balance = getBalanceForRow(r);
                const placed  = parseFloat(g(r, 22).replace(/,/g, "")) || 0;
                return (
                  <tr key={r} style={{ borderBottom: "1px solid #f1f5f9",
                    background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "3px 12px", textAlign: "center", fontWeight: 600, color: "#1a5c36", fontSize: 12 }}>
                      {g(r, 21)}
                    </td>
                    <td style={{ padding: "1px 0" }}><Cell r={r} c={22} align="right" muted /></td>
                    <td style={{ padding: "3px 10px", textAlign: "right" }}>
                      <span style={{ color: morts > 0 ? "#dc2626" : "#94a3b8", fontWeight: morts > 0 ? 600 : 400, fontSize: 12 }}>
                        {morts > 0 ? `−${morts.toLocaleString()}` : "—"}
                      </span>
                    </td>
                    <td style={{ padding: "3px 10px", textAlign: "right" }}>
                      <span style={{ color: caught > 0 ? "#374151" : "#94a3b8", fontSize: 12 }}>
                        {caught > 0 ? `−${caught.toLocaleString()}` : "—"}
                      </span>
                    </td>
                    <td style={{ padding: "3px 10px", textAlign: "right" }}>
                      {placed > 0 ? (
                        <span style={{
                          fontWeight: 700, fontSize: 12,
                          color: balance === 0 ? "#1a5c36" : (balance ?? 0) > 0 ? "#92400e" : "#dc2626",
                        }}>
                          {(balance ?? 0).toLocaleString()}
                        </span>
                      ) : <span style={{ color: "#94a3b8" }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {totalBirdsPlaced > 0 && (
              <tfoot>
                <tr style={{ background: "#f0fdf4", borderTop: "2px solid #e2e8f0" }}>
                  <td style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, color: "#1a5c36",
                    textTransform: "uppercase", letterSpacing: 0.5 }}>Total</td>
                  <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 700, color: "#1a5c36", fontSize: 12 }}>
                    {totalBirdsPlaced.toLocaleString()}
                  </td>
                  <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 700, color: "#dc2626", fontSize: 12 }}>
                    {totalBirdsMorts > 0 ? `−${totalBirdsMorts.toLocaleString()}` : "—"}
                  </td>
                  <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 700, color: "#374151", fontSize: 12 }}>
                    {totalBirdsCatched > 0 ? `−${totalBirdsCatched.toLocaleString()}` : "—"}
                  </td>
                  <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 800, fontSize: 13,
                    color: totalBalance === 0 ? "#1a5c36" : totalBalance > 0 ? "#92400e" : "#dc2626" }}>
                    {totalBalance.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Feed Summary card */}
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0",
          overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", minWidth: 230 }}>
          <div style={{ background: "#C9A227", padding: "8px 14px", display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ color: "#1a1a00", fontWeight: 700, fontSize: 13 }}>Feed Summary</span>
            <span style={{ color: "rgba(0,0,0,0.45)", fontSize: 10 }}>click to edit</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <tbody>
              {([
                { label: "Last Batch Left",  r: 7,  c: 18, accent: false, liveVal: null },
                { label: "Total Delivered",  r: 11, c: 18, accent: false, liveVal: liveTotalPurchased > 0 ? liveTotalPurchased.toLocaleString() : null },
                { label: "Total Used",       r: 18, c: 18, accent: false, liveVal: null },
                { label: "Feed Left",        r: 15, c: 18, accent: true,  liveVal: null },
              ] as { label: string; r: number; c: number; accent: boolean; liveVal: string | null }[]).map(({ label, r, c, accent, liveVal }) => (
                <tr key={label} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "7px 14px", fontSize: 11, color: "#64748b", fontWeight: 500, whiteSpace: "nowrap" }}>
                    {label}
                  </td>
                  <td style={{ padding: "2px 0", width: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                      <span style={{ fontWeight: 700, color: accent ? "#16a34a" : "#1e293b", fontSize: 13, flex: 1, textAlign: "right", padding: "3px 6px" }}>
                        {liveVal !== null ? liveVal : <Cell r={r} c={c} align="right" muted />}
                      </span>
                      <span style={{ padding: "0 10px 0 4px", fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>kg</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
