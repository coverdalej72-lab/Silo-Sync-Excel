import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ScreenCallout } from '../ScreenCallout';

const BASE = import.meta.env.BASE_URL;

const BULLETS = [
  'Paste your GeniusFOM spreadsheet — every shed appears instantly',
  'Placement date, bird numbers and feed targets all load automatically',
  'No typing required — your whole batch program is ready in seconds',
];

export function Scene2() {
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
      initial={{ clipPath: 'polygon(100% 0, 100% 0, 100% 100%, 100% 100%)' }}
      animate={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }}
      exit={{ clipPath: 'polygon(0 0, 0 0, 0 100%, 0 100%)' }}
      transition={{ duration: 0.65, ease: [0.76, 0, 0.24, 1] }}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 70% 40%, rgba(201,162,39,0.07) 0%, transparent 55%)' }} />

      {/* LEFT — text */}
      <div className="relative z-20 flex flex-col justify-center h-full pl-[5%] w-[38%] pr-4">
        <motion.div
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-black mb-4 self-start"
          style={{ background: 'rgba(201,162,39,0.15)', color: 'var(--color-accent)', border: '1px solid rgba(201,162,39,0.3)', fontSize: 'clamp(9px, 1.2vw, 13px)' }}
          initial={{ opacity: 0, y: -8 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
        >
          STEP 1 OF 5
        </motion.div>

        <motion.h2
          className="font-black text-white leading-none mb-4"
          style={{ fontSize: 'clamp(22px, 4.2vw, 52px)' }}
          initial={{ opacity: 0, y: 18 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
          transition={{ delay: 0.08 }}
        >
          YOUR FEED<br /><span style={{ color: 'var(--color-accent)' }}>PROGRAM</span>
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
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          initial={{ opacity: 0 }}
          animate={phase >= 5 ? { opacity: 1 } : { opacity: 0 }}
        >
          <div className="text-white/40 font-bold mb-0.5" style={{ fontSize: 'clamp(8px, 1vw, 10px)' }}>BROILER BASE MATE</div>
          <div className="font-black text-white" style={{ fontSize: 'clamp(12px, 1.6vw, 17px)' }}>6 sheds · Auto-calculated · Always live</div>
        </motion.div>
      </div>

      {/* RIGHT — real screenshot with callouts */}
      <motion.div
        className="relative z-20 flex items-center justify-center h-full"
        style={{ width: '57%', paddingRight: '2%' }}
        initial={{ opacity: 0, x: 50, rotateY: -8 }}
        animate={phase >= 1 ? { opacity: 1, x: 0, rotateY: 0 } : { opacity: 0, x: 50, rotateY: -8 }}
        transition={{ type: 'spring', damping: 24, delay: 0.1 }}
      >
        <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl" style={{ border: '2px solid rgba(255,255,255,0.1)' }}>
          <img
            src={`${BASE}screen-feed-program.jpg`}
            alt="Broiler Base Mate"
            className="w-full h-auto block"
          />

          {/* Callout: Shed tabs */}
          <ScreenCallout top="12%" left="0%" width="62%" height="8%" label="All your sheds" labelSide="bottom" visible={phase === 3} />
          {/* Callout: Paste GeniusFOM button */}
          <ScreenCallout top="12%" left="85%" width="14%" height="8%" label="Paste your spreadsheet here" labelSide="left" visible={phase === 3} color="#4ade80" />
          {/* Callout: Placement date */}
          <ScreenCallout top="31%" left="10%" width="28%" height="9%" label="Placement date" labelSide="right" visible={phase === 4} />
          {/* Callout: Total birds */}
          <ScreenCallout top="30%" left="76%" width="22%" height="11%" label="Total birds per shed" labelSide="left" visible={phase === 4} />
          {/* Callout: Today's row */}
          <ScreenCallout top="82%" left="0%" width="100%" height="8%" label="Today's row — always highlighted automatically" labelSide="top" visible={phase === 5} />
          {/* Callout: Feed on hand */}
          <ScreenCallout top="50%" left="55%" width="10%" height="38%" label="Feed on hand, live" labelSide="right" visible={phase === 5} />
        </div>
      </motion.div>
    </motion.div>
  );
}
