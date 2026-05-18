import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1600),
      setTimeout(() => setPhase(3), 3200),
      setTimeout(() => setPhase(4), 5000),
      setTimeout(() => setPhase(5), 6800),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const silos = [
    { label: 'Silo 1', feed: 'Starter', pct: 72, tonnes: '12.4t', color: '#16a34a' },
    { label: 'Silo 2', feed: 'Starter', pct: 38, tonnes: '6.5t', color: '#ea580c' },
    { label: 'Silo 3', feed: 'Grower', pct: 55, tonnes: '9.4t', color: '#16a34a' },
  ];

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{ background: '#0b1f12' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.6 }}
    >
      <motion.div
        className="absolute bottom-0 left-0 right-0 h-[40%] pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(15,61,36,0.8), transparent)' }}
      />

      {/* Left text */}
      <div className="absolute left-[6%] top-1/2 -translate-y-1/2 z-20 flex flex-col w-[38%]">
        <motion.div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full font-black mb-4 self-start"
          style={{ background: '#1a5c36', color: 'var(--color-accent)', fontSize: 'clamp(10px, 1.4vw, 14px)', border: '1px solid rgba(201,162,39,0.3)' }}
          initial={{ opacity: 0, y: -10 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
        >
          🌾 DAILY SILO READING
        </motion.div>

        <motion.h2
          className="font-black text-white leading-none mb-3"
          style={{ fontSize: 'clamp(22px, 5vw, 60px)' }}
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ delay: 0.1 }}
        >
          FROM THE<br /><span style={{ color: 'var(--color-accent)' }}>SHED FLOOR</span>
        </motion.h2>

        <motion.p
          className="text-white/70 leading-snug mb-5"
          style={{ fontSize: 'clamp(11px, 1.8vw, 18px)' }}
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
        >
          Open Silo Base Mate, tap a silo, enter your reading. Feed on hand updates instantly across every bin.
        </motion.p>

        {/* Feed on hand total */}
        <motion.div
          className="rounded-2xl p-4"
          style={{ background: 'rgba(201,162,39,0.12)', border: '1.5px solid rgba(201,162,39,0.3)' }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={phase >= 5 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', damping: 18 }}
        >
          <div className="text-white/60 font-bold mb-1" style={{ fontSize: 'clamp(9px, 1.2vw, 12px)' }}>TOTAL FEED ON HAND</div>
          <div className="font-black" style={{ fontSize: 'clamp(20px, 4vw, 44px)', color: 'var(--color-accent)' }}>28.3t</div>
          <div className="text-white/50 mt-1" style={{ fontSize: 'clamp(9px, 1.1vw, 11px)' }}>Across 3 silos — Shed 1 & 2</div>
        </motion.div>
      </div>

      {/* Phone mockup */}
      <motion.div
        className="absolute right-[5%] top-1/2 -translate-y-1/2 z-20"
        style={{ width: 'clamp(150px, 26vw, 300px)' }}
        initial={{ opacity: 0, y: 40 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
        transition={{ type: 'spring', damping: 22 }}
      >
        <div
          className="relative rounded-[4vw] overflow-hidden"
          style={{
            aspectRatio: '9/19',
            background: '#0d1f13',
            border: '2px solid rgba(255,255,255,0.1)',
            boxShadow: '0 30px 80px rgba(0,0,0,0.7)',
          }}
        >
          <div className="absolute inset-0 p-3 flex flex-col" style={{ paddingTop: '8%' }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <span className="font-black text-white" style={{ fontSize: 'clamp(8px, 1.4vw, 13px)' }}>🌾 Silo Base Mate</span>
              <span className="text-green-400 font-bold" style={{ fontSize: 'clamp(7px, 1vw, 10px)' }}>● LIVE</span>
            </div>

            {/* Silo gauges */}
            <div className="flex gap-2 mb-4">
              {silos.map((silo, i) => (
                <div key={silo.label} className="flex-1 flex flex-col items-center gap-1">
                  {/* Gauge bar */}
                  <div className="w-full relative rounded-t-full overflow-hidden" style={{ height: 'clamp(40px, 8vw, 80px)', background: 'rgba(255,255,255,0.06)' }}>
                    <motion.div
                      className="absolute bottom-0 left-0 right-0 rounded-t-full"
                      style={{ background: silo.color }}
                      initial={{ height: '5%' }}
                      animate={phase >= 2 ? { height: `${silo.pct}%` } : { height: '5%' }}
                      transition={{ duration: 1.2, ease: 'easeOut', delay: i * 0.15 }}
                    />
                  </div>
                  <span style={{ fontSize: 'clamp(6px, 0.9vw, 9px)', color: 'rgba(255,255,255,0.5)' }}>{silo.label}</span>
                  <motion.span
                    className="font-black text-white"
                    style={{ fontSize: 'clamp(7px, 1vw, 10px)' }}
                    initial={{ opacity: 0 }}
                    animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
                    transition={{ delay: 0.8 + i * 0.1 }}
                  >
                    {silo.tonnes}
                  </motion.span>
                </div>
              ))}
            </div>

            {/* Reading entry */}
            <motion.div
              className="rounded-xl p-2.5 mb-3"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              initial={{ opacity: 0 }}
              animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
            >
              <div className="text-white/50 mb-1.5" style={{ fontSize: 'clamp(6px, 0.9vw, 9px)' }}>ADD READING — SILO 2</div>
              <motion.div
                className="flex items-center gap-2 rounded-lg p-2"
                style={{ background: phase >= 3 ? 'rgba(22,163,74,0.15)' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(22,163,74,0.3)' }}
                animate={phase >= 3 ? { borderColor: 'rgba(22,163,74,0.5)' } : {}}
              >
                <span className="font-black text-white" style={{ fontSize: 'clamp(9px, 1.4vw, 14px)' }}>
                  {phase >= 3 ? '6.5' : '___'}
                </span>
                <span className="text-white/50" style={{ fontSize: 'clamp(7px, 1vw, 10px)' }}>tonnes</span>
              </motion.div>
            </motion.div>

            {/* Save button */}
            <motion.div
              className="rounded-xl py-2 text-center font-black"
              style={{ background: phase >= 4 ? '#16a34a' : 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 'clamp(8px, 1.2vw, 12px)' }}
              animate={phase >= 4 ? { scale: [1, 1.06, 1] } : {}}
              transition={{ duration: 0.3 }}
            >
              {phase >= 4 ? '✓ Saved' : 'Save Reading'}
            </motion.div>

            {/* Low feed warning */}
            {phase >= 4 && (
              <motion.div
                className="mt-2 rounded-xl p-2 flex items-center gap-2"
                style={{ background: 'rgba(234,88,12,0.2)', border: '1px solid rgba(234,88,12,0.4)' }}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <span style={{ fontSize: 'clamp(10px, 1.5vw, 14px)' }}>⚠️</span>
                <span style={{ fontSize: 'clamp(6px, 0.9vw, 9px)', color: '#fb923c' }} className="font-bold">
                  Silo 2 low — order in 2 days
                </span>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
