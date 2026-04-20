import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const BASE = import.meta.env.BASE_URL;

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-[var(--color-bg-dark)]"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '-100%' }}
      transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
    >
      <div className="absolute inset-0 opacity-10 mix-blend-screen pointer-events-none">
        <img 
          src={`${BASE}data-bg.png`} 
          alt="Data Background" 
          className="w-full h-full object-cover" 
        />
      </div>

      <div className="relative z-20 text-center mb-10 w-full px-8">
        <motion.h2 
          className="text-[6vw] md:text-[5vw] font-black text-white uppercase tracking-tight leading-none"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          SILO <span className="text-[var(--color-accent)]">TRACKER</span>
        </motion.h2>
        <motion.p
          className="text-[2.5vw] md:text-[2vw] font-medium text-white/70 mt-4"
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          Live updates straight from the shed floor.
        </motion.p>
      </div>

      <div className="relative w-full flex items-center justify-center z-20 h-[50vh]">
        <motion.div 
          className="relative w-[28vw] max-w-[320px] aspect-[9/19] bg-black rounded-[3vw] md:rounded-[2vw] border-[8px] border-gray-800 shadow-[0_20px_50px_rgba(201,162,39,0.2)] overflow-hidden"
          initial={{ y: '20vh', opacity: 0, scale: 0.9 }}
          animate={phase >= 1 ? { y: 0, opacity: 1, scale: 1 } : { y: '20vh', opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', damping: 20 }}
        >
          {/* Silo UI */}
          <div className="absolute inset-0 bg-[#0a1a10] p-6 flex flex-col pt-12">
            <div className="flex justify-between items-center mb-8">
              <div className="font-bold text-white text-xl">Shed 1</div>
              <div className="text-[var(--color-accent)] text-sm font-bold bg-[var(--color-accent)]/20 px-3 py-1 rounded">LIVE</div>
            </div>

            <div className="flex gap-6 h-1/2 items-end justify-center">
              {/* Silo 1 */}
              <div className="w-1/3 h-full bg-gray-800 rounded-t-[20px] relative overflow-hidden flex flex-col justify-end">
                <motion.div 
                  className="w-full bg-[var(--color-primary)]"
                  initial={{ height: '20%' }}
                  animate={phase >= 2 ? { height: '80%' } : { height: '20%' }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                />
                <div className="absolute inset-0 border-2 border-white/10 rounded-t-[20px]" />
                <motion.div 
                  className="absolute bottom-4 left-0 right-0 text-center font-bold text-white drop-shadow-md text-xl"
                  initial={{ opacity: 0 }}
                  animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
                >
                  12.4t
                </motion.div>
              </div>

              {/* Silo 2 */}
              <div className="w-1/3 h-full bg-gray-800 rounded-t-[20px] relative overflow-hidden flex flex-col justify-end">
                <motion.div 
                  className="w-full bg-[var(--color-accent)]"
                  initial={{ height: '40%' }}
                  animate={phase >= 2 ? { height: '30%' } : { height: '40%' }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                />
                <div className="absolute inset-0 border-2 border-white/10 rounded-t-[20px]" />
                <motion.div 
                  className="absolute bottom-4 left-0 right-0 text-center font-bold text-white drop-shadow-md text-xl"
                  initial={{ opacity: 0 }}
                  animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
                >
                  4.2t
                </motion.div>
              </div>
            </div>

            <motion.div 
              className="mt-8 bg-gray-800/50 rounded-xl p-4 border border-white/10"
              initial={{ opacity: 0, y: 20 }}
              animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            >
              <div className="text-sm text-gray-400 mb-1">Total Feed</div>
              <div className="text-2xl font-bold text-white">16.6 Tonnes</div>
            </motion.div>
          </div>
        </motion.div>

        {/* Floating stats around phone */}
        <motion.div 
          className="absolute left-[15%] top-[20%] bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-xl shadow-2xl hidden md:block"
          initial={{ opacity: 0, x: -50 }}
          animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
          transition={{ type: 'spring', delay: 0.5 }}
        >
          <div className="text-[var(--color-accent)] font-bold text-lg">Shed 2</div>
          <div className="text-white text-3xl font-black">Ready</div>
        </motion.div>

        <motion.div 
          className="absolute right-[15%] bottom-[20%] bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-xl shadow-2xl hidden md:block"
          initial={{ opacity: 0, x: 50 }}
          animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
          transition={{ type: 'spring', delay: 0.2 }}
        >
          <div className="text-green-400 font-bold text-lg">Delivery</div>
          <div className="text-white text-3xl font-black">Logged</div>
        </motion.div>
      </div>
    </motion.div>
  );
}