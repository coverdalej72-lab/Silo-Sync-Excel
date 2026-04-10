import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sceneTransitions } from '@/lib/video';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 3500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center p-12"
      {...sceneTransitions.fadeBlur}>
      
      <div className="relative z-10 flex flex-col items-center">
        <motion.h1 
          className="text-[6vw] font-black text-white leading-tight tracking-tight text-center"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          Still on <span className="text-[#94A3B8] italic font-serif">paper?</span>
        </motion.h1>

        <motion.h1 
          className="text-[6vw] font-black text-white leading-tight tracking-tight text-center"
          initial={{ opacity: 0, y: 40 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          Still on <span className="text-[#10B981]">Excel?</span>
        </motion.h1>
      </div>

      {/* Floating abstract paper/grid shapes in background */}
      <motion.div 
        className="absolute w-[40vw] h-[30vw] border-2 border-white/5 rounded-xl rotate-12 bg-white/5 backdrop-blur-sm"
        initial={{ opacity: 0, scale: 0.8, rotate: 0 }}
        animate={{ opacity: 1, scale: 1, rotate: 12 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
      />
      
      <motion.div 
        className="absolute w-[35vw] h-[25vw] border border-emerald-500/20 rounded-xl -rotate-6 bg-emerald-900/20 backdrop-blur-md"
        initial={{ opacity: 0, scale: 0.8, x: -100 }}
        animate={phase >= 1 ? { opacity: 1, scale: 1, x: -50, rotate: -6 } : { opacity: 0, scale: 0.8, x: -100 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
      />

    </motion.div>
  );
}