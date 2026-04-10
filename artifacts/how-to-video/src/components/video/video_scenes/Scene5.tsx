import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sceneTransitions } from '@/lib/video';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),
      setTimeout(() => setPhase(2), 2200),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center p-12"
      {...sceneTransitions.fadeBlur}
    >
      
      {/* Background Drone Video is in VideoTemplate, but we can darken here */}
      <div className="absolute inset-0 z-0 bg-[#0f3d24]/60 mix-blend-multiply" />

      {/* Final Logo Lockup */}
      <motion.div 
        className="absolute inset-0 flex flex-col items-center justify-center z-20"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 1.1 }}
        transition={{ duration: 1, ease: "easeOut" }}
      >
        <div className="flex flex-col items-center gap-2 mb-12">
           <motion.div 
             className="w-[10vw] h-[10vw] bg-[#C9A227] rounded-xl rotate-45 mb-4 shadow-[0_0_30px_rgba(201,162,39,0.3)] flex items-center justify-center"
             initial={{ scale: 0, rotate: 0 }}
             animate={{ scale: 1, rotate: 45 }}
             transition={{ type: "spring", duration: 1.5, delay: 0.5 }}
           >
             <div className="w-[5vw] h-[5vw] bg-[#0f3d24] rounded-lg" />
           </motion.div>
           <motion.h1 
             className="text-[6vw] font-display text-white uppercase tracking-widest leading-none drop-shadow-2xl"
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: 0.8, duration: 0.8 }}
           >
             Poultry Mate
           </motion.h1>
        </div>
        
        <div className="flex gap-4 text-[3vw] font-display text-[#C9A227] tracking-wider uppercase">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 20 }}
          >
            Every shed.
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 20, delay: 0.2 }}
          >
            Every batch.
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 20 }}
            className="text-white"
          >
            Always in control.
          </motion.span>
        </div>
        
        {/* Drift particles (gold) */}
        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
          {Array.from({ length: 30 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 rounded-full bg-[#C9A227]/40 blur-[1px]"
              style={{
                left: `${Math.random() * 100}%`,
                bottom: `-10%`,
              }}
              animate={{
                y: [0, -1000],
                x: [0, Math.random() * 200 - 100],
                opacity: [0, 0.8, 0],
              }}
              transition={{
                duration: Math.random() * 5 + 5,
                repeat: Infinity,
                delay: Math.random() * 5,
                ease: "linear",
              }}
            />
          ))}
        </div>
      </motion.div>

    </motion.div>
  );
}