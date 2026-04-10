import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sceneTransitions } from '@/lib/video';
import screenshotFeedProgram from '../../../../../silo-mate-plans/public/screenshot-feed-program.jpg';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 5500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center p-12 overflow-hidden"
      {...sceneTransitions.slideUp}>
      
      <div className="absolute top-16 left-16 z-20">
        <motion.div 
          className="inline-block px-4 py-2 bg-emerald-500/20 border border-emerald-500/40 rounded-full mb-4"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="text-emerald-400 font-medium tracking-wide uppercase text-sm">The Solution</span>
        </motion.div>
        <motion.h2 
          className="text-[4vw] font-bold text-white leading-none"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          Meet the Feed Program
        </motion.h2>
        <motion.p
          className="text-[1.5vw] text-slate-300 mt-4 max-w-[30vw]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          A browser-based spreadsheet for tracking feed, silos, and batch results across multiple sheds.
        </motion.p>
      </div>

      <motion.div 
        className="absolute -right-[10vw] top-[20vh] w-[70vw] h-[45vw] rounded-2xl overflow-hidden shadow-2xl shadow-emerald-900/50 border border-white/10"
        initial={{ opacity: 0, x: 100, rotateY: 15, transformPerspective: 1000 }}
        animate={phase >= 1 ? { opacity: 1, x: 0, rotateY: -5 } : { opacity: 0, x: 100, rotateY: 15 }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
      >
        <img src={screenshotFeedProgram} alt="Feed Program Interface" className="w-full h-full object-cover object-left-top" />
      </motion.div>

    </motion.div>
  );
}