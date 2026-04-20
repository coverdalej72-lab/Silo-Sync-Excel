import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';
import { useBackgroundMusic } from '@/lib/audio';

const SCENE_DURATIONS = {
  hook: 4000,
  feedProgram: 4000,
  scanner: 4000,
  siloTracker: 4000,
  endOfBatch: 4000,
  closer: 5000,
};

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });
  useBackgroundMusic();

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[var(--color-bg-dark)] font-sans select-none">
      
      {/* Persistent Background Layer - Drift / Vignette */}
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
    </div>
  );
}