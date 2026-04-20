import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const BASE = import.meta.env.BASE_URL;

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500), // bg and text
      setTimeout(() => setPhase(2), 1500), // logo scales up
      setTimeout(() => setPhase(3), 2500), // url appears
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[var(--color-bg-dark)]"
      initial={{ clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2, ease: [0.76, 0, 0.24, 1] }}
    >
      <div className="absolute inset-0 z-0">
        <video 
          src={`${BASE}farm-aerial.mp4`}
          className="w-full h-full object-cover opacity-30 mix-blend-screen"
          autoPlay 
          loop 
          muted 
          playsInline
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg-dark)] via-[var(--color-primary)]/80 to-[var(--color-bg-dark)]" />
      </div>

      <div className="relative z-20 flex flex-col items-center w-full">
        <motion.div 
          className="flex gap-3 md:gap-6 text-[4vw] md:text-[3vw] font-black text-white uppercase tracking-wider mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        >
          <motion.span>Every shed.</motion.span>
          <motion.span className="text-[var(--color-accent)]">Every batch.</motion.span>
        </motion.div>

        <motion.div 
          className="flex flex-col items-center justify-center relative w-full h-[30vh]"
          initial={{ scale: 0, opacity: 0 }}
          animate={phase >= 2 ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
          transition={{ type: 'spring', damping: 20, stiffness: 100 }}
        >
          {/* Giant Logo Text */}
          <div className="text-[12vw] md:text-[10vw] font-black text-white uppercase tracking-tighter leading-none drop-shadow-[0_20px_40px_rgba(0,0,0,0.8)] z-10 text-center">
            POULTRY<br/>MATE
          </div>
          
          {/* Abstract Logo Shape Behind */}
          <motion.div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40vw] h-[40vw] max-w-[400px] max-h-[400px] bg-[var(--color-accent)] rounded-[30%] rotate-45 -z-10 opacity-80 mix-blend-overlay blur-[20px]"
            animate={{ rotate: [45, 135, 225, 315] }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          />
        </motion.div>

        <motion.div 
          className="mt-12 flex flex-col items-center"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 15 }}
        >
          <div className="bg-white text-[var(--color-primary)] font-black text-[3vw] md:text-[2vw] px-8 py-4 rounded-full uppercase tracking-wider shadow-[0_10px_30px_rgba(255,255,255,0.2)] mb-4">
            Download Free Today
          </div>
          <div className="text-[2.5vw] md:text-[1.8vw] font-bold text-[var(--color-accent)] tracking-widest drop-shadow-md">
            POULTRYMATE.COM.AU
          </div>
        </motion.div>
      </div>

    </motion.div>
  );
}