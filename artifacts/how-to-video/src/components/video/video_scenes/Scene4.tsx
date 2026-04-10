import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sceneTransitions } from '@/lib/video';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 4500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center p-12 overflow-hidden"
      {...sceneTransitions.zoomThrough}>
      
      <motion.h2 
        className="absolute top-20 text-[4vw] font-bold text-white tracking-tight z-30"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <span className="text-emerald-400">Instant</span> sync.
      </motion.h2>

      <div className="flex items-center justify-center w-full h-full gap-20 mt-10">
        
        {/* Mobile Device (Left) */}
        <motion.div 
          className="w-[18vw] h-[36vw] bg-slate-900 rounded-3xl border-4 border-slate-800 relative shadow-2xl z-10"
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: "spring", damping: 20 }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div 
              className="w-16 h-16 bg-emerald-500 rounded-full"
              animate={phase >= 1 ? { scale: [1, 1.2, 1], opacity: [1, 0.8, 1] } : {}}
              transition={{ duration: 1, repeat: Infinity }}
            />
          </div>
        </motion.div>

        {/* Sync Animation */}
        <div className="relative w-40 h-20 flex items-center justify-center z-0">
          {phase >= 1 && (
            <motion.div 
              className="h-1 bg-emerald-400 absolute left-0 shadow-[0_0_15px_#34d399]"
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 0.8, ease: "easeInOut" }}
            />
          )}
          {phase >= 2 && (
            <motion.div 
              className="w-4 h-4 bg-white rounded-full absolute left-0 shadow-[0_0_20px_white]"
              initial={{ x: 0 }}
              animate={{ x: 160 }}
              transition={{ duration: 0.8, ease: "linear", repeat: Infinity }}
            />
          )}
        </div>

        {/* Desktop Device (Right) */}
        <motion.div 
          className="w-[36vw] h-[24vw] bg-slate-900 rounded-xl border-4 border-slate-800 relative shadow-2xl z-10 overflow-hidden"
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: "spring", damping: 20, delay: 0.2 }}
        >
          <div className="h-8 bg-slate-800 flex items-center px-4">
            <div className="flex gap-2"><div className="w-2 h-2 rounded-full bg-slate-600"/><div className="w-2 h-2 rounded-full bg-slate-600"/><div className="w-2 h-2 rounded-full bg-slate-600"/></div>
          </div>
          <div className="p-4 grid gap-2">
            {[1, 2, 3, 4].map((row, i) => (
              <div key={row} className="flex gap-2">
                <div className="h-6 flex-1 bg-slate-800 rounded"></div>
                <div className="h-6 flex-1 bg-slate-800 rounded"></div>
                <motion.div 
                  className="h-6 flex-1 bg-slate-800 rounded relative overflow-hidden"
                >
                  {phase >= 2 && i === 1 && (
                    <motion.div 
                      className="absolute inset-0 bg-emerald-500"
                      initial={{ x: "-100%" }}
                      animate={{ x: 0 }}
                      transition={{ duration: 0.5 }}
                    />
                  )}
                </motion.div>
              </div>
            ))}
          </div>
        </motion.div>

      </div>

    </motion.div>
  );
}