import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ScreenCallout } from '../ScreenCallout';

const BASE = import.meta.env.BASE_URL;

const SUMMARY_ITEMS = [
  { label: 'Placement Date', value: '20 March 2026', color: 'rgba(255,255,255,0.85)' },
  { label: 'Birds Placed',   value: '80,000',         color: 'rgba(255,255,255,0.85)' },
  { label: 'Days on Farm',   value: '60 days',         color: 'rgba(255,255,255,0.85)' },
  { label: 'Total Feed Used',value: '138,000 kg',      color: '#4ade80' },
  { label: 'FCR',            value: '1.725',           color: '#4ade80' },
  { label: 'Total Morts',    value: 'Tracked',         color: '#f87171' },
  { label: 'Birds Caught',   value: 'Full breakdown',  color: 'var(--color-accent)' },
];

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 5000),
      setTimeout(() => setPhase(4), 9500),
      setTimeout(() => setPhase(5), 13500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center overflow-hidden"
      style={{ background: 'var(--color-primary)' }}
      initial={{ clipPath: 'polygon(100% 0, 100% 0, 100% 100%, 100% 100%)' }}
      animate={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.65, ease: [0.76, 0, 0.24, 1] }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 65% 50%, rgba(201,162,39,0.08) 0%, transparent 55%)' }} />

      {/* LEFT */}
      <div className="relative z-20 flex flex-col justify-center h-full pl-[5%] w-[38%] pr-4">
        <motion.div
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-black mb-4 self-start"
          style={{ background: 'rgba(201,162,39,0.15)', color: 'var(--color-accent)', border: '1px solid rgba(201,162,39,0.3)', fontSize: 'clamp(9px, 1.2vw, 13px)' }}
          initial={{ opacity: 0, y: -8 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
        >
          STEP 6 OF 6
        </motion.div>

        <motion.h2
          className="font-black text-white leading-none mb-4"
          style={{ fontSize: 'clamp(22px, 4.2vw, 52px)' }}
          initial={{ opacity: 0, y: 18 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
        >
          END OF<br /><span style={{ color: 'var(--color-accent)' }}>BATCH</span>
        </motion.h2>

        {/* Summary card */}
        <motion.div
          className="rounded-2xl overflow-hidden shadow-xl"
          style={{ background: '#0f2718', border: '1px solid rgba(255,255,255,0.08)' }}
          initial={{ opacity: 0, y: 14 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          transition={{ type: 'spring', damping: 22 }}
        >
          <div className="px-4 py-3" style={{ background: 'rgba(201,162,39,0.12)', borderBottom: '1px solid rgba(201,162,39,0.15)' }}>
            <span className="font-black" style={{ fontSize: 'clamp(9px, 1.2vw, 13px)', color: 'var(--color-accent)' }}>BATCH SUMMARY — AUTO COMPILED</span>
          </div>
          <div className="px-4 py-2 flex flex-col gap-1.5">
            {SUMMARY_ITEMS.map((item, i) => (
              <motion.div
                key={item.label}
                className="flex justify-between items-center py-1 border-b"
                style={{ borderColor: 'rgba(255,255,255,0.05)' }}
                initial={{ opacity: 0, x: -8 }}
                animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
                transition={{ delay: i * 0.09 }}
              >
                <span className="text-white/45 font-medium" style={{ fontSize: 'clamp(8px, 1vw, 11px)' }}>{item.label}</span>
                <span className="font-black" style={{ fontSize: 'clamp(9px, 1.1vw, 12px)', color: item.color }}>{item.value}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          className="mt-4 flex items-center gap-3 rounded-2xl px-4 py-3"
          style={{ background: '#16a34a', boxShadow: '0 8px 30px rgba(22,163,74,0.3)' }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={phase >= 5 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', damping: 18 }}
        >
          <span style={{ fontSize: 'clamp(18px, 2vw, 22px)' }}>📤</span>
          <div>
            <div className="font-black text-white" style={{ fontSize: 'clamp(11px, 1.4vw, 15px)' }}>Export in one tap</div>
            <div className="text-white/70" style={{ fontSize: 'clamp(9px, 1.1vw, 12px)' }}>CSV ready to send to your processor</div>
          </div>
        </motion.div>
      </div>

      {/* RIGHT */}
      <motion.div
        className="relative z-20 flex items-center justify-center h-full"
        style={{ width: '57%', paddingRight: '2%' }}
        initial={{ opacity: 0, x: 60, rotateY: -10 }}
        animate={phase >= 1 ? { opacity: 1, x: 0, rotateY: 0 } : { opacity: 0, x: 60, rotateY: -10 }}
        transition={{ type: 'spring', damping: 24, delay: 0.12 }}
      >
        <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl" style={{ border: '2px solid rgba(255,255,255,0.1)' }}>
          <img
            src={`${BASE}screen-feed-batch.jpg`}
            alt="End of batch"
            className="w-full h-auto block"
          />

          {/* Callout: End of batch button */}
          <ScreenCallout top="12%" left="31%" width="14%" height="8%" label="Tap End of Batch" labelSide="bottom" visible={phase === 3} color="#4ade80" />
          {/* Callout: Shed header with placement date */}
          <ScreenCallout top="29%" left="0%" width="55%" height="12%" label="Shed — placement date auto-shown" labelSide="bottom" visible={phase === 4} />
          {/* Callout: Total birds */}
          <ScreenCallout top="29%" left="73%" width="26%" height="12%" label="Total birds placed" labelSide="bottom" visible={phase === 4} />
          {/* Callout: Feed summary row */}
          <ScreenCallout top="42%" left="0%" width="55%" height="9%" label="Total feed ordered · kg/bird" labelSide="bottom" visible={phase === 4} />
          {/* Callout: Total morts at bottom */}
          <ScreenCallout top="82%" left="0%" width="60%" height="9%" label="Total morts — auto-totalled" labelSide="top" visible={phase === 5} color="#f87171" />
          {/* Callout: Birds caught */}
          <ScreenCallout top="89%" left="0%" width="70%" height="9%" label="Total birds caught" labelSide="top" visible={phase === 5} color="#4ade80" />
        </div>
      </motion.div>
    </motion.div>
  );
}
