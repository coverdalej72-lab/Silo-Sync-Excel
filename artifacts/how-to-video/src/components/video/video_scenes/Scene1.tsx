import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 1500), // paper crumbles
      setTimeout(() => setPhase(3), 1800), // Red X
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      initial={{ clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ clipPath: 'circle(0% at 50% 50%)' }}
      transition={{ duration: 1, ease: [0.76, 0, 0.24, 1] }}
    >
      <div className="absolute inset-0 opacity-30 mix-blend-overlay">
        <img 
          src={`${import.meta.env.BASE_URL}shed-bg.png`} 
          alt="Shed Background" 
          className="w-full h-full object-cover" 
        />
      </div>

      <div className="relative z-20 flex flex-col items-center">
        <motion.h1 
          className="text-[8vw] font-display text-white uppercase tracking-wider text-shadow-heavy"
          initial={{ opacity: 0, y: 40, rotateX: -30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 40, rotateX: -30 }}
          transition={{ type: 'spring', damping: 20 }}
        >
          Still tracking on paper?
        </motion.h1>
      </div>

      {/* Paper Stack */}
      <motion.div 
        className="absolute top-1/2 left-1/2 w-[30vw] h-[40vw] -translate-x-1/2 -translate-y-1/2 z-10"
        initial={{ opacity: 0, scale: 0 }}
        animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
        transition={{ type: 'spring', damping: 15, delay: 0.5 }}
      >
        <motion.div 
          className="absolute inset-0 bg-white shadow-2xl rounded-sm border border-gray-200 p-8 flex flex-col gap-4"
          animate={phase >= 2 ? { rotate: -45, x: '-150vw', y: '50vh', opacity: 0 } : { rotate: -6, x: '-50%', y: '-50%' }}
          transition={{ duration: 0.8, ease: 'easeIn' }}
        >
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="mt-8 grid grid-cols-4 gap-2">
            {Array.from({length: 16}).map((_, i) => (
              <div key={i} className="h-8 border border-gray-300" />
            ))}
          </div>
        </motion.div>
        
        {/* Red X */}
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-red-500 font-display text-[40vw] leading-none"
          initial={{ scale: 0, opacity: 0, rotate: -20 }}
          animate={phase >= 3 ? { scale: 1, opacity: 1, rotate: 0 } : { scale: 0, opacity: 0, rotate: -20 }}
          transition={{ type: 'spring', stiffness: 500, damping: 15 }}
        >
          X
        </motion.div>
      </motion.div>
    </motion.div>
  );
}