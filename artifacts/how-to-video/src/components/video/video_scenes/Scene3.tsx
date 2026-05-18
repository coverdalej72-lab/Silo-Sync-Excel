import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ScreenCallout } from '../ScreenCallout';

const BASE = import.meta.env.BASE_URL;

const BULLETS = [
  'Open the app from the shed floor — works on any phone',
  'Type how many tonnes in each silo — A, B and C',
  'Tap Save All Readings — every shed recorded in 30 seconds',
];

export function Scene3() {
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
      style={{ background: '#0b1f12' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.55 }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 30% 60%, rgba(15,61,36,0.8) 0%, transparent 60%)' }} />

      {/* LEFT */}
      <div className="relative z-20 flex flex-col justify-center h-full pl-[5%] w-[38%] pr-4">
        <motion.div
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-black mb-4 self-start"
          style={{ background: 'rgba(201,162,39,0.12)', color: 'var(--color-accent)', border: '1px solid rgba(201,162,39,0.25)', fontSize: 'clamp(9px, 1.2vw, 13px)' }}
          initial={{ opacity: 0, y: -8 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
        >
          STEP 3 OF 6
        </motion.div>

        <motion.h2
          className="font-black text-white leading-none mb-4"
          style={{ fontSize: 'clamp(22px, 4.2vw, 52px)' }}
          initial={{ opacity: 0, y: 18 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
          transition={{ delay: 0.08 }}
        >
          DAILY SILO<br /><span style={{ color: 'var(--color-accent)' }}>READINGS</span>
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
          className="mt-6 rounded-2xl px-4 py-3 flex items-center gap-3"
          style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)' }}
          initial={{ opacity: 0 }}
          animate={phase >= 5 ? { opacity: 1 } : { opacity: 0 }}
        >
          <span style={{ fontSize: 'clamp(18px, 2.5vw, 26px)' }}>⚠️</span>
          <div>
            <div className="text-orange-400 font-black" style={{ fontSize: 'clamp(10px, 1.3vw, 14px)' }}>Low feed alert fires automatically</div>
            <div className="text-white/50" style={{ fontSize: 'clamp(9px, 1.1vw, 12px)' }}>Farm Buddy warns you before you run out</div>
          </div>
        </motion.div>
      </div>

      {/* RIGHT — screenshot with callouts */}
      <motion.div
        className="relative z-20 flex items-center justify-center h-full"
        style={{ width: '57%', paddingRight: '2%' }}
        initial={{ opacity: 0, x: 50 }}
        animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
        transition={{ type: 'spring', damping: 24, delay: 0.1 }}
      >
        <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl" style={{ border: '2px solid rgba(255,255,255,0.08)' }}>
          <img
            src={`${BASE}screen-silo-dashboard.jpg`}
            alt="Silo Base Mate"
            className="w-full h-auto block"
          />

          {/* Callout: Farm name header */}
          <ScreenCallout top="0%" left="0%" width="40%" height="13%" label="Your farm name" labelSide="bottom" visible={phase === 3} />
          {/* Callout: Today date */}
          <ScreenCallout top="0%" left="72%" width="28%" height="13%" label="Today's date — auto-set" labelSide="bottom" visible={phase === 3} />
          {/* Callout: Shed 1&2 card */}
          <ScreenCallout top="17%" left="0%" width="33%" height="40%" label="Each shed's silos" labelSide="right" visible={phase === 4} />
          {/* Callout: Silo A/B/C inputs */}
          <ScreenCallout top="35%" left="1%" width="31%" height="25%" label="Silo A, B and C — type the tonnes" labelSide="right" visible={phase === 4} color="#4ade80" />
          {/* Callout: Save All Readings */}
          <ScreenCallout top="85%" left="0%" width="100%" height="13%" label="One tap — all sheds saved at once" labelSide="top" visible={phase === 5} />
        </div>
      </motion.div>
    </motion.div>
  );
}
