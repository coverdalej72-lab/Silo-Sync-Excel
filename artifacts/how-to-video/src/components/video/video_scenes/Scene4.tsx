import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sceneTransitions } from '@/lib/video';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500), // Laser scan starts
      setTimeout(() => setPhase(3), 2500), // Value snaps
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      {...sceneTransitions.zoomThrough}
    >
      <div className="absolute inset-0 opacity-40 mix-blend-screen">
        <img 
          src={`${import.meta.env.BASE_URL}data-bg.png`} 
          alt="Data Background" 
          className="w-full h-full object-cover" 
        />
      </div>

      <div className="w-1/2 h-full flex flex-col justify-center pl-20 z-20">
        <motion.h2 
          className="text-[6vw] font-display text-white uppercase tracking-widest leading-none"
          initial={{ opacity: 0, x: -50 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
          transition={{ duration: 0.8 }}
        >
          Record silos right from the shed.
        </motion.h2>
        <motion.p
          className="text-[2.5vw] font-body text-[var(--color-text-muted)] mt-6"
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          No app store. Just add to home screen.
        </motion.p>
      </div>

      <div className="w-1/2 h-full flex items-center justify-center z-20">
        <motion.div 
          className="relative w-[22vw] h-[45vw] bg-black rounded-[3vw] border-[8px] border-gray-800 overflow-hidden shadow-2xl"
          initial={{ y: '100%', rotateZ: 10 }}
          animate={{ y: 0, rotateZ: -5 }}
          transition={{ type: 'spring', damping: 20 }}
        >
          <img src={`${import.meta.env.BASE_URL}screenshot-silo-mate.jpg`} className="w-full h-full object-cover" />
          
          {/* Laser Scan Line */}
          {phase >= 2 && phase < 3 && (
            <motion.div 
              className="absolute left-0 right-0 h-1 bg-[var(--color-accent)] shadow-[0_0_15px_var(--color-accent)]"
              initial={{ top: '20%' }}
              animate={{ top: '80%' }}
              transition={{ duration: 1, ease: 'linear' }}
            />
          )}

          {/* Reading Snaps In */}
          <motion.div 
            className="absolute bottom-1/4 left-1/2 -translate-x-1/2 bg-[var(--color-secondary)]/95 backdrop-blur border border-[var(--color-accent)] px-6 py-4 rounded-xl flex flex-col items-center shadow-2xl"
            initial={{ scale: 0, opacity: 0 }}
            animate={phase >= 3 ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <span className="text-[var(--color-accent)] text-sm font-bold uppercase">Silo 1 Recorded</span>
            <span className="text-white text-4xl font-display mt-1">12.4t</span>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}