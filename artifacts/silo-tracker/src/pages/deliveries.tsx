import { useState } from "react";
import { useListDeliveries, useCreateDelivery, useDeleteDelivery, useListShedGroups, getListDeliveriesQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Trash2, Truck, ScanLine, Plus, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { QrScanner, type DocketData } from "@/components/qr-scanner";

const FEED_TYPES = ["Starter", "Grower", "Finisher", "Withdrawal"] as const;

function normalizeFeedType(raw: string): string {
  const ft = raw.toLowerCase().trim();
  if (ft.includes("start") || ft.includes("strt") || ft === "b/strt" || ft === "br/strt") return "Starter";
  if (ft.includes("grow") || ft.includes("grw") || ft === "b/grw" || ft === "br/grw") return "Grower";
  if (ft.includes("fin") || ft === "b/fin" || ft === "br/fin") return "Finisher";
  if (ft.includes("with") || ft.includes("wdw") || ft.includes("wdrwl") || ft === "b/wdw") return "Withdrawal";
  return "Starter";
}

const deliverySchema = z.object({
  shedGroupId: z.coerce.number().optional(),
  feedType: z.string().default("Starter"),
  amount: z.coerce.number().min(0.01, "Enter the kg amount"),
  unit: z.string().default("kg"),
  notes: z.string().optional(),
  deliveryDate: z.string().optional(),
});
type DeliveryFormValues = z.infer<typeof deliverySchema>;

const FEED_BADGES: Record<string, string> = {
  starter: "bg-blue-500/20 text-blue-400",
  grower:  "bg-green-500/20 text-green-400",
  finisher: "bg-red-500/20 text-red-400",
  feed: "bg-primary/20 text-primary",
};
function feedBadgeClass(feedType: string) {
  return FEED_BADGES[feedType.toLowerCase()] ?? "bg-primary/20 text-primary";
}

function groupByBatch(deliveries: any[]) {
  const map = new Map<string, any[]>();
  for (const d of deliveries) {
    const key = d.notes?.match(/batch\s*\d+/i)?.[0]?.toLowerCase() ?? "delivery";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(d);
  }
  return Array.from(map.entries()).map(([batch, items]) => ({ batch, items }));
}

export default function Deliveries() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showScanner, setShowScanner] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const { data: deliveries, isLoading } = useListDeliveries({
    query: { queryKey: getListDeliveriesQueryKey() }
  });
  const { data: shedGroups } = useListShedGroups({ query: { queryKey: ["/api/shed-groups"] } });

  const createDelivery = useCreateDelivery();
  const deleteDelivery = useDeleteDelivery();

  const form = useForm<DeliveryFormValues>({
    resolver: zodResolver(deliverySchema),
    defaultValues: {
      amount: 0, unit: "kg", feedType: "Starter", notes: "",
      deliveryDate: new Date().toISOString().split("T")[0],
    },
  });

  const handleScanResult = (data: DocketData) => {
    setShowScanner(false);
    setShowForm(true);
    if (data.amountKg != null)  form.setValue("amount", data.amountKg);
    if (data.deliveryDate)       form.setValue("deliveryDate", data.deliveryDate);
    if (data.feedType)           form.setValue("feedType", normalizeFeedType(data.feedType));
    if (data.docNumber)          form.setValue("notes", `Doc: ${data.docNumber}`);
    toast({ title: "Docket scanned" });
  };

  const onSubmit = (values: DeliveryFormValues) => {
    createDelivery.mutate({ data: { ...values, shedGroupId: values.shedGroupId ?? null } }, {
      onSuccess: () => {
        toast({ title: "Delivery saved" });
        form.reset({ amount: 0, unit: "kg", feedType: "Starter", notes: "", deliveryDate: new Date().toISOString().split("T")[0] });
        setShowForm(false);
        queryClient.invalidateQueries({ queryKey: getListDeliveriesQueryKey() });
      },
      onError: () => toast({ variant: "destructive", title: "Failed to save delivery" })
    });
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this delivery?")) return;
    deleteDelivery.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Deleted" });
        queryClient.invalidateQueries({ queryKey: getListDeliveriesQueryKey() });
      }
    });
  };

  const groups = groupByBatch(deliveries ?? []);

  return (
    <>
      {showScanner && (
        <QrScanner onResult={handleScanResult} onClose={() => setShowScanner(false)} />
      )}

      <div className="px-3 py-3 pb-8 space-y-3">

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowScanner(true)}
            className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold py-3.5 rounded-2xl text-sm active:scale-95 transition-all"
          >
            <ScanLine className="w-5 h-5" />
            Scan QR Code
          </button>
          <button
            onClick={() => setShowForm(v => !v)}
            className="w-12 h-12 rounded-2xl bg-secondary border border-border/50 flex items-center justify-center text-foreground active:scale-95 transition-all self-center"
          >
            {showForm ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          </button>
        </div>

        {/* Manual form */}
        {showForm && (
          <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
              <Truck className="w-4 h-4 text-primary" />
              <span className="font-bold text-sm">New Delivery</span>
            </div>
            <form onSubmit={form.handleSubmit(onSubmit)} className="p-4 space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest block mb-1">Kilograms</label>
                <input
                  type="number" step="1"
                  className="w-full bg-secondary border border-border/50 rounded-xl px-4 py-3 text-2xl font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  {...form.register("amount", { valueAsNumber: true })}
                />
                {form.formState.errors.amount && (
                  <p className="text-destructive text-xs mt-1">{form.formState.errors.amount.message}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest block mb-1">Date</label>
                  <input type="date" className="w-full bg-secondary border border-border/50 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" {...form.register("deliveryDate")} />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest block mb-1">Feed Type</label>
                  <select className="w-full bg-secondary border border-border/50 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" {...form.register("feedType")}>
                    {FEED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest block mb-1">Doc Number</label>
                <input type="text" placeholder="e.g. Doc: 55104" className="w-full bg-secondary border border-border/50 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50" {...form.register("notes")} />
              </div>
              <button type="submit" disabled={createDelivery.isPending} className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl active:scale-95 transition-all">
                {createDelivery.isPending ? "Saving…" : "Save Delivery"}
              </button>
            </form>
          </div>
        )}

        {/* Delivery list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-28 rounded-2xl bg-card animate-pulse" />)}
          </div>
        ) : deliveries?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No deliveries recorded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(({ batch, items }) => {
              const totalKg = items.reduce((s, d) => s + (d.amount ?? 0), 0);
              const totalT = (totalKg / 1000).toFixed(2);
              return (
                <div key={batch} className="bg-card border border-border/50 rounded-2xl overflow-hidden">
                  {/* Batch header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
                    <div>
                      <p className="font-bold text-base capitalize">{batch}</p>
                      <p className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? "delivery" : "deliveries"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-base">{totalT} t</p>
                      <p className="text-xs text-muted-foreground">{totalKg.toLocaleString()} KG</p>
                    </div>
                  </div>
                  {/* Items */}
                  {items.map((delivery, idx) => (
                    <div key={delivery.id} className={cn("flex items-center gap-3 px-4 py-3", idx > 0 && "border-t border-border/20")}>
                      <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                        <Truck className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{delivery.feedType || "Unknown Feed"}</span>
                          {delivery.feedType && (
                            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide", feedBadgeClass(delivery.feedType))}>
                              {delivery.feedType}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {delivery.notes ? `${delivery.notes} · ` : ""}
                          {format(new Date(delivery.deliveryDate), "yyyy-MM-dd")} · {delivery.amount.toLocaleString()} kg
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(delivery.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
