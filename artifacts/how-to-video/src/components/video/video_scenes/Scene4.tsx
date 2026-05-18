import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const BASE = import.meta.env.BASE_URL;

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1400),
      setTimeout(() => setPhase(3), 3000),
      setTimeout(() => setPhase(4), 4800),
      setTimeout(() => setPhase(5), 6500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const rows = [
    { day: 21, target: '120 g', total: '4.80 t', isToday: false },
    { day: 22, target: '126 g', total: '5.04 t', isToday: false },
    { day: 23, target: '132 g', total: '5.28 t', isToday: true },
    { day: 24, target: '138 g', total: '5.52 t', isToday: false },
    { day: 25, target: '144 g', total: '5.76 t', isToday: false },
  ];

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{ background: 'var(--color-primary)' }}
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '-100%' }}
      transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
    >
      <motion.div
        className="absolute top-0 left-0 w-[50vw] h-[50vw] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(201,162,39,0.1) 0%, transparent 70%)' }}
        animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 8, repeat: Infinity }}
      />

      {/* Push notification banner */}
      {phase >= 4 && (
        <motion.div
          className="absolute top-8 left-1/2 -translate-x-1/2 z-40 flex items-start gap-3 rounded-2xl px-5 py-3.5 shadow-2xl"
          style={{
            background: 'rgba(15,20,15,0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(234,88,12,0.5)',
            maxWidth: '85%',
          }}
          initial={{ opacity: 0, y: -60, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', damping: 18 }}
        >
          <span style={{ fontSize: 'clamp(18px, 2.5vw, 24px)' }}>⚠️</span>
          <div>
            <div className="font-black text-white" style={{ fontSize: 'clamp(10px, 1.5vw, 14px)' }}>Farm Buddy Alert</div>
            <div className="text-orange-400" style={{ fontSize: 'clamp(9px, 1.2vw, 12px)' }}>Shed 3 & 4 — 2.8 days feed remaining</div>
          </div>
        </motion.div>
      )}

      {/* Left */}
      <div className="absolute left-[5%] top-1/2 -translate-y-1/2 z-20 flex flex-col w-[36%]">
        <motion.div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full font-black mb-4 self-start"
          style={{ background: 'rgba(201,162,39,0.15)', color: 'var(--color-accent)', border: '1px solid rgba(201,162,39,0.3)', fontSize: 'clamp(10px, 1.4vw, 14px)' }}
          initial={{ opacity: 0, y: -10 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
        >
          🐔 FEED PROGRAM
        </motion.div>

        <motion.h2
          className="font-black text-white leading-none mb-3"
          style={{ fontSize: 'clamp(22px, 5vw, 60px)' }}
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        >
          ALWAYS<br /><span style={{ color: 'var(--color-accent)' }}>UP TO DATE</span>
        </motion.h2>

        <motion.p
          className="text-white/70 leading-snug mb-5"
          style={{ fontSize: 'clamp(11px, 1.8vw, 18px)' }}
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
        >
          Today's row highlights automatically. Feed alerts fire to your phone before you run out.
        </motion.p>

        <motion.div
          className="rounded-2xl p-4"
          style={{ background: 'rgba(201,162,39,0.1)', border: '1.5px solid rgba(201,162,39,0.25)' }}
          initial={{ opacity: 0, y: 10 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        >
          <div className="text-white/50 font-bold mb-1" style={{ fontSize: 'clamp(8px, 1.1vw, 11px)' }}>TODAY'S TARGET — DAY 23</div>
          <div className="font-black" style={{ fontSize: 'clamp(18px, 3.5vw, 38px)', color: 'var(--color-accent)' }}>5.28 t</div>
          <div className="text-white/50 mt-0.5" style={{ fontSize: 'clamp(8px, 1.1vw, 11px)' }}>132 g/bird × 40,000 birds</div>
        </motion.div>
      </div>

      {/* Spreadsheet mockup */}
      <motion.div
        className="absolute right-[4%] top-1/2 -translate-y-1/2 z-20"
        style={{ width: 'clamp(180px, 36vw, 420px)' }}
        initial={{ opacity: 0, x: 50 }}
        animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
        transition={{ type: 'spring', damping: 22, delay: 0.1 }}
      >
        <div
          className="rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: '#0d1f12', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {/* Tab bar */}
          <div className="flex px-3 pt-3 gap-1.5">
            {['1 & 2', '3 & 4', '5 & 6'].map((tab, i) => (
              <div
                key={tab}
                className="px-3 py-1.5 rounded-t-lg font-bold relative"
                style={{
                  background: i === 0 ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: i === 0 ? '#fff' : 'rgba(255,255,255,0.4)',
                  fontSize: 'clamp(8px, 1.1vw, 11px)',
                }}
              >
                {tab}
                {i === 1 && phase >= 4 && (
                  <motion.div
                    className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-orange-500"
                    animate={{ scale: [1, 1.4, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="p-3">
            <div className="flex gap-2 mb-2 px-2">
              {['DAY', 'G/BIRD', 'TOTAL'].map(h => (
                <div key={h} className="flex-1 font-black text-white/30" style={{ fontSize: 'clamp(7px, 1vw, 10px)' }}>{h}</div>
              ))}
            </div>
            {rows.map((row, i) => (
              <motion.div
                key={row.day}
                className="flex gap-2 px-2 py-2 rounded-lg mb-1"
                style={{
                  background: row.isToday
                    ? 'rgba(201,162,39,0.18)'
                    : 'rgba(255,255,255,0.03)',
                  border: row.isToday ? '1px solid rgba(201,162,39,0.35)' : '1px solid transparent',
                }}
                initial={{ opacity: 0, x: 10 }}
                animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: 10 }}
                transition={{ delay: i * 0.08 }}
              >
                <div className="flex-1 font-black" style={{ fontSize: 'clamp(8px, 1.1vw, 11px)', color: row.isToday ? 'var(--color-accent)' : 'rgba(255,255,255,0.7)' }}>
                  {row.isToday ? '▶ ' : ''}{row.day}
                </div>
                <div className="flex-1" style={{ fontSize: 'clamp(8px, 1.1vw, 11px)', color: 'rgba(255,255,255,0.6)' }}>{row.target}</div>
                <div className="flex-1 font-bold" style={{ fontSize: 'clamp(8px, 1.1vw, 11px)', color: row.isToday ? '#4ade80' : 'rgba(255,255,255,0.5)' }}>{row.total}</div>
              </motion.div>
            ))}
          </div>

          {/* Screenshot */}
          <motion.div
            className="mx-3 mb-3 rounded-xl overflow-hidden"
            style={{ maxHeight: '8vw' }}
            initial={{ opacity: 0 }}
            animate={phase >= 5 ? { opacity: 1 } : { opacity: 0 }}
          >
            <img src={`${BASE}screenshot-feed-program.jpg`} alt="Feed Program" className="w-full object-cover object-top" />
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
