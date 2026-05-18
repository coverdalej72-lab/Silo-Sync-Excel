import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2600),
      setTimeout(() => setPhase(4), 4800),
      setTimeout(() => setPhase(5), 6500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const sheds = [
    { label: 'Shed 1 & 2', birds: '40,000' },
    { label: 'Shed 3 & 4', birds: '38,500' },
    { label: 'Shed 5 & 6', birds: '41,200' },
  ];

  const feedRows = [
    { day: 'Day 1–3', target: '28 g/bird', total: '1.12 t' },
    { day: 'Day 4–7', target: '55 g/bird', total: '2.20 t' },
    { day: 'Day 8–14', target: '95 g/bird', total: '3.80 t' },
  ];

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{ background: 'var(--color-primary)' }}
      initial={{ clipPath: 'polygon(100% 0, 100% 0, 100% 100%, 100% 100%)' }}
      animate={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }}
      exit={{ clipPath: 'polygon(0 0, 0 0, 0 100%, 0 100%)' }}
      transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
    >
      <motion.div
        className="absolute top-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(201,162,39,0.12) 0%, transparent 70%)' }}
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 6, repeat: Infinity }}
      />

      {/* Left: label */}
      <div className="absolute left-[6%] top-1/2 -translate-y-1/2 z-20 flex flex-col w-[38%]">
        <motion.div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full font-black text-[#0a2415] mb-4 self-start"
          style={{ background: 'var(--color-accent)', fontSize: 'clamp(10px, 1.4vw, 14px)' }}
          initial={{ opacity: 0, y: -10 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
        >
          📅 PLACEMENT DAY
        </motion.div>

        <motion.h2
          className="font-black text-white leading-none mb-3"
          style={{ fontSize: 'clamp(22px, 5vw, 60px)' }}
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ delay: 0.1 }}
        >
          SET UP IN<br /><span style={{ color: 'var(--color-accent)' }}>60 SECONDS</span>
        </motion.h2>

        <motion.p
          className="text-white/70 leading-snug"
          style={{ fontSize: 'clamp(11px, 1.8vw, 18px)' }}
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ delay: 0.2 }}
        >
          Enter placement date and bird numbers per shed — Farm Buddy auto-builds your complete feed program instantly.
        </motion.p>
      </div>

      {/* Right: phone mockup */}
      <motion.div
        className="absolute right-[4%] top-1/2 -translate-y-1/2 z-20"
        style={{ width: 'clamp(160px, 28vw, 320px)' }}
        initial={{ opacity: 0, x: 60, rotateY: -20 }}
        animate={phase >= 1 ? { opacity: 1, x: 0, rotateY: -8 } : { opacity: 0, x: 60, rotateY: -20 }}
        transition={{ type: 'spring', damping: 22 }}
      >
        <div
          className="relative rounded-[4vw] overflow-hidden"
          style={{
            aspectRatio: '9/19',
            background: '#0a1a10',
            border: '2px solid rgba(255,255,255,0.12)',
            boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
          }}
        >
          <div className="absolute inset-0 p-3 flex flex-col" style={{ paddingTop: '8%' }}>
            {/* App header */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-white font-black" style={{ fontSize: 'clamp(8px, 1.5vw, 14px)' }}>🐔 Broiler Base Mate</span>
              <span className="font-bold rounded-full px-2" style={{ background: 'var(--color-accent)', color: '#0a2415', fontSize: 'clamp(7px, 1vw, 10px)' }}>NEW BATCH</span>
            </div>

            {/* Placement date */}
            <motion.div
              className="rounded-lg p-2 mb-3"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
              initial={{ opacity: 0 }}
              animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
            >
              <div className="text-white/50 mb-1" style={{ fontSize: 'clamp(6px, 1vw, 9px)' }}>PLACEMENT DATE</div>
              <motion.div
                className="text-white font-black"
                style={{ fontSize: 'clamp(9px, 1.5vw, 14px)', color: 'var(--color-accent)' }}
                initial={{ opacity: 0 }}
                animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
              >
                15 May 2026
              </motion.div>
            </motion.div>

            {/* Shed bird numbers */}
            <div className="text-white/50 mb-1.5" style={{ fontSize: 'clamp(6px, 0.9vw, 9px)' }}>SHED BIRD NUMBERS</div>
            <div className="flex flex-col gap-1.5 mb-3">
              {sheds.map((shed, i) => (
                <motion.div
                  key={shed.label}
                  className="flex justify-between items-center rounded-lg px-2 py-1.5"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
                  initial={{ opacity: 0, x: 10 }}
                  animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: 10 }}
                  transition={{ delay: i * 0.15 }}
                >
                  <span className="text-white/70" style={{ fontSize: 'clamp(7px, 1vw, 10px)' }}>{shed.label}</span>
                  <span className="font-black text-white" style={{ fontSize: 'clamp(8px, 1.2vw, 12px)' }}>{shed.birds}</span>
                </motion.div>
              ))}
            </div>

            {/* Feed program auto-calculating */}
            <motion.div
              className="text-white/50 mb-1.5"
              style={{ fontSize: 'clamp(6px, 0.9vw, 9px)' }}
              initial={{ opacity: 0 }}
              animate={phase >= 4 ? { opacity: 1 } : { opacity: 0 }}
            >
              FEED PROGRAM — AUTO CALCULATED
            </motion.div>
            <div className="flex flex-col gap-1">
              {feedRows.map((row, i) => (
                <motion.div
                  key={row.day}
                  className="flex justify-between items-center rounded px-2 py-1"
                  style={{ background: i === 0 ? 'rgba(201,162,39,0.15)' : 'rgba(255,255,255,0.04)' }}
                  initial={{ opacity: 0, scaleX: 0 }}
                  animate={phase >= 4 ? { opacity: 1, scaleX: 1 } : { opacity: 0, scaleX: 0 }}
                  transition={{ delay: i * 0.1, duration: 0.4 }}
                >
                  <span style={{ fontSize: 'clamp(6px, 0.9vw, 9px)', color: i === 0 ? 'var(--color-accent)' : 'rgba(255,255,255,0.5)' }}>{row.day}</span>
                  <span style={{ fontSize: 'clamp(6px, 0.9vw, 9px)', color: 'rgba(255,255,255,0.7)' }}>{row.total}</span>
                </motion.div>
              ))}
            </div>

            {/* Active badge */}
            <motion.div
              className="mt-auto flex items-center justify-center gap-2 py-2 rounded-xl font-black"
              style={{ background: '#16a34a', color: '#fff', fontSize: 'clamp(7px, 1.1vw, 11px)' }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={phase >= 5 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', damping: 15 }}
            >
              ✓ All sheds active — Day 1
            </motion.div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
