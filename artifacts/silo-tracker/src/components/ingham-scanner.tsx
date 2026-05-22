import { useRef, useState, type ChangeEvent } from "react";
import { X, Camera, ScanLine, RotateCcw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DocketData } from "./qr-scanner";

interface InghamFields {
  feedType?: string | null;
  productCode?: string | null;
  amount?: number | null;
  unit?: string | null;
  deliveryDate?: string | null;
  orderNumber?: string | null;
  customerName?: string | null;
  siteCode?: string | null;
  deliveryInstructions?: string | null;
  truckRego?: string | null;
  outloadingBin?: string | null;
}

type Phase = "idle" | "previewing" | "scanning" | "scanned" | "error";

interface InghamScannerProps {
  onResult: (data: DocketData) => void;
  onClose: () => void;
}

function resizeImage(dataUrl: string, maxPx = 1400): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      const out = canvas.toDataURL("image/jpeg", 0.85);
      const [, data] = out.split(",");
      resolve({ data, mimeType: "image/jpeg" });
    };
    img.src = dataUrl;
  });
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between items-start text-sm border-b border-gray-100 pb-2 last:border-0 last:pb-0 gap-2">
      <span className="text-gray-400 shrink-0 font-medium">{label}</span>
      <span className="font-bold text-right text-gray-900 text-sm leading-snug">{value || "—"}</span>
    </div>
  );
}

export function InghamScanner({ onResult, onClose }: InghamScannerProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fields, setFields] = useState<InghamFields | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewUrl(reader.result as string);
      setPhase("previewing");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleScan = async () => {
    if (!previewUrl) return;
    setPhase("scanning");
    try {
      const { data, mimeType } = await resizeImage(previewUrl);
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const resp = await fetch(`${BASE}/api/scan-docket/ingham`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: data, mimeType }),
      });
      if (!resp.ok) throw new Error(`Server error ${resp.status}`);
      const json = (await resp.json()) as { ok: boolean; fields: InghamFields };
      setFields(json.fields);
      setPhase("scanned");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not read the docket. Try a clearer photo.");
      setPhase("error");
    }
  };

  const handleUse = () => {
    if (!fields) return;
    const noteParts: string[] = [];
    if (fields.orderNumber) noteParts.push(`Order: ${fields.orderNumber}`);
    if (fields.deliveryInstructions) noteParts.push(`Delivery: ${fields.deliveryInstructions}`);

    const docketData: DocketData = {
      rawText: JSON.stringify(fields),
      amountKg: fields.amount != null ? fields.amount * 1000 : undefined,
      deliveryDate: fields.deliveryDate ?? undefined,
      feedType: fields.feedType ?? undefined,
      docNumber: (noteParts.join(" | ") || fields.orderNumber) ?? undefined,
    };
    onResult(docketData);
  };

  const handleRetake = () => {
    setPhase("idle");
    setPreviewUrl(null);
    setFields(null);
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 text-white shrink-0">
        <div>
          <span className="font-bold text-lg">Ingham Docket</span>
          <span className="ml-2 text-[10px] font-bold bg-white/10 text-white/70 px-2 py-0.5 rounded-full uppercase tracking-widest">AI Scan</span>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* ── IDLE ── */}
      {phase === "idle" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
          <div className="w-24 h-24 rounded-3xl bg-white/10 flex items-center justify-center">
            <Camera className="w-12 h-12 text-white/60" />
          </div>
          <div className="text-center space-y-2">
            <p className="text-white font-bold text-xl">Take a photo of the docket</p>
            <p className="text-white/50 text-sm leading-relaxed">AI will read the feed type, weight,<br />date, and delivery instructions</p>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full max-w-sm bg-white text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-3 text-base active:scale-95 transition-all"
          >
            <Camera className="w-5 h-5" />
            Take Photo
          </button>
          <p className="text-white/30 text-xs">Works best in good lighting • lay flat on surface</p>
        </div>
      )}

      {/* ── PREVIEWING ── */}
      {phase === "previewing" && previewUrl && (
        <div className="flex-1 flex flex-col gap-4 p-4 overflow-hidden">
          <div className="flex-1 rounded-2xl overflow-hidden bg-black min-h-0">
            <img src={previewUrl} alt="Docket preview" className="w-full h-full object-contain" />
          </div>
          <div className="flex gap-3 shrink-0">
            <button
              onClick={handleRetake}
              className="flex-1 flex items-center justify-center gap-2 border border-white/20 text-white font-semibold py-3.5 rounded-2xl active:scale-95 transition-all"
            >
              <RotateCcw className="w-4 h-4" /> Retake
            </button>
            <button
              onClick={handleScan}
              className="flex-1 flex items-center justify-center gap-2 bg-white text-black font-bold py-3.5 rounded-2xl active:scale-95 transition-all"
            >
              <ScanLine className="w-4 h-4" /> Scan Docket
            </button>
          </div>
        </div>
      )}

      {/* ── SCANNING ── */}
      {phase === "scanning" && previewUrl && (
        <div className="flex-1 flex flex-col gap-4 p-4 overflow-hidden">
          <div className="flex-1 rounded-2xl overflow-hidden bg-black min-h-0 relative">
            <img src={previewUrl} alt="Docket" className="w-full h-full object-contain opacity-40" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div className="bg-black/70 rounded-2xl px-6 py-5 flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
                <p className="text-white font-bold text-base">Reading docket with AI…</p>
                <p className="text-white/50 text-xs">Usually takes 3–5 seconds</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SCANNED ── */}
      {phase === "scanned" && fields && (
        <div className="flex-1 flex flex-col gap-4 p-4 overflow-y-auto">
          <div className="bg-green-500/20 border border-green-500/30 rounded-2xl px-4 py-3 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
            <span className="text-green-300 font-semibold text-sm">Docket read successfully</span>
          </div>

          <div className="bg-white rounded-2xl p-5 space-y-3">
            <Field label="Feed Type"    value={fields.feedType} />
            <Field label="Product Code" value={fields.productCode} />
            <Field label="Net Weight"   value={fields.amount != null ? `${fields.amount} t  (${(fields.amount * 1000).toLocaleString()} kg)` : null} />
            <Field label="Date"         value={fields.deliveryDate} />
            <Field label="Order No"     value={fields.orderNumber} />
            <Field label="Customer"     value={fields.customerName} />
            <Field label="Site"         value={fields.siteCode} />
            <Field label="Delivery"     value={fields.deliveryInstructions} />
            <Field label="Truck"        value={fields.truckRego} />
          </div>

          <button
            onClick={handleUse}
            className="w-full bg-white text-black font-bold py-4 rounded-2xl active:scale-95 transition-all"
          >
            Use This Data
          </button>
          <button
            onClick={handleRetake}
            className="w-full border border-white/20 text-white font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <RotateCcw className="w-4 h-4" /> Scan Another
          </button>
        </div>
      )}

      {/* ── ERROR ── */}
      {phase === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
          <div className="w-20 h-20 rounded-3xl bg-red-500/20 flex items-center justify-center">
            <AlertCircle className="w-10 h-10 text-red-400" />
          </div>
          <div className="text-center space-y-2">
            <p className="text-white font-bold text-lg">Couldn't read the docket</p>
            <p className="text-white/50 text-sm leading-relaxed">{errorMsg}</p>
          </div>
          <button
            onClick={handleRetake}
            className="w-full max-w-sm bg-white text-black font-bold py-4 rounded-2xl active:scale-95 transition-all"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
