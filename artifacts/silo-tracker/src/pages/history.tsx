import { useListReadings, useDeleteReading, getListReadingsQueryKey, useGetOnedriveStatus, getGetOnedriveStatusQueryKey, useListDeliveries, getListDeliveriesQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Trash2, CloudOff, FileSpreadsheet, Mail, Pencil, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { exportToExcel } from "@/lib/export-excel";
import { useFarmConfig } from "@/hooks/use-farm-config";
import { cn } from "@/lib/utils";

const SILO_COLORS: Record<string, string> = {
  A: "bg-primary/20 text-primary",
  B: "bg-blue-500/20 text-blue-400",
  C: "bg-amber-500/20 text-amber-400",
  D: "bg-purple-500/20 text-purple-400",
};

const REPORT_EMAIL_KEY = "silo-report-email";

function toTonnes(amount: number, unit: string): number {
  return unit === "t" ? amount : amount / 1000;
}

export default function History() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { config } = useFarmConfig();
  const [exporting, setExporting] = useState(false);
  const [reportEmail, setReportEmail] = useState(() => localStorage.getItem(REPORT_EMAIL_KEY) ?? "");
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");

  const { data: readings, isLoading, error } = useListReadings(undefined, {
    query: { queryKey: getListReadingsQueryKey() }
  });
  const { data: deliveries } = useListDeliveries({ query: { queryKey: getListDeliveriesQueryKey() } });
  const { data: onedriveStatus } = useGetOnedriveStatus({ query: { queryKey: getGetOnedriveStatusQueryKey() } });

  const deleteReading = useDeleteReading();

  const handleDelete = (id: number) => {
    if (!confirm("Delete this reading?")) return;
    deleteReading.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Reading deleted" });
        queryClient.invalidateQueries({ queryKey: getListReadingsQueryKey() });
      },
      onError: () => toast({ variant: "destructive", title: "Failed to delete" })
    });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportToExcel(readings ?? [], deliveries ?? [], config.farmName);
      toast({ title: "Excel file downloaded" });
    } catch {
      toast({ variant: "destructive", title: "Export failed" });
    } finally {
      setExporting(false);
    }
  };

  // ── Latest reading per silo (most recent date per shed+silo) ────────────────
  const latestBySilo = useMemo(() => {
    const map = new Map<string, NonNullable<typeof readings>[0]>();
    (readings ?? []).forEach(r => {
      const key = `${r.shedGroupName}|${r.siloLetter}`;
      const existing = map.get(key);
      if (!existing || r.readingDate > existing.readingDate) map.set(key, r);
    });
    return map;
  }, [readings]);

  // Per-shed totals, sorted by farm config order
  const shedTotals = useMemo(() => {
    const map = new Map<string, { silos: { letter: string; amount: number; unit: string }[]; totalT: number }>();
    for (const [key, r] of latestBySilo) {
      const [shedName, letter] = key.split("|");
      if (!map.has(shedName)) map.set(shedName, { silos: [], totalT: 0 });
      const entry = map.get(shedName)!;
      entry.silos.push({ letter, amount: r.amountRemaining, unit: r.unit });
      entry.totalT += toTonnes(r.amountRemaining, r.unit);
    }
    // Sort silos within each shed alphabetically
    for (const entry of map.values()) entry.silos.sort((a, b) => a.letter.localeCompare(b.letter));
    // Sort sheds by farm config order
    const cfgOrder = config.shedGroups.map(g => g.customName);
    return [...map.entries()].sort(([a], [b]) => {
      const ai = cfgOrder.indexOf(a), bi = cfgOrder.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [latestBySilo, config.shedGroups]);

  const grandTotalT = useMemo(
    () => shedTotals.reduce((sum, [, s]) => sum + s.totalT, 0),
    [shedTotals]
  );

  // ── Email report ─────────────────────────────────────────────────────────────
  const buildEmailBody = () => {
    const now = new Date(Date.now() + 10 * 3600_000);
    const dateStr = now.toLocaleDateString("en-AU", {
      weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC"
    });
    let body = `Daily Silo Report\n`;
    body += `Farm: ${config.farmName}\n`;
    body += `Date: ${dateStr}\n`;
    body += `\n`;
    for (const [shedName, shed] of shedTotals) {
      const siloStr = shed.silos.map(s => `Silo ${s.letter}: ${toTonnes(s.amount, s.unit).toFixed(1)} t`).join("  |  ");
      body += `${shedName}\n`;
      body += `  ${siloStr}\n`;
      body += `  Subtotal: ${shed.totalT.toFixed(1)} t\n`;
      body += `\n`;
    }
    body += `──────────────────────────────\n`;
    body += `TOTAL FEED ON HAND: ${grandTotalT.toFixed(1)} t\n`;
    body += `──────────────────────────────\n`;
    body += `\nSent from Farm Buddy`;
    return body;
  };

  const handleEmailReport = () => {
    const aestNow = new Date(Date.now() + 10 * 3600_000);
    const dateLabel = aestNow.toLocaleDateString("en-AU", { timeZone: "UTC" });
    const subject = encodeURIComponent(`Silo Report — ${config.farmName} — ${dateLabel}`);
    const body = encodeURIComponent(buildEmailBody());
    const to = encodeURIComponent(reportEmail.trim());
    window.open(`mailto:${to}?subject=${subject}&body=${body}`, "_blank");
  };

  const saveEmail = (val: string) => {
    const trimmed = val.trim();
    setReportEmail(trimmed);
    localStorage.setItem(REPORT_EMAIL_KEY, trimmed);
    setEditingEmail(false);
  };

  // ── Group history by AEST date ───────────────────────────────────────────────
  const toAESTDateKey = (iso: string) => {
    const local = new Date(new Date(iso).getTime() + 10 * 3600_000);
    return local.toISOString().slice(0, 10);
  };

  const grouped = readings?.reduce((acc, r) => {
    const d = toAESTDateKey(r.readingDate);
    if (!acc[d]) acc[d] = [];
    acc[d].push(r);
    return acc;
  }, {} as Record<string, typeof readings>) ?? {};

  const hasSummary = shedTotals.length > 0;

  return (
    <div className="px-3 py-3 pb-8 space-y-4">

      {/* ── Summary & Email card ────────────────────────────────────────────── */}
      {hasSummary && (
        <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="px-4 pt-3.5 pb-2 flex items-center justify-between gap-2 border-b border-border/20">
            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Feed on Hand</p>
              <p className="text-2xl font-extrabold leading-tight text-primary">
                {grandTotalT.toFixed(1)} <span className="text-base font-bold text-muted-foreground">t</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Latest readings</p>
              <p className="text-[11px] font-semibold text-foreground">{config.farmName}</p>
            </div>
          </div>

          {/* Per-shed breakdown */}
          <div className="divide-y divide-border/10">
            {shedTotals.map(([shedName, shed]) => (
              <div key={shedName} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{shedName}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {shed.silos.map(s => `Silo ${s.letter}: ${toTonnes(s.amount, s.unit).toFixed(1)} t`).join("  ·  ")}
                  </p>
                </div>
                <p className="text-sm font-bold shrink-0 text-foreground">{shed.totalT.toFixed(1)} t</p>
              </div>
            ))}
          </div>

          {/* Email section */}
          <div className="px-4 py-3 border-t border-border/20 space-y-2.5">
            {/* Email address row */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide shrink-0">To:</span>
              {editingEmail ? (
                <div className="flex-1 flex items-center gap-2">
                  <input
                    autoFocus
                    type="email"
                    value={emailDraft}
                    onChange={e => setEmailDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveEmail(emailDraft); if (e.key === "Escape") setEditingEmail(false); }}
                    placeholder="email@baiada.com.au"
                    className="flex-1 text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => saveEmail(emailDraft)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-primary text-primary-foreground"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setEmailDraft(reportEmail); setEditingEmail(true); }}
                  className="flex-1 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className={cn("truncate", reportEmail ? "text-foreground font-medium" : "italic")}>
                    {reportEmail || "tap to set email address…"}
                  </span>
                  <Pencil className="h-3 w-3 shrink-0" />
                </button>
              )}
            </div>

            {/* Send button */}
            <button
              onClick={handleEmailReport}
              disabled={shedTotals.length === 0}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold text-sm px-4 py-2.5 rounded-xl active:scale-95 transition-all disabled:opacity-40"
            >
              <Mail className="h-4 w-4" />
              Email Report to Baiada
            </button>
          </div>
        </div>
      )}

      {/* ── Top actions ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        {onedriveStatus && !onedriveStatus.onedriveConnected && !onedriveStatus.gdriveConnected && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary px-2.5 py-1.5 rounded-lg">
            <CloudOff className="h-3 w-3" /> Local only
          </div>
        )}
        <div className="ml-auto">
          <button
            onClick={handleExport}
            disabled={exporting || !readings?.length}
            className="flex items-center gap-2 bg-card border border-border/50 text-primary font-bold text-sm px-4 py-2.5 rounded-xl active:scale-95 transition-all disabled:opacity-40"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export Excel"}
          </button>
        </div>
      </div>

      {/* ── Readings history list ────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-card animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 text-sm text-destructive">
          Failed to load readings history.
        </div>
      ) : readings?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No readings recorded yet.
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([date, dayReadings]) => (
            <div key={date}>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1 sticky top-0 bg-background py-1.5">
                {format(new Date(date), "EEEE, MMM d, yyyy")}
              </p>
              <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
                {dayReadings.map((reading, idx) => (
                  <div
                    key={reading.id}
                    className={cn("flex items-center gap-3 px-4 py-3", idx > 0 && "border-t border-border/20")}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{reading.shedGroupName}</span>
                        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded uppercase", SILO_COLORS[reading.siloLetter] ?? "bg-primary/20 text-primary")}>
                          Silo {reading.siloLetter}
                        </span>
                        {reading.feedType && (
                          <span className="text-[10px] text-muted-foreground">{reading.feedType}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {format(new Date(reading.readingDate), "h:mm a")}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xl font-extrabold leading-none">{reading.amountRemaining}</p>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mt-1">{reading.unit}</p>
                    </div>
                    <button
                      onClick={() => handleDelete(reading.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
