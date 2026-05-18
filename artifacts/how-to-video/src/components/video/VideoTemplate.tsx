import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { SceneBirdsArrive } from './video_scenes/SceneBirdsArrive';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';
import { Scene7 } from './video_scenes/Scene7';
import { useNarration } from '@/lib/narration';

const SCENE_DURATIONS = {
  hook:          8000,
  birdsArrive:  20000,
  feedProgram:  18000,
  siloReading:  18000,
  liveProgram:  17000,
  weightFCR:    17000,
  endOfBatch:   17000,
  closer:        9000,
};

export default function VideoTemplate() {
  const [started, setStarted] = useState(false);
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS, paused: !started });
  useNarration(started ? currentScene : -1);

  const sceneLabels = ['Intro', 'Birds Arrive', 'Feed Program', 'Silo Readings', 'Live Program', 'Weights & FCR', 'End of Batch', 'Farm Buddy™'];

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#060d08] font-sans select-none">

      <AnimatePresence mode="popLayout">
        {currentScene === 0 && <Scene1 key="hook" />}
        {currentScene === 1 && <SceneBirdsArrive key="birdsArrive" />}
        {currentScene === 2 && <Scene2 key="feedProgram" />}
        {currentScene === 3 && <Scene3 key="siloReading" />}
        {currentScene === 4 && <Scene4 key="liveProgram" />}
        {currentScene === 5 && <Scene5 key="weightFCR" />}
        {currentScene === 6 && <Scene6 key="endOfBatch" />}
        {currentScene === 7 && <Scene7 key="closer" />}
      </AnimatePresence>

      {/* Bottom progress bar + scene label */}
      {started && (
        <div className="absolute bottom-0 left-0 right-0 z-50 px-6 pb-4 pt-2"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }}>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-white/50 font-bold" style={{ fontSize: 'clamp(9px, 1.1vw, 12px)' }}>
              {sceneLabels[currentScene]}
            </span>
            <div className="flex-1 flex gap-1">
              {Object.keys(SCENE_DURATIONS).map((_, i) => (
                <motion.div
                  key={i}
                  className="h-1 rounded-full flex-1"
                  style={{ background: i < currentScene ? 'var(--color-accent)' : i === currentScene ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)' }}
                  animate={i === currentScene ? { opacity: [0.5, 1, 0.5] } : {}}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              ))}
            </div>
            <span className="text-white/40 font-bold" style={{ fontSize: 'clamp(9px, 1.1vw, 12px)' }}>
              {currentScene + 1} / {Object.keys(SCENE_DURATIONS).length}
            </span>
          </div>
        </div>
      )}

      {/* Tap-to-start overlay */}
      <AnimatePresence>
        {!started && (
          <motion.div
            className="absolute inset-0 z-50 flex flex-col items-center justify-center cursor-pointer"
            style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setStarted(true)}
          >
            <motion.div
              className="flex flex-col items-center gap-6"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', damping: 18 }}
            >
              <motion.div
                className="rounded-full flex items-center justify-center"
                style={{
                  width: 'clamp(80px, 12vw, 128px)',
                  height: 'clamp(80px, 12vw, 128px)',
                  background: 'var(--color-accent)',
                }}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                animate={{ boxShadow: ['0 0 40px rgba(201,162,39,0.4)', '0 0 80px rgba(201,162,39,0.75)', '0 0 40px rgba(201,162,39,0.4)'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '40%', height: '40%', color: '#0a2415', transform: 'translateX(8%)' }}>
                  <path d="M8 5v14l11-7z" />
                </svg>
              </motion.div>
              <div className="text-center">
                <div className="text-white font-black uppercase tracking-wide" style={{ fontSize: 'clamp(18px, 3vw, 32px)' }}>
                  Tap to Play
                </div>
                <div className="text-white/50 font-medium mt-1" style={{ fontSize: 'clamp(12px, 1.6vw, 16px)' }}>
                  Farm Buddy™ — How It Works
                </div>
                <div className="text-white/30 mt-2" style={{ fontSize: 'clamp(10px, 1.2vw, 13px)' }}>
                  ~2 min · voice-over included
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
