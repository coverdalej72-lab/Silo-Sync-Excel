import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';
import { Scene7 } from './video_scenes/Scene7';
import { useNarration } from '@/lib/narration';

const SCENE_DURATIONS = {
  problem:      7000,
  placement:   11000,
  siloReading: 11000,
  feedProgram: 11000,
  weightSheet: 11000,
  endOfBatch:  12000,
  closer:       8000,
};

export default function VideoTemplate() {
  const [started, setStarted] = useState(false);
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS, paused: !started });
  useNarration(started ? currentScene : -1);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[var(--color-bg-dark)] font-sans select-none">

      <AnimatePresence mode="popLayout">
        {currentScene === 0 && <Scene1 key="problem" />}
        {currentScene === 1 && <Scene2 key="placement" />}
        {currentScene === 2 && <Scene3 key="siloReading" />}
        {currentScene === 3 && <Scene4 key="feedProgram" />}
        {currentScene === 4 && <Scene5 key="weightSheet" />}
        {currentScene === 5 && <Scene6 key="endOfBatch" />}
        {currentScene === 6 && <Scene7 key="closer" />}
      </AnimatePresence>

      {/* Scene progress dots */}
      {started && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-50">
          {Object.keys(SCENE_DURATIONS).map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-500"
              style={{
                width: i === currentScene ? 20 : 6,
                height: 6,
                background: i === currentScene ? 'var(--color-accent)' : 'rgba(255,255,255,0.3)',
              }}
            />
          ))}
        </div>
      )}

      {/* Tap-to-start overlay */}
      <AnimatePresence>
        {!started && (
          <motion.div
            className="absolute inset-0 z-50 flex flex-col items-center justify-center cursor-pointer"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
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
              <motion.div
                className="w-24 h-24 md:w-32 md:h-32 rounded-full flex items-center justify-center"
                style={{ background: 'var(--color-accent)', boxShadow: '0 0 60px rgba(201,162,39,0.5)' }}
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
                  Farm Buddy™ — Full Walkthrough
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
