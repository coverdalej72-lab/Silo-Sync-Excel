import { useState } from "react";
import { useListSilos, useCreateSilo, useUpdateSilo, useDeleteSilo, getListSilosQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Edit2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const siloSchema = z.object({
  name: z.string().min(1, "Name is required"),
  defaultFeedType: z.string().optional(),
});

type SiloFormValues = z.infer<typeof siloSchema>;

export default function Silos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSiloId, setEditingSiloId] = useState<number | null>(null);

  const { data: silos, isLoading } = useListSilos({
    query: { queryKey: ["/api/silos"] }
  });

  const createSilo = useCreateSilo();
  const updateSilo = useUpdateSilo();
  const deleteSilo = useDeleteSilo();

  const form = useForm<SiloFormValues>({
    resolver: zodResolver(siloSchema),
    defaultValues: {
      name: "",
      defaultFeedType: "",
    },
  });

  const openNewDialog = () => {
    setEditingSiloId(null);
    form.reset({ name: "", defaultFeedType: "" });
    setIsDialogOpen(true);
  };

  const openEditDialog = (silo: any) => {
    setEditingSiloId(silo.id);
    form.reset({
      name: silo.name,
      defaultFeedType: silo.defaultFeedType || "",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (values: SiloFormValues) => {
    const payload = {
      name: values.name,
      defaultFeedType: values.defaultFeedType || null,
    };

    if (editingSiloId) {
      updateSilo.mutate({ id: editingSiloId, data: payload }, {
        onSuccess: () => {
          toast({ title: "Silo updated" });
          queryClient.invalidateQueries({ queryKey: getListSilosQueryKey() });
          setIsDialogOpen(false);
        }
      });
    } else {
      createSilo.mutate({ data: payload }, {
        onSuccess: () => {
          toast({ title: "Silo created" });
          queryClient.invalidateQueries({ queryKey: getListSilosQueryKey() });
          setIsDialogOpen(false);
        }
      });
    }
  };

  const handleDelete = (id: number) => {
    deleteSilo.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Silo deleted" });
        queryClient.invalidateQueries({ queryKey: getListSilosQueryKey() });
      },
      onError: () => {
        toast({ variant: "destructive", title: "Error deleting silo" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Silos</h1>
          <p className="text-muted-foreground mt-1">Manage your storage infrastructure.</p>
        </div>
        <Button onClick={openNewDialog} className="shadow-sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Silo
        </Button>
      </header>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingSiloId ? "Edit Silo" : "Add Silo"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Silo Name/Identifier</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Bin 1, Nursery Silo" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="defaultFeedType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Feed Type (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Finisher Pellets" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={createSilo.isPending || updateSilo.isPending}>
                {editingSiloId ? "Save Changes" : "Create Silo"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : !silos || silos.length === 0 ? (
        <div className="text-center p-12 bg-card rounded-lg border border-dashed">
          <p className="text-muted-foreground">No silos configured.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {silos.map(silo => (
            <Card key={silo.id}>
              <CardContent className="p-6 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-lg">{silo.name}</h3>
                  {silo.defaultFeedType && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Default: {silo.defaultFeedType}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={() => openEditDialog(silo)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {silo.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure? This will delete the silo and all its reading history.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(silo.id)} className="bg-destructive text-destructive-foreground">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}