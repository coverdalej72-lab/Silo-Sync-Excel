import { useEffect, useRef } from 'react';

export function useBackgroundMusic() {
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    // Only initialize on the first interaction or mount if browser allows
    const initAudio = () => {
      if (audioCtxRef.current) return;
      
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;

      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.4;
      masterGain.connect(ctx.destination);

      // 1. Steady rhythmic bass pulse (~90Hz)
      const bassOsc = ctx.createOscillator();
      bassOsc.type = 'sine';
      bassOsc.frequency.value = 90; // ~F2
      
      const bassGain = ctx.createGain();
      bassGain.gain.value = 0;
      bassOsc.connect(bassGain);
      bassGain.connect(masterGain);
      
      let bassInterval: any;
      bassOsc.start();
      
      const playBassPulse = () => {
        const now = ctx.currentTime;
        bassGain.gain.cancelScheduledValues(now);
        bassGain.gain.setValueAtTime(0, now);
        bassGain.gain.linearRampToValueAtTime(0.6, now + 0.05);
        bassGain.gain.linearRampToValueAtTime(0, now + 0.3);
      };
      
      // 115 BPM = ~521ms per beat
      bassInterval = setInterval(playBassPulse, 521);

      // 2. Warm pad chord layer (A major: A, C#, E)
      const padFrequencies = [220, 277.18, 329.63]; // A3, C#4, E4
      const padGain = ctx.createGain();
      padGain.gain.value = 0.15;
      padGain.connect(masterGain);
      
      const padOscs = padFrequencies.map(freq => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        osc.detune.value = (Math.random() - 0.5) * 10;
        osc.connect(padGain);
        osc.start();
        return osc;
      });

      // 3. Subtle hi-hat clicks
      const bufferSize = ctx.sampleRate * 0.1; // 100ms
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      
      const playHat = (accent = false) => {
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 7000;
        
        const hatGain = ctx.createGain();
        const now = ctx.currentTime;
        hatGain.gain.setValueAtTime(accent ? 0.15 : 0.05, now);
        hatGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        
        noise.connect(filter);
        filter.connect(hatGain);
        hatGain.connect(masterGain);
        
        noise.start(now);
      };

      let hatCount = 0;
      const hatInterval = setInterval(() => {
        playHat(hatCount % 4 === 0);
        hatCount++;
      }, 521 / 2); // Eighth notes

      // Fade in master
      masterGain.gain.setValueAtTime(0, ctx.currentTime);
      masterGain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 2);

      return () => {
        clearInterval(bassInterval);
        clearInterval(hatInterval);
        bassOsc.stop();
        padOscs.forEach(o => o.stop());
        ctx.close();
      };
    };

    const cleanup = initAudio();

    return () => {
      if (cleanup) cleanup();
    };
  }, []);
}