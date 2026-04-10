import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sceneTransitions } from '@/lib/video';
import logoPng from '@assets/generated_images/poultry-mate-logo-white.png';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),
      setTimeout(() => setPhase(2), 2500),
      setTimeout(() => setPhase(3), 4000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center p-12 bg-[#022C22]"
      {...sceneTransitions.morphExpand}>
      
      {/* Background radial highlight */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.15)_0%,transparent_60%)]"></div>

      {phase < 2 && (
        <div className="flex flex-col items-center justify-center absolute inset-0 z-10">
          <motion.div className="flex gap-8 mb-12">
            <motion.div 
              className="bg-emerald-900/40 border border-emerald-500/30 p-8 rounded-2xl backdrop-blur-md flex flex-col items-center"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", delay: 0.2 }}
            >
              <span className="text-slate-400 text-[1.2vw] uppercase tracking-wider mb-2">Batch FCR</span>
              <span className="text-[3vw] font-bold text-white">1.42</span>
            </motion.div>
            
            <motion.div 
              className="bg-emerald-900/40 border border-emerald-500/30 p-8 rounded-2xl backdrop-blur-md flex flex-col items-center"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", delay: 0.4 }}
            >
              <span className="text-slate-400 text-[1.2vw] uppercase tracking-wider mb-2">Liveability</span>
              <span className="text-[3vw] font-bold text-white">96.8%</span>
            </motion.div>
          </motion.div>
          
          <motion.h2 
            className="text-[3vw] text-emerald-300 font-medium tracking-tight"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.8 }}
          >
            End-of-batch reporting made easy.
          </motion.h2>
        </div>
      )}

      {/* Final Logo Lockup */}
      <motion.div 
        className="absolute inset-0 flex flex-col items-center justify-center z-20"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9, pointerEvents: 'none' }}
        transition={{ duration: 1, ease: "easeOut" }}
      >
        <img src={logoPng} alt="Poultry Mate Logo" className="w-[30vw] max-w-[400px] mb-8 drop-shadow-2xl" />
        
        <div className="flex gap-4 text-[2vw] font-medium text-white tracking-wide">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.2 }}
          >
            Every shed.
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.4 }}
            className="text-emerald-400"
          >
            Every batch.
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.6 }}
          >
            Always in control.
          </motion.span>
        </div>
      </motion.div>

    </motion.div>
  );
}