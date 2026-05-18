import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const BASE = import.meta.env.BASE_URL;

export function Scene7() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1800),
      setTimeout(() => setPhase(3), 3200),
      setTimeout(() => setPhase(4), 5200),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: '#060d08' }}
      initial={{ clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.1, ease: [0.76, 0, 0.24, 1] }}
    >
      {/* Aerial background */}
      <div className="absolute inset-0 z-0">
        <video
          src={`${BASE}farm-aerial.mp4`}
          className="w-full h-full object-cover"
          style={{ opacity: 0.22, mixBlendMode: 'screen' }}
          autoPlay loop muted playsInline
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(6,13,8,0.6), rgba(15,61,36,0.5), rgba(6,13,8,0.75))' }} />
      </div>

      {/* Radial glow */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{ width: '70vw', height: '70vw', background: 'radial-gradient(circle, rgba(201,162,39,0.1) 0%, transparent 70%)', top: '15%', left: '15%' }}
        animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 5, repeat: Infinity }}
      />

      <div className="relative z-20 flex flex-col items-center text-center px-8 w-full max-w-3xl">

        {/* Tag line */}
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 mb-8">
          {['Every shed.', 'Every batch.', 'Every day.'].map((word, i) => (
            <motion.span
              key={word}
              className="font-black text-white uppercase tracking-wide"
              style={{ fontSize: 'clamp(16px, 3.2vw, 40px)', textShadow: '0 2px 16px rgba(0,0,0,0.7)' }}
              initial={{ opacity: 0, y: 14 }}
              animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
              transition={{ delay: i * 0.14, type: 'spring', damping: 22 }}
            >
              {i < 2 ? word : <span style={{ color: 'var(--color-accent)' }}>{word}</span>}
            </motion.span>
          ))}
        </div>

        {/* Logo */}
        <motion.div
          className="flex flex-col items-center mb-8"
          initial={{ scale: 0, opacity: 0 }}
          animate={phase >= 2 ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
          transition={{ type: 'spring', damping: 18, stiffness: 130 }}
        >
          <img
            src={`${BASE}logo.png`}
            alt="Farm Buddy"
            style={{ height: 'clamp(55px, 9vw, 110px)', width: 'auto', filter: 'drop-shadow(0 8px 30px rgba(0,0,0,0.7))' }}
          />
          <div
            className="mt-2 font-black text-white uppercase tracking-widest"
            style={{ fontSize: 'clamp(20px, 3.5vw, 42px)', textShadow: '0 4px 20px rgba(0,0,0,0.8)' }}
          >
            Farm Buddy™
          </div>
          <div className="font-semibold text-white/40 uppercase tracking-widest mt-1" style={{ fontSize: 'clamp(9px, 1.3vw, 14px)' }}>
            by Appcovi
          </div>
        </motion.div>

        {/* CTA + URL */}
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 20 }}
        >
          <motion.div
            className="font-black text-[#0a2415] px-10 py-4 rounded-full uppercase tracking-wide"
            style={{
              background: 'var(--color-accent)',
              fontSize: 'clamp(13px, 2vw, 22px)',
              boxShadow: '0 12px 40px rgba(201,162,39,0.45)',
            }}
            animate={phase >= 3 ? { boxShadow: ['0 12px 40px rgba(201,162,39,0.35)', '0 12px 60px rgba(201,162,39,0.65)', '0 12px 40px rgba(201,162,39,0.35)'] } : {}}
            transition={{ duration: 2, repeat: Infinity }}
          >
            Get Started Free Today
          </motion.div>

          <motion.div
            className="font-bold tracking-widest uppercase"
            style={{ fontSize: 'clamp(12px, 1.8vw, 20px)', color: 'var(--color-accent)', textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}
            initial={{ opacity: 0 }}
            animate={phase >= 4 ? { opacity: 1 } : { opacity: 0 }}
          >
            farmbuddy.com.au
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
