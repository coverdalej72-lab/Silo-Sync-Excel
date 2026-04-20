import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2000),
      setTimeout(() => setPhase(4), 2800),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[var(--color-primary)]"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.8 }}
    >
      <div className="absolute inset-0 bg-[#0a2415]/80 z-0" />
      
      <motion.div 
        className="absolute top-0 right-0 w-[50vw] h-[50vw] bg-[var(--color-accent)] rounded-full mix-blend-screen filter blur-[120px] opacity-20 pointer-events-none"
        animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.3, 0.1] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative z-20 flex flex-col md:flex-row w-full h-full items-center justify-center p-8 gap-12 max-w-6xl">
        
        <div className="flex-1 flex flex-col">
          <motion.h2 
            className="text-[6vw] md:text-[5vw] font-black text-white uppercase tracking-tight leading-[1]"
            initial={{ opacity: 0, y: 30 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          >
            END OF <span className="text-[var(--color-accent)]">BATCH</span>
          </motion.h2>
          <motion.p
            className="text-[2.5vw] md:text-[2vw] font-medium text-white/80 mt-4 leading-snug"
            initial={{ opacity: 0 }}
            animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
            transition={{ delay: 0.3 }}
          >
            All your data summarized perfectly.<br/>Ready for the processor.
          </motion.p>
        </div>

        <div className="flex-1 w-full relative">
          <motion.div 
            className="bg-white rounded-xl shadow-2xl overflow-hidden p-6 w-full"
            initial={{ opacity: 0, x: 50, rotateY: 20 }}
            animate={phase >= 2 ? { opacity: 1, x: 0, rotateY: 0 } : { opacity: 0, x: 50, rotateY: 20 }}
            transition={{ type: 'spring', damping: 20 }}
            style={{ perspective: 1000 }}
          >
            <div className="border-b border-gray-200 pb-4 mb-6">
              <h3 className="text-2xl font-black text-gray-800 uppercase">Batch Summary</h3>
              <div className="text-sm text-gray-500 font-bold">Shed 1 - 42 Days</div>
            </div>

            <div className="space-y-6">
              <motion.div 
                className="flex justify-between items-center bg-gray-50 p-4 rounded-lg"
                initial={{ opacity: 0, x: -20 }}
                animate={phase >= 3 ? { opacity: 1, x: 0 } : {}}
              >
                <div className="text-gray-600 font-bold uppercase text-sm">Birds Placed</div>
                <div className="text-2xl font-black text-gray-900">40,000</div>
              </motion.div>

              <motion.div 
                className="flex justify-between items-center bg-gray-50 p-4 rounded-lg"
                initial={{ opacity: 0, x: -20 }}
                animate={phase >= 4 ? { opacity: 1, x: 0 } : {}}
              >
                <div className="text-gray-600 font-bold uppercase text-sm">Total Mortality</div>
                <div className="text-2xl font-black text-red-600">3.2%</div>
              </motion.div>

              <motion.div 
                className="flex justify-between items-center bg-[#dcfce7] p-4 rounded-lg border border-[#22c55e]/30"
                initial={{ opacity: 0, x: -20 }}
                animate={phase >= 4 ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.2 }}
              >
                <div className="text-green-800 font-bold uppercase text-sm">Total Feed Used</div>
                <div className="text-2xl font-black text-green-900">164.5t</div>
              </motion.div>
            </div>
          </motion.div>
        </div>

      </div>
    </motion.div>
  );
}