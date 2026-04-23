import React, { useEffect, useRef } from "react";
import { ArrowRight, CheckCircle2, ChevronRight, Activity, Bell, FileText, Smartphone, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  const getAssetUrl = (path: string) => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    return `${base}${path}`;
  };

  // Intersection Observer for scroll animations
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("animate-in", "fade-in-up");
            observerRef.current?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );

    document.querySelectorAll(".scroll-reveal").forEach((el) => {
      observerRef.current?.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <div className="flex flex-col min-h-[100dvh] overflow-x-hidden">
      {/* Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-display font-bold text-xl">
              FB
            </div>
            <span className="font-display font-bold text-xl tracking-tight text-foreground">Farm Buddy™</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#pix2026" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">PIX 2026</a>
            <a href="#about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Our Story</a>
          </nav>
          <div className="flex items-center gap-4">
            <a href="/plans/">
              <Button className="font-semibold bg-accent hover:bg-accent/90 text-accent-foreground border-none">
                Get Started
              </Button>
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-20 pb-32 md:pt-32 md:pb-48 overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img 
              src={getAssetUrl("/hero.png")} 
              alt="Australian farmer at sunset" 
              className="w-full h-full object-cover object-center opacity-20"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background via-background/80 to-background" />
          </div>
          
          <div className="container relative z-10 mx-auto px-4 text-center max-w-4xl scroll-reveal opacity-0">
            <div className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-sm font-medium text-accent mb-8">
              <span className="flex h-2 w-2 rounded-full bg-accent mr-2"></span>
              Built by growers, for growers
            </div>
            
            <h1 className="text-5xl md:text-7xl font-display font-bold tracking-tight text-foreground mb-6 leading-[1.1]">
              Ditch the paper.<br />
              <span className="text-primary">Run your sheds from your phone.</span>
            </h1>
            
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              Farm Buddy™ is the rugged, simple app that replaces messy shed records. Track silos, manage feed programs, and send batch reports to Baiada or Ingham with one tap.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href="/plans/">
                <Button size="lg" className="w-full sm:w-auto h-14 px-8 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground">
                  View Plans & Pricing
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </a>
              <a href="#features">
                <Button size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 text-lg font-medium border-border hover:bg-secondary/50">
                  See how it works
                </Button>
              </a>
            </div>
          </div>
        </section>

        {/* Value Prop / Features */}
        <section id="features" className="py-24 bg-white relative">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-2xl mx-auto mb-16 scroll-reveal opacity-0">
              <h2 className="text-3xl md:text-5xl font-display font-bold mb-4">Everything you need. Nothing you don't.</h2>
              <p className="text-lg text-muted-foreground">We built Farm Buddy™ on a South Australian broiler farm because existing software was too complicated or built for massive corporate operations. This is just the good stuff.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-12 lg:gap-24 items-center mb-24">
              <div className="order-2 md:order-1 scroll-reveal opacity-0 delay-100">
                <div className="aspect-[4/3] rounded-2xl overflow-hidden shadow-xl border border-border">
                  <img src={getAssetUrl("/silos.png")} alt="Feed silos" className="w-full h-full object-cover" />
                </div>
              </div>
              <div className="order-1 md:order-2 scroll-reveal opacity-0 delay-200">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                  <Activity className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-3xl font-display font-bold mb-4">Silo Buddy</h3>
                <p className="text-lg text-muted-foreground mb-6">Stop climbing ladders or guessing levels. Track your feed silos directly from your pocket.</p>
                <ul className="space-y-4">
                  {[
                    "Live feed level estimations",
                    "Automated critical low-feed alerts",
                    "Delivery history and reconciliation",
                    "Multi-shed, multi-silo support"
                  ].map((feature, i) => (
                    <li key={i} className="flex items-start">
                      <CheckCircle2 className="h-6 w-6 text-accent shrink-0 mr-3" />
                      <span className="text-foreground font-medium">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-12 lg:gap-24 items-center">
              <div className="scroll-reveal opacity-0 delay-100">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-6">
                  <CalendarDays className="h-6 w-6 text-accent" />
                </div>
                <h3 className="text-3xl font-display font-bold mb-4">Feed Program</h3>
                <p className="text-lg text-muted-foreground mb-6">Throw away the clipboard. Log daily weights, mortalities, and feed types as you walk the shed.</p>
                <ul className="space-y-4">
                  {[
                    "Manage bird feed schedules and transitions",
                    "Track target vs actual body weights",
                    "Calculate FCR (Feed Conversion Ratio) instantly",
                    "One-tap batch reports formatted for integrators"
                  ].map((feature, i) => (
                    <li key={i} className="flex items-start">
                      <CheckCircle2 className="h-6 w-6 text-primary shrink-0 mr-3" />
                      <span className="text-foreground font-medium">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="scroll-reveal opacity-0 delay-200">
                <div className="aspect-[4/3] rounded-2xl overflow-hidden shadow-xl border border-border">
                  <img src={getAssetUrl("/shed.png")} alt="Inside a modern poultry shed" className="w-full h-full object-cover" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* The "Why" / Story */}
        <section id="about" className="py-24 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div className="scroll-reveal opacity-0">
                <h2 className="text-3xl md:text-5xl font-display font-bold mb-6 text-white">Born in the dirt, not in a boardroom.</h2>
                <p className="text-primary-foreground/80 text-lg mb-6 leading-relaxed">
                  Farm Buddy™ wasn't dreamed up by tech bros in Silicon Valley. It was built by a South Australian broiler grower who was sick of losing paper records, miscalculating feed, and spending hours compiling batch reports for the processor.
                </p>
                <p className="text-primary-foreground/80 text-lg mb-8 leading-relaxed">
                  We built the tool we wanted to use. It works offline when you're in the back of Shed 4 with no reception. It has big buttons because you're wearing gloves. It's a tool that respects your time.
                </p>
                <div className="flex items-center gap-4">
                  <img src={getAssetUrl("/app-hand.png")} alt="Farmer holding app" className="w-16 h-16 rounded-full border-2 border-primary-foreground/20 object-cover" />
                  <div>
                    <p className="font-bold text-white">Built by Appcovi</p>
                    <p className="text-primary-foreground/60 text-sm">South Australia</p>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 scroll-reveal opacity-0 delay-200">
                <div className="bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/10">
                  <Smartphone className="h-8 w-8 text-accent mb-4" />
                  <h4 className="font-display font-bold text-xl text-white mb-2">Mobile First</h4>
                  <p className="text-primary-foreground/70 text-sm">Everything happens on your phone. No need to trek back to the office PC.</p>
                </div>
                <div className="bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/10 mt-8">
                  <FileText className="h-8 w-8 text-accent mb-4" />
                  <h4 className="font-display font-bold text-xl text-white mb-2">Instant Reports</h4>
                  <p className="text-primary-foreground/70 text-sm">Generate flawless end-of-batch reports for Baiada or Ingham in seconds.</p>
                </div>
                <div className="bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/10">
                  <Bell className="h-8 w-8 text-accent mb-4" />
                  <h4 className="font-display font-bold text-xl text-white mb-2">Smart Alerts</h4>
                  <p className="text-primary-foreground/70 text-sm">Get notified before you run out of starter feed. Never miss a delivery.</p>
                </div>
                <div className="bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/10 mt-8">
                  <Activity className="h-8 w-8 text-accent mb-4" />
                  <h4 className="font-display font-bold text-xl text-white mb-2">Live FCR</h4>
                  <p className="text-primary-foreground/70 text-sm">Know exactly how your birds are converting, day by day.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PIX 2026 Banner */}
        <section id="pix2026" className="py-20 bg-background border-t border-b border-border">
          <div className="container mx-auto px-4">
            <div className="bg-card border border-border rounded-3xl p-8 md:p-12 shadow-sm flex flex-col md:flex-row items-center justify-between gap-8 scroll-reveal opacity-0">
              <div className="max-w-xl">
                <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary mb-4">
                  Come see us!
                </div>
                <h2 className="text-3xl font-display font-bold mb-3">Proudly launching at PIX 2026</h2>
                <p className="text-muted-foreground text-lg mb-0">
                  We're bringing Farm Buddy™ to the premier Australian pig and poultry industry expo. Find us on the Gold Coast, May 13–15, 2026. Stop by for a yarn and a live demo.
                </p>
              </div>
              <div className="shrink-0 flex flex-col items-center justify-center p-6 bg-secondary/30 rounded-2xl border border-secondary text-center min-w-[200px]">
                <span className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">GOLD COAST</span>
                <span className="text-4xl font-display font-black text-primary mb-1">MAY 13-15</span>
                <span className="text-lg font-bold text-foreground">2026</span>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-32 bg-white relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-3xl" />
          <div className="container relative z-10 mx-auto px-4 text-center max-w-3xl scroll-reveal opacity-0">
            <h2 className="text-4xl md:text-6xl font-display font-bold mb-6">Ready to ditch the clipboard?</h2>
            <p className="text-xl text-muted-foreground mb-10">
              Join the Australian growers who are saving hours every week and running their sheds from their pockets.
            </p>
            <a href="/plans/">
              <Button size="lg" className="h-16 px-10 text-xl font-bold bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
                View Plans & Pricing
                <ArrowRight className="ml-2 h-6 w-6" />
              </Button>
            </a>
            <p className="mt-6 text-sm text-muted-foreground">No credit card required for trial. Setup takes 5 minutes.</p>
          </div>
        </section>
      </main>

      <footer className="bg-foreground text-background py-12 border-t border-foreground/10">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-display font-bold">
              FB
            </div>
            <span className="font-display font-bold text-xl tracking-tight text-background">Farm Buddy™</span>
          </div>
          <p className="text-background/60 text-sm text-center md:text-left">
            &copy; {new Date().getFullYear()} Appcovi. Built in South Australia.
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-background/60 hover:text-background transition-colors text-sm">Privacy Policy</a>
            <a href="#" className="text-background/60 hover:text-background transition-colors text-sm">Terms of Service</a>
            <a href="#" className="text-background/60 hover:text-background transition-colors text-sm">Contact Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
