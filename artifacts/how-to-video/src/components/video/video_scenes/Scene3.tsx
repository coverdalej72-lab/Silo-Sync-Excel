import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const BASE = import.meta.env.BASE_URL;

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300), // phone appears
      setTimeout(() => setPhase(2), 1000), // scan line starts
      setTimeout(() => setPhase(3), 2000), // data autofills
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[var(--color-secondary)]"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, filter: 'blur(10px)', scale: 1.2 }}
      transition={{ duration: 0.8 }}
    >
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <img 
          src={`${BASE}data-bg.png`} 
          alt="Data Background" 
          className="w-full h-full object-cover mix-blend-luminosity" 
        />
      </div>

      <div className="w-1/2 h-full flex flex-col justify-center px-[8%] z-20">
        <motion.h2 
          className="text-[6vw] font-black text-white uppercase tracking-tight leading-[1.1] mb-6"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          SCAN QR <br/><span className="text-[var(--color-accent)]">DOCKETS</span>
        </motion.h2>
        <motion.p
          className="text-[2.5vw] md:text-[2vw] font-medium text-white/80 leading-snug"
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          Scan delivery dockets with your phone. Data auto-fills instantly.
        </motion.p>
      </div>

      <div className="w-1/2 h-full flex items-center justify-center relative z-20">
        <motion.div 
          className="relative w-[28vw] max-w-[320px] aspect-[9/19] bg-gray-900 rounded-[3vw] md:rounded-[2vw] border-[8px] border-gray-800 shadow-[0_30px_60px_rgba(0,0,0,0.5)] overflow-hidden"
          initial={{ y: '50vh', rotateZ: -10, opacity: 0 }}
          animate={phase >= 1 ? { y: 0, rotateZ: 5, opacity: 1 } : { y: '50vh', rotateZ: -10, opacity: 0 }}
          transition={{ type: 'spring', damping: 20, stiffness: 100 }}
        >
          {/* Phone UI Background */}
          <div className="absolute inset-0 bg-white p-6 flex flex-col">
            <div className="h-10 bg-gray-100 rounded-lg mb-6 w-full flex items-center justify-center font-bold text-gray-500">
              SCAN DELIVERY
            </div>
            
            {/* Camera Viewfinder */}
            <div className="relative w-full aspect-square bg-gray-200 rounded-xl overflow-hidden mb-6 flex items-center justify-center">
              <div className="w-1/2 h-1/2 border-4 border-dashed border-gray-400 rounded-lg" />
              
              {/* Scan Line */}
              {phase >= 2 && phase < 3 && (
                <motion.div 
                  className="absolute left-0 right-0 h-1 bg-[var(--color-primary)] shadow-[0_0_15px_var(--color-primary)] z-10"
                  initial={{ top: '10%' }}
                  animate={{ top: '90%' }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
              )}
              
              {/* QR Code Graphic */}
              <div className="absolute w-[40%] h-[40%] bg-black" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 20%, 20% 20%, 20% 100%, 0 100%, 0 0, 80% 80%, 100% 80%, 100% 100%, 80% 100%, 80% 80%)' }} />
            </div>

            {/* Auto-filled form */}
            <div className="flex-1 flex flex-col gap-3">
              <div className="h-4 bg-gray-200 rounded w-1/3" />
              <motion.div 
                className="h-10 bg-gray-100 rounded border border-gray-300 relative overflow-hidden"
                initial={{ backgroundColor: '#f3f4f6' }}
                animate={phase >= 3 ? { backgroundColor: '#dcfce7', borderColor: '#22c55e' } : {}}
              >
                {phase >= 3 && (
                  <motion.div 
                    className="absolute inset-y-0 left-3 flex items-center text-green-700 font-bold"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    24.5 Tonnes
                  </motion.div>
                )}
              </motion.div>
              
              <div className="h-4 bg-gray-200 rounded w-1/4 mt-2" />
              <motion.div 
                className="h-10 bg-gray-100 rounded border border-gray-300 relative overflow-hidden"
                initial={{ backgroundColor: '#f3f4f6' }}
                animate={phase >= 3 ? { backgroundColor: '#dcfce7', borderColor: '#22c55e' } : {}}
              >
                {phase >= 3 && (
                  <motion.div 
                    className="absolute inset-y-0 left-3 flex items-center text-green-700 font-bold"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    Grower Pellet
                  </motion.div>
                )}
              </motion.div>
            </div>
          </div>
          
          {/* Success Overlay */}
          <motion.div 
            className="absolute inset-0 bg-green-500/90 flex flex-col items-center justify-center text-white"
            initial={{ opacity: 0 }}
            animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="font-bold text-2xl uppercase">Saved</span>
          </motion.div>

        </motion.div>
      </div>
    </motion.div>
  );
}