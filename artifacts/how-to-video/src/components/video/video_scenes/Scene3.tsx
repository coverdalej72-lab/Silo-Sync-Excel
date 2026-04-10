import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sceneTransitions } from '@/lib/video';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500), // screenshot loads
      setTimeout(() => setPhase(3), 2500), // highlights pop
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center p-12 overflow-hidden"
      {...sceneTransitions.wipe}
    >
      <motion.h2 
        className="text-[5vw] font-display text-white uppercase tracking-widest mb-8 z-20 text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
        transition={{ duration: 0.8 }}
      >
        Your existing spreadsheet — <span className="text-[var(--color-accent)]">supercharged.</span>
      </motion.h2>

      <motion.div 
        className="w-[80vw] h-[45vw] bg-white rounded-t-xl overflow-hidden shadow-2xl relative z-10 border border-gray-300"
        initial={{ rotateX: 20, y: 100, opacity: 0 }}
        animate={phase >= 2 ? { rotateX: 0, y: 0, opacity: 1 } : { rotateX: 20, y: 100, opacity: 0 }}
        transition={{ type: 'spring', damping: 20 }}
        style={{ perspective: 1000 }}
      >
        {/* Browser Chrome */}
        <div className="h-8 bg-gray-200 flex items-center px-4 gap-2 border-b border-gray-300">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <img src={`${import.meta.env.BASE_URL}screenshot-feed-program.jpg`} className="w-full object-cover object-top" />

        {/* Highlights */}
        {phase >= 3 && (
          <motion.div 
            className="absolute top-[30%] left-[40%] w-[30%] h-[40%] border-4 border-[var(--color-accent)] bg-[var(--color-accent)]/10 rounded"
            initial={{ opacity: 0, scale: 1.2 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 15 }}
          >
            <div className="absolute -top-10 left-0 bg-[var(--color-accent)] text-black px-4 py-1 font-bold text-sm uppercase rounded">
              Auto-Calculating
            </div>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}