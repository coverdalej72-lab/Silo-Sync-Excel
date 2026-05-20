import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Edit2, Check, X, RefreshCw, Mail } from "lucide-react";
import { useFarms, type Farm } from "@/hooks/useFarms";
import { cn } from "@/lib/utils";

const PLAN_TIERS = ["bronze", "silver", "gold", "platinum"] as const;
type PlanTier = typeof PLAN_TIERS[number];

const TIER_LABELS: Record<PlanTier, string> = {
  bronze: "🥉 Bronze",
  silver: "🥈 Silver",
  gold: "🥇 Gold",
  platinum: "💎 Platinum",
};

function FarmRow({
  farm,
  onUpdate,
  onRemove,
}: {
  farm: Farm;
  onUpdate: (id: number, data: { name?: string; planTier?: string }) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: farm.name, planTier: farm.planTier });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onUpdate(farm.id, { name: form.name.trim(), planTier: form.planTier });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm({ name: farm.name, planTier: farm.planTier });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="bg-card border border-primary/30 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Farm Name</label>
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
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Plan Tier</label>
            <select
              value={form.planTier}
              onChange={e => setForm(f => ({ ...f, planTier: e.target.value }))}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {PLAN_TIERS.map(t => (
                <option key={t} value={t}>{TIER_LABELS[t]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={handleCancel} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-secondary transition-colors">
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!form.name.trim() || saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Check className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save"}
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
        <p className="text-muted-foreground text-xs mt-0.5">{TIER_LABELS[farm.planTier as PlanTier] ?? farm.planTier}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => setEditing(true)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <span className="text-xs text-destructive font-semibold">Remove?</span>
            <button onClick={() => onRemove(farm.id)} className="w-8 h-8 rounded-lg flex items-center justify-center bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setConfirmDelete(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function AddFarmForm({ onCreate }: { onCreate: (name: string, tier: string, email?: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", planTier: "bronze" as PlanTier, managerEmail: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setErr("");
    try {
      await onCreate(form.name.trim(), form.planTier, form.managerEmail.trim() || undefined);
      setForm({ name: "", planTier: "bronze", managerEmail: "" });
      setOpen(false);
    } catch (e: any) {
      setErr(e.message ?? "Failed to create farm");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-primary font-semibold text-sm transition-all"
      >
        <Plus className="w-4 h-4" /> Provision New Farm
      </button>
    );
  }

  return (
    <div className="bg-card border-2 border-primary/30 rounded-xl p-4 space-y-3">
      <p className="text-sm font-bold text-foreground">Provision New Farm</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Farm Name *</label>
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
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Plan Tier</label>
          <select
            value={form.planTier}
            onChange={e => setForm(f => ({ ...f, planTier: e.target.value as PlanTier }))}
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {PLAN_TIERS.map(t => (
              <option key={t} value={t}>{TIER_LABELS[t]}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
          <Mail className="w-3 h-3 inline mr-1" />Manager Email (optional — sends invite)
        </label>
        <input
          type="email"
          value={form.managerEmail}
          onChange={e => setForm(f => ({ ...f, managerEmail: e.target.value }))}
          placeholder="manager@farm.com.au"
          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => { setOpen(false); setForm({ name: "", planTier: "bronze", managerEmail: "" }); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-secondary transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!form.name.trim() || saving}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> {saving ? "Creating…" : "Create Farm"}
        </button>
      </div>
    </div>
  );
}

export default function OpsSettings() {
  useEffect(() => { document.title = "Farm Buddy™ — Manage Farms"; }, []);
  const { farms, loading, error, refresh, createFarm, updateFarm, removeFarm } = useFarms();
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-primary border-b border-primary/20 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="w-8 h-8 rounded-lg bg-primary-foreground/10 hover:bg-primary-foreground/20 flex items-center justify-center text-primary-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <span className="text-primary-foreground font-bold text-base leading-none">Farm Buddy™</span>
            <span className="ml-2 text-primary-foreground/50 text-xs font-medium">Manage Farms</span>
          </div>
          <button onClick={refresh} className="w-8 h-8 rounded-lg bg-primary-foreground/10 hover:bg-primary-foreground/20 flex items-center justify-center text-primary-foreground transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-extrabold text-foreground">Provisioned Farms</h2>
              <p className="text-muted-foreground text-xs mt-0.5">
                {loading ? "Loading…" : error ? error : farms.length === 0 ? "No farms yet" : `${farms.length} farm${farms.length !== 1 ? "s" : ""} in your operations group`}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {farms.map(farm => (
              <FarmRow key={farm.id} farm={farm} onUpdate={updateFarm} onRemove={removeFarm} />
            ))}
            <AddFarmForm onCreate={createFarm} />
          </div>
        </section>

        <section className="bg-card border border-border rounded-2xl p-6">
          <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center">
              <span className="text-primary text-[10px] font-extrabold">i</span>
            </div>
            How farm provisioning works
          </h3>
          <div className="space-y-3 text-sm text-muted-foreground">
            {[
              "Create each farm here — it's instantly added to the database with its own isolated data.",
              <>Enter the farm manager's email to <strong className="text-foreground">automatically send a sign-up invitation</strong> via Clerk. They'll set their own password.</>,
              <>Assign a <strong className="text-foreground">plan tier</strong> (Bronze / Silver / Gold / Platinum) per farm — this controls which features and report types are available.</>,
              <>Once a manager signs in, their readings, silos, and deliveries are <strong className="text-foreground">fully isolated</strong> from other farms.</>,
            ].map((text, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">{i + 1}</div>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>

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
