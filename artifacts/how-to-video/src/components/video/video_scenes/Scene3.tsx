import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sceneTransitions } from '@/lib/video';
import screenshotSiloMate from '../../../../../silo-mate-plans/public/screenshot-silo-mate.jpg';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 4500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 flex items-center justify-center p-12 overflow-hidden bg-emerald-950"
      {...sceneTransitions.clipPolygon}>
      
      <div className="w-1/2 h-full flex flex-col justify-center pl-12 z-20">
        <motion.h2 
          className="text-[5vw] font-bold text-white leading-none mb-6"
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
        >
          Silo Mate <br/>
          <span className="text-emerald-400">goes mobile.</span>
        </motion.h2>
        
        <motion.div className="space-y-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/50">
              <div className="w-4 h-4 bg-emerald-400 rounded-full"></div>
            </div>
            <p className="text-[1.5vw] text-slate-200">Record silo readings in the shed</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/50">
              <div className="w-4 h-4 bg-emerald-400 rounded-sm"></div>
            </div>
            <p className="text-[1.5vw] text-slate-200">Scan delivery dockets instantly</p>
          </div>
        </motion.div>
      </div>

      <div className="w-1/2 h-full flex items-center justify-center relative">
        <motion.div 
          className="w-[22vw] h-[45vw] bg-slate-900 rounded-[3vw] border-[0.5vw] border-slate-800 shadow-2xl relative overflow-hidden"
          initial={{ y: 100, opacity: 0, rotate: 10 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.3 }}
        >
          <img src={screenshotSiloMate} alt="Silo Mate App" className="w-full h-full object-cover" />

          {/* Scan UI Pop */}
          <motion.div 
            className="absolute bottom-8 left-1/2 -translate-x-1/2 w-16 h-16 bg-emerald-500 rounded-full shadow-lg shadow-emerald-500/50 border-4 border-slate-900"
            initial={{ scale: 0 }}
            animate={phase >= 2 ? { scale: 1 } : { scale: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
          />
        </motion.div>
      </div>

    </motion.div>
  );
}