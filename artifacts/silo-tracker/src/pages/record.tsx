import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useListSilos, useCreateReading, getGetReadingsSummaryQueryKey, getListReadingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

const formSchema = z.object({
  siloId: z.coerce.number().min(1, "Please select a silo"),
  feedType: z.string().min(1, "Feed type is required"),
  amountRemaining: z.coerce.number().min(0, "Amount must be zero or positive"),
  unit: z.string().min(1, "Unit is required"),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function RecordReading() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: silos, isLoading: silosLoading } = useListSilos({
    query: { queryKey: ["/api/silos"] }
  });

  const createReading = useCreateReading();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      siloId: 0,
      feedType: "",
      amountRemaining: 0,
      unit: localStorage.getItem("silo-default-unit") || "t",
      notes: "",
    },
  });

  // Auto-fill default feed type when a silo is selected
  const selectedSiloId = form.watch("siloId");
  useEffect(() => {
    if (selectedSiloId && silos) {
      const silo = silos.find(s => s.id === selectedSiloId);
      if (silo && silo.defaultFeedType) {
        form.setValue("feedType", silo.defaultFeedType);
      }
    }
  }, [selectedSiloId, silos, form]);

  const onSubmit = (values: FormValues) => {
    createReading.mutate({ data: values }, {
      onSuccess: () => {
        toast({
          title: "Reading recorded",
          description: "Your silo reading has been saved successfully.",
        });
        queryClient.invalidateQueries({ queryKey: getGetReadingsSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListReadingsQueryKey() });
        setLocation("/");
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to record reading. Please try again.",
        });
      }
    });
  };

  if (silosLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Record Reading</h1>
        </div>
        <Card>
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!silos || silos.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Record Reading</h1>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <h2 className="text-xl font-semibold mb-2">No silos found</h2>
            <p className="text-muted-foreground mb-6">You need to create a silo before you can record a reading.</p>
            <Button onClick={() => setLocation("/silos")}>Manage Silos</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Record Reading</h1>
        <p className="text-muted-foreground mt-1">Enter current levels directly from the field.</p>
      </header>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <FormField
                control={form.control}
                name="siloId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base">Select Silo</FormLabel>
                    <Select
                      onValueChange={(val) => field.onChange(parseInt(val, 10))}
                      value={field.value ? field.value.toString() : ""}
                    >
                      <FormControl>
                        <SelectTrigger className="h-12 text-lg">
                          <SelectValue placeholder="Choose a silo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {silos.map((silo) => (
                          <SelectItem key={silo.id} value={silo.id.toString()} className="text-lg py-3">
                            {silo.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="amountRemaining"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">Amount Remaining</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          className="h-12 text-lg font-bold" 
                          {...field} 
                        />
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
                      <FormLabel className="text-base">Unit</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-12 text-lg">
                            <SelectValue placeholder="Unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="tons" className="text-lg py-3">Tons</SelectItem>
                          <SelectItem value="lbs" className="text-lg py-3">Pounds (lbs)</SelectItem>
                          <SelectItem value="kg" className="text-lg py-3">Kilograms (kg)</SelectItem>
                          <SelectItem value="bushels" className="text-lg py-3">Bushels</SelectItem>
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
                    <FormLabel className="text-base">Feed Type</FormLabel>
                    <FormControl>
                      <Input className="h-12 text-lg" placeholder="e.g. Starter, Finisher, Corn..." {...field} />
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
                    <FormLabel className="text-base">Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        className="min-h-[100px] text-base resize-none" 
                        placeholder="Any observations? Bridging, mold, repairs needed?" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                size="lg" 
                className="w-full h-14 text-lg font-bold shadow-sm"
                disabled={createReading.isPending}
              >
                {createReading.isPending ? "Saving..." : "Save Reading"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}