import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[var(--color-primary)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
    >
      {/* Background Drone Video */}
      <div className="absolute inset-0 opacity-40 mix-blend-screen z-0">
        <video 
          src={`${import.meta.env.BASE_URL}farm-aerial.mp4`}
          className="w-full h-full object-cover"
          autoPlay 
          loop 
          muted 
          playsInline
        />
        <div className="absolute inset-0 bg-[var(--color-primary)]/60" />
      </div>

      <div className="relative z-20 flex flex-col items-center">
        <motion.h2 
          className="text-[5vw] font-display text-[var(--color-accent)] uppercase tracking-widest text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
          transition={{ duration: 1 }}
        >
          Every shed. Every batch.<br />
          <span className="text-white">Always in control.</span>
        </motion.h2>

        <motion.div 
          className="mt-12 flex flex-col items-center"
          initial={{ opacity: 0, y: 40 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 1, delay: 0.5 }}
        >
          <div className="text-[8vw] font-display text-white uppercase tracking-widest leading-none">
            Poultry Mate
          </div>
        </motion.div>

        <motion.div 
          className="mt-8 text-[3vw] font-body text-[var(--color-accent)] drop-shadow-[0_0_10px_var(--color-accent)]"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 1 }}
        >
          poultrymate.com.au
        </motion.div>
      </div>

      {/* Animated Gold Particles */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        {Array.from({ length: 40 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-[var(--color-accent)]/60 blur-[1px]"
            style={{
              left: `${Math.random() * 100}%`,
              bottom: `-10%`,
            }}
            animate={{
              y: [0, -1000],
              x: [0, Math.random() * 200 - 100],
              opacity: [0, 0.8, 0],
            }}
            transition={{
              duration: Math.random() * 5 + 5,
              repeat: Infinity,
              delay: Math.random() * 5,
              ease: "linear",
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}