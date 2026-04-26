import { useState, useRef } from "react";
import { Trash2, ZoomIn, X, Camera, Scale, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { useFarmConfig } from "@/hooks/use-farm-config";

// ─── Types ───────────────────────────────────────────────────────────────────
type PhotoType = "mort" | "weigh";

interface PhotoEntry {
  id: string;
  date: string;
  dataUrl: string;
  note: string;
  type: PhotoType;
  shedNum: number;           // individual shed number, e.g. 1, 2, 3…
  shedGroupId: number;       // parent group for flock forecast key
  weightKg?: number;
  confidence?: string;
  ageDays?: number;
}

type WeighInData = Record<number, Record<number, number>>;

// ─── Storage ─────────────────────────────────────────────────────────────────
const PHOTOS_KEY  = "silo-shed-photos-v2";
const WEIGHIN_KEY = "feedmate-flock-weighins";

function loadPhotos(): PhotoEntry[] {
  try { return JSON.parse(localStorage.getItem(PHOTOS_KEY) || "[]"); } catch { return []; }
}
function savePhotos(photos: PhotoEntry[]) {
  localStorage.setItem(PHOTOS_KEY, JSON.stringify(photos));
}
function loadWeighIns(): WeighInData {
  try { return JSON.parse(localStorage.getItem(WEIGHIN_KEY) || "{}"); } catch { return {}; }
}
function saveWeighIn(shedGroupId: number, ageDays: number, weightKg: number) {
  const data = loadWeighIns();
  if (!data[shedGroupId]) data[shedGroupId] = {};
  const grams = Math.round(weightKg * 1000);
  const cur = data[shedGroupId][ageDays];
  data[shedGroupId][ageDays] = cur ? Math.round((cur + grams) / 2) : grams;
  localStorage.setItem(WEIGHIN_KEY, JSON.stringify(data));
}

function confColor(c?: string) {
  if (c === "high")   return "#16a34a";
  if (c === "medium") return "#d97706";
  return "#dc2626";
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Photos() {
  const { config } = useFarmConfig();

  // Expand each active shed group into its 2 individual sheds
  const individualSheds = config.shedGroups
    .filter(g => g.active)
    .flatMap(g => [
      { shedNum: (g.shedGroupId - 1) * 2 + 1, shedGroupId: g.shedGroupId, label: `Shed ${(g.shedGroupId - 1) * 2 + 1}` },
      { shedNum: (g.shedGroupId - 1) * 2 + 2, shedGroupId: g.shedGroupId, label: `Shed ${(g.shedGroupId - 1) * 2 + 2}` },
    ]);

  const [photos, setPhotos]               = useState<PhotoEntry[]>(loadPhotos);
  const [viewPhoto, setViewPhoto]         = useState<PhotoEntry | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [collapsed, setCollapsed]         = useState<Record<number, boolean>>({});

  // Active capture
  const [activeShedNum, setActiveShedNum]     = useState<number | null>(null);
  const [activeShedGroupId, setActiveShedGroupId] = useState<number>(1);
  const [captureType, setCaptureType]         = useState<PhotoType>("mort");

  // Mort state
  const [mortNote, setMortNote]           = useState("");

  // Bird weight state
  const [weighAge, setWeighAge]           = useState("");
  const [weighNote, setWeighNote]         = useState("");
  const [pendingImg, setPendingImg]       = useState<string | null>(null);
  const [aiLoading, setAiLoading]         = useState(false);
  const [aiResult, setAiResult]           = useState<{
    estimatedWeightKg: number | null;
    confidenceLevel: string;
    visualCues: string;
    notes: string;
  } | null>(null);
  const [aiError, setAiError]             = useState<string | null>(null);

  const mortFileRef  = useRef<HTMLInputElement>(null);
  const weighFileRef = useRef<HTMLInputElement>(null);

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  // ── Helpers ──────────────────────────────────────────────────────────────
  const openCapture = (shedNum: number, shedGroupId: number, type: PhotoType) => {
    setActiveShedNum(shedNum);
    setActiveShedGroupId(shedGroupId);
    setCaptureType(type);
    setMortNote(""); setWeighAge(""); setWeighNote("");
    setPendingImg(null); setAiResult(null); setAiError(null);
  };
  const closeCapture = () => {
    setActiveShedNum(null);
    setPendingImg(null); setAiResult(null); setAiError(null);
  };

  // ── Mort photo ───────────────────────────────────────────────────────────
  const handleMortFile = (file: File | null | undefined) => {
    if (!file || activeShedNum === null) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const entry: PhotoEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        date: new Date().toISOString(),
        dataUrl: ev.target?.result as string,
        note: mortNote.trim(),
        type: "mort",
        shedNum: activeShedNum,
        shedGroupId: activeShedGroupId,
      };
      const next = [...photos, entry];
      setPhotos(next); savePhotos(next);
      closeCapture();
    };
    reader.readAsDataURL(file);
    if (mortFileRef.current) mortFileRef.current.value = "";
  };

  // ── Bird weight photo ─────────────────────────────────────────────────────
  const handleWeighFile = (file: File | null | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setPendingImg(ev.target?.result as string);
      setAiResult(null); setAiError(null);
    };
    reader.readAsDataURL(file);
    if (weighFileRef.current) weighFileRef.current.value = "";
  };

  const runAI = async () => {
    if (!pendingImg || activeShedNum === null) return;
    setAiLoading(true); setAiError(null);
    try {
      const age = weighAge ? parseInt(weighAge) : undefined;
      const res = await fetch(`${BASE}/api/weigh-bird`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: pendingImg, ageDays: age, shedNum: activeShedNum }),
      });
      if (!res.ok) throw new Error(await res.text());
      setAiResult(await res.json());
    } catch (err) {
      setAiError(String(err));
    } finally {
      setAiLoading(false);
    }
  };

  const logWeighIn = () => {
    if (!aiResult?.estimatedWeightKg || activeShedNum === null) return;
    const age = weighAge ? parseInt(weighAge) : 0;
    if (age > 0) saveWeighIn(activeShedGroupId, age, aiResult.estimatedWeightKg);
    const entry: PhotoEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date: new Date().toISOString(),
      dataUrl: pendingImg!,
      note: weighNote.trim(),
      type: "weigh",
      shedNum: activeShedNum,
      shedGroupId: activeShedGroupId,
      weightKg: aiResult.estimatedWeightKg,
      confidence: aiResult.confidenceLevel,
      ageDays: age > 0 ? age : undefined,
    };
    const next = [...photos, entry];
    setPhotos(next); savePhotos(next);
    closeCapture();
  };

  const deletePhoto = (id: string) => {
    const next = photos.filter(p => p.id !== id);
    setPhotos(next); savePhotos(next);
    setConfirmDelete(null);
    if (viewPhoto?.id === id) setViewPhoto(null);
  };

  const toggleCollapsed = (shedNum: number) =>
    setCollapsed(prev => ({ ...prev, [shedNum]: !prev[shedNum] }));

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">

      {individualSheds.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-8 text-center">
          <Camera className="h-12 w-12 opacity-20" />
          <div className="text-sm font-medium">No active sheds</div>
          <div className="text-xs opacity-60">Enable shed groups in Settings to start.</div>
        </div>
      )}

      {individualSheds.map(({ shedNum, shedGroupId, label }) => {
        const shedPhotos = photos
          .filter(p => p.shedNum === shedNum)
          .sort((a, b) => b.date.localeCompare(a.date));
        const isOpen = !collapsed[shedNum];

        return (
          <div key={shedNum} className="border-b border-border">
            {/* Shed header row */}
            <button
              className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 active:bg-muted/70"
              onClick={() => toggleCollapsed(shedNum)}
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">{label}</span>
                {shedPhotos.length > 0 && (
                  <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {shedPhotos.length}
                  </span>
                )}
              </div>
              {isOpen
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>

            {isOpen && (
              <div className="px-3 py-3">
                {/* Two action buttons */}
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => openCapture(shedNum, shedGroupId, "mort")}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-red-400 bg-red-50 text-red-700 font-semibold text-sm active:opacity-70"
                  >
                    <FileText className="h-4 w-4" />
                    Mort Sheet
                  </button>
                  <button
                    onClick={() => openCapture(shedNum, shedGroupId, "weigh")}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-primary bg-primary/5 text-primary font-semibold text-sm active:opacity-70"
                  >
                    <Scale className="h-4 w-4" />
                    Bird Weight
                  </button>
                </div>

                {/* Photo grid */}
                {shedPhotos.length === 0 ? (
                  <div className="text-center py-3 text-xs text-muted-foreground">No photos yet for {label}</div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {shedPhotos.map(p => (
                      <div
                        key={p.id}
                        className="relative rounded-xl overflow-hidden border border-border bg-muted shadow-sm group"
                        style={{ aspectRatio: "4/3" }}
                      >
                        <img
                          src={p.dataUrl}
                          alt={p.note || p.type}
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => setViewPhoto(p)}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                        <div className={`absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md ${p.type === "mort" ? "bg-red-600 text-white" : "bg-primary text-primary-foreground"}`}>
                          {p.type === "mort" ? "MORT" : "WEIGH"}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 p-1.5 pointer-events-none">
                          <div className="text-[9px] text-white/80">{format(new Date(p.date), "d MMM, h:mm a")}</div>
                          {p.type === "weigh" && p.weightKg != null && (
                            <div className="text-[11px] text-white font-bold">{(p.weightKg * 1000).toFixed(0)}g</div>
                          )}
                          {p.note && <div className="text-[10px] text-white/90 truncate">{p.note}</div>}
                        </div>
                        <button
                          onClick={() => setViewPhoto(p)}
                          className="absolute top-1.5 right-8 bg-black/40 text-white rounded-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <ZoomIn className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(p.id)}
                          className="absolute top-1.5 right-1.5 bg-black/40 text-white rounded-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ── MORT CAPTURE PANEL ──────────────────────────────────────────── */}
      {activeShedNum !== null && captureType === "mort" && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end">
          <div className="w-full bg-background rounded-t-2xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-1">
              <div className="font-bold text-base">📋 Mort Sheet — Shed {activeShedNum}</div>
              <button onClick={closeCapture} className="bg-muted rounded-xl p-2"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Take or upload a mort sheet photo for this shed.</p>
            <input
              placeholder="Add a note (optional)..."
              value={mortNote}
              onChange={e => setMortNote(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background mb-3 outline-none focus:ring-2 focus:ring-red-300"
            />
            <button
              onClick={() => mortFileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 text-white font-bold text-sm active:opacity-80"
            >
              <Camera className="h-4 w-4" />
              Take / Choose Photo
            </button>
            <input
              ref={mortFileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => handleMortFile(e.target.files?.[0])}
            />
          </div>
        </div>
      )}

      {/* ── BIRD WEIGHT CAPTURE PANEL ────────────────────────────────────── */}
      {activeShedNum !== null && captureType === "weigh" && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end">
          <div className="w-full bg-background rounded-t-2xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <div className="font-bold text-base">⚖️ Bird Weight — Shed {activeShedNum}</div>
              <button onClick={closeCapture} className="bg-muted rounded-xl p-2"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Photo a bird to get an AI weight estimate. Enter age to log to Flock Forecast.</p>

            {/* Step 1 — age + capture */}
            {!pendingImg && (
              <>
                <input
                  placeholder="Bird age in days (optional)..."
                  value={weighAge}
                  onChange={e => setWeighAge(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background mb-3 outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button
                  onClick={() => weighFileRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm active:opacity-80"
                >
                  <Camera className="h-4 w-4" />
                  Take / Choose Photo of Bird
                </button>
                <input
                  ref={weighFileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => handleWeighFile(e.target.files?.[0])}
                />
              </>
            )}

            {/* Step 2 — preview, optionally set age, run AI */}
            {pendingImg && !aiResult && (
              <div className="flex flex-col gap-3">
                <img src={pendingImg} alt="Bird" className="w-full max-h-44 object-contain rounded-xl border border-border" />
                <input
                  placeholder="Bird age in days (optional)..."
                  value={weighAge}
                  onChange={e => setWeighAge(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-primary/40"
                />
                {aiError && (
                  <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{aiError}</div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setPendingImg(null); setAiError(null); weighFileRef.current?.click(); }}
                    className="flex-1 py-2.5 rounded-xl border border-border font-semibold text-sm"
                  >
                    Retake
                  </button>
                  <button
                    onClick={runAI}
                    disabled={aiLoading}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm active:opacity-80 disabled:opacity-50"
                  >
                    {aiLoading ? "Analysing…" : "Estimate Weight"}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3 — AI result */}
            {pendingImg && aiResult && (
              <div className="flex flex-col gap-3">
                <img src={pendingImg} alt="Bird" className="w-full max-h-36 object-contain rounded-xl border border-border" />
                {aiResult.estimatedWeightKg != null ? (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center">
                    <div className="text-4xl font-black text-primary">{(aiResult.estimatedWeightKg * 1000).toFixed(0)}g</div>
                    <div className="text-xs text-muted-foreground mt-1">{aiResult.estimatedWeightKg.toFixed(3)} kg</div>
                    <div className="mt-1.5 text-[10px] font-bold uppercase" style={{ color: confColor(aiResult.confidenceLevel) }}>
                      {aiResult.confidenceLevel} confidence
                    </div>
                    {aiResult.visualCues && (
                      <div className="text-[11px] text-muted-foreground mt-2">{aiResult.visualCues}</div>
                    )}
                  </div>
                ) : (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center text-sm text-red-700">
                    Could not estimate — {aiResult.notes || "no bird clearly visible"}
                  </div>
                )}
                <input
                  placeholder="Add a note (optional)..."
                  value={weighNote}
                  onChange={e => setWeighNote(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-primary/40"
                />
                {!weighAge && aiResult.estimatedWeightKg != null && (
                  <div className="text-[11px] text-amber-600 text-center bg-amber-50 rounded-lg px-3 py-2">
                    Add a bird age above to log this to Flock Forecast
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setPendingImg(null); setAiResult(null); }}
                    className="flex-1 py-2.5 rounded-xl border border-border font-semibold text-sm"
                  >
                    Retake
                  </button>
                  {aiResult.estimatedWeightKg != null && (
                    <button
                      onClick={logWeighIn}
                      className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm active:opacity-80"
                    >
                      {weighAge ? "Save & Log to Forecast" : "Save Photo"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── LIGHTBOX ───────────────────────────────────────────────────── */}
      {viewPhoto && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={() => setViewPhoto(null)}>
          <div className="flex items-center justify-between px-4 py-3" onClick={e => e.stopPropagation()}>
            <div>
              <div className="text-white/60 text-xs">{format(new Date(viewPhoto.date), "d MMM yyyy, h:mm a")}</div>
              <div className="text-white/80 text-xs font-semibold mt-0.5">Shed {viewPhoto.shedNum}</div>
              {viewPhoto.type === "weigh" && viewPhoto.weightKg != null && (
                <div className="text-white text-sm font-bold mt-0.5">
                  {(viewPhoto.weightKg * 1000).toFixed(0)}g
                  {viewPhoto.ageDays ? ` — Day ${viewPhoto.ageDays}` : ""}
                  {viewPhoto.confidence ? ` (${viewPhoto.confidence})` : ""}
                </div>
              )}
              {viewPhoto.note && <div className="text-white/80 text-xs mt-0.5">{viewPhoto.note}</div>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setConfirmDelete(viewPhoto.id); setViewPhoto(null); }}
                className="bg-red-600/80 text-white rounded-xl p-2"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button onClick={() => setViewPhoto(null)} className="bg-white/10 text-white rounded-xl p-2">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <img
              src={viewPhoto.dataUrl}
              alt={viewPhoto.note || viewPhoto.type}
              className="max-w-full max-h-full object-contain rounded-xl"
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM ─────────────────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end">
          <div className="w-full bg-background rounded-t-2xl p-5 shadow-2xl">
            <div className="text-base font-bold mb-1">Delete photo?</div>
            <div className="text-sm text-muted-foreground mb-4">This cannot be undone.</div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2.5 rounded-xl border border-border font-semibold text-sm">Cancel</button>
              <button onClick={() => deletePhoto(confirmDelete)} className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-semibold text-sm">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
