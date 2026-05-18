import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ScreenCallout } from '../ScreenCallout';

const BASE = import.meta.env.BASE_URL;

const BULLETS = [
  'Enter weigh-in results — FCR and daily gain calculate instantly',
  'Density view shows when to start thinning your flock',
  'Flock Forecast projects weight and feed all the way to catch day',
];

export function Scene5() {
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
      style={{ background: '#0b1a10' }}
      initial={{ opacity: 0, scale: 1.03 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.55 }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 75% 30%, rgba(201,162,39,0.07) 0%, transparent 55%)' }} />

      {/* LEFT */}
      <div className="relative z-20 flex flex-col justify-center h-full pl-[5%] w-[38%] pr-4">
        <motion.div
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-black mb-4 self-start"
          style={{ background: 'rgba(201,162,39,0.12)', color: 'var(--color-accent)', border: '1px solid rgba(201,162,39,0.25)', fontSize: 'clamp(9px, 1.2vw, 13px)' }}
          initial={{ opacity: 0, y: -8 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
        >
          STEP 5 OF 6
        </motion.div>

        <motion.h2
          className="font-black text-white leading-none mb-4"
          style={{ fontSize: 'clamp(22px, 4.2vw, 52px)' }}
          initial={{ opacity: 0, y: 18 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
          transition={{ delay: 0.08 }}
        >
          WEIGHTS,<br /><span style={{ color: 'var(--color-accent)' }}>FCR & MORE</span>
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

        <div className="flex flex-col gap-2 mt-5">
          {[
            { label: 'Batch Results', icon: '📊', desc: 'FCR, avg weight, mortality' },
            { label: 'Flock Forecast', icon: '🔭', desc: 'Weight projection to catch day' },
            { label: 'Density View', icon: '📐', desc: 'When to thin your flock' },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              className="flex items-center gap-3 rounded-xl px-3 py-2"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              initial={{ opacity: 0, x: -10 }}
              animate={phase >= 4 ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
              transition={{ delay: i * 0.12 }}
            >
              <span style={{ fontSize: 'clamp(14px, 1.8vw, 18px)' }}>{item.icon}</span>
              <div>
                <div className="font-black text-white" style={{ fontSize: 'clamp(10px, 1.2vw, 13px)' }}>{item.label}</div>
                <div className="text-white/45" style={{ fontSize: 'clamp(8px, 1vw, 11px)' }}>{item.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* RIGHT */}
      <motion.div
        className="relative z-20 flex items-center justify-center h-full"
        style={{ width: '57%', paddingRight: '2%' }}
        initial={{ opacity: 0, x: 50 }}
        animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
        transition={{ type: 'spring', damping: 24, delay: 0.1 }}
      >
        <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl" style={{ border: '2px solid rgba(255,255,255,0.08)' }}>
          <img
            src={`${BASE}screen-feed-program.jpg`}
            alt="Advanced features"
            className="w-full h-auto block"
          />

          {/* Callout: Feed OK button */}
          <ScreenCallout top="0%" left="37%" width="18%" height="12%" label="Feed alert — OK or warning" labelSide="bottom" visible={phase === 3} color="#4ade80" />
          {/* Callout: Batch Results button */}
          <ScreenCallout top="12%" left="56%" width="14%" height="8%" label="Batch Results — FCR & weight" labelSide="bottom" visible={phase === 4} />
          {/* Callout: Flock Forecast */}
          <ScreenCallout top="12%" left="70.5%" width="13%" height="8%" label="Flock Forecast" labelSide="bottom" visible={phase === 4} color="#a78bfa" />
          {/* Callout: Density */}
          <ScreenCallout top="12%" left="84%" width="9%" height="8%" label="Density alerts" labelSide="left" visible={phase === 5} color="#f87171" />
          {/* Callout: Morts */}
          <ScreenCallout top="12%" left="78%" width="6.5%" height="8%" label="Morts" labelSide="bottom" visible={phase === 5} color="#fb923c" />
        </div>
      </motion.div>
    </motion.div>
  );
}
