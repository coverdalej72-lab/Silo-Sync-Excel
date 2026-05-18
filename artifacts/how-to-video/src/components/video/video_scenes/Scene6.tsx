import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2600),
      setTimeout(() => setPhase(4), 4600),
      setTimeout(() => setPhase(5), 7000),
      setTimeout(() => setPhase(6), 9000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const summaryRows = [
    { label: 'Placement Date',    value: '15 May 2026',  color: 'rgba(255,255,255,0.8)' },
    { label: 'Birds Placed',       value: '40,000',        color: 'rgba(255,255,255,0.8)' },
    { label: 'Days on Farm',       value: '42 days',       color: 'rgba(255,255,255,0.8)' },
    { label: 'Mortality',          value: '2.8% (1,120)',  color: '#f87171' },
    { label: 'Total Feed Used',    value: '152.4 t',       color: 'rgba(255,255,255,0.8)' },
    { label: 'FCR',                value: '1.58',          color: '#4ade80' },
    { label: 'Avg Live Weight',    value: '2.68 kg',       color: '#4ade80' },
  ];

  const catches = [
    { label: 'Catch 1', birds: '21,120 birds', trucks: '5 trucks', date: 'Day 40' },
    { label: 'Catch 2', birds: '17,760 birds', trucks: '4 trucks', date: 'Day 42' },
  ];

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{ background: 'var(--color-primary)' }}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7 }}
    >
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 60% 40%, rgba(201,162,39,0.08) 0%, transparent 60%)' }}
      />

      {/* Left label */}
      <div className="absolute left-[5%] top-1/2 -translate-y-1/2 z-20 flex flex-col w-[32%]">
        <motion.div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full font-black mb-4 self-start"
          style={{ background: 'rgba(201,162,39,0.15)', color: 'var(--color-accent)', border: '1px solid rgba(201,162,39,0.3)', fontSize: 'clamp(10px, 1.4vw, 14px)' }}
          initial={{ opacity: 0, y: -10 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
        >
          🏁 END OF BATCH
        </motion.div>

        <motion.h2
          className="font-black text-white leading-none mb-3"
          style={{ fontSize: 'clamp(22px, 4.5vw, 56px)' }}
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        >
          COMPLETE<br /><span style={{ color: 'var(--color-accent)' }}>SUMMARY</span>
        </motion.h2>

        <motion.p
          className="text-white/70 leading-snug mb-5"
          style={{ fontSize: 'clamp(11px, 1.7vw, 17px)' }}
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
        >
          Every number your processor needs — automatically compiled from your records.
        </motion.p>

        {/* Export badge */}
        <motion.div
          className="flex items-center gap-3 px-5 py-3 rounded-2xl"
          style={{ background: '#16a34a', boxShadow: '0 8px 30px rgba(22,163,74,0.35)' }}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={phase >= 6 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }}
          transition={{ type: 'spring', damping: 16 }}
        >
          <span style={{ fontSize: 'clamp(16px, 2.5vw, 24px)' }}>📤</span>
          <div>
            <div className="font-black text-white" style={{ fontSize: 'clamp(10px, 1.5vw, 15px)' }}>Export Ready</div>
            <div className="text-white/70" style={{ fontSize: 'clamp(8px, 1.1vw, 11px)' }}>CSV · PDF · Share</div>
          </div>
        </motion.div>
      </div>

      {/* Right: Summary card */}
      <motion.div
        className="absolute right-[4%] top-1/2 -translate-y-1/2 z-20"
        style={{ width: 'clamp(200px, 40vw, 480px)' }}
        initial={{ opacity: 0, x: 60, rotateY: 15 }}
        animate={phase >= 2 ? { opacity: 1, x: 0, rotateY: 0 } : { opacity: 0, x: 60, rotateY: 15 }}
        transition={{ type: 'spring', damping: 22 }}
      >
        <div
          className="rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: '#0f2718', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {/* Header */}
          <div
            className="px-5 py-4"
            style={{ background: 'linear-gradient(135deg, #1a5c36 0%, #0f3d24 100%)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="font-black text-white" style={{ fontSize: 'clamp(11px, 1.8vw, 18px)' }}>Batch Summary — Shed 1 & 2</div>
            <div className="text-white/50 mt-0.5" style={{ fontSize: 'clamp(8px, 1.1vw, 11px)' }}>Auto-compiled by Farm Buddy™</div>
          </div>

          {/* Summary rows */}
          <div className="p-4 flex flex-col gap-1.5">
            {summaryRows.map((row, i) => (
              <motion.div
                key={row.label}
                className="flex justify-between items-center px-3 py-2 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)' }}
                initial={{ opacity: 0, x: -10 }}
                animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
                transition={{ delay: i * 0.1 }}
              >
                <span className="text-white/50 font-medium" style={{ fontSize: 'clamp(8px, 1.1vw, 11px)' }}>{row.label}</span>
                <span className="font-black" style={{ fontSize: 'clamp(9px, 1.3vw, 13px)', color: row.color }}>{row.value}</span>
              </motion.div>
            ))}
          </div>

          {/* Catch breakdown */}
          <motion.div
            className="mx-4 mb-4 rounded-xl overflow-hidden"
            style={{ border: '1px solid rgba(201,162,39,0.2)' }}
            initial={{ opacity: 0, y: 10 }}
            animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          >
            <div className="px-3 py-2" style={{ background: 'rgba(201,162,39,0.1)', borderBottom: '1px solid rgba(201,162,39,0.15)' }}>
              <span className="font-black" style={{ fontSize: 'clamp(8px, 1.1vw, 11px)', color: 'var(--color-accent)' }}>🚛 CATCH PLAN</span>
            </div>
            {catches.map((c, i) => (
              <motion.div
                key={c.label}
                className="flex items-center justify-between px-3 py-2.5"
                style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
                initial={{ opacity: 0 }}
                animate={phase >= 5 ? { opacity: 1 } : { opacity: 0 }}
                transition={{ delay: i * 0.15 }}
              >
                <span className="font-black text-white" style={{ fontSize: 'clamp(8px, 1.1vw, 11px)' }}>{c.label}</span>
                <span className="text-white/60" style={{ fontSize: 'clamp(7px, 1vw, 10px)' }}>{c.birds}</span>
                <span className="text-white/60" style={{ fontSize: 'clamp(7px, 1vw, 10px)' }}>{c.trucks}</span>
                <span style={{ fontSize: 'clamp(7px, 1vw, 10px)', color: 'var(--color-accent)' }}>{c.date}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
