import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ScreenCallout } from '../ScreenCallout';

const BASE = import.meta.env.BASE_URL;

const BULLETS = [
  'Every column updates as you enter silo readings each day',
  'See feed ordered, feed used, and feed on hand — all in one row',
  'Compare every shed side by side — nothing falls through the cracks',
];

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1800),
      setTimeout(() => setPhase(3), 5000),
      setTimeout(() => setPhase(4), 9000),
      setTimeout(() => setPhase(5), 13000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center overflow-hidden"
      style={{ background: 'var(--color-primary)' }}
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '-100%' }}
      transition={{ duration: 0.65, ease: [0.76, 0, 0.24, 1] }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 20% 80%, rgba(201,162,39,0.06) 0%, transparent 50%)' }} />

      {/* LEFT */}
      <div className="relative z-20 flex flex-col justify-center h-full pl-[5%] w-[38%] pr-4">
        <motion.div
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-black mb-4 self-start"
          style={{ background: 'rgba(201,162,39,0.15)', color: 'var(--color-accent)', border: '1px solid rgba(201,162,39,0.3)', fontSize: 'clamp(9px, 1.2vw, 13px)' }}
          initial={{ opacity: 0, y: -8 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
        >
          STEP 3 OF 5
        </motion.div>

        <motion.h2
          className="font-black text-white leading-none mb-4"
          style={{ fontSize: 'clamp(22px, 4.2vw, 52px)' }}
          initial={{ opacity: 0, y: 18 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
          transition={{ delay: 0.08 }}
        >
          ALWAYS<br /><span style={{ color: 'var(--color-accent)' }}>UP TO DATE</span>
        </motion.h2>

        <div className="flex flex-col gap-3">
          {BULLETS.map((b, i) => (
            <motion.div
              key={b}
              className="flex items-start gap-3"
              initial={{ opacity: 0, x: -14 }}
              animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -14 }}
              transition={{ delay: i * 0.18, type: 'spring', damping: 22 }}
            >
              <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center font-black text-[#0a2415]"
                style={{ background: 'var(--color-accent)', fontSize: 'clamp(8px, 1vw, 11px)' }}>✓</span>
              <span className="text-white/80 leading-snug" style={{ fontSize: 'clamp(11px, 1.5vw, 16px)' }}>{b}</span>
            </motion.div>
          ))}
        </div>

        <motion.div
          className="mt-6 rounded-2xl px-4 py-3"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
          initial={{ opacity: 0 }}
          animate={phase >= 5 ? { opacity: 1 } : { opacity: 0 }}
        >
          <div className="font-black text-white" style={{ fontSize: 'clamp(11px, 1.5vw, 16px)' }}>No spreadsheet skills needed.</div>
          <div className="text-white/50 mt-0.5" style={{ fontSize: 'clamp(9px, 1.2vw, 13px)' }}>Farm Buddy does all the maths for you.</div>
        </motion.div>
      </div>

      {/* RIGHT */}
      <motion.div
        className="relative z-20 flex items-center justify-center h-full"
        style={{ width: '57%', paddingRight: '2%' }}
        initial={{ opacity: 0, x: 50 }}
        animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
        transition={{ type: 'spring', damping: 24, delay: 0.1 }}
      >
        <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl" style={{ border: '2px solid rgba(255,255,255,0.1)' }}>
          <img
            src={`${BASE}screen-feed-program.jpg`}
            alt="Broiler Base Mate live program"
            className="w-full h-auto block"
          />

          {/* Callout: Feed summary row */}
          <ScreenCallout top="43%" left="0%" width="60%" height="8%" label="Total feed ordered this batch" labelSide="bottom" visible={phase === 3} />
          {/* Callout: kg/bird */}
          <ScreenCallout top="43%" left="60%" width="20%" height="8%" label="kg/bird — auto calculated" labelSide="bottom" visible={phase === 3} color="#4ade80" />
          {/* Callout: Column headers */}
          <ScreenCallout top="51%" left="33%" width="55%" height="10%" label="Feed ordered · Feed used · Feed on hand" labelSide="bottom" visible={phase === 4} />
          {/* Callout: Today's row */}
          <ScreenCallout top="82%" left="0%" width="100%" height="8%" label="Today — highlighted automatically every day" labelSide="top" visible={phase === 5} />
        </div>
      </motion.div>
    </motion.div>
  );
}
