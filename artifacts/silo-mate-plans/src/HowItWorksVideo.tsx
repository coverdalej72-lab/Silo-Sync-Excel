import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const GREEN = "#1a5c36";
const DARK_GREEN = "#0f3d24";
const GOLD = "#C9A227";

const STEPS = [
  {
    id: "hook",
    label: "The problem",
    icon: "📋",
    duration: 4000,
  },
  {
    id: "upload",
    label: "Broiler Base Mate",
    icon: "🖥️",
    duration: 4500,
  },
  {
    id: "mobile",
    label: "Farm Buddy",
    icon: "📱",
    duration: 4500,
  },
  {
    id: "sync",
    label: "Instant sync",
    icon: "🔄",
    duration: 3500,
  },
  {
    id: "results",
    label: "Results",
    icon: "📊",
    duration: 4000,
  },
];

const BASE = import.meta.env.BASE_URL;

function HookScene() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 200);
    const t2 = setTimeout(() => setPhase(2), 900);
    const t3 = setTimeout(() => setPhase(3), 1700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <motion.div
      key="hook"
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.5 }}
      style={{ background: `linear-gradient(135deg, ${DARK_GREEN} 0%, ${GREEN} 100%)` }}
    >
      {/* Floating grid lines */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.07, backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

      <div style={{ textAlign: "center", padding: "0 32px", position: "relative", zIndex: 1 }}>
        {/* Icon row */}
        <motion.div
          style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 28 }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 20 }}
          transition={{ duration: 0.5 }}
        >
          {["📋", "📝", "📊"].map((emoji, i) => (
            <motion.div
              key={i}
              style={{
                width: 56, height: 56, borderRadius: 14,
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 26,
              }}
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.4, ease: "easeInOut" }}
            >
              {emoji}
            </motion.div>
          ))}
        </motion.div>

        <motion.h2
          style={{ fontSize: "clamp(22px, 4vw, 38px)", fontWeight: 900, color: "#fff", margin: "0 0 12px", lineHeight: 1.2, letterSpacing: "-0.03em" }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : 16 }}
          transition={{ duration: 0.5 }}
        >
          Still on paper?<br />
          <span style={{ color: GOLD }}>Still on Excel?</span>
        </motion.h2>

        <motion.p
          style={{ fontSize: "clamp(13px, 2vw, 17px)", color: "rgba(255,255,255,0.7)", maxWidth: 480, margin: "0 auto", lineHeight: 1.65 }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: phase >= 3 ? 1 : 0, y: phase >= 3 ? 0 : 12 }}
          transition={{ duration: 0.5 }}
        >
          Most growers are still re-keying silo readings by hand and chasing spreadsheets across email. There's a better way.
        </motion.p>
      </div>

      {/* Diagonal slash accent */}
      <motion.div
        style={{ position: "absolute", bottom: 0, right: 0, width: "30%", height: "40%", background: `linear-gradient(135deg, transparent 50%, rgba(201,162,39,0.08) 50%)` }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.8 }}
      />
    </motion.div>
  );
}

function FeedProgramScene() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 200);
    const t2 = setTimeout(() => setPhase(2), 800);
    const t3 = setTimeout(() => setPhase(3), 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <motion.div
      key="upload"
      className="absolute inset-0 flex items-center"
      initial={{ clipPath: "inset(0 100% 0 0)" }}
      animate={{ clipPath: "inset(0 0% 0 0)" }}
      exit={{ clipPath: "inset(0 0 0 100%)" }}
      transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
      style={{ background: "#f0fdf4" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 40, padding: "0 40px", width: "100%", maxWidth: 960, margin: "0 auto" }}>

        {/* Left: text */}
        <div style={{ flex: "0 0 auto", maxWidth: 280 }}>
          <motion.div
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#dcfce7", borderRadius: 999, padding: "4px 14px", marginBottom: 14 }}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: phase >= 1 ? 1 : 0, x: phase >= 1 ? 0 : -16 }}
            transition={{ duration: 0.45 }}
          >
            <span style={{ fontSize: 14 }}>🖥️</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, letterSpacing: "0.07em", textTransform: "uppercase" }}>Step 1</span>
          </motion.div>

          <motion.h3
            style={{ fontSize: "clamp(18px, 3vw, 28px)", fontWeight: 900, color: "#111827", margin: "0 0 12px", letterSpacing: "-0.02em", lineHeight: 1.2 }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 12 }}
            transition={{ duration: 0.45, delay: 0.05 }}
          >
            Upload your<br />feed program
          </motion.h3>

          <motion.p
            style={{ fontSize: "clamp(12px, 1.5vw, 14px)", color: "#6b7280", lineHeight: 1.65, margin: "0 0 18px" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: phase >= 2 ? 1 : 0 }}
            transition={{ duration: 0.4 }}
          >
            Drop your existing Excel spreadsheet in and it loads instantly. All your sheds, formulas, and history carry over.
          </motion.p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              "Multi-shed tabs",
              "Auto feed-on-hand",
              "Live silo totals",
            ].map((f, i) => (
              <motion.div
                key={f}
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: GREEN, fontWeight: 600 }}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: phase >= 3 ? 1 : 0, x: phase >= 3 ? 0 : -10 }}
                transition={{ duration: 0.35, delay: i * 0.1 }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="7" fill={GREEN} opacity="0.15"/>
                  <path d="M4 7l2 2 4-4" stroke={GREEN} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {f}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right: screenshot in browser frame */}
        <motion.div
          style={{ flex: 1, maxWidth: 560 }}
          initial={{ opacity: 0, x: 30, scale: 0.97 }}
          animate={{ opacity: phase >= 1 ? 1 : 0, x: phase >= 1 ? 0 : 30, scale: phase >= 1 ? 1 : 0.97 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.14)", border: "1px solid #e5e7eb" }}>
            {/* Browser chrome */}
            <div style={{ background: "#f3f4f6", padding: "8px 14px", display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid #e5e7eb" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#fc5c65", display: "inline-block" }} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#fed330", display: "inline-block" }} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#26de81", display: "inline-block" }} />
              <span style={{ flex: 1, background: "#e5e7eb", borderRadius: 5, height: 18, marginLeft: 6 }} />
            </div>
            <img
              src={`${BASE}screenshot-feed-program.jpg`}
              alt="Broiler Base Mate"
              style={{ width: "100%", display: "block" }}
            />
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function SiloBuddyScene() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 200);
    const t2 = setTimeout(() => setPhase(2), 900);
    const t3 = setTimeout(() => setPhase(3), 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <motion.div
      key="mobile"
      className="absolute inset-0 flex items-center"
      initial={{ clipPath: "inset(0 100% 0 0)" }}
      animate={{ clipPath: "inset(0 0% 0 0)" }}
      exit={{ clipPath: "inset(0 0 0 100%)" }}
      transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
      style={{ background: `linear-gradient(135deg, ${DARK_GREEN} 0%, ${GREEN} 100%)` }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 40, padding: "0 40px", width: "100%", maxWidth: 960, margin: "0 auto" }}>

        {/* Left: Phone mockup */}
        <motion.div
          style={{ flex: "0 0 auto" }}
          initial={{ opacity: 0, scale: 0.9, x: -20 }}
          animate={{ opacity: phase >= 1 ? 1 : 0, scale: phase >= 1 ? 1 : 0.9, x: phase >= 1 ? 0 : -20 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <div style={{
            width: 160,
            background: "#1f2937",
            borderRadius: 28,
            border: "5px solid #374151",
            padding: "10px 4px 4px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          }}>
            <div style={{ width: 50, height: 14, background: "#1f2937", borderRadius: 7, margin: "0 auto 4px" }} />
            <div style={{ borderRadius: 20, overflow: "hidden" }}>
              <img
                src={`${BASE}screenshot-silo-mate.jpg`}
                alt="Farm Buddy"
                style={{ width: "100%", display: "block" }}
              />
            </div>
          </div>
        </motion.div>

        {/* Right: text */}
        <div style={{ flex: 1 }}>
          <motion.div
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(201,162,39,0.2)", border: "1px solid rgba(201,162,39,0.4)", borderRadius: 999, padding: "4px 14px", marginBottom: 14 }}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : -8 }}
            transition={{ duration: 0.4 }}
          >
            <span style={{ fontSize: 14 }}>📱</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, letterSpacing: "0.07em", textTransform: "uppercase" }}>Step 2</span>
          </motion.div>

          <motion.h3
            style={{ fontSize: "clamp(18px, 3vw, 28px)", fontWeight: 900, color: "#fff", margin: "0 0 12px", letterSpacing: "-0.02em", lineHeight: 1.2 }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 12 }}
            transition={{ duration: 0.45, delay: 0.06 }}
          >
            Record silos<br />from the shed
          </motion.h3>

          <motion.p
            style={{ fontSize: "clamp(12px, 1.5vw, 14px)", color: "rgba(255,255,255,0.72)", lineHeight: 1.65, margin: "0 0 18px", maxWidth: 340 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: phase >= 2 ? 1 : 0 }}
            transition={{ duration: 0.4 }}
          >
            Walk the shed, tap in silo readings on your iPhone or Android, or scan the delivery docket's QR code. One tap to save.
          </motion.p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              "Works offline in the shed",
              "QR docket scanning",
              "Add to home screen — no app install",
            ].map((f, i) => (
              <motion.div
                key={f}
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: GOLD, fontWeight: 600 }}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: phase >= 3 ? 1 : 0, x: phase >= 3 ? 0 : 10 }}
                transition={{ duration: 0.35, delay: i * 0.1 }}
              >
                <span style={{ fontSize: 10 }}>✓</span>
                {f}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function SyncScene() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 200);
    const t2 = setTimeout(() => setPhase(2), 1000);
    const t3 = setTimeout(() => setPhase(3), 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <motion.div
      key="sync"
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{ background: "#f9fafb" }}
    >
      <motion.div
        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#ecfdf5", borderRadius: 999, padding: "4px 14px", marginBottom: 20 }}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : -8 }}
        transition={{ duration: 0.4 }}
      >
        <span style={{ fontSize: 14 }}>🔄</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, letterSpacing: "0.07em", textTransform: "uppercase" }}>Step 3</span>
      </motion.div>

      <motion.h3
        style={{ fontSize: "clamp(20px, 3.5vw, 34px)", fontWeight: 900, color: "#111827", margin: "0 0 10px", letterSpacing: "-0.03em", textAlign: "center" }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 12 }}
        transition={{ duration: 0.45, delay: 0.05 }}
      >
        Instantly synced
      </motion.h3>

      <motion.p
        style={{ fontSize: "clamp(13px, 1.8vw, 16px)", color: "#6b7280", textAlign: "center", maxWidth: 440, margin: "0 auto 32px", lineHeight: 1.65 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 2 ? 1 : 0 }}
        transition={{ duration: 0.4 }}
      >
        Your silo readings from the shed appear in the Broiler Base Mate on the office desktop the moment you hit Save.
      </motion.p>

      {/* Animated sync diagram */}
      <motion.div
        style={{ display: "flex", alignItems: "center", gap: 20 }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: phase >= 2 ? 1 : 0, scale: phase >= 2 ? 1 : 0.9 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Phone */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 60, height: 100, background: "#1f2937", borderRadius: 14,
            border: "3px solid #374151", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, margin: "0 auto 8px",
          }}>
            📱
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>Farm Buddy</div>
          <div style={{ fontSize: 10, color: "#9ca3af" }}>In the shed</div>
        </div>

        {/* Animated arrows */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 100 }}>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              style={{
                height: 2,
                background: `linear-gradient(90deg, ${GREEN}, ${GOLD})`,
                borderRadius: 1,
                width: "100%",
              }}
              animate={{ opacity: [0.2, 1, 0.2], scaleX: [0.7, 1, 0.7] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.4, ease: "easeInOut" }}
            />
          ))}
          <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, marginTop: 4 }}>Live sync</div>
        </div>

        {/* Laptop */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 90, height: 60, background: "#f3f4f6", borderRadius: 8,
            border: "2px solid #d1d5db", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, margin: "0 auto 4px",
          }}>
            🖥️
          </div>
          <div style={{ width: 100, height: 8, background: "#9ca3af", borderRadius: 2, margin: "0 auto 8px" }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>Broiler Base Mate</div>
          <div style={{ fontSize: 10, color: "#9ca3af" }}>Office / tablet</div>
        </div>
      </motion.div>

      {/* Updated badge */}
      <motion.div
        style={{
          marginTop: 24,
          padding: "8px 20px",
          background: "#dcfce7",
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 700,
          color: GREEN,
          display: "flex", alignItems: "center", gap: 8,
        }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: phase >= 3 ? 1 : 0, y: phase >= 3 ? 0 : 10 }}
        transition={{ duration: 0.4 }}
      >
        <span>✓</span>
        Feed-on-hand updates automatically — no re-keying
      </motion.div>
    </motion.div>
  );
}

function ResultsScene() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 200);
    const t2 = setTimeout(() => setPhase(2), 900);
    const t3 = setTimeout(() => setPhase(3), 1700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const stats = [
    { label: "FCR", value: "1.74", unit: "", color: GREEN },
    { label: "Liveability", value: "97.2", unit: "%", color: "#1d4ed8" },
    { label: "Avg Weight", value: "2.84", unit: "kg", color: "#7c3aed" },
  ];

  return (
    <motion.div
      key="results"
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ clipPath: "circle(0% at 50% 50%)" }}
      animate={{ clipPath: "circle(100% at 50% 50%)" }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
      style={{ background: `linear-gradient(135deg, ${DARK_GREEN} 0%, #1e4d2b 100%)` }}
    >
      <div style={{ position: "absolute", inset: 0, opacity: 0.06, backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

      <div style={{ textAlign: "center", padding: "0 32px", position: "relative", zIndex: 1, width: "100%", maxWidth: 640, margin: "0 auto" }}>
        <motion.div
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(201,162,39,0.2)", border: "1px solid rgba(201,162,39,0.4)", borderRadius: 999, padding: "4px 14px", marginBottom: 16 }}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: phase >= 1 ? 1 : 0, scale: phase >= 1 ? 1 : 0.85 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <span style={{ fontSize: 14 }}>📊</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, letterSpacing: "0.07em", textTransform: "uppercase" }}>Batch Results</span>
        </motion.div>

        <motion.h3
          style={{ fontSize: "clamp(20px, 3.5vw, 34px)", fontWeight: 900, color: "#fff", margin: "0 0 8px", letterSpacing: "-0.03em" }}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 14 }}
          transition={{ duration: 0.5, delay: 0.06 }}
        >
          Every result. At a glance.
        </motion.h3>

        <motion.p
          style={{ fontSize: "clamp(12px, 1.6vw, 15px)", color: "rgba(255,255,255,0.68)", margin: "0 0 28px", lineHeight: 1.6 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: phase >= 2 ? 1 : 0 }}
          transition={{ duration: 0.4 }}
        >
          End-of-batch FCR, liveability, and weight — exported in one click and added to your batch history automatically.
        </motion.p>

        {/* Stats row */}
        <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
          {stats.map(({ label, value, unit, color }, i) => (
            <motion.div
              key={label}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 14,
                padding: "16px 24px",
                textAlign: "center",
                minWidth: 100,
              }}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: phase >= 3 ? 1 : 0, y: phase >= 3 ? 0 : 20, scale: phase >= 3 ? 1 : 0.9 }}
              transition={{ duration: 0.45, delay: phase >= 3 ? i * 0.12 : 0, ease: [0.16, 1, 0.3, 1] }}
            >
              <div style={{ fontSize: "clamp(20px, 3vw, 28px)", fontWeight: 900, color: "#fff", letterSpacing: "-0.02em" }}>
                {value}<span style={{ fontSize: "0.55em", color: "rgba(255,255,255,0.6)", marginLeft: 2 }}>{unit}</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>{label}</div>
            </motion.div>
          ))}
        </div>

        {/* Tagline */}
        <motion.p
          style={{ marginTop: 28, fontSize: "clamp(12px, 1.8vw, 16px)", color: GOLD, fontWeight: 700, letterSpacing: "0.01em" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: phase >= 3 ? 1 : 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          Every shed. Every batch. Always in control.
        </motion.p>
      </div>
    </motion.div>
  );
}

const SCENES = [HookScene, FeedProgramScene, SiloBuddyScene, SyncScene, ResultsScene];

export function HowItWorksVideo() {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // Start when scrolled into view
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Auto-advance steps
  useEffect(() => {
    if (!visible) return;
    const duration = STEPS[step].duration;
    const TICK = 50;

    progressRef.current = setInterval(() => {
      setProgress(p => Math.min(p + (TICK / duration) * 100, 100));
    }, TICK);

    timerRef.current = setTimeout(() => {
      setStep(s => (s + 1) % STEPS.length);
      setProgress(0);
    }, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [step, visible]);

  const CurrentScene = SCENES[step];

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      {/* Title */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 999, padding: "5px 18px", marginBottom: 16 }}>
          <span style={{ fontSize: 16 }}>▶️</span>
          <span style={{ color: "#065f46", fontWeight: 700, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>How it works</span>
        </div>
        <h2 style={{ fontSize: "clamp(24px, 4vw, 40px)", fontWeight: 900, color: "#111827", margin: "0 0 14px", letterSpacing: "-0.03em", lineHeight: 1.15 }}>
          Simple enough to use<br />
          <span style={{ color: GREEN }}>on day one.</span>
        </h2>
        <p style={{ fontSize: 16, color: "#6b7280", maxWidth: 520, margin: "0 auto", lineHeight: 1.7 }}>
          No training courses. No IT support. Just open it and start tracking.
        </p>
      </div>

      {/* Step indicators */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => { setStep(i); setProgress(0); }}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px",
              borderRadius: 999,
              border: i === step ? `2px solid ${GREEN}` : "2px solid #e5e7eb",
              background: i === step ? "#ecfdf5" : "#fff",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: i === step ? 700 : 500,
              color: i === step ? GREEN : "#6b7280",
              transition: "all 0.2s",
            }}
          >
            <span style={{ fontSize: 14 }}>{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* Video frame */}
      <div style={{
        position: "relative",
        width: "100%",
        maxWidth: 860,
        margin: "0 auto",
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: "0 8px 8px rgba(0,0,0,0.04), 0 24px 60px rgba(0,0,0,0.12)",
        border: "1px solid #e5e7eb",
        aspectRatio: "16/9",
      }}>
        <AnimatePresence mode="popLayout">
          <CurrentScene key={step} />
        </AnimatePresence>

        {/* Progress bar */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "rgba(0,0,0,0.2)" }}>
          <motion.div
            style={{ height: "100%", background: GOLD }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0 }}
          />
        </div>
      </div>

      {/* Auto-play indicator */}
      <div style={{ textAlign: "center", marginTop: 14 }}>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>
          {visible ? "▶ Auto-playing" : "▶ Scroll to play"} · Click a step to jump to it
        </span>
      </div>
    </div>
  );
}
