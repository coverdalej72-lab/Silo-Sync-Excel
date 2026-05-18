import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const BASE = import.meta.env.BASE_URL;

const PROBLEMS = [
  { icon: '📋', text: 'Paper dockets scattered everywhere' },
  { icon: '🔢', text: 'Manually working out tonnes and FCR' },
  { icon: '📞', text: 'Ringing around to check silo levels' },
  { icon: '⏰', text: 'Scrambling at end of batch for numbers' },
];

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2200),
      setTimeout(() => setPhase(4), 4000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: '#060d08' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0">
        <img src={`${BASE}shed-bg.png`} alt="" className="w-full h-full object-cover" style={{ opacity: 0.18 }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(6,13,8,0.55) 0%, rgba(6,13,8,0.35) 50%, rgba(6,13,8,0.8) 100%)' }} />
      </div>

      <div className="relative z-20 flex flex-col items-center text-center px-8 w-full max-w-3xl">

        <motion.div
          className="font-black text-white mb-4"
          style={{ fontSize: 'clamp(26px, 5.5vw, 64px)', lineHeight: 1.1, textShadow: '0 4px 24px rgba(0,0,0,0.7)' }}
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ type: 'spring', damping: 22 }}
        >
          Still running your sheds<br />
          <span style={{ color: 'var(--color-accent)' }}>on paper?</span>
        </motion.div>

        <div className="grid grid-cols-2 gap-3 w-full max-w-xl mt-2">
          {PROBLEMS.map((p, i) => (
            <motion.div
              key={p.text}
              className="flex items-center gap-3 rounded-2xl px-4 py-3 text-left"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}
              initial={{ opacity: 0, y: 16 }}
              animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              transition={{ delay: i * 0.1, type: 'spring', damping: 22 }}
            >
              <span style={{ fontSize: 'clamp(16px, 2.2vw, 22px)' }}>{p.icon}</span>
              <span className="text-white/75 font-medium leading-snug" style={{ fontSize: 'clamp(11px, 1.5vw, 15px)' }}>{p.text}</span>
            </motion.div>
          ))}
        </div>

        <motion.div
          className="mt-7 font-black text-[#0a2415] rounded-2xl px-10 py-4"
          style={{
            background: 'var(--color-accent)',
            fontSize: 'clamp(14px, 2.2vw, 22px)',
            boxShadow: '0 12px 50px rgba(201,162,39,0.45)',
          }}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={phase >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }}
          transition={{ type: 'spring', damping: 18 }}
        >
          There's a better way. Here's how Farm Buddy works.
        </motion.div>

        <motion.div
          className="mt-4 text-white/40 font-medium"
          style={{ fontSize: 'clamp(10px, 1.3vw, 14px)' }}
          initial={{ opacity: 0 }}
          animate={phase >= 4 ? { opacity: 1 } : { opacity: 0 }}
        >
          Works on any phone or tablet · No app store needed
        </motion.div>
      </div>
    </motion.div>
  );
}
