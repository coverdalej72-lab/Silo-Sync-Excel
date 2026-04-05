import { useState, useRef } from "react";
import { useFarmConfig } from "@/hooks/use-farm-config";
import { Trash2, ZoomIn, X, Camera, ImagePlus } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface PhotoEntry {
  id: string;
  shedGroupId: number;
  date: string;
  dataUrl: string;
  note: string;
}

const PHOTOS_KEY = "silo-photos";

function loadPhotos(): PhotoEntry[] {
  try { return JSON.parse(localStorage.getItem(PHOTOS_KEY) || "[]"); } catch { return []; }
}
function savePhotos(photos: PhotoEntry[]) {
  localStorage.setItem(PHOTOS_KEY, JSON.stringify(photos));
}

export default function Photos() {
  const { config } = useFarmConfig();
  const [photos, setPhotos] = useState<PhotoEntry[]>(loadPhotos);
  const [note, setNote] = useState("");
  const [viewPhoto, setViewPhoto] = useState<PhotoEntry | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const activeGroups = config.shedGroups.filter(g => g.active);
  const [selectedGroupId, setSelectedGroupId] = useState<number>(activeGroups[0]?.shedGroupId ?? 1);

  const groupPhotos = photos
    .filter(p => p.shedGroupId === selectedGroupId)
    .sort((a, b) => b.date.localeCompare(a.date));

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      const entry: PhotoEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        shedGroupId: selectedGroupId,
        date: new Date().toISOString(),
        dataUrl,
        note: note.trim(),
      };
      const next = [...photos, entry];
      setPhotos(next);
      savePhotos(next);
      setNote("");
    };
    reader.readAsDataURL(file);
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  };

  const deletePhoto = (id: string) => {
    const next = photos.filter(p => p.id !== id);
    setPhotos(next);
    savePhotos(next);
    setConfirmDelete(null);
    if (viewPhoto?.id === id) setViewPhoto(null);
  };

  const selectedGroup = activeGroups.find(g => g.shedGroupId === selectedGroupId);

  return (
    <div className="flex flex-col h-full bg-background">

      {/* Shed selector */}
      <div className="shrink-0 px-3 pt-3 pb-2 border-b border-border bg-background">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          Shed Group
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {activeGroups.map(g => (
            <button
              key={g.shedGroupId}
              onClick={() => setSelectedGroupId(g.shedGroupId)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                selectedGroupId === g.shedGroupId
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-muted-foreground border-transparent hover:bg-primary/10"
              )}
            >
              {g.customName}
            </button>
          ))}
        </div>
      </div>

      {/* Upload area */}
      <div className="shrink-0 px-3 py-3 border-b border-border bg-muted/30">
        <input
          placeholder="Add a note (optional)..."
          value={note}
          onChange={e => setNote(e.target.value)}
          className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background mb-2 outline-none focus:ring-2 focus:ring-primary/40"
        />
        <div className="flex gap-2">
          <button
            onClick={() => cameraRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:opacity-80"
          >
            <Camera className="h-4 w-4" />
            Take Photo
          </button>
          <button
            onClick={() => galleryRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-secondary text-foreground font-semibold text-sm border border-border active:opacity-80"
          >
            <ImagePlus className="h-4 w-4" />
            Upload
          </button>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
      </div>

      {/* Gallery */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {groupPhotos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Camera className="h-12 w-12 opacity-20" />
            <div className="text-sm font-medium">No photos for {selectedGroup?.customName}</div>
            <div className="text-xs opacity-60">Take or upload a photo above</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {groupPhotos.map(p => (
              <div
                key={p.id}
                className="relative rounded-xl overflow-hidden border border-border bg-muted shadow-sm group"
                style={{ aspectRatio: "4/3" }}
              >
                <img
                  src={p.dataUrl}
                  alt={p.note || "Photo"}
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => setViewPhoto(p)}
                />
                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-0 left-0 right-0 p-2 pointer-events-none">
                  <div className="text-[10px] text-white/80 font-medium">
                    {format(new Date(p.date), "d MMM, h:mm a")}
                  </div>
                  {p.note && (
                    <div className="text-[11px] text-white font-semibold truncate">{p.note}</div>
                  )}
                </div>
                {/* Action buttons */}
                <button
                  onClick={() => setViewPhoto(p)}
                  className="absolute top-1.5 right-8 bg-black/40 text-white rounded-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setConfirmDelete(p.id)}
                  className="absolute top-1.5 right-1.5 bg-black/40 text-white rounded-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {viewPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col"
          onClick={() => setViewPhoto(null)}
        >
          <div className="flex items-center justify-between px-4 py-3" onClick={e => e.stopPropagation()}>
            <div>
              <div className="text-white text-sm font-semibold">
                {selectedGroup?.customName}
              </div>
              <div className="text-white/60 text-xs">{format(new Date(viewPhoto.date), "d MMM yyyy, h:mm a")}</div>
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
              alt={viewPhoto.note || "Photo"}
              className="max-w-full max-h-full object-contain rounded-xl"
              onClick={e => e.stopPropagation()}
            />
          </div>
          {viewPhoto.note && (
            <div className="px-4 pb-6 text-white text-sm text-center" onClick={e => e.stopPropagation()}>
              {viewPhoto.note}
            </div>
          )}
        </div>
      )}

      {/* Delete confirm */}
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
