import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const BASE = import.meta.env.BASE_URL;

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1400),
      setTimeout(() => setPhase(3), 2600),
      setTimeout(() => setPhase(4), 3800),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const problems = ['Chasing paper records', 'No feed visibility', 'Missing delivery dockets', 'Scrambling at end of batch'];

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: '#080f0a' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.6 }}
    >
      {/* Shed background */}
      <div className="absolute inset-0">
        <img src={`${BASE}shed-bg.png`} alt="" className="w-full h-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80" />
      </div>

      {/* Floating glow */}
      <motion.div
        className="absolute w-[50vw] h-[50vw] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(201,162,39,0.15) 0%, transparent 70%)', top: '10%', left: '25%' }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 4, repeat: Infinity }}
      />

      <div className="relative z-20 flex flex-col items-center text-center px-8 w-full max-w-4xl">

        {/* Hook headline */}
        <motion.h1
          className="font-black text-white leading-tight mb-6"
          style={{ fontSize: 'clamp(28px, 6vw, 72px)', textShadow: '0 4px 20px rgba(0,0,0,0.8)' }}
          initial={{ opacity: 0, y: 40 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ type: 'spring', damping: 22, stiffness: 180 }}
        >
          Still running your sheds<br />
          <span style={{ color: 'var(--color-accent)' }}>on paper?</span>
        </motion.h1>

        {/* Problem list */}
        <div className="flex flex-col gap-3 w-full max-w-md">
          {problems.map((p, i) => (
            <motion.div
              key={p}
              className="flex items-center gap-3 px-5 py-3 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
              initial={{ opacity: 0, x: -30 }}
              animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
              transition={{ delay: i * 0.12, type: 'spring', damping: 20 }}
            >
              <span className="text-red-400 font-black text-lg">✕</span>
              <span className="text-white/80 font-medium" style={{ fontSize: 'clamp(12px, 2vw, 18px)' }}>{p}</span>
            </motion.div>
          ))}
        </div>

        {/* Solution tease */}
        <motion.div
          className="mt-8 px-8 py-4 rounded-2xl font-black text-[#0a2415]"
          style={{
            background: 'var(--color-accent)',
            fontSize: 'clamp(14px, 2.5vw, 24px)',
            boxShadow: '0 8px 40px rgba(201,162,39,0.4)',
          }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={phase >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
          transition={{ type: 'spring', damping: 18, stiffness: 200 }}
        >
          Farm Buddy™ fixes all of this.
        </motion.div>
      </div>
    </motion.div>
  );
}
