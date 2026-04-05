import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ClipboardList, History, Truck, Settings, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetTodayProgress, getGetTodayProgressQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { useFarmConfig } from "@/hooks/use-farm-config";

const SILO_ICON = (
  <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={2}>
    <ellipse cx="12" cy="6" rx="6" ry="3" />
    <path d="M6 6v12c0 1.657 2.686 3 6 3s6-1.343 6-3V6" />
    <path d="M6 12c0 1.657 2.686 3 6 3s6-1.343 6-3" />
  </svg>
);

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { config } = useFarmConfig();

  const { data: progress } = useGetTodayProgress({
    query: { queryKey: getGetTodayProgressQueryKey() }
  });

  const tabs = [
    { href: "/",            label: "Today",      icon: ClipboardList },
    { href: "/history",     label: "History",    icon: History },
    { href: "/deliveries",  label: "Deliveries", icon: Truck },
    { href: "/photos",      label: "Photos",     icon: Camera },
    { href: "/settings",    label: "Settings",   icon: Settings },
  ];

  const savedCount = progress?.savedCount ?? 0;
  const totalCount = progress?.totalCount ?? 0;
  const allDone = totalCount > 0 && savedCount === totalCount;

  return (
    <div className="flex flex-col h-[100dvh] max-w-md mx-auto bg-background shadow-xl overflow-hidden relative">

      {/* Header */}
      <header className="shrink-0 px-4 pt-5 pb-0 bg-background z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shrink-0">
              {SILO_ICON}
            </div>
            <div>
              <div className="font-bold text-base text-foreground leading-tight">{config.farmName || "Silo Mate"}</div>
              <div className="text-[11px] text-muted-foreground font-medium tracking-wide uppercase">Feed Management</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Today</div>
              <div className="text-sm font-bold text-foreground">{format(new Date(), "d MMM yyyy")}</div>
            </div>
            <div className={cn(
              "rounded-xl px-3 py-1.5 text-center min-w-[52px]",
              allDone ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
            )}>
              <div className="text-base font-extrabold leading-tight">{savedCount}/{totalCount}</div>
              <div className="text-[9px] font-bold tracking-widest uppercase">{allDone ? "Done" : "Left"}</div>
            </div>
          </div>
        </div>

        {/* Green progress bar */}
        <div className="h-[3px] rounded-full bg-secondary overflow-hidden mb-0">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: totalCount > 0 ? `${(savedCount / totalCount) * 100}%` : "0%" }}
          />
        </div>

        {/* Tab bar */}
        <div className="flex mt-1">
          {tabs.map((tab) => {
            const isActive = location === tab.href || (tab.href !== "/" && location.startsWith(tab.href));
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-semibold transition-colors relative flex-1 justify-center",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-primary rounded-full" />
                )}
              </Link>
            );
          })}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
