import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const BASE = import.meta.env.BASE_URL;

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300), // Text appears
      setTimeout(() => setPhase(2), 1500), // Paper stack drops
      setTimeout(() => setPhase(3), 2200), // Paper tossed away & X appears
      setTimeout(() => setPhase(4), 3200), // Exit drift
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-[var(--color-bg-dark)]"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 opacity-40 mix-blend-overlay pointer-events-none">
        <img 
          src={`${BASE}shed-bg.png`} 
          alt="Shed Background" 
          className="w-full h-full object-cover" 
        />
      </div>

      {/* Floating accent elements */}
      <motion.div 
        className="absolute top-[10%] left-[10%] w-[20vw] h-[20vw] bg-[var(--color-primary)] rounded-full mix-blend-screen filter blur-[80px] opacity-60"
        animate={{ x: [0, 50, 0], y: [0, -30, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div 
        className="absolute bottom-[10%] right-[10%] w-[30vw] h-[30vw] bg-[var(--color-accent)] rounded-full mix-blend-screen filter blur-[100px] opacity-30"
        animate={{ x: [0, -50, 0], y: [0, 50, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative z-20 flex flex-col items-center text-center px-8 w-full max-w-4xl mt-[-10vh]">
        <motion.h1 
          className="text-[7vw] md:text-[6vw] font-black text-white uppercase tracking-tight leading-[1.1] drop-shadow-2xl"
          initial={{ opacity: 0, y: 40, rotateX: -30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 40, rotateX: -30 }}
          transition={{ type: 'spring', damping: 20, stiffness: 200 }}
        >
          Still managing your shed on <span className="text-[var(--color-accent)]">paper?</span>
        </motion.h1>
      </div>

      {/* Paper Stack */}
      <motion.div 
        className="absolute top-[60%] left-1/2 w-[25vw] max-w-[300px] aspect-[3/4] z-10 origin-bottom"
        initial={{ opacity: 0, y: '-100vh', x: '-50%', rotate: 10 }}
        animate={
          phase >= 3 
            ? { opacity: 0, y: '50vh', x: '-150%', rotate: -60, scale: 0.5 } // Tossed away
            : phase >= 2 
            ? { opacity: 1, y: '-50%', x: '-50%', rotate: -5, scale: 1 } // Dropped in
            : { opacity: 0, y: '-100vh', x: '-50%', rotate: 10, scale: 1.2 }
        }
        transition={{ 
          type: phase >= 3 ? 'tween' : 'spring', 
          duration: phase >= 3 ? 0.6 : undefined,
          damping: 15, 
          stiffness: 150 
        }}
      >
        <div className="absolute inset-0 bg-white shadow-2xl rounded p-6 flex flex-col gap-3 transform -rotate-2">
          <div className="h-3 bg-gray-200 rounded w-1/2" />
          <div className="h-3 bg-gray-200 rounded w-full" />
          <div className="h-3 bg-gray-200 rounded w-3/4" />
          <div className="mt-4 grid grid-cols-4 gap-2 flex-1">
            {Array.from({length: 16}).map((_, i) => (
              <div key={i} className="h-6 border-b border-gray-300" />
            ))}
          </div>
        </div>
        <div className="absolute inset-0 bg-white shadow-xl rounded p-6 flex flex-col gap-3 transform rotate-3 origin-bottom-right">
          <div className="h-3 bg-gray-200 rounded w-2/3" />
          <div className="h-3 bg-gray-200 rounded w-full" />
          <div className="h-3 bg-gray-200 rounded w-4/5" />
          <div className="mt-4 grid grid-cols-4 gap-2 flex-1">
            {Array.from({length: 16}).map((_, i) => (
              <div key={i} className="h-6 border-b border-gray-300" />
            ))}
          </div>
        </div>
      </motion.div>

      {/* Red X over paper */}
      <motion.div
        className="absolute top-[60%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-red-500 font-black text-[30vw] md:text-[25vw] leading-none z-30 drop-shadow-[0_10px_20px_rgba(239,68,68,0.5)]"
        initial={{ scale: 0, opacity: 0, rotate: -20 }}
        animate={phase >= 3 ? { scale: 1, opacity: 1, rotate: 0 } : { scale: 0, opacity: 0, rotate: -20 }}
        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
      >
        X
      </motion.div>
    </motion.div>
  );
}