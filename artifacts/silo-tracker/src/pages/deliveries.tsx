import { useListDeliveries, useCreateDelivery, useDeleteDelivery, useListShedGroups, getListDeliveriesQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Trash2, Truck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const deliverySchema = z.object({
  shedGroupId: z.coerce.number().optional(),
  feedType: z.string().min(1, "Feed type is required"),
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
  unit: z.string().min(1, "Unit is required"),
  notes: z.string().optional(),
  deliveryDate: z.string().optional(),
});

type DeliveryFormValues = z.infer<typeof deliverySchema>;

export default function Deliveries() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      unit: "tons",
      feedType: "",
      notes: "",
      deliveryDate: new Date().toISOString().split('T')[0]
    },
  });

  const onSubmit = (values: DeliveryFormValues) => {
    createDelivery.mutate({ 
      data: {
        ...values,
        shedGroupId: values.shedGroupId ? values.shedGroupId : null,
      } 
    }, {
      onSuccess: () => {
        toast({ title: "Delivery recorded" });
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListDeliveriesQueryKey() });
      },
      onError: () => {
        toast({ variant: "destructive", title: "Failed to record delivery" });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this delivery record?")) return;
    deleteDelivery.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Delivery deleted" });
        queryClient.invalidateQueries({ queryKey: getListDeliveriesQueryKey() });
      }
    });
  };

  return (
    <div className="p-4 space-y-6 pt-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Deliveries</h1>
        <p className="text-sm text-muted-foreground mt-1">Record feed drop-offs.</p>
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
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase font-bold text-muted-foreground">Amount</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" className="h-12 font-bold text-lg" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase font-bold text-muted-foreground">Unit</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-12 font-medium">
                            <SelectValue placeholder="Unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="tons">Tons</SelectItem>
                          <SelectItem value="kg">kg</SelectItem>
                          <SelectItem value="lbs">lbs</SelectItem>
                          <SelectItem value="bushels">Bushels</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="feedType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase font-bold text-muted-foreground">Feed Type</FormLabel>
                    <FormControl>
                      <Input className="h-12 font-medium" placeholder="e.g. Starter Pellets" {...field} />
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
                    <FormLabel className="text-xs uppercase font-bold text-muted-foreground">Destination (Optional)</FormLabel>
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
                    <FormLabel className="text-xs uppercase font-bold text-muted-foreground">Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Driver name, docket number..." className="resize-none" {...field} />
                    </FormControl>
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

      <div className="space-y-4 pt-4">
        <h2 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">Past Deliveries</h2>
        
        {deliveriesLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : deliveries?.length === 0 ? (
          <div className="text-center p-6 bg-muted/30 rounded-lg text-sm text-muted-foreground">
            No deliveries recorded.
          </div>
        ) : (
          <div className="space-y-3">
            {deliveries?.map(delivery => (
              <Card key={delivery.id} className="shadow-sm">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-bold text-lg">{delivery.amount} {delivery.unit}</div>
                      <div className="text-sm font-medium">{delivery.feedType}</div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(delivery.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground mt-3 pt-3 border-t">
                    <div className="flex justify-between">
                      <span>Date:</span>
                      <span className="font-medium text-foreground">{format(new Date(delivery.deliveryDate), "MMM d, yyyy")}</span>
                    </div>
                    {delivery.shedGroupName && (
                      <div className="flex justify-between">
                        <span>Destination:</span>
                        <span className="font-medium text-foreground">{delivery.shedGroupName}</span>
                      </div>
                    )}
                    {delivery.notes && (
                      <div className="mt-1 text-foreground italic bg-muted/50 p-2 rounded">
                        "{delivery.notes}"
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
