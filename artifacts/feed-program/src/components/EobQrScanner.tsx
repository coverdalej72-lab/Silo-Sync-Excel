import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

export interface DocketData {
  amountKg?: number;
  deliveryDate?: string;
  docNumber?: string;
  feedType?: string;
  rawText: string;
}

function parseCsv(raw: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '"') {
      i++;
      let field = "";
      while (i < raw.length) {
        if (raw[i] === '"' && raw[i + 1] === '"') { field += '"'; i += 2; }
        else if (raw[i] === '"') { i++; break; }
        else field += raw[i++];
      }
      fields.push(field);
    } else {
      let field = "";
      while (i < raw.length && raw[i] !== ",") field += raw[i++];
      fields.push(field.trim());
    }
    if (i < raw.length && raw[i] === ",") i++;
  }
  return fields;
}

function parseDate(raw: string): string {
  const parts = raw.split(/[\/\-]/);
  if (parts.length === 3) {
    let [a, b, c] = parts;
    if (c.length === 2) c = "20" + c;
    if (c.length === 4) return `${a.padStart(2, "0")}/${b.padStart(2, "0")}/${c}`;
  }
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  }
  return raw;
}

export function parseDocketQr(raw: string): DocketData {
  const result: DocketData = { rawText: raw };

  if (raw.trimStart().startsWith('"')) {
    const fields = parseCsv(raw);
    if (fields.length >= 14) {
      result.docNumber   = fields[1] || undefined;
      if (fields[2]) result.deliveryDate = parseDate(fields[2]);
      result.feedType    = fields[7] || undefined;
      const netIdx = fields.length - 1;
      const net = parseFloat(fields[netIdx].replace(/[^\d.]/g, ""));
      if (!isNaN(net) && net > 0) result.amountKg = net;
      return result;
    }
  }

  try {
    const url = new URL(raw);
    const p = url.searchParams;
    const net = p.get("net") ?? p.get("netWeight") ?? p.get("weight");
    if (net) result.amountKg = parseFloat(net.replace(/[^\d.]/g, ""));
    result.docNumber = p.get("ticket") ?? p.get("ticketNo") ?? p.get("dispatch") ?? undefined;
    result.feedType  = p.get("feedType") ?? p.get("feed") ?? undefined;
    const d = p.get("date") ?? p.get("deliveryDate");
    if (d) result.deliveryDate = parseDate(d);
    return result;
  } catch {}

  try {
    const obj = JSON.parse(raw);
    const net = obj.netWeight ?? obj.net ?? obj.weight;
    if (net) result.amountKg = parseFloat(String(net).replace(/[^\d.]/g, ""));
    result.docNumber = obj.ticketNo ?? obj.ticket ?? obj.dispatchNo ?? undefined;
    result.feedType  = obj.feedType ?? obj.feed ?? undefined;
    const d = obj.deliveryDate ?? obj.date;
    if (d) result.deliveryDate = parseDate(d);
    return result;
  } catch {}

  const delimiters = ["|", ";", "\t"];
  for (const delim of delimiters) {
    if (raw.includes(delim)) {
      const parts = raw.split(delim).map(s => s.trim());
      for (const part of parts) {
        const dateMatch = part.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
        if (dateMatch && !result.deliveryDate) { result.deliveryDate = parseDate(dateMatch[1]); continue; }
        const n = parseFloat(part.replace(/[^\d.]/g, ""));
        if (!isNaN(n) && n > 500 && !result.amountKg) { result.amountKg = n; continue; }
        if (part.length >= 3 && !result.docNumber) result.docNumber = part;
      }
      return result;
    }
  }

  const netMatch = raw.match(/net[:\s]*([0-9,]+\.?[0-9]*)\s*(kg)?/i);
  if (netMatch) result.amountKg = parseFloat(netMatch[1].replace(/,/g, ""));

  const ticketMatch = raw.match(/ticket[^:]*no[^:]*:\s*([^\n\r|,;]+)/i) ?? raw.match(/ticket[^:]*:\s*([^\n\r|,;]+)/i);
  if (ticketMatch) result.docNumber = ticketMatch[1].trim();

  const dispatchMatch = raw.match(/dispatch[^:]*no[^:]*:\s*([^\n\r|,;]+)/i);
  if (dispatchMatch && !result.docNumber) result.docNumber = dispatchMatch[1].trim();

  const dateMatch = raw.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
  if (dateMatch) result.deliveryDate = parseDate(dateMatch[1]);

  const bigNum = raw.match(/\b(\d{4,6})\b/);
  if (bigNum && !result.amountKg) {
    const n = parseFloat(bigNum[1]);
    if (n > 500 && n < 200000) result.amountKg = n;
  }

  return result;
}

interface EobQrScannerProps {
  onClose: () => void;
  onResult: (data: DocketData) => void;
}

export function EobQrScanner({ onClose, onResult }: EobQrScannerProps) {
  const containerId = "eob-qr-container";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isRunningRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<DocketData | null>(null);

  const stopScanner = async () => {
    if (scannerRef.current && isRunningRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      isRunningRef.current = false;
    }
  };

  const startScanner = () => {
    setError(null);
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;
    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        async (text) => { await stopScanner(); setScanned(parseDocketQr(text)); },
        () => {}
      )
      .then(() => { isRunningRef.current = true; })
      .catch(() => {
        isRunningRef.current = false;
        setError("Camera access denied. Please allow camera permissions and try again.");
      });
  };

  useEffect(() => {
    startScanner();
    return () => { stopScanner(); };
  }, []);

  const handleScanAgain = async () => {
    setScanned(null);
    setTimeout(() => startScanner(), 100);
  };

  const GREEN = "#1a5c36";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px" }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>Scan Docket QR</span>
        <button onClick={async () => { await stopScanner(); onClose(); }}
          style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 14, cursor: "pointer" }}>
          ✕ Close
        </button>
      </div>

      {!scanned && (
        <>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div id={containerId} style={{ width: 300, maxWidth: "90vw" }} />
          </div>
          {error && <div style={{ padding: 16, textAlign: "center", color: "#f87171", fontSize: 14 }}>{error}</div>}
          <div style={{ padding: "16px", textAlign: "center", color: "rgba(255,255,255,0.55)", fontSize: 13, paddingBottom: 32 }}>
            Point camera at the QR code on the delivery docket
          </div>
        </>
      )}

      {scanned && (() => {
        const nothingParsed = !scanned.deliveryDate && !scanned.docNumber && scanned.amountKg == null;
        const today = (() => { const d = new Date(); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`; })();
        return (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 20px", gap: 12 }}>
            <div style={{ background: "#fff", borderRadius: 16, padding: "20px 22px" }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: nothingParsed ? "#dc2626" : "#111", marginBottom: 4 }}>
                {nothingParsed ? "⚠️ QR Format Not Recognised" : "Docket Scanned ✓"}
              </div>
              {nothingParsed && (
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                  The QR code was read but no docket data could be extracted. You can still proceed — the row will be added with today's date so you can fill in the details manually.
                </div>
              )}
              {[
                { label: "Document No", value: scanned.docNumber },
                {
                  label: "Date",
                  value: scanned.deliveryDate,
                  fallback: `${today} (today)`,
                },
                { label: "Kilos", value: scanned.amountKg != null ? `${scanned.amountKg.toLocaleString()} kg` : undefined },
                { label: "Feed Type", value: scanned.feedType },
              ].map(({ label, value, fallback }: { label: string; value?: string; fallback?: string }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", padding: "10px 0", fontSize: 14 }}>
                  <span style={{ color: "#64748b" }}>{label}</span>
                  <span style={{ fontWeight: 700, color: value ? "#111" : (fallback ? "#f59e0b" : "#cbd5e1"), fontSize: value ? 14 : 12 }}>
                    {value ?? fallback ?? "—"}
                  </span>
                </div>
              ))}
              {nothingParsed && (
                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 8, wordBreak: "break-all" }}>Raw: {scanned.rawText}</div>
              )}
            </div>
            <button onClick={() => onResult(scanned)}
              style={{ width: "100%", background: GREEN, color: "#fff", fontWeight: 700, fontSize: 16, padding: "15px 0", borderRadius: 12, border: "none", cursor: "pointer" }}>
              {nothingParsed ? "Add Empty Row →" : "Use This Data →"}
            </button>
            <button onClick={handleScanAgain}
              style={{ width: "100%", background: "rgba(255,255,255,0.12)", color: "#fff", fontWeight: 600, fontSize: 14, padding: "12px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer" }}>
              Scan Again
            </button>
          </div>
        );
      })()}
    </div>
  );
}
