import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1400),
      setTimeout(() => setPhase(3), 3500),
      setTimeout(() => setPhase(4), 5500),
      setTimeout(() => setPhase(5), 7200),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const weightRows = [
    { day: 7,  weight: '185 g',   fcr: '0.98', done: true  },
    { day: 14, weight: '450 g',   fcr: '1.12', done: true  },
    { day: 21, weight: '870 g',   fcr: '1.34', done: true  },
    { day: 28, weight: '1,380 g', fcr: '1.52', done: false },
  ];

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{ background: '#0b1a10' }}
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.6 }}
    >
      <motion.div
        className="absolute top-[20%] right-[10%] w-[40vw] h-[40vw] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(201,162,39,0.08) 0%, transparent 70%)' }}
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 7, repeat: Infinity }}
      />

      {/* Left */}
      <div className="absolute left-[5%] top-1/2 -translate-y-1/2 z-20 flex flex-col w-[38%]">
        <motion.div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full font-black mb-4 self-start"
          style={{ background: 'rgba(201,162,39,0.12)', color: 'var(--color-accent)', border: '1px solid rgba(201,162,39,0.25)', fontSize: 'clamp(10px, 1.4vw, 14px)' }}
          initial={{ opacity: 0, y: -10 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
        >
          ⚖️ WEIGHT SHEET
        </motion.div>

        <motion.h2
          className="font-black text-white leading-none mb-3"
          style={{ fontSize: 'clamp(22px, 5vw, 60px)' }}
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        >
          TRACK YOUR<br /><span style={{ color: 'var(--color-accent)' }}>FLOCK GROWTH</span>
        </motion.h2>

        <motion.p
          className="text-white/70 leading-snug mb-5"
          style={{ fontSize: 'clamp(11px, 1.8vw, 18px)' }}
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
        >
          Enter weigh-in results and Farm Buddy auto-calculates FCR, average daily gain, and flags density break points.
        </motion.p>

        {/* Stats */}
        <div className="flex flex-col gap-3">
          <motion.div
            className="rounded-2xl p-4 flex justify-between items-center"
            style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)' }}
            initial={{ opacity: 0, x: -20 }}
            animate={phase >= 4 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
          >
            <div>
              <div className="text-white/50 font-bold" style={{ fontSize: 'clamp(8px, 1.1vw, 11px)' }}>FCR DAY 28</div>
              <div className="font-black text-green-400" style={{ fontSize: 'clamp(20px, 3.5vw, 38px)' }}>1.52</div>
            </div>
            <div className="text-right">
              <div className="text-white/50 font-bold" style={{ fontSize: 'clamp(8px, 1.1vw, 11px)' }}>AVG DAILY GAIN</div>
              <div className="font-black text-white" style={{ fontSize: 'clamp(16px, 2.8vw, 30px)' }}>49.3 g/day</div>
            </div>
          </motion.div>

          {/* Density break warning */}
          <motion.div
            className="rounded-2xl p-4 flex items-center gap-3"
            style={{ background: 'rgba(234,88,12,0.12)', border: '1.5px solid rgba(234,88,12,0.35)' }}
            initial={{ opacity: 0, x: -20 }}
            animate={phase >= 5 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
            transition={{ type: 'spring', damping: 18 }}
          >
            <motion.span
              style={{ fontSize: 'clamp(18px, 2.5vw, 28px)' }}
              animate={phase >= 5 ? { rotate: [-5, 5, -5, 5, 0] } : {}}
              transition={{ duration: 0.4 }}
            >
              🔔
            </motion.span>
            <div>
              <div className="font-black text-orange-400" style={{ fontSize: 'clamp(9px, 1.3vw, 13px)' }}>Density Break 1 — Day 30</div>
              <div className="text-white/50" style={{ fontSize: 'clamp(8px, 1.1vw, 11px)' }}>Thin to 30 kg/m² — remove ~4,200 birds</div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Weight table mockup */}
      <motion.div
        className="absolute right-[4%] top-1/2 -translate-y-1/2 z-20"
        style={{ width: 'clamp(180px, 34vw, 400px)' }}
        initial={{ opacity: 0, x: 60 }}
        animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: 60 }}
        transition={{ type: 'spring', damping: 22 }}
      >
        <div
          className="rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: '#0d1f12', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <div className="font-black text-white" style={{ fontSize: 'clamp(10px, 1.6vw, 16px)' }}>Weight Sheet — Shed 1 & 2</div>
            <div className="text-white/40 mt-0.5" style={{ fontSize: 'clamp(8px, 1.1vw, 11px)' }}>Placement: 15 May 2026 · 40,000 birds</div>
          </div>

          <div className="p-4">
            <div className="flex gap-3 mb-2 px-2">
              {['DAY', 'AVG WEIGHT', 'FCR'].map(h => (
                <div key={h} className="flex-1 font-black text-white/30" style={{ fontSize: 'clamp(7px, 1vw, 10px)' }}>{h}</div>
              ))}
            </div>
            {weightRows.map((row, i) => (
              <motion.div
                key={row.day}
                className="flex gap-3 px-2 py-2.5 rounded-xl mb-1.5"
                style={{
                  background: !row.done && phase >= 3 ? 'rgba(201,162,39,0.12)' : 'rgba(255,255,255,0.04)',
                  border: !row.done && phase >= 3 ? '1px solid rgba(201,162,39,0.25)' : '1px solid transparent',
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                transition={{ delay: i * 0.12 }}
              >
                <div className="flex-1 font-bold" style={{ fontSize: 'clamp(9px, 1.2vw, 13px)', color: !row.done ? 'var(--color-accent)' : 'rgba(255,255,255,0.6)' }}>
                  {!row.done && phase >= 3 ? '▶ ' : ''}{row.day}
                </div>
                <div className="flex-1 font-bold text-white" style={{ fontSize: 'clamp(9px, 1.2vw, 13px)' }}>
                  {row.done || phase >= 3 ? row.weight : '— g'}
                </div>
                <motion.div
                  className="flex-1 font-black"
                  style={{ fontSize: 'clamp(9px, 1.2vw, 13px)', color: row.done ? '#4ade80' : 'var(--color-accent)' }}
                  initial={{ opacity: 0 }}
                  animate={phase >= (row.done ? 2 : 3) ? { opacity: 1 } : { opacity: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                >
                  {row.done || phase >= 3 ? row.fcr : '—'}
                </motion.div>
              </motion.div>
            ))}

            {/* Density bar */}
            <motion.div
              className="mt-3 rounded-xl overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.05)' }}
              initial={{ opacity: 0 }}
              animate={phase >= 4 ? { opacity: 1 } : { opacity: 0 }}
            >
              <div className="flex justify-between px-3 py-2">
                <span className="text-white/50 font-bold" style={{ fontSize: 'clamp(7px, 1vw, 10px)' }}>DENSITY</span>
                <span className="font-black" style={{ fontSize: 'clamp(7px, 1vw, 10px)', color: 'var(--color-accent)' }}>28.6 kg/m²</span>
              </div>
              <div className="h-2 mx-3 mb-3 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(to right, #22c55e, #eab308, #ef4444)' }}
                  initial={{ width: '0%' }}
                  animate={phase >= 4 ? { width: '72%' } : { width: '0%' }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                />
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
