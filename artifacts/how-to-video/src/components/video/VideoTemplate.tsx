import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';
import { useNarration } from '@/lib/narration';

const SCENE_DURATIONS = {
  hook: 5500,
  feedProgram: 8000,
  scanner: 7500,
  siloTracker: 7000,
  endOfBatch: 7000,
  closer: 7000,
};

export default function VideoTemplate() {
  const [started, setStarted] = useState(false);
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS, paused: !started });
  useNarration(started ? currentScene : -1);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[var(--color-bg-dark)] font-sans select-none">

      {/* Persistent Background Layer - Vignette */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-black/40 to-transparent z-10" />
      </div>

      {/* Persistent Element - Traveling brand line */}
      <motion.div
        className="absolute bg-[var(--color-accent)] z-30 shadow-[0_0_20px_var(--color-accent)]"
        animate={{
          left: ['0%', '10%', '0%', '100%', '50%', '0%'][currentScene],
          top: ['0%', '50%', '100%', '50%', '90%', '100%'][currentScene],
          width: ['10px', '2px', '10px', '2px', '40%', '100%'][currentScene],
          height: ['100%', '80%', '100%', '80%', '2px', '10px'][currentScene],
          opacity: currentScene === 5 ? 0 : 0.8,
        }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        style={{ transform: 'translate(-50%, -50%)' }}
      />

      <AnimatePresence mode="popLayout">
        {currentScene === 0 && <Scene1 key="hook" />}
        {currentScene === 1 && <Scene2 key="feedProgram" />}
        {currentScene === 2 && <Scene3 key="scanner" />}
        {currentScene === 3 && <Scene4 key="siloTracker" />}
        {currentScene === 4 && <Scene5 key="endOfBatch" />}
        {currentScene === 5 && <Scene6 key="closer" />}
      </AnimatePresence>

      {/* Tap-to-start overlay — browsers require a user gesture for audio/speech */}
      <AnimatePresence>
        {!started && (
          <motion.div
            className="absolute inset-0 z-50 flex flex-col items-center justify-center cursor-pointer"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            onClick={() => setStarted(true)}
          >
            <motion.div
              className="flex flex-col items-center gap-6"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', damping: 18 }}
            >
              {/* Play button */}
              <motion.div
                className="w-24 h-24 md:w-32 md:h-32 rounded-full flex items-center justify-center shadow-[0_0_60px_rgba(201,162,39,0.5)]"
                style={{ background: 'var(--color-accent)' }}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                animate={{ boxShadow: ['0 0 40px rgba(201,162,39,0.4)', '0 0 80px rgba(201,162,39,0.7)', '0 0 40px rgba(201,162,39,0.4)'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 md:w-14 md:h-14 text-[#0a2415] translate-x-1">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </motion.div>

              <div className="text-center">
                <div className="text-white font-black text-[5vw] md:text-[2.5vw] uppercase tracking-wide drop-shadow-lg">
                  Tap to Play
                </div>
                <div className="text-white/60 font-medium text-[3vw] md:text-[1.4vw] mt-1">
                  with voice-over
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
