import { useState } from "react";

const GREEN = "#1a5c36";
const GOLD = "#C9A227";

const PLANS = [
  {
    id: "bronze",
    name: "Bronze",
    icon: "🥉",
    color: "#cd7f32",
    tagline: "Perfect for solo growers just getting started.",
    monthlyPrice: 20,
    features: [
      "Silo Mate mobile app",
      "Up to 6 sheds / silos",
      "Daily feed readings & alerts",
      "30-day reading history",
      "Works on any phone — no install needed",
    ],
    notIncluded: [
      "Feed Program spreadsheet",
      "Batch Results & Morts tracking",
      "QR docket scanning",
      "Multi-user access",
    ],
    cta: "Start Free Trial",
    highlight: false,
  },
  {
    id: "silver",
    name: "Silver",
    icon: "🥈",
    color: "#94a3b8",
    tagline: "Full batch management for active farms.",
    monthlyPrice: 50,
    features: [
      "Everything in Bronze",
      "Feed Program spreadsheet viewer",
      "Batch Results, FCR & Morts tracking",
      "Unlimited reading history",
      "QR docket scanning",
      "Email / share batch reports",
      "Cross-device auto-sync",
    ],
    notIncluded: [
      "Multiple farms / locations",
      "Multi-user access",
    ],
    cta: "Start Free Trial",
    highlight: true,
  },
  {
    id: "gold",
    name: "Gold",
    icon: "🥇",
    color: GOLD,
    tagline: "For large operations and integrators.",
    monthlyPrice: 150,
    features: [
      "Everything in Silver",
      "Multiple farms / locations",
      "Multi-user access (farm hand + manager)",
      "Custom shed & silo configuration",
      "Data export (CSV / Excel)",
      "Priority support",
      "Per-grower integrator pricing available",
    ],
    notIncluded: [],
    cta: "Contact Us",
    highlight: false,
  },
];

const FAQS = [
  {
    q: "Is there a free trial?",
    a: "Yes — every new account starts on a 30-day free trial of Silver. No credit card required to start.",
  },
  {
    q: "Can I switch plans later?",
    a: "Absolutely. You can upgrade or downgrade at any time. Changes take effect at the start of your next billing cycle.",
  },
  {
    q: "What is the annual discount?",
    a: "Pay yearly and get 10% off — equivalent to getting more than one month free every year.",
  },
  {
    q: "Do I need to install an app?",
    a: "No. Silo Mate is a Progressive Web App (PWA) — it works in any browser on any phone. You can add it to your home screen for an app-like experience.",
  },
  {
    q: "What happens to my data if I cancel?",
    a: "Your data is kept for 60 days after cancellation. You can export everything to CSV / Excel before you leave.",
  },
  {
    q: "Is Gold suitable for integrators?",
    a: "Yes. Integrators can manage multiple grower sites under one Gold account, or ask us about per-grower volume pricing.",
  },
];

function CheckIcon({ color = GREEN }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="9" cy="9" r="9" fill={color} fillOpacity={0.12} />
      <path d="M5 9l3 3 5-5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="9" cy="9" r="9" fill="#9ca3af" fillOpacity={0.12} />
      <path d="M6.5 6.5l5 5M11.5 6.5l-5 5" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SiloIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <rect x="8" y="10" width="20" height="20" rx="10" fill={GREEN} />
      <rect x="12" y="6" width="12" height="6" rx="3" fill={GREEN} fillOpacity={0.6} />
      <rect x="14" y="4" width="8" height="4" rx="2" fill={GREEN} fillOpacity={0.3} />
      <rect x="15" y="18" width="6" height="8" rx="1" fill="white" fillOpacity={0.3} />
    </svg>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        borderBottom: "1px solid #e5e7eb",
        paddingBottom: 16,
        marginBottom: 16,
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          textAlign: "left",
          background: "none",
          border: "none",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 15, color: "#111827" }}>{q}</span>
        <span style={{ fontSize: 20, color: GREEN, flexShrink: 0, transition: "transform 0.2s", transform: open ? "rotate(45deg)" : "none" }}>+</span>
      </button>
      {open && (
        <p style={{ marginTop: 10, color: "#6b7280", fontSize: 14, lineHeight: 1.7 }}>{a}</p>
      )}
    </div>
  );
}

function PlanCard({ plan, yearly }: { plan: typeof PLANS[0]; yearly: boolean }) {
  const discount = yearly ? 0.9 : 1;
  const monthlyBilled = plan.monthlyPrice * discount;
  const annualTotal = Math.round(plan.monthlyPrice * 12 * discount);
  const savedPerYear = Math.round(plan.monthlyPrice * 12 - annualTotal);

  return (
    <div
      style={{
        background: "#fff",
        border: `2px solid ${plan.highlight ? GREEN : "#e5e7eb"}`,
        borderRadius: 16,
        padding: "28px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        position: "relative",
        boxShadow: plan.highlight ? `0 8px 32px ${GREEN}22` : "0 2px 8px #0001",
        flex: 1,
        minWidth: 260,
        maxWidth: 360,
      }}
    >
      {plan.highlight && (
        <div
          style={{
            position: "absolute",
            top: -14,
            left: "50%",
            transform: "translateX(-50%)",
            background: GREEN,
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            padding: "4px 16px",
            borderRadius: 999,
            letterSpacing: "0.05em",
            whiteSpace: "nowrap",
          }}
        >
          MOST POPULAR
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 28 }}>{plan.icon}</span>
        <span style={{ fontSize: 22, fontWeight: 800, color: plan.color }}>{plan.name}</span>
      </div>

      <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>{plan.tagline}</p>

      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 40, fontWeight: 900, color: "#111827" }}>
          ${Math.round(monthlyBilled)}
        </span>
        <span style={{ fontSize: 14, color: "#9ca3af" }}>/mo</span>
      </div>

      {yearly ? (
        <div style={{ marginBottom: 20 }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            Billed annually — ${annualTotal}/yr
          </span>
          {savedPerYear > 0 && (
            <span
              style={{
                marginLeft: 8,
                background: "#d1fae5",
                color: GREEN,
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 999,
              }}
            >
              Save ${savedPerYear}/yr
            </span>
          )}
        </div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          <span style={{ fontSize: 13, color: "#9ca3af" }}>Billed monthly</span>
        </div>
      )}

      <a
        href="mailto:hello@silomate.com.au"
        style={{
          display: "block",
          textAlign: "center",
          background: plan.highlight ? GREEN : "transparent",
          color: plan.highlight ? "#fff" : GREEN,
          border: `2px solid ${GREEN}`,
          borderRadius: 10,
          padding: "12px 0",
          fontWeight: 700,
          fontSize: 15,
          textDecoration: "none",
          marginBottom: 24,
          transition: "opacity 0.15s",
        }}
      >
        {plan.cta}
      </a>

      <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        {plan.features.map((f) => (
          <div key={f} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <CheckIcon color={plan.highlight ? GREEN : plan.color} />
            <span style={{ fontSize: 14, color: "#374151" }}>{f}</span>
          </div>
        ))}
        {plan.notIncluded.map((f) => (
          <div key={f} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <XIcon />
            <span style={{ fontSize: 14, color: "#9ca3af" }}>{f}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [yearly, setYearly] = useState(false);

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", background: "#f9fafb", minHeight: "100vh" }}>

      {/* NAVBAR */}
      <nav style={{
        background: GREEN,
        color: "#fff",
        padding: "0 24px",
        height: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SiloIcon />
          <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.03em" }}>Silo Mate</span>
        </div>
        <a
          href="mailto:hello@silomate.com.au"
          style={{
            background: GOLD,
            color: "#1a1a1a",
            fontWeight: 700,
            fontSize: 14,
            padding: "8px 18px",
            borderRadius: 8,
            textDecoration: "none",
          }}
        >
          Contact Us
        </a>
      </nav>

      {/* HERO */}
      <section style={{
        background: `linear-gradient(135deg, ${GREEN} 0%, #2d7a4f 100%)`,
        color: "#fff",
        padding: "72px 24px 64px",
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{
            display: "inline-block",
            background: "rgba(255,255,255,0.15)",
            borderRadius: 999,
            padding: "6px 18px",
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 20,
            letterSpacing: "0.05em",
          }}>
            🐔 Built for Australian Broiler Growers
          </div>
          <h1 style={{
            fontSize: "clamp(32px, 6vw, 52px)",
            fontWeight: 900,
            lineHeight: 1.1,
            marginBottom: 20,
            letterSpacing: "-0.03em",
          }}>
            Track every silo.<br />
            <span style={{ color: GOLD }}>Never run low</span> on feed.
          </h1>
          <p style={{
            fontSize: "clamp(16px, 2.5vw, 20px)",
            opacity: 0.88,
            lineHeight: 1.6,
            marginBottom: 36,
          }}>
            Silo Mate replaces paper & Excel with a mobile-first app and smart Feed Program spreadsheet that update automatically — across every device on your farm.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a
              href="#pricing"
              style={{
                background: GOLD,
                color: "#1a1a1a",
                fontWeight: 800,
                fontSize: 16,
                padding: "14px 32px",
                borderRadius: 10,
                textDecoration: "none",
              }}
            >
              See Plans & Pricing
            </a>
            <a
              href="mailto:hello@silomate.com.au"
              style={{
                background: "rgba(255,255,255,0.15)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 16,
                padding: "14px 32px",
                borderRadius: 10,
                textDecoration: "none",
                border: "2px solid rgba(255,255,255,0.3)",
              }}
            >
              Book a Demo
            </a>
          </div>
        </div>
      </section>

      {/* FEATURES STRIP */}
      <section style={{
        background: "#fff",
        borderBottom: "1px solid #e5e7eb",
        padding: "40px 24px",
      }}>
        <div style={{
          maxWidth: 960,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 32,
        }}>
          {[
            { icon: "📱", title: "No App Install", desc: "Works in any phone browser. Add to home screen for a native feel." },
            { icon: "🔔", title: "Feed Alerts", desc: "Automatic 14-day alerts when silos are running low." },
            { icon: "📊", title: "Feed Program", desc: "Smart spreadsheet auto-synced from your silo readings." },
            { icon: "📷", title: "QR Scanning", desc: "Scan delivery dockets straight into the system." },
            { icon: "🔄", title: "Cross-device Sync", desc: "Phone and desktop always in sync — instantly." },
            { icon: "🐥", title: "Batch Tracking", desc: "FCR, CFCR, Morts, Culls and catch data per batch." },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>{icon}</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#111827", marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ padding: "72px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2 style={{ fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 900, color: "#111827", marginBottom: 12, letterSpacing: "-0.03em" }}>
              Simple, honest pricing
            </h2>
            <p style={{ color: "#6b7280", fontSize: 16, marginBottom: 32 }}>
              Start free for 30 days. No credit card required.
            </p>

            {/* TOGGLE */}
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              background: "#f3f4f6",
              borderRadius: 999,
              padding: "6px 8px",
            }}>
              <button
                onClick={() => setYearly(false)}
                style={{
                  background: !yearly ? "#fff" : "transparent",
                  border: "none",
                  borderRadius: 999,
                  padding: "8px 20px",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  color: !yearly ? "#111827" : "#6b7280",
                  boxShadow: !yearly ? "0 1px 4px #0001" : "none",
                  transition: "all 0.2s",
                }}
              >
                Monthly
              </button>
              <button
                onClick={() => setYearly(true)}
                style={{
                  background: yearly ? "#fff" : "transparent",
                  border: "none",
                  borderRadius: 999,
                  padding: "8px 20px",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  color: yearly ? "#111827" : "#6b7280",
                  boxShadow: yearly ? "0 1px 4px #0001" : "none",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                Yearly
                <span style={{
                  background: "#d1fae5",
                  color: GREEN,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 999,
                }}>
                  Save 10%
                </span>
              </button>
            </div>
          </div>

          {/* PLAN CARDS */}
          <div style={{
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "flex-start",
          }}>
            {PLANS.map((plan) => (
              <PlanCard key={plan.id} plan={plan} yearly={yearly} />
            ))}
          </div>

          {/* COMPARISON NOTE */}
          <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, marginTop: 32 }}>
            All prices in AUD. GST may apply. Yearly plans are billed as one annual payment.
          </p>
        </div>
      </section>

      {/* TESTIMONIAL / TRUST */}
      <section style={{
        background: `linear-gradient(135deg, ${GREEN}11 0%, ${GOLD}11 100%)`,
        borderTop: "1px solid #e5e7eb",
        borderBottom: "1px solid #e5e7eb",
        padding: "56px 24px",
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🌾</div>
          <blockquote style={{
            fontSize: "clamp(17px, 2.5vw, 21px)",
            fontStyle: "italic",
            color: "#374151",
            lineHeight: 1.65,
            marginBottom: 20,
          }}>
            "Finally an app that understands how broiler farms actually work. I can check my silos on the phone, and my Feed Program on the desktop, and they're always in sync."
          </blockquote>
          <p style={{ fontWeight: 700, color: GREEN, fontSize: 14 }}>— Early access grower, QLD</p>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: "72px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 style={{
            fontSize: "clamp(24px, 3.5vw, 34px)",
            fontWeight: 900,
            color: "#111827",
            marginBottom: 40,
            textAlign: "center",
            letterSpacing: "-0.02em",
          }}>
            Frequently asked questions
          </h2>
          {FAQS.map((f) => <Faq key={f.q} {...f} />)}
        </div>
      </section>

      {/* CTA FOOTER */}
      <section style={{
        background: GREEN,
        color: "#fff",
        padding: "64px 24px",
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <h2 style={{
            fontSize: "clamp(24px, 4vw, 36px)",
            fontWeight: 900,
            marginBottom: 14,
            letterSpacing: "-0.03em",
          }}>
            Ready to ditch the paperwork?
          </h2>
          <p style={{ opacity: 0.85, fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>
            Start your free 30-day trial today. No credit card needed. Cancel anytime.
          </p>
          <a
            href="mailto:hello@silomate.com.au"
            style={{
              display: "inline-block",
              background: GOLD,
              color: "#1a1a1a",
              fontWeight: 800,
              fontSize: 17,
              padding: "16px 40px",
              borderRadius: 12,
              textDecoration: "none",
            }}
          >
            Get Started Free
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{
        background: "#111827",
        color: "#9ca3af",
        padding: "28px 24px",
        textAlign: "center",
        fontSize: 13,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
          <SiloIcon />
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>Silo Mate</span>
        </div>
        <p>© {new Date().getFullYear()} Silo Mate Australia · ABN registered · <a href="mailto:hello@silomate.com.au" style={{ color: GOLD }}>hello@silomate.com.au</a></p>
        <p style={{ marginTop: 6 }}>Proudly built for Australian broiler growers.</p>
      </footer>
    </div>
  );
}
