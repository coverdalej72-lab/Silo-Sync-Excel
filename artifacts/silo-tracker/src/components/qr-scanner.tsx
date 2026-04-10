import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface DocketData {
  amountKg?: number;
  deliveryDate?: string;
  docNumber?: string;
  feedType?: string;
  rawText: string;
}

// Parse a quoted-CSV string (handles "field1","field2",... format)
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

function parseDocketQr(raw: string): DocketData {
  const result: DocketData = { rawText: raw };

  // ── BPL Adelaide / Australian mill quoted-CSV format ──────────────────────
  // "Supplier","TicketNo","Date","LoadTime","DelivTime","Ref","ProdCode",
  // "FeedType","OrderNo","Farm","Rego","Driver","Ref2","GrossKg","TareKg","NetKg"
  if (raw.trimStart().startsWith('"')) {
    const fields = parseCsv(raw);
    if (fields.length >= 14) {
      result.docNumber   = fields[1] || undefined;
      if (fields[2]) result.deliveryDate = parseDate(fields[2]);
      result.feedType    = fields[7] || undefined;
      // Net weight is last field (gross - tare = net)
      const netIdx = fields.length - 1;
      const net = parseFloat(fields[netIdx].replace(/[^\d.]/g, ""));
      if (!isNaN(net) && net > 0) result.amountKg = net;
      return result;
    }
  }

  // ── URL query-string format ────────────────────────────────────────────────
  try {
    const url = new URL(raw);
    const p = url.searchParams;
    const net = p.get("net") ?? p.get("netWeight") ?? p.get("weight");
    if (net) result.amountKg = parseFloat(net.replace(/[^\d.]/g, ""));
    result.docNumber = p.get("ticket") ?? p.get("ticketNo") ?? p.get("dispatch") ?? p.get("dispatchNo") ?? undefined;
    result.feedType  = p.get("feedType") ?? p.get("feed") ?? undefined;
    const d = p.get("date") ?? p.get("deliveryDate");
    if (d) result.deliveryDate = parseDate(d);
    return result;
  } catch {}

  // ── JSON object format ─────────────────────────────────────────────────────
  try {
    const obj = JSON.parse(raw);
    const net = obj.netWeight ?? obj.net ?? obj.weight;
    if (net) result.amountKg = parseFloat(String(net).replace(/[^\d.]/g, ""));
    result.docNumber = obj.ticketNo ?? obj.ticket ?? obj.dispatchNo ?? obj.dispatch ?? undefined;
    result.feedType  = obj.feedType ?? obj.feed ?? undefined;
    const d = obj.deliveryDate ?? obj.date;
    if (d) result.deliveryDate = parseDate(d);
    return result;
  } catch {}

  // ── Delimited (pipe / comma / semicolon / tab) format ─────────────────────
  const delimiters = ["|", ";", "\t"];
  for (const delim of delimiters) {
    if (raw.includes(delim)) {
      const parts = raw.split(delim).map((s) => s.trim());
      for (const part of parts) {
        const dateMatch = part.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
        if (dateMatch && !result.deliveryDate) { result.deliveryDate = parseDate(dateMatch[1]); continue; }
        const n = parseFloat(part.replace(/[^\d.]/g, ""));
        if (!isNaN(n) && n > 500 && !result.amountKg) { result.amountKg = n; continue; }
        const clean = part.replace(/[^a-zA-Z0-9]/g, "");
        if (clean.length >= 3 && !result.docNumber) result.docNumber = part.trim();
      }
      return result;
    }
  }

  // ── Plain-text keyword fallback ────────────────────────────────────────────
  const netMatch = raw.match(/net[:\s]*([0-9,]+\.?[0-9]*)\s*(kg)?/i);
  if (netMatch) result.amountKg = parseFloat(netMatch[1].replace(/,/g, ""));

  const ticketMatch = raw.match(/ticket[^:]*no[^:]*:\s*([^\n\r|,;]+)/i) ?? raw.match(/ticket[^:]*:\s*([^\n\r|,;]+)/i);
  if (ticketMatch) result.docNumber = ticketMatch[1].trim();

  const dispatchMatch = raw.match(/dispatch[^:]*no[^:]*:\s*([^\n\r|,;]+)/i) ?? raw.match(/dispatch[^:]*:\s*([^\n\r|,;]+)/i);
  if (dispatchMatch && !result.docNumber) result.docNumber = dispatchMatch[1].trim();

  const dateMatch = raw.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
  if (dateMatch) result.deliveryDate = parseDate(dateMatch[1]);

  return result;
}

function parseDate(raw: string): string {
  const parts = raw.split(/[\/\-]/);
  if (parts.length === 3) {
    let [a, b, c] = parts;
    if (c.length === 2) c = "20" + c;
    if (c.length === 4) return `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
  }
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return raw;
}

interface QrScannerProps {
  onResult: (data: DocketData) => void;
  onClose: () => void;
}

export function QrScanner({ onResult, onClose }: QrScannerProps) {
  const containerId = "qr-scanner-container";
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

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      <div className="flex items-center justify-between p-4 text-white">
        <span className="font-bold text-lg">Scan Docket</span>
        <button onClick={onClose} className="p-2">
          <X className="h-6 w-6" />
        </button>
      </div>

      {!scanned && (
        <>
          <div className="flex-1 flex items-center justify-center">
            <div id={containerId} className="w-full max-w-sm" />
          </div>
          {error && <div className="p-4 text-center text-red-400 text-sm">{error}</div>}
          <div className="p-4 text-center text-white/60 text-sm pb-10">
            Point the camera at the QR code on the delivery docket
          </div>
        </>
      )}

      {scanned && (
        <div className="flex-1 flex flex-col justify-center p-6 gap-4">
          <div className="bg-white rounded-xl p-5 space-y-4">
            <h2 className="font-bold text-lg text-gray-900">Docket Scanned</h2>
            <Row label="Ticket No" value={scanned.docNumber ?? "—"} />
            <Row label="Date"      value={scanned.deliveryDate ?? "—"} />
            <Row label="Feed Type" value={scanned.feedType ?? "—"} />
            <Row label="Net Weight" value={scanned.amountKg != null ? `${scanned.amountKg.toLocaleString()} kg` : "—"} />
            {!scanned.deliveryDate && !scanned.docNumber && scanned.amountKg == null && (
              <div className="text-xs text-gray-500 break-all pt-1">Raw: {scanned.rawText}</div>
            )}
          </div>
          <Button className="w-full h-14 text-base font-bold" onClick={() => onResult(scanned)}>
            Use This Data
          </Button>
          <Button variant="outline" className="w-full h-12 bg-white text-gray-900" onClick={handleScanAgain}>
            Scan Again
          </Button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm border-b border-gray-200 pb-3 last:border-0 last:pb-0">
      <span className="text-gray-500">{label}</span>
      <span className="font-bold text-right text-gray-900">{value}</span>
    </div>
  );
}
