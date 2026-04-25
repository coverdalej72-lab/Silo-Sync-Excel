import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const GREEN = "#1a5c36";
const DARK = "#0f3d24";
const GOLD = "#C9A227";
const BASE = import.meta.env.BASE_URL;

function useBackgroundMusic(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<AudioNode[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const nodes: AudioNode[] = [];

    const master = ctx.createGain();
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 2);
    master.connect(ctx.destination);
    nodes.push(master);

    const BPM = 112;
    const beat = 60 / BPM;
    const now = ctx.currentTime;

    const makePad = (freq: number, delay: number, gain: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.detune.value = (Math.random() - 0.5) * 8;
      g.gain.setValueAtTime(0, now + delay);
      g.gain.linearRampToValueAtTime(gain, now + delay + 1.2);
      osc.connect(g);
      g.connect(master);
      osc.start(now + delay);
      nodes.push(osc, g);
    };

    makePad(110, 0, 0.12);
    makePad(138.6, 0.3, 0.08);
    makePad(165, 0.6, 0.06);
    makePad(220, 1.0, 0.05);
    makePad(277.2, 1.5, 0.04);

    const scheduleBass = () => {
      const bassOsc = ctx.createOscillator();
      const bassGain = ctx.createGain();
      bassOsc.type = "sine";
      bassOsc.frequency.value = 82.4;
      bassGain.gain.value = 0;
      bassOsc.connect(bassGain);
      bassGain.connect(master);
      bassOsc.start(now);

      for (let i = 0; i < 96; i++) {
        const t = now + i * beat;
        const onBeat = i % 2 === 0;
        bassGain.gain.setValueAtTime(0, t);
        if (onBeat) {
          bassGain.gain.linearRampToValueAtTime(0.18, t + 0.02);
          bassGain.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.85);
        }
      }
      nodes.push(bassOsc, bassGain);
    };

    const scheduleHihat = () => {
      for (let i = 0; i < 192; i++) {
        const t = now + i * (beat / 2);
        const bufferSize = ctx.sampleRate * 0.04;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let j = 0; j < bufferSize; j++) data[j] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const hpf = ctx.createBiquadFilter();
        hpf.type = "highpass";
        hpf.frequency.value = 8000;
        const g = ctx.createGain();
        const vol = i % 4 === 0 ? 0.07 : 0.035;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        src.connect(hpf);
        hpf.connect(g);
        g.connect(master);
        src.start(t);
        nodes.push(src, hpf, g);
      }
    };

    scheduleBass();
    scheduleHihat();
    nodesRef.current = nodes;

    return () => {
      nodes.forEach(n => { try { (n as OscillatorNode).stop?.(); } catch {} });
      ctx.close();
    };
  }, [enabled]);
}

const SCENES = [
  { id: "hook",     label: "The problem",   icon: "📋", dur: 3500 },
  { id: "benefits", label: "Benefits",       icon: "✅", dur: 5000 },
  { id: "feed",     label: "Broiler Base Mate",   icon: "🖥️", dur: 4000 },
  { id: "silo",     label: "Farm Buddy",      icon: "📱", dur: 4000 },
  { id: "install",  label: "Get started",    icon: "🚀", dur: 5000 },
  { id: "closer",   label: "The result",     icon: "🏆", dur: 4000 },
];

function HookScene() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const t = [
      setTimeout(() => setP(1), 100),
      setTimeout(() => setP(2), 700),
      setTimeout(() => setP(3), 1500),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ clipPath: "circle(0% at 50% 50%)" }}
      animate={{ clipPath: "circle(100% at 50% 50%)" }}
      exit={{ clipPath: "circle(0% at 50% 50%)" }}
      transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
      style={{ background: `linear-gradient(135deg, ${DARK} 0%, ${GREEN} 100%)` }}>

      <div style={{ position: "absolute", inset: 0, opacity: 0.07, backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "48px 48px" }} />

      <motion.div style={{ display: "flex", gap: 20, marginBottom: 32 }}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: p >= 1 ? 1 : 0, y: p >= 1 ? 0 : 30 }}
        transition={{ duration: 0.6 }}>
        {["📋", "📝", "📊", "🗂️"].map((e, i) => (
          <motion.div key={i} style={{ width: 64, height: 64, borderRadius: 16, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}
            animate={{ y: [0, -8, 0], rotate: [0, i % 2 === 0 ? 4 : -4, 0] }}
            transition={{ duration: 2.5 + i * 0.3, repeat: Infinity, ease: "easeInOut" }}>
            {e}
          </motion.div>
        ))}
      </motion.div>

      <motion.h1 style={{ fontSize: "clamp(28px,5vw,56px)", fontWeight: 900, color: "#fff", textAlign: "center", margin: "0 0 16px", letterSpacing: "-0.03em", lineHeight: 1.1 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: p >= 2 ? 1 : 0, y: p >= 2 ? 0 : 20 }}
        transition={{ duration: 0.55 }}>
        Still on paper?<br />
        <span style={{ color: GOLD }}>Still on Excel?</span>
      </motion.h1>

      <motion.p style={{ fontSize: "clamp(14px,2vw,20px)", color: "rgba(255,255,255,0.7)", textAlign: "center", maxWidth: 520, lineHeight: 1.65, margin: 0 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: p >= 3 ? 1 : 0 }}
        transition={{ duration: 0.5 }}>
        Australian poultry growers are still re-keying silo readings and chasing spreadsheets across email. There's a better way.
      </motion.p>

      <motion.div style={{ marginTop: 28, width: 48, height: 4, borderRadius: 2, background: GOLD }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: p >= 3 ? 1 : 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
    </motion.div>
  );
}

function BenefitsScene() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const t = [
      setTimeout(() => setP(1), 100),
      setTimeout(() => setP(2), 500),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  const benefits = [
    { icon: "📊", label: "Live silo totals" },
    { icon: "🧮", label: "Auto feed-on-hand" },
    { icon: "📱", label: "Mobile-ready PWA" },
    { icon: "📦", label: "QR docket scanning" },
    { icon: "📈", label: "Batch results & FCR" },
    { icon: "💀", label: "Liveability tracking" },
    { icon: "🏚️", label: "Multi-shed support" },
    { icon: "🔔", label: "Low-feed alerts" },
    { icon: "📤", label: "One-click export" },
    { icon: "⚡", label: "No app install" },
    { icon: "🔄", label: "Instant sync" },
    { icon: "📜", label: "Batch history" },
  ];

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ clipPath: "inset(0 100% 0 0)" }}
      animate={{ clipPath: "inset(0 0% 0 0)" }}
      exit={{ clipPath: "inset(0 0 0 100%)" }}
      transition={{ duration: 0.65, ease: [0.4, 0, 0.2, 1] }}
      style={{ background: "#f0fdf4" }}>

      <motion.div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#dcfce7", borderRadius: 999, padding: "5px 18px", marginBottom: 20 }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: p >= 1 ? 1 : 0, y: p >= 1 ? 0 : -10 }}
        transition={{ duration: 0.4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, letterSpacing: "0.08em", textTransform: "uppercase" }}>Everything you need</span>
      </motion.div>

      <motion.h2 style={{ fontSize: "clamp(22px,4vw,44px)", fontWeight: 900, color: "#111827", textAlign: "center", margin: "0 0 28px", letterSpacing: "-0.03em" }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: p >= 1 ? 1 : 0, y: p >= 1 ? 0 : 12 }}
        transition={{ duration: 0.45, delay: 0.05 }}>
        One platform. <span style={{ color: GREEN }}>Every shed.</span>
      </motion.h2>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", maxWidth: 780, padding: "0 20px" }}>
        {benefits.map(({ icon, label }, i) => (
          <motion.div key={label}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1.5px solid #d1fae5`, borderRadius: 10, padding: "9px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: p >= 2 ? 1 : 0, scale: p >= 2 ? 1 : 0.8, y: p >= 2 ? 0 : 10 }}
            transition={{ duration: 0.35, delay: p >= 2 ? i * 0.06 : 0, type: "spring", stiffness: 300, damping: 20 }}>
            <span style={{ fontSize: 16 }}>{icon}</span>
            <span style={{ fontSize: "clamp(11px,1.3vw,14px)", fontWeight: 600, color: "#111827" }}>{label}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function FeedScene() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const t = [setTimeout(() => setP(1), 200), setTimeout(() => setP(2), 900)];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <motion.div className="absolute inset-0 flex items-center"
      initial={{ clipPath: "inset(0 100% 0 0)" }}
      animate={{ clipPath: "inset(0 0% 0 0)" }}
      exit={{ clipPath: "inset(0 0 0 100%)" }}
      transition={{ duration: 0.65, ease: [0.4, 0, 0.2, 1] }}
      style={{ background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 40, padding: "0 40px", width: "100%", maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ flex: "0 0 auto", maxWidth: 300 }}>
          <motion.div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#dcfce7", borderRadius: 999, padding: "4px 14px", marginBottom: 14 }}
            initial={{ opacity: 0, x: -16 }} animate={{ opacity: p >= 1 ? 1 : 0, x: p >= 1 ? 0 : -16 }} transition={{ duration: 0.4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, letterSpacing: "0.07em", textTransform: "uppercase" }}>🖥️ Desktop & Tablet</span>
          </motion.div>
          <motion.h2 style={{ fontSize: "clamp(20px,3.5vw,36px)", fontWeight: 900, color: "#111827", margin: "0 0 12px", letterSpacing: "-0.03em", lineHeight: 1.2 }}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: p >= 1 ? 1 : 0, y: p >= 1 ? 0 : 12 }} transition={{ duration: 0.45, delay: 0.05 }}>
            Your feed program.<br /><span style={{ color: GREEN }}>In the browser.</span>
          </motion.h2>
          <motion.p style={{ fontSize: "clamp(12px,1.6vw,15px)", color: "#6b7280", lineHeight: 1.65, margin: "0 0 16px" }}
            initial={{ opacity: 0 }} animate={{ opacity: p >= 2 ? 1 : 0 }} transition={{ duration: 0.4 }}>
            Drop in your existing Excel spreadsheet and it loads instantly. All your sheds, formulas, and history carry over.
          </motion.p>
          {["Multi-shed tabs", "Auto feed-on-hand calc", "Silo sync & live totals", "End-of-batch export"].map((f, i) => (
            <motion.div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: GREEN, fontWeight: 600, marginBottom: 6 }}
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: p >= 2 ? 1 : 0, x: p >= 2 ? 0 : -10 }} transition={{ duration: 0.3, delay: i * 0.08 }}>
              <span>✓</span>{f}
            </motion.div>
          ))}
        </div>
        <motion.div style={{ flex: 1 }}
          initial={{ opacity: 0, x: 30 }} animate={{ opacity: p >= 1 ? 1 : 0, x: p >= 1 ? 0 : 30 }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}>
          <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.14)", border: "1px solid #e5e7eb" }}>
            <div style={{ background: "#f3f4f6", padding: "8px 14px", display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid #e5e7eb" }}>
              {["#fc5c65","#fed330","#26de81"].map(c => <span key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c, display: "inline-block" }} />)}
              <span style={{ flex: 1, background: "#e5e7eb", borderRadius: 5, height: 18, marginLeft: 6 }} />
            </div>
            <img src={`${BASE}screenshot-feed-program.jpg`} alt="Broiler Base Mate" style={{ width: "100%", display: "block" }} />
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function SiloScene() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const t = [setTimeout(() => setP(1), 200), setTimeout(() => setP(2), 900)];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <motion.div className="absolute inset-0 flex items-center"
      initial={{ clipPath: "inset(0 100% 0 0)" }}
      animate={{ clipPath: "inset(0 0% 0 0)" }}
      exit={{ clipPath: "inset(0 0 0 100%)" }}
      transition={{ duration: 0.65, ease: [0.4, 0, 0.2, 1] }}
      style={{ background: `linear-gradient(135deg, ${DARK} 0%, ${GREEN} 100%)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 40, padding: "0 40px", width: "100%", maxWidth: 1000, margin: "0 auto" }}>
        <motion.div style={{ flex: "0 0 auto" }}
          initial={{ opacity: 0, x: -20 }} animate={{ opacity: p >= 1 ? 1 : 0, x: p >= 1 ? 0 : -20 }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}>
          <div style={{ width: 170, background: "#1f2937", borderRadius: 28, border: "5px solid #374151", padding: "10px 4px 4px", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
            <div style={{ width: 50, height: 14, background: "#1f2937", borderRadius: 7, margin: "0 auto 4px" }} />
            <div style={{ borderRadius: 20, overflow: "hidden" }}>
              <img src={`${BASE}screenshot-silo-mate.jpg`} alt="Farm Buddy" style={{ width: "100%", display: "block" }} />
            </div>
          </div>
        </motion.div>
        <div style={{ flex: 1 }}>
          <motion.div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(201,162,39,0.2)", border: "1px solid rgba(201,162,39,0.4)", borderRadius: 999, padding: "4px 14px", marginBottom: 14 }}
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: p >= 1 ? 1 : 0, y: p >= 1 ? 0 : -8 }} transition={{ duration: 0.4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, letterSpacing: "0.07em", textTransform: "uppercase" }}>📱 iPhone & Android</span>
          </motion.div>
          <motion.h2 style={{ fontSize: "clamp(20px,3.5vw,36px)", fontWeight: 900, color: "#fff", margin: "0 0 12px", letterSpacing: "-0.03em", lineHeight: 1.2 }}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: p >= 1 ? 1 : 0, y: p >= 1 ? 0 : 12 }} transition={{ duration: 0.45, delay: 0.05 }}>
            Record silos<br /><span style={{ color: GOLD }}>from the shed.</span>
          </motion.h2>
          <motion.p style={{ fontSize: "clamp(12px,1.6vw,15px)", color: "rgba(255,255,255,0.72)", lineHeight: 1.65, margin: "0 0 16px", maxWidth: 360 }}
            initial={{ opacity: 0 }} animate={{ opacity: p >= 2 ? 1 : 0 }} transition={{ duration: 0.4 }}>
            Walk the shed, tap in silo readings or scan the delivery docket QR code. Syncs instantly to the Broiler Base Mate.
          </motion.p>
          {["Works offline in the shed", "QR delivery docket scan", "No app store — add to home screen", "Syncs instantly to desktop"].map((f, i) => (
            <motion.div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: GOLD, fontWeight: 600, marginBottom: 6 }}
              initial={{ opacity: 0, x: 10 }} animate={{ opacity: p >= 2 ? 1 : 0, x: p >= 2 ? 0 : 10 }} transition={{ duration: 0.3, delay: i * 0.08 }}>
              <span>✓</span>{f}
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function InstallScene() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const t = [
      setTimeout(() => setP(1), 200),
      setTimeout(() => setP(2), 800),
      setTimeout(() => setP(3), 1600),
      setTimeout(() => setP(4), 2400),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  const steps = [
    { n: "1", icon: "🌐", title: "Sign up", desc: "Create your account at farmbuddy.com.au — no credit card to start." },
    { n: "2", icon: "📤", title: "Upload your spreadsheet", desc: "Drop in your existing Excel feed program. It loads instantly — all your sheds, history, formulas." },
    { n: "3", icon: "📱", title: "Add Farm Buddy to your phone", desc: "Open the link on your phone, tap 'Add to Home Screen'. No App Store needed." },
  ];

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ clipPath: "inset(0 100% 0 0)" }}
      animate={{ clipPath: "inset(0 0% 0 0)" }}
      exit={{ clipPath: "inset(0 0 0 100%)" }}
      transition={{ duration: 0.65, ease: [0.4, 0, 0.2, 1] }}
      style={{ background: "#f9fafb" }}>

      <motion.div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 999, padding: "5px 18px", marginBottom: 20 }}
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: p >= 1 ? 1 : 0, y: p >= 1 ? 0 : -10 }} transition={{ duration: 0.4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, letterSpacing: "0.08em", textTransform: "uppercase" }}>🚀 Getting started</span>
      </motion.div>

      <motion.h2 style={{ fontSize: "clamp(22px,4vw,42px)", fontWeight: 900, color: "#111827", textAlign: "center", margin: "0 0 36px", letterSpacing: "-0.03em" }}
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: p >= 1 ? 1 : 0, y: p >= 1 ? 0 : 12 }} transition={{ duration: 0.45, delay: 0.05 }}>
        Up and running in <span style={{ color: GREEN }}>3 steps.</span>
      </motion.h2>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center", padding: "0 32px", maxWidth: 900 }}>
        {steps.map(({ n, icon, title, desc }, i) => (
          <motion.div key={n}
            style={{ flex: "1 1 240px", maxWidth: 280, background: "#fff", borderRadius: 16, padding: "24px 22px", border: "1px solid #e5e7eb", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: p >= i + 2 ? 1 : 0, y: p >= i + 2 ? 0 : 24, scale: p >= i + 2 ? 1 : 0.95 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 18 }}>{n}</div>
              <span style={{ fontSize: 22 }}>{icon}</span>
            </div>
            <div style={{ fontWeight: 800, fontSize: "clamp(14px,1.6vw,17px)", color: "#111827", marginBottom: 8 }}>{title}</div>
            <div style={{ fontSize: "clamp(11px,1.3vw,13px)", color: "#6b7280", lineHeight: 1.6 }}>{desc}</div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function CloserScene() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const t = [
      setTimeout(() => setP(1), 300),
      setTimeout(() => setP(2), 1000),
      setTimeout(() => setP(3), 1800),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      initial={{ clipPath: "circle(0% at 50% 50%)" }}
      animate={{ clipPath: "circle(100% at 50% 50%)" }}
      exit={{ clipPath: "circle(0% at 50% 50%)" }}
      transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
      style={{ background: `linear-gradient(135deg, ${DARK} 0%, #1e4d2b 100%)` }}>

      <div style={{ position: "absolute", inset: 0, opacity: 0.06, backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

      {[...Array(18)].map((_, i) => (
        <motion.div key={i}
          style={{ position: "absolute", width: 4 + (i % 3) * 2, height: 4 + (i % 3) * 2, borderRadius: "50%", background: GOLD, left: `${5 + i * 5.2}%`, opacity: 0.4 + (i % 3) * 0.2 }}
          animate={{ y: [0, -(80 + i * 15), -(160 + i * 30)], opacity: [0, 0.6, 0] }}
          transition={{ duration: 3 + i * 0.2, repeat: Infinity, delay: i * 0.25, ease: "easeOut" }} />
      ))}

      <motion.div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}
        initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: p >= 1 ? 1 : 0, scale: p >= 1 ? 1 : 0.85 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: GREEN, border: `2px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>🐔</div>
        <span style={{ fontWeight: 900, fontSize: "clamp(18px,3vw,28px)", color: "#fff", letterSpacing: "-0.02em" }}>Farm Buddy™</span>
      </motion.div>

      <motion.h2 style={{ fontSize: "clamp(24px,5vw,56px)", fontWeight: 900, color: "#fff", textAlign: "center", margin: "0 0 16px", letterSpacing: "-0.04em", lineHeight: 1.05, maxWidth: 700 }}
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: p >= 1 ? 1 : 0, y: p >= 1 ? 0 : 16 }} transition={{ duration: 0.55, delay: 0.1 }}>
        Every shed.<br />Every batch.<br /><span style={{ color: GOLD }}>Always in control.</span>
      </motion.h2>

      <motion.div style={{ width: 80, height: 3, background: GOLD, borderRadius: 2, margin: "16px 0 20px" }}
        initial={{ scaleX: 0 }} animate={{ scaleX: p >= 2 ? 1 : 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />

      <motion.p style={{ fontSize: "clamp(14px,2vw,20px)", color: GOLD, fontWeight: 700, letterSpacing: "0.02em" }}
        initial={{ opacity: 0 }} animate={{ opacity: p >= 3 ? 1 : 0 }} transition={{ duration: 0.5 }}>
        farmbuddy.com.au
      </motion.p>

      <motion.p style={{ fontSize: "clamp(12px,1.4vw,15px)", color: "rgba(255,255,255,0.5)", marginTop: 8 }}
        initial={{ opacity: 0 }} animate={{ opacity: p >= 3 ? 1 : 0 }} transition={{ duration: 0.5, delay: 0.15 }}>
        Built for Australian broiler & breeder growers
      </motion.p>
    </motion.div>
  );
}

const SCENE_COMPONENTS = [HookScene, BenefitsScene, FeedScene, SiloScene, InstallScene, CloserScene];

export function VideoPage() {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [musicStarted, setMusicStarted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useBackgroundMusic(musicStarted);

  const startAudio = () => { if (!musicStarted) setMusicStarted(true); };

  useEffect(() => {
    const dur = SCENES[step].dur;
    const TICK = 50;
    progressRef.current = setInterval(() => setProgress(p => Math.min(p + (TICK / dur) * 100, 100)), TICK);
    timerRef.current = setTimeout(() => { setStep(s => (s + 1) % SCENES.length); setProgress(0); }, dur);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [step]);

  const CurrentScene = SCENE_COMPONENTS[step];

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
      onClick={startAudio}>

      {/* 16:9 video frame */}
      <div style={{ position: "relative", width: "min(100vw, 177.78vh)", height: "min(56.25vw, 100vh)", overflow: "hidden" }}>
        <AnimatePresence mode="popLayout">
          <CurrentScene key={step} />
        </AnimatePresence>

        {/* Progress bar */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, background: "rgba(0,0,0,0.3)", zIndex: 100 }}>
          <motion.div style={{ height: "100%", background: GOLD, transformOrigin: "left" }} animate={{ width: `${progress}%` }} transition={{ duration: 0 }} />
        </div>

        {/* Scene dots */}
        <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 8, zIndex: 100 }}>
          {SCENES.map((_, i) => (
            <button key={i} onClick={e => { e.stopPropagation(); setStep(i); setProgress(0); startAudio(); }}
              style={{ width: i === step ? 24 : 8, height: 8, borderRadius: 4, background: i === step ? GOLD : "rgba(255,255,255,0.35)", border: "none", cursor: "pointer", padding: 0, transition: "all 0.3s" }} />
          ))}
        </div>

        {/* Sound notice */}
        {!musicStarted && (
          <div style={{ position: "absolute", top: 14, right: 14, background: "rgba(0,0,0,0.55)", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "rgba(255,255,255,0.7)", backdropFilter: "blur(4px)", zIndex: 100 }}>
            🔈 Click anywhere for sound
          </div>
        )}
      </div>
    </div>
  );
}
