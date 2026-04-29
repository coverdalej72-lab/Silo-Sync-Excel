import { useState, useRef, useEffect, useCallback } from "react";
import { Trash2, ZoomIn, X, Camera, Scale, FileText, ChevronDown, ChevronUp, ImageIcon } from "lucide-react";
import { format } from "date-fns";
import { useFarmConfig } from "@/hooks/use-farm-config";

// ─── Types ───────────────────────────────────────────────────────────────────
type PhotoType = "mort" | "weigh";
type CaptureMode = "camera" | "manual";

interface PhotoEntry {
  id: string;
  date: string;
  dataUrl: string;
  note: string;
  type: PhotoType;
  shedNum: number;
  shedGroupId: number;
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
  const [activeShedNum, setActiveShedNum]         = useState<number | null>(null);
  const [activeShedGroupId, setActiveShedGroupId] = useState<number>(1);
  const [captureType, setCaptureType]             = useState<PhotoType>("mort");
  const [captureMode, setCaptureMode]             = useState<CaptureMode>("camera");

  // Mort state
  const [mortNote, setMortNote] = useState("");

  // Bird weight state
  const [weighAge, setWeighAge]     = useState("");
  const [weighNote, setWeighNote]   = useState("");
  const [pendingImg, setPendingImg] = useState<string | null>(null);
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiResult, setAiResult]     = useState<{
    estimatedWeightKg: number | null;
    confidenceLevel: string;
    visualCues: string;
    notes: string;
  } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Camera state
  const [cameraActive, setCameraActive]   = useState(false);
  const [cameraError, setCameraError]     = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [flashActive, setFlashActive]     = useState(false);

  const videoRef        = useRef<HTMLVideoElement>(null);
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const mortFileRef     = useRef<HTMLInputElement>(null);
  const weighFileRef    = useRef<HTMLInputElement>(null);

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  // ── Camera control ────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(t => t.stop());
      cameraStreamRef.current = null;
    }
    setCameraActive(false);
    setCameraLoading(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Permission") || msg.includes("NotAllowed")) {
        setCameraError("Camera permission denied. Allow camera access and try again, or use Manual Entry.");
      } else if (msg.includes("NotFound") || msg.includes("DevicesNotFound")) {
        setCameraError("No camera found on this device. Use Manual Entry instead.");
      } else {
        setCameraError("Could not start camera. Use Manual Entry instead.");
      }
    } finally {
      setCameraLoading(false);
    }
  }, []);

  const captureFrame = useCallback(async () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraActive) return;

    // Flash animation
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 200);

    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    stopCamera();
    setPendingImg(dataUrl);
    setAiResult(null);
    setAiError(null);

    // Auto-run AI immediately after capture
    setAiLoading(true);
    try {
      const age = weighAge ? parseInt(weighAge) : undefined;
      const res = await fetch(`${BASE}/api/weigh-bird`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: dataUrl, ageDays: age, shedNum: activeShedNum }),
      });
      if (!res.ok) throw new Error(await res.text());
      setAiResult(await res.json());
    } catch (err) {
      setAiError(String(err));
    } finally {
      setAiLoading(false);
    }
  }, [cameraActive, weighAge, activeShedNum, BASE, stopCamera]);

  // Stop camera on tab switch or close
  useEffect(() => {
    if (captureMode === "manual" || activeShedNum === null || captureType !== "weigh") {
      stopCamera();
    }
  }, [captureMode, activeShedNum, captureType, stopCamera]);

  // Auto-start camera when switching to camera tab in weigh mode (and no result yet)
  useEffect(() => {
    if (captureMode === "camera" && activeShedNum !== null && captureType === "weigh" && !pendingImg && !cameraActive && !cameraLoading) {
      startCamera();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureMode, activeShedNum, captureType, pendingImg]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const openCapture = (shedNum: number, shedGroupId: number, type: PhotoType) => {
    setActiveShedNum(shedNum);
    setActiveShedGroupId(shedGroupId);
    setCaptureType(type);
    setMortNote(""); setWeighAge(""); setWeighNote("");
    setPendingImg(null); setAiResult(null); setAiError(null);
    setCameraError(null);
    if (type === "weigh") setCaptureMode("camera");
  };

  const closeCapture = () => {
    stopCamera();
    setActiveShedNum(null);
    setPendingImg(null); setAiResult(null); setAiError(null);
    setCameraError(null);
  };

  const retakeCamera = () => {
    setPendingImg(null);
    setAiResult(null);
    setAiError(null);
    startCamera();
  };

  // ── Mort photo ───────────────────────────────────────────────────────────
  const handleMortFile = (file: File | null | undefined) => {
    if (!file || activeShedNum == null) return;
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

  // ── Manual photo (gallery / file) ─────────────────────────────────────────
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

      {/* ── Single Mort Sheet section ───────────────────────────────────── */}
      {individualSheds.length > 0 && (() => {
        const mortPhotos = photos.filter(p => p.type === "mort").sort((a, b) => b.date.localeCompare(a.date));
        const mortOpen = !collapsed[-1];
        return (
          <div className="border-b border-border">
            <button
              className="w-full flex items-center justify-between px-4 py-3 bg-red-50 active:bg-red-100"
              onClick={() => setCollapsed(prev => ({ ...prev, [-1]: !prev[-1] }))}
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-red-600" />
                <span className="font-bold text-sm text-red-700">Mort Sheet</span>
                {mortPhotos.length > 0 && (
                  <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {mortPhotos.length}
                  </span>
                )}
              </div>
              {mortOpen
                ? <ChevronUp className="h-4 w-4 text-red-400" />
                : <ChevronDown className="h-4 w-4 text-red-400" />}
            </button>
            {mortOpen && (
              <div className="px-3 py-3">
                <button
                  onClick={() => openCapture(0, 0, "mort")}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-red-400 bg-red-50 text-red-700 font-semibold text-sm active:opacity-70 mb-3"
                >
                  <FileText className="h-4 w-4" />
                  Add Mort Sheet Photo
                </button>
                {mortPhotos.length === 0 ? (
                  <div className="text-center py-3 text-xs text-muted-foreground">No mort sheet photos yet</div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {mortPhotos.map(p => (
                      <div key={p.id} className="relative rounded-xl overflow-hidden border border-border bg-muted shadow-sm group" style={{ aspectRatio: "4/3" }}>
                        <img src={p.dataUrl} alt={p.note || "mort"} className="w-full h-full object-cover cursor-pointer" onClick={() => setViewPhoto(p)} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                        <div className="absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-red-600 text-white">MORT</div>
                        <div className="absolute bottom-0 left-0 right-0 p-1.5 pointer-events-none">
                          <div className="text-[9px] text-white/80">{format(new Date(p.date), "d MMM, h:mm a")}</div>
                          {p.note && <div className="text-[10px] text-white/90 truncate">{p.note}</div>}
                        </div>
                        <button onClick={() => setViewPhoto(p)} className="absolute top-1.5 right-8 bg-black/40 text-white rounded-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity"><ZoomIn className="h-3 w-3" /></button>
                        <button onClick={() => setConfirmDelete(p.id)} className="absolute top-1.5 right-1.5 bg-black/40 text-white rounded-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Per-shed Bird Weight sections ───────────────────────────────── */}
      {individualSheds.map(({ shedNum, shedGroupId, label }) => {
        const shedPhotos = photos
          .filter(p => p.shedNum === shedNum && p.type === "weigh")
          .sort((a, b) => b.date.localeCompare(a.date));
        const isOpen = !collapsed[shedNum];

        return (
          <div key={shedNum} className="border-b border-border">
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
                <div className="mb-3">
                  <button
                    onClick={() => openCapture(shedNum, shedGroupId, "weigh")}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-primary bg-primary/5 text-primary font-semibold text-sm active:opacity-70"
                  >
                    <Scale className="h-4 w-4" />
                    Bird Weight
                  </button>
                </div>

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
        <div className="fixed inset-0 z-50 bg-black flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0 bg-black">
            <div>
              <div className="text-white font-bold text-base">⚖️ Bird Weight</div>
              <div className="text-white/50 text-xs">Shed {activeShedNum}</div>
            </div>
            <button onClick={closeCapture} className="bg-white/10 rounded-xl p-2">
              <X className="h-4 w-4 text-white" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex mx-4 mb-3 rounded-xl overflow-hidden border border-white/10 shrink-0">
            <button
              onClick={() => { setCaptureMode("camera"); setPendingImg(null); setAiResult(null); setAiError(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold transition-colors ${
                captureMode === "camera" ? "bg-primary text-white" : "bg-white/5 text-white/50"
              }`}
            >
              <Camera className="h-3.5 w-3.5" />
              AI Camera
            </button>
            <button
              onClick={() => { setCaptureMode("manual"); stopCamera(); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold transition-colors ${
                captureMode === "manual" ? "bg-primary text-white" : "bg-white/5 text-white/50"
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Manual Entry
            </button>
          </div>

          {/* ── AI CAMERA MODE ── */}
          {captureMode === "camera" && (
            <div className="flex flex-col flex-1 min-h-0">

              {/* Camera view / result */}
              <div className="relative flex-1 min-h-0 bg-black">

                {/* Live video — always rendered so ref is stable */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${(cameraActive && !pendingImg) ? "block" : "hidden"}`}
                />

                {/* Capture flash overlay */}
                {flashActive && (
                  <div className="absolute inset-0 bg-white z-10 pointer-events-none" />
                )}

                {/* Captured image + AI result */}
                {pendingImg && (
                  <div className="absolute inset-0 flex flex-col">
                    <img src={pendingImg} alt="Captured" className="w-full h-full object-cover" />
                    {/* Result overlay */}
                    {aiLoading && (
                      <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
                        <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                        <div className="text-white font-semibold text-sm">Analysing bird…</div>
                      </div>
                    )}
                    {aiResult && !aiLoading && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent px-4 pt-10 pb-4">
                        {aiResult.estimatedWeightKg != null ? (
                          <>
                            <div className="flex items-end gap-3 mb-2">
                              <div className="text-5xl font-black text-white leading-none">{(aiResult.estimatedWeightKg * 1000).toFixed(0)}<span className="text-2xl ml-1 text-white/70">g</span></div>
                              <div className="mb-1">
                                <div className="text-xs font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: confColor(aiResult.confidenceLevel) + "33", color: confColor(aiResult.confidenceLevel), border: `1px solid ${confColor(aiResult.confidenceLevel)}` }}>
                                  {aiResult.confidenceLevel} confidence
                                </div>
                              </div>
                            </div>
                            {aiResult.visualCues && (
                              <div className="text-white/60 text-xs mb-3">{aiResult.visualCues}</div>
                            )}
                          </>
                        ) : (
                          <div className="text-red-400 text-sm font-semibold mb-3">
                            Could not detect a bird — {aiResult.notes || "try a clearer photo"}
                          </div>
                        )}
                        {aiError && (
                          <div className="text-red-400 text-xs mb-3">{aiError}</div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Camera loading state */}
                {cameraLoading && !pendingImg && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
                    <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                    <div className="text-white/60 text-sm">Starting camera…</div>
                  </div>
                )}

                {/* Camera error state */}
                {cameraError && !pendingImg && !cameraLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 px-8 text-center">
                    <Camera className="h-12 w-12 text-white/20" />
                    <div className="text-white/70 text-sm">{cameraError}</div>
                    <button
                      onClick={startCamera}
                      className="px-5 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm"
                    >
                      Try Again
                    </button>
                  </div>
                )}

                {/* Viewfinder overlay — corners */}
                {cameraActive && !pendingImg && (
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 border-primary rounded-tl-lg" />
                    <div className="absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 border-primary rounded-tr-lg" />
                    <div className="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-primary rounded-bl-lg" />
                    <div className="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-primary rounded-br-lg" />
                    <div className="absolute inset-x-0 top-3 flex justify-center">
                      <div className="bg-black/50 text-white/70 text-xs px-3 py-1 rounded-full">Point at your flock</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Hidden canvas for frame capture */}
              <canvas ref={canvasRef} className="hidden" />

              {/* Bottom controls */}
              <div className="shrink-0 bg-black px-4 py-4">

                {/* Age input */}
                <div className="mb-3">
                  <input
                    placeholder="Bird age in days (optional)…"
                    value={weighAge}
                    onChange={e => setWeighAge(e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric"
                    className="w-full text-sm px-3 py-2.5 rounded-xl border border-white/15 bg-white/5 text-white placeholder:text-white/30 outline-none focus:border-primary"
                  />
                </div>

                {/* Action buttons */}
                {!pendingImg && (
                  /* Capture button */
                  <button
                    onClick={captureFrame}
                    disabled={!cameraActive || cameraLoading}
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base disabled:opacity-40 transition-opacity"
                    style={{ background: "var(--primary)", color: "#fff" }}
                  >
                    <Camera className="h-5 w-5" />
                    Capture & Analyse
                  </button>
                )}

                {pendingImg && !aiLoading && (
                  <div className="flex gap-3">
                    <button
                      onClick={retakeCamera}
                      className="flex-1 py-3 rounded-2xl border border-white/20 text-white font-semibold text-sm"
                    >
                      Retake
                    </button>
                    {aiResult?.estimatedWeightKg != null && (
                      <button
                        onClick={logWeighIn}
                        className="flex-1 py-3 rounded-2xl font-bold text-sm"
                        style={{ background: "var(--primary)", color: "#fff" }}
                      >
                        {weighAge ? "Save & Log Forecast" : "Save Photo"}
                      </button>
                    )}
                    {(!aiResult || aiResult.estimatedWeightKg == null) && (
                      <button
                        onClick={runAI}
                        disabled={aiLoading}
                        className="flex-1 py-3 rounded-2xl font-bold text-sm disabled:opacity-50"
                        style={{ background: "var(--primary)", color: "#fff" }}
                      >
                        Retry AI
                      </button>
                    )}
                  </div>
                )}

                {pendingImg && aiResult?.estimatedWeightKg != null && !aiLoading && (
                  <div className="mt-2">
                    <input
                      placeholder="Add a note (optional)…"
                      value={weighNote}
                      onChange={e => setWeighNote(e.target.value)}
                      className="w-full text-sm px-3 py-2.5 rounded-xl border border-white/15 bg-white/5 text-white placeholder:text-white/30 outline-none focus:border-primary"
                    />
                    {!weighAge && (
                      <div className="text-amber-400 text-xs text-center mt-2">
                        Add age above to log this to Flock Forecast
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── MANUAL ENTRY MODE ── */}
          {captureMode === "manual" && (
            <div className="flex flex-col flex-1 min-h-0 px-4 overflow-y-auto">
              <p className="text-white/50 text-xs mb-4">Choose a photo from your gallery or take one to get an AI weight estimate.</p>

              {/* Age input */}
              <input
                placeholder="Bird age in days (optional)…"
                value={weighAge}
                onChange={e => setWeighAge(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                className="w-full text-sm px-3 py-2.5 rounded-xl border border-white/15 bg-white/5 text-white placeholder:text-white/30 outline-none focus:border-primary mb-3"
              />

              {!pendingImg ? (
                <>
                  <button
                    onClick={() => weighFileRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base"
                    style={{ background: "var(--primary)", color: "#fff" }}
                  >
                    <Camera className="h-5 w-5" />
                    Take / Choose Photo
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
              ) : (
                <div className="flex flex-col gap-3">
                  <img src={pendingImg} alt="Bird" className="w-full max-h-52 object-contain rounded-xl border border-white/10" />

                  {aiError && <div className="text-red-400 text-xs bg-red-900/30 rounded-xl px-3 py-2">{aiError}</div>}

                  {aiResult && (
                    aiResult.estimatedWeightKg != null ? (
                      <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 text-center">
                        <div className="text-4xl font-black text-white">{(aiResult.estimatedWeightKg * 1000).toFixed(0)}<span className="text-xl text-white/60 ml-1">g</span></div>
                        <div className="text-xs text-white/50 mt-1">{aiResult.estimatedWeightKg.toFixed(3)} kg</div>
                        <div className="mt-1.5 text-[10px] font-bold uppercase" style={{ color: confColor(aiResult.confidenceLevel) }}>
                          {aiResult.confidenceLevel} confidence
                        </div>
                        {aiResult.visualCues && <div className="text-[11px] text-white/50 mt-2">{aiResult.visualCues}</div>}
                      </div>
                    ) : (
                      <div className="bg-red-900/20 border border-red-800/40 rounded-xl p-4 text-center text-sm text-red-400">
                        Could not estimate — {aiResult.notes || "no bird clearly visible"}
                      </div>
                    )
                  )}

                  {aiResult?.estimatedWeightKg != null && (
                    <input
                      placeholder="Add a note (optional)…"
                      value={weighNote}
                      onChange={e => setWeighNote(e.target.value)}
                      className="w-full text-sm px-3 py-2.5 rounded-xl border border-white/15 bg-white/5 text-white placeholder:text-white/30 outline-none focus:border-primary"
                    />
                  )}

                  {!weighAge && aiResult?.estimatedWeightKg != null && (
                    <div className="text-amber-400 text-xs text-center bg-amber-900/20 rounded-lg px-3 py-2">
                      Add bird age above to log to Flock Forecast
                    </div>
                  )}

                  <div className="flex gap-2 pb-4">
                    <button
                      onClick={() => { setPendingImg(null); setAiResult(null); setAiError(null); }}
                      className="flex-1 py-3 rounded-2xl border border-white/20 text-white font-semibold text-sm"
                    >
                      Retake
                    </button>
                    {!aiResult && (
                      <button
                        onClick={runAI}
                        disabled={aiLoading}
                        className="flex-1 py-3 rounded-2xl font-bold text-sm disabled:opacity-50"
                        style={{ background: "var(--primary)", color: "#fff" }}
                      >
                        {aiLoading ? "Analysing…" : "Estimate Weight"}
                      </button>
                    )}
                    {aiResult?.estimatedWeightKg != null && (
                      <button
                        onClick={logWeighIn}
                        className="flex-1 py-3 rounded-2xl font-bold text-sm"
                        style={{ background: "var(--primary)", color: "#fff" }}
                      >
                        {weighAge ? "Save & Log Forecast" : "Save Photo"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
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
