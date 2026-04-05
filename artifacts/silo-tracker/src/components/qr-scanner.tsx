import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface DocketData {
  feedType?: string;
  amountKg?: number;
  deliveryDate?: string;
  ticketNo?: string;
  dispatchNo?: string;
  driverName?: string;
  rawText: string;
}

function parseDocketQr(raw: string): DocketData {
  const result: DocketData = { rawText: raw };

  // Try URL query params
  try {
    const url = new URL(raw);
    const p = url.searchParams;
    result.feedType = p.get("formula") ?? p.get("feedType") ?? p.get("feed") ?? undefined;
    const net = p.get("net") ?? p.get("netWeight") ?? p.get("weight");
    if (net) result.amountKg = parseFloat(net.replace(/[^\d.]/g, ""));
    result.ticketNo = p.get("ticket") ?? p.get("ticketNo") ?? undefined;
    result.dispatchNo = p.get("dispatch") ?? p.get("dispatchNo") ?? undefined;
    result.driverName = p.get("driver") ?? p.get("driverName") ?? undefined;
    const d = p.get("date") ?? p.get("deliveryDate");
    if (d) result.deliveryDate = parseDate(d);
    return result;
  } catch {}

  // Try JSON
  try {
    const obj = JSON.parse(raw);
    result.feedType = obj.formulaName ?? obj.feedType ?? obj.formula ?? undefined;
    const net = obj.netWeight ?? obj.net ?? obj.weight;
    if (net) result.amountKg = parseFloat(String(net).replace(/[^\d.]/g, ""));
    result.ticketNo = obj.ticketNo ?? obj.ticket ?? undefined;
    result.dispatchNo = obj.dispatchNo ?? obj.dispatch ?? undefined;
    result.driverName = obj.driverName ?? obj.driver ?? undefined;
    const d = obj.deliveryDate ?? obj.date;
    if (d) result.deliveryDate = parseDate(d);
    return result;
  } catch {}

  // Try pipe / comma / semicolon delimited — common in docket systems
  const delimiters = ["|", ",", ";", "\t"];
  for (const delim of delimiters) {
    if (raw.includes(delim)) {
      const parts = raw.split(delim).map((s) => s.trim());
      // Heuristic: scan for numeric weight and formula name
      for (const part of parts) {
        const n = parseFloat(part.replace(/[^\d.]/g, ""));
        if (!isNaN(n) && n > 1000 && !result.amountKg) result.amountKg = n;
        if (/[A-Za-z]/.test(part) && part.length > 3 && !result.feedType) {
          result.feedType = part;
        }
      }
      return result;
    }
  }

  // Plain text — scrape with regex
  const netMatch = raw.match(/net[:\s]*([0-9,]+\.?[0-9]*)\s*(kg)?/i);
  if (netMatch) result.amountKg = parseFloat(netMatch[1].replace(/,/g, ""));

  const formulaMatch = raw.match(/formula[^:]*:\s*([^\n\r|,;]+)/i);
  if (formulaMatch) result.feedType = formulaMatch[1].trim();

  const ticketMatch = raw.match(/ticket[^:]*:\s*([^\n\r|,;]+)/i);
  if (ticketMatch) result.ticketNo = ticketMatch[1].trim();

  const dispatchMatch = raw.match(/dispatch[^:]*:\s*([^\n\r|,;]+)/i);
  if (dispatchMatch) result.dispatchNo = dispatchMatch[1].trim();

  const dateMatch = raw.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
  if (dateMatch) result.deliveryDate = parseDate(dateMatch[1]);

  return result;
}

function parseDate(raw: string): string {
  // Try to turn d/m/yy or d/m/yyyy into yyyy-mm-dd
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
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<DocketData | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (text) => {
          scanner.stop().catch(() => {});
          const parsed = parseDocketQr(text);
          setScanned(parsed);
        },
        () => {}
      )
      .catch(() => {
        setError("Camera access denied. Please allow camera permissions and try again.");
      });

    return () => {
      scanner.stop().catch(() => {});
    };
  }, []);

  const handleAccept = () => {
    if (scanned) onResult(scanned);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      <div className="flex items-center justify-between p-4 text-white">
        <span className="font-bold text-lg">Scan Docket QR Code</span>
        <button onClick={onClose} className="p-2">
          <X className="h-6 w-6" />
        </button>
      </div>

      {!scanned && (
        <>
          <div className="flex-1 flex items-center justify-center">
            <div id={containerId} className="w-full max-w-sm" />
          </div>
          {error && (
            <div className="p-4 text-center text-red-400 text-sm">{error}</div>
          )}
          <div className="p-4 text-center text-white/60 text-sm pb-8">
            Point the camera at the QR code on the delivery docket
          </div>
        </>
      )}

      {scanned && (
        <div className="flex-1 flex flex-col justify-center p-6 gap-4">
          <div className="bg-white rounded-xl p-5 space-y-3">
            <h2 className="font-bold text-lg">Docket Scanned</h2>

            {scanned.feedType && (
              <Row label="Feed Type" value={scanned.feedType} />
            )}
            {scanned.amountKg != null && (
              <Row label="Net Weight" value={`${scanned.amountKg.toLocaleString()} kg`} />
            )}
            {scanned.deliveryDate && (
              <Row label="Date" value={scanned.deliveryDate} />
            )}
            {scanned.ticketNo && (
              <Row label="Ticket No" value={scanned.ticketNo} />
            )}
            {scanned.dispatchNo && (
              <Row label="Dispatch No" value={scanned.dispatchNo} />
            )}
            {scanned.driverName && (
              <Row label="Driver" value={scanned.driverName} />
            )}

            {!scanned.feedType && scanned.amountKg == null && (
              <div className="text-sm text-gray-500 break-all">
                <span className="font-medium">Raw:</span> {scanned.rawText}
              </div>
            )}
          </div>

          <Button className="w-full h-14 text-base font-bold" onClick={handleAccept}>
            Use This Data
          </Button>
          <Button variant="outline" className="w-full h-12 bg-white" onClick={() => setScanned(null)}>
            Scan Again
          </Button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm border-b pb-2 last:border-0 last:pb-0">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-right max-w-[60%]">{value}</span>
    </div>
  );
}
