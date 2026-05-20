import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Edit2, Check, X, Globe } from "lucide-react";
import { useFarms, type Farm } from "@/hooks/useFarms";
import { cn } from "@/lib/utils";

interface FarmFormState {
  name: string;
  apiUrl: string;
}

function FarmRow({
  farm,
  onUpdate,
  onRemove,
}: {
  farm: Farm;
  onUpdate: (id: string, data: Partial<Omit<Farm, "id">>) => void;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FarmFormState>({ name: farm.name, apiUrl: farm.apiUrl });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = () => {
    if (!form.name.trim()) return;
    onUpdate(farm.id, { name: form.name.trim(), apiUrl: form.apiUrl.trim() });
    setEditing(false);
  };

  const handleCancel = () => {
    setForm({ name: farm.name, apiUrl: farm.apiUrl });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="bg-card border border-primary/30 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
              Farm Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Double B Farm North"
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
              API Base URL
            </label>
            <input
              type="url"
              value={form.apiUrl}
              onChange={e => setForm(f => ({ ...f, apiUrl: e.target.value }))}
              placeholder="https://farm.example.com (blank = this server)"
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={handleCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!form.name.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-4 hover:border-primary/30 transition-colors">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <span className="text-primary font-bold text-sm">{farm.name.slice(0, 2).toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground text-sm">{farm.name}</p>
        <p className="text-muted-foreground text-xs truncate flex items-center gap-1 mt-0.5">
          <Globe className="w-3 h-3 shrink-0" />
          {farm.apiUrl || "This server (current origin)"}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => setEditing(true)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <span className="text-xs text-destructive font-semibold">Remove?</span>
            <button
              onClick={() => onRemove(farm.id)}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function AddFarmForm({ onAdd }: { onAdd: (data: Omit<Farm, "id">) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FarmFormState>({ name: "", apiUrl: "" });

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    onAdd({ name: form.name.trim(), apiUrl: form.apiUrl.trim() });
    setForm({ name: "", apiUrl: "" });
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-primary font-semibold text-sm transition-all"
      >
        <Plus className="w-4 h-4" />
        Add Farm
      </button>
    );
  }

  return (
    <div className="bg-card border-2 border-primary/30 rounded-xl p-4 space-y-3">
      <p className="text-sm font-bold text-foreground">New Farm</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
            Farm Name <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Double B Farm South"
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
            autoFocus
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
            API Base URL
          </label>
          <input
            type="url"
            value={form.apiUrl}
            onChange={e => setForm(f => ({ ...f, apiUrl: e.target.value }))}
            placeholder="https://farm.example.com"
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Leave URL blank if this farm runs on the same server as the dashboard.
        For remote farms, enter their full domain (e.g.{" "}
        <code className="font-mono bg-secondary px-1 rounded">https://farm2.yourdomain.com</code>).
      </p>
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => { setOpen(false); setForm({ name: "", apiUrl: "" }); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-secondary transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!form.name.trim()}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Farm
        </button>
      </div>
    </div>
  );
}

export default function OpsSettings() {
  const { farms, addFarm, updateFarm, removeFarm } = useFarms();
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-primary border-b border-primary/20 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="w-8 h-8 rounded-lg bg-primary-foreground/10 hover:bg-primary-foreground/20 flex items-center justify-center text-primary-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <span className="text-primary-foreground font-bold text-base leading-none">Farm Buddy™</span>
            <span className="ml-2 text-primary-foreground/50 text-xs font-medium">Manage Farms</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-extrabold text-foreground">Configured Farms</h2>
              <p className="text-muted-foreground text-xs mt-0.5">
                {farms.length === 0
                  ? "No farms added yet"
                  : `${farms.length} farm${farms.length !== 1 ? "s" : ""} in your operations group`}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {farms.map(farm => (
              <FarmRow
                key={farm.id}
                farm={farm}
                onUpdate={updateFarm}
                onRemove={removeFarm}
              />
            ))}
            <AddFarmForm onAdd={addFarm} />
          </div>
        </section>

        {/* How it works */}
        <section className="bg-card border border-border rounded-2xl p-6">
          <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center">
              <span className="text-primary text-[10px] font-extrabold">?</span>
            </div>
            How the Operations Dashboard works
          </h3>
          <div className="space-y-3 text-sm text-muted-foreground">
            {[
              "Each farm manager runs their own Farm Buddy app (Silo Tracker) on their device or server.",
              <>Add each farm here with its <strong className="text-foreground">name</strong> and <strong className="text-foreground">API URL</strong> (the web address where their app is hosted).</>,
              <>The dashboard <strong className="text-foreground">fetches live data</strong> from each farm's API — feed on hand, today's readings, upcoming deliveries — and shows them side by side.</>,
              <>Click <strong className="text-foreground">Open App</strong> on any card to jump directly into that farm's own app in a new tab.</>,
            ].map((text, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">{i + 1}</div>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Legend */}
        <section className="bg-card border border-border rounded-2xl p-6">
          <h3 className="font-bold text-foreground mb-4">Feed Level Indicators</h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { color: "bg-green-500", label: "Good", desc: "15 tonnes or more" },
              { color: "bg-amber-500", label: "Low", desc: "Between 5 and 15 t" },
              { color: "bg-red-500", label: "Critical", desc: "Under 5 tonnes" },
            ].map(item => (
              <div key={item.label} className={cn("flex items-center gap-3 p-3 rounded-xl bg-secondary/50")}>
                <div className={cn("w-3 h-3 rounded-full shrink-0", item.color)} />
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
