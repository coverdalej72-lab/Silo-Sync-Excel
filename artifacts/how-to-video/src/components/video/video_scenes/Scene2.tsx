import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const BASE = import.meta.env.BASE_URL;
const screenshotFeedProgram = `${BASE}screenshot-feed-program.jpg`;

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2000), // highlights pop
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[var(--color-primary)]"
      initial={{ clipPath: 'polygon(100% 0, 100% 0, 100% 100%, 100% 100%)' }}
      animate={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }}
      exit={{ clipPath: 'polygon(0 0, 0 0, 0 100%, 0 100%)' }}
      transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
    >
      
      <motion.div 
        className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] bg-[#0f3d24] rounded-full mix-blend-multiply filter blur-[100px] opacity-80 pointer-events-none"
        animate={{ x: [0, 50, 0], y: [0, 50, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      
      {/* Product UI */}
      <motion.div 
        className="absolute right-[-10%] top-[15%] w-[70vw] rounded-xl overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.6)] border border-white/10 z-10 origin-left"
        initial={{ opacity: 0, x: 100, rotateY: -30, rotateX: 10, scale: 0.8 }}
        animate={phase >= 1 ? { opacity: 1, x: 0, rotateY: -15, rotateX: 5, scale: 1 } : { opacity: 0, x: 100, rotateY: -30, rotateX: 10, scale: 0.8 }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
        style={{ perspective: 1500 }}
      >
        <img src={screenshotFeedProgram} className="w-full h-auto" alt="Spreadsheet UI" />
        
        {/* Animated highlight overlays on the UI */}
        {phase >= 3 && (
          <motion.div 
            className="absolute top-[30%] left-[40%] w-[35%] h-[30%] border-4 border-[#C9A227] bg-[#C9A227]/20 rounded shadow-[0_0_30px_rgba(201,162,39,0.4)]"
            initial={{ opacity: 0, scale: 1.2 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 15 }}
          >
            <div className="absolute -top-10 left-0 bg-[#C9A227] text-[#0a2415] px-4 py-1 font-bold text-[1.5vw] uppercase rounded whitespace-nowrap">
              Auto-Calculations
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Typography */}
      <div className="absolute left-[8%] top-[30%] w-[40vw] z-20 flex flex-col items-start text-left">
        <motion.h1 
          className="text-[7vw] md:text-[6vw] font-black text-white leading-[1] tracking-tight drop-shadow-xl"
          initial={{ opacity: 0, x: -50 }}
          animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          YOUR FEED <br/><span className="text-[var(--color-accent)]">PROGRAM</span>
        </motion.h1>
        
        <motion.p 
          className="text-[2.5vw] md:text-[2vw] font-medium text-white/90 mt-6 leading-tight"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          Clean, auto-calculating spreadsheets for every shed.
        </motion.p>
      </div>

    </motion.div>
  );
}