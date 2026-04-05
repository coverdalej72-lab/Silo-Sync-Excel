import { useState, useEffect } from "react";
import { 
  useGetTodayProgress, 
  getGetTodayProgressQueryKey,
  useBatchCreateReadings 
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

type SiloFormState = {
  amountRemaining: string;
  unit: string;
  feedType: string;
};

type ShedFormState = Record<number, SiloFormState>;

export default function Home() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const batchCreate = useBatchCreateReadings();

  const { data: progress, isLoading } = useGetTodayProgress({
    query: { queryKey: getGetTodayProgressQueryKey() }
  });

  const [formState, setFormState] = useState<Record<number, ShedFormState>>({});

  useEffect(() => {
    if (progress) {
      const newState: Record<number, ShedFormState> = {};
      progress.sheds.forEach(shed => {
        newState[shed.shedGroupId] = {};
        shed.silos.forEach(silo => {
          newState[shed.shedGroupId][silo.siloId] = {
            amountRemaining: silo.amountRemaining !== null ? silo.amountRemaining.toString() : "",
            unit: silo.unit || "tons",
            feedType: silo.feedType || silo.defaultFeedType || "",
          };
        });
      });
      setFormState(newState);
    }
  }, [progress]);

  const handleSiloChange = (shedId: number, siloId: number, field: keyof SiloFormState, value: string) => {
    setFormState(prev => ({
      ...prev,
      [shedId]: {
        ...prev[shedId],
        [siloId]: {
          ...prev[shedId]?.[siloId],
          [field]: value
        }
      }
    }));
  };

  const handleSaveShed = (shedId: number) => {
    if (!progress) return;
    
    const shed = progress.sheds.find(s => s.shedGroupId === shedId);
    if (!shed) return;

    const readingsToSave = shed.silos.map(silo => {
      const state = formState[shedId]?.[silo.siloId];
      return {
        siloId: silo.siloId,
        feedType: state?.feedType || "",
        amountRemaining: parseFloat(state?.amountRemaining || "0") || 0,
        unit: state?.unit || "tons",
      };
    });

    batchCreate.mutate({ data: { readings: readingsToSave } }, {
      onSuccess: () => {
        toast({ title: "Shed saved successfully" });
        queryClient.invalidateQueries({ queryKey: getGetTodayProgressQueryKey() });
      },
      onError: () => {
        toast({ variant: "destructive", title: "Failed to save shed" });
      }
    });
  };

  const handleSaveAll = () => {
    if (!progress) return;
    
    const unsavedSheds = progress.sheds.filter(s => !s.allSaved);
    const readingsToSave: any[] = [];
    
    unsavedSheds.forEach(shed => {
      shed.silos.forEach(silo => {
        const state = formState[shed.shedGroupId]?.[silo.siloId];
        readingsToSave.push({
          siloId: silo.siloId,
          feedType: state?.feedType || "",
          amountRemaining: parseFloat(state?.amountRemaining || "0") || 0,
          unit: state?.unit || "tons",
        });
      });
    });

    if (readingsToSave.length === 0) {
      toast({ title: "All sheds are already saved." });
      return;
    }

    batchCreate.mutate({ data: { readings: readingsToSave } }, {
      onSuccess: () => {
        toast({ title: "All readings saved successfully" });
        queryClient.invalidateQueries({ queryKey: getGetTodayProgressQueryKey() });
      },
      onError: () => {
        toast({ variant: "destructive", title: "Failed to save all readings" });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-10 w-3/4 mb-4" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!progress) {
    return <div className="p-4">Failed to load data.</div>;
  }

  return (
    <div className="bg-background min-h-full pb-20">
      <div className="p-4 bg-primary text-primary-foreground pt-8 pb-10">
        <h1 className="text-2xl font-bold tracking-tight">Silo Reader</h1>
        <p className="text-primary-foreground/80 mt-1">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
        
        <div className="mt-6 flex flex-col items-center justify-center p-6 bg-primary-foreground/10 rounded-xl">
          <span className="text-4xl font-extrabold">{progress.savedCount} of {progress.totalCount}</span>
          <span className="text-sm font-medium mt-1">Sheds Done</span>
        </div>
      </div>

      <div className="px-4 py-4 space-y-6 mt-[-1rem]">
        {progress.sheds.map(shed => (
          <Card key={shed.shedGroupId} className="shadow-md border-border/50 overflow-hidden">
            <CardHeader className="bg-secondary/50 py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-lg">{shed.shedGroupName}</CardTitle>
              {shed.allSaved && (
                <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-white gap-1 py-1">
                  <Check className="h-3 w-3" /> Saved
                </Badge>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {shed.silos.map((silo, index) => {
                  const state = formState[shed.shedGroupId]?.[silo.siloId];
                  return (
                    <div key={silo.siloId} className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="bg-muted text-muted-foreground font-bold w-8 h-8 rounded-md flex items-center justify-center text-sm">
                          {silo.letter}
                        </div>
                        <span className="font-semibold text-sm flex-1">{silo.name}</span>
                        {silo.saved && !shed.allSaved && (
                          <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                            <Check className="w-3 h-3" /> saved
                          </span>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Amount</label>
                          <Input 
                            type="number" 
                            placeholder="0"
                            className="h-12 text-lg font-bold" 
                            value={state?.amountRemaining || ""} 
                            onChange={(e) => handleSiloChange(shed.shedGroupId, silo.siloId, "amountRemaining", e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Unit</label>
                          <Select 
                            value={state?.unit || "tons"} 
                            onValueChange={(val) => handleSiloChange(shed.shedGroupId, silo.siloId, "unit", val)}
                          >
                            <SelectTrigger className="h-12 font-medium">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="tons">Tons</SelectItem>
                              <SelectItem value="kg">kg</SelectItem>
                              <SelectItem value="lbs">lbs</SelectItem>
                              <SelectItem value="bushels">Bushels</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div>
                        <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Feed Type</label>
                        <Input 
                          type="text" 
                          placeholder="e.g. Finisher"
                          className="h-10"
                          value={state?.feedType || ""}
                          onChange={(e) => handleSiloChange(shed.shedGroupId, silo.siloId, "feedType", e.target.value)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="p-4 bg-muted/20 border-t">
                <Button 
                  className="w-full h-12 font-bold text-base" 
                  disabled={batchCreate.isPending}
                  onClick={() => handleSaveShed(shed.shedGroupId)}
                >
                  <Save className="w-5 h-5 mr-2" />
                  Save {shed.shedGroupName}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="fixed bottom-16 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent pointer-events-none flex justify-center z-40 max-w-md mx-auto">
        <Button 
          size="lg" 
          className="w-full h-14 rounded-full font-bold shadow-lg pointer-events-auto"
          onClick={handleSaveAll}
          disabled={batchCreate.isPending || progress.savedCount === progress.totalCount}
        >
          <Save className="w-5 h-5 mr-2" />
          Save All Readings
        </Button>
      </div>
    </div>
  );
}
