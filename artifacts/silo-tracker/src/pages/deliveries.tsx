import { useState } from "react";
import { useListDeliveries, useCreateDelivery, useDeleteDelivery, useListShedGroups, getListDeliveriesQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Trash2, Truck, ScanLine } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { QrScanner, type DocketData } from "@/components/qr-scanner";

const deliverySchema = z.object({
  shedGroupId: z.coerce.number().optional(),
  feedType: z.string().default("Feed"),
  amount: z.coerce.number().min(0.01, "Enter the kg amount"),
  unit: z.string().default("kg"),
  notes: z.string().optional(),
  deliveryDate: z.string().optional(),
});

type DeliveryFormValues = z.infer<typeof deliverySchema>;

export default function Deliveries() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showScanner, setShowScanner] = useState(false);

  const { data: deliveries, isLoading: deliveriesLoading } = useListDeliveries({
    query: { queryKey: getListDeliveriesQueryKey() }
  });

  const { data: shedGroups } = useListShedGroups({
    query: { queryKey: ["/api/shed-groups"] }
  });

  const createDelivery = useCreateDelivery();
  const deleteDelivery = useDeleteDelivery();

  const form = useForm<DeliveryFormValues>({
    resolver: zodResolver(deliverySchema),
    defaultValues: {
      amount: 0,
      unit: "kg",
      feedType: "Feed",
      notes: "",
      deliveryDate: new Date().toISOString().split("T")[0],
    },
  });

  const handleScanResult = (data: DocketData) => {
    setShowScanner(false);
    if (data.amountKg != null) form.setValue("amount", data.amountKg);
    if (data.deliveryDate) form.setValue("deliveryDate", data.deliveryDate);
    if (data.docNumber) form.setValue("notes", `Doc: ${data.docNumber}`);
    toast({ title: "Docket scanned" });
  };

  const onSubmit = (values: DeliveryFormValues) => {
    createDelivery.mutate({
      data: {
        ...values,
        shedGroupId: values.shedGroupId ?? null,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Delivery saved" });
        form.reset({
          amount: 0,
          unit: "kg",
          feedType: "Feed",
          notes: "",
          deliveryDate: new Date().toISOString().split("T")[0],
        });
        queryClient.invalidateQueries({ queryKey: getListDeliveriesQueryKey() });
      },
      onError: () => {
        toast({ variant: "destructive", title: "Failed to save delivery" });
      }
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

  return (
    <>
      {showScanner && (
        <QrScanner onResult={handleScanResult} onClose={() => setShowScanner(false)} />
      )}

      <div className="p-4 space-y-6 pt-6 pb-24">
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Deliveries</h1>
            <p className="text-sm text-muted-foreground mt-1">Record feed deliveries.</p>
          </div>
          <Button onClick={() => setShowScanner(true)} className="flex items-center gap-2 h-12 px-4 font-bold">
            <ScanLine className="h-5 w-5" />
            Scan Docket
          </Button>
        </header>

        <Card className="shadow-md border-border/50">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-lg flex items-center gap-2">
              <Truck className="h-5 w-5" /> New Delivery
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase font-bold text-muted-foreground">Kilograms</FormLabel>
                      <FormControl>
                        <Input type="number" step="1" className="h-14 font-bold text-2xl" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deliveryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase font-bold text-muted-foreground">Date</FormLabel>
                      <FormControl>
                        <Input type="date" className="h-12 font-medium" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase font-bold text-muted-foreground">Doc Number</FormLabel>
                      <FormControl>
                        <Input className="h-12 font-medium" placeholder="e.g. Doc: 55104" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="shedGroupId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase font-bold text-muted-foreground">Shed (Optional)</FormLabel>
                      <Select
                        onValueChange={(val) => field.onChange(val ? parseInt(val, 10) : undefined)}
                        value={field.value?.toString() || ""}
                      >
                        <FormControl>
                          <SelectTrigger className="h-12 font-medium">
                            <SelectValue placeholder="Select shed group" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {shedGroups?.map(sg => (
                            <SelectItem key={sg.id} value={sg.id.toString()}>{sg.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full h-12 font-bold" disabled={createDelivery.isPending}>
                  Save Delivery
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="space-y-4 pt-2">
          <h2 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">Past Deliveries</h2>

          {deliveriesLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : deliveries?.length === 0 ? (
            <div className="text-center p-6 bg-muted/30 rounded-lg text-sm text-muted-foreground">
              No deliveries recorded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {deliveries?.map(delivery => (
                <Card key={delivery.id} className="shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-bold text-xl">{delivery.amount.toLocaleString()} kg</div>
                        <div className="text-sm text-muted-foreground mt-0.5">
                          {format(new Date(delivery.deliveryDate), "d MMM yyyy")}
                          {delivery.notes ? ` — ${delivery.notes}` : ""}
                        </div>
                        {delivery.shedGroupName && (
                          <div className="text-xs text-muted-foreground mt-0.5">{delivery.shedGroupName}</div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(delivery.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
