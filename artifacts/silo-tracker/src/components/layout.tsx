import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Home, Clock, Truck, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  const tabs = [
    { href: "/",            label: "Today",      icon: Home },
    { href: "/history",     label: "History",    icon: Clock },
    { href: "/deliveries",  label: "Deliveries", icon: Truck },
    { href: "/settings",    label: "Settings",   icon: Settings },
  ];

  return (
    <div className="flex flex-col h-[100dvh] max-w-md mx-auto bg-background shadow-xl overflow-hidden relative">
      <main className="flex-1 overflow-y-auto pb-16">
        {children}
      </main>

      <nav className="absolute bottom-0 left-0 right-0 bg-card border-t border-border flex items-center justify-around h-16 px-2 z-50">
        {tabs.map((tab) => {
          const isActive = location === tab.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full space-y-1 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-6 w-6" />
              <span className="text-xs font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
