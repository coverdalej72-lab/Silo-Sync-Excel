import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sceneTransitions } from '@/lib/video';

const BASE = import.meta.env.BASE_URL;
const screenshotFeedProgram = `${BASE}screenshot-feed-program.jpg`;

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 4000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 flex items-center justify-center overflow-hidden"
      {...sceneTransitions.morphExpand}>
      
      {/* Background styling */}
      <motion.div className="absolute inset-0 bg-[#1a5c36]" 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      />

      {/* Midground: Floating elements to frame UI */}
      <motion.div 
        className="absolute top-0 right-0 w-[50vw] h-[50vw] bg-[#0f3d24] rounded-full mix-blend-multiply filter blur-3xl opacity-50"
        animate={{ x: [100, -50, 0], y: [-100, 50, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      
      {/* Product UI */}
      <motion.div 
        className="absolute top-[25%] left-[5%] w-[65vw] rounded-xl overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.5)] border border-white/10 z-10"
        initial={{ opacity: 0, x: -100, rotateY: 20, rotateX: 10, scale: 0.8 }}
        animate={phase >= 3 ? { x: -100, opacity: 0, scale: 0.9 } : phase >= 1 ? { opacity: 1, x: 0, rotateY: 5, rotateX: 5, scale: 1 } : { opacity: 0, x: -100, rotateY: 20, rotateX: 10, scale: 0.8 }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
      >
        <img src={screenshotFeedProgram} className="w-full h-auto" alt="Desktop UI" />
        
        {/* Animated highlight overlays on the UI */}
        {phase >= 2 && (
          <motion.div 
            className="absolute top-[20%] left-[30%] w-[40%] h-[40%] bg-[#C9A227]/20 border-2 border-[#C9A227] rounded shadow-[0_0_20px_rgba(201,162,39,0.5)]"
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          />
        )}
      </motion.div>

      {/* Typography */}
      <div className="absolute right-[5%] top-[40%] w-[25vw] z-20 flex flex-col items-start text-left">
        <motion.h1 
          className="text-[5vw] font-display text-white leading-[0.9] tracking-tight drop-shadow-lg"
          initial={{ opacity: 0, x: 50 }}
          animate={phase >= 3 ? { opacity: 0, x: 50 } : { opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        >
          YOUR FEED <br/><span className="text-[#C9A227]">PROGRAM</span>
        </motion.h1>
        
        <motion.p 
          className="text-[1.5vw] font-sans font-light text-white/80 mt-6"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 3 ? { opacity: 0, y: 20 } : { opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          Auto calculations, multi-shed tabs. Always accessible in the browser.
        </motion.p>
      </div>

    </motion.div>
  );
}