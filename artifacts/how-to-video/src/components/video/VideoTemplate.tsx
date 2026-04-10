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
  hook: 3000,
  benefits: 5000,
  feedProgram: 4000,
  siloMate: 4000,
  install: 5000,
  closer: 4000,
};

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });
  useBackgroundMusic();

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[var(--color-bg-dark)] font-body">
      
      {/* Persistent Background Layer - Animated Gradient */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <motion.div 
          className="absolute w-[120vw] h-[120vw] rounded-full opacity-40 blur-[120px]"
          style={{ background: 'radial-gradient(circle, var(--color-secondary), transparent)' }}
          animate={{
            x: ['-20%', '10%', '-10%', '-20%'],
            y: ['-20%', '-10%', '10%', '-20%'],
            scale: [1, 1.2, 0.9, 1]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div 
          className="absolute w-[80vw] h-[80vw] rounded-full opacity-20 blur-[100px] right-0 bottom-0"
          style={{ background: 'radial-gradient(circle, var(--color-accent), transparent)' }}
          animate={{
            x: ['20%', '-10%', '30%', '20%'],
            y: ['20%', '30%', '-10%', '20%'],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Persistent Element - Gold Line that travels and morphs */}
      <motion.div
        className="absolute bg-[var(--color-accent)] z-10"
        animate={{
          left: ['10%', '50%', '10%', '90%', '50%', '50%'][currentScene],
          top: ['50%', '10%', '90%', '50%', '80%', '50%'][currentScene],
          width: ['80%', '2px', '80%', '2px', '40%', '0%'][currentScene],
          height: ['2px', '80%', '2px', '80%', '2px', '0%'][currentScene],
          opacity: currentScene === 5 ? 0 : 0.8,
        }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        style={{ transform: 'translate(-50%, -50%)' }}
      />

      <AnimatePresence mode="popLayout">
        {currentScene === 0 && <Scene1 key="hook" />}
        {currentScene === 1 && <Scene2 key="benefits" />}
        {currentScene === 2 && <Scene3 key="feedProgram" />}
        {currentScene === 3 && <Scene4 key="siloMate" />}
        {currentScene === 4 && <Scene5 key="install" />}
        {currentScene === 5 && <Scene6 key="closer" />}
      </AnimatePresence>
    </div>
  );
}