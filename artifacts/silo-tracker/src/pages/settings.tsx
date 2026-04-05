import { FileSpreadsheet, Moon, Sun, Download } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

export default function Settings() {
  const { theme, toggle } = useTheme();

  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="bg-primary px-4 pt-12 pb-6">
        <h1 className="text-2xl font-bold text-primary-foreground">Settings</h1>
        <p className="text-primary-foreground/70 text-sm mt-1">Silo Mate preferences</p>
      </div>

      <div className="flex-1 px-4 py-6 space-y-4">

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Appearance</p>
          </div>
          <button
            onClick={toggle}
            className="w-full flex items-center justify-between px-4 py-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              {theme === "dark"
                ? <Moon className="h-5 w-5 text-primary" />
                : <Sun className="h-5 w-5 text-primary" />}
              <div className="text-left">
                <p className="font-medium text-foreground">Dark Mode</p>
                <p className="text-sm text-muted-foreground">
                  {theme === "dark" ? "On — tap to switch to light" : "Off — tap to switch to dark"}
                </p>
              </div>
            </div>
            <div className={`w-11 h-6 rounded-full transition-colors ${theme === "dark" ? "bg-primary" : "bg-muted"} flex items-center px-1`}>
              <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${theme === "dark" ? "translate-x-5" : "translate-x-0"}`} />
            </div>
          </button>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Downloads</p>
          </div>
          <a
            href="/silo-mate-feed-program.xlsx"
            download="Silo-Mate-Feed-Program.xlsx"
            className="flex items-center justify-between px-4 py-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium text-foreground">Feed Program Spreadsheet</p>
                <p className="text-sm text-muted-foreground">Download the styled Excel workbook</p>
              </div>
            </div>
            <Download className="h-4 w-4 text-muted-foreground" />
          </a>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">About</p>
          </div>
          <div className="px-4 py-4 space-y-1">
            <p className="font-medium text-foreground">Silo Mate</p>
            <p className="text-sm text-muted-foreground">Daily silo reading tracker for Double B Farm</p>
            <p className="text-xs text-muted-foreground pt-2">6 shed groups · 18 silos · A/B/C per shed</p>
          </div>
        </div>

      </div>
    </div>
  );
}
