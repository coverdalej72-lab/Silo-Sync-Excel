import { useEffect, useRef } from 'react';

// Plays a single short note and cleans itself up — no continuous oscillators
function playNote(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
  attackTime = 0.01,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(dest);

  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + attackTime);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

function playNoise(ctx: AudioContext, dest: AudioNode, volume: number, durationSec: number, hpfHz = 8000) {
  const bufSize = Math.floor(ctx.sampleRate * durationSec);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const hpf = ctx.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = hpfHz;

  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

  src.connect(hpf);
  hpf.connect(gain);
  gain.connect(dest);
  src.start(now);
}

export function useBackgroundMusic() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const initAudio = () => {
      if (audioCtxRef.current) return;

      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;

      // Keep music quiet so it doesn't fight the voice-over
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0, ctx.currentTime);
      masterGain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 3);
      masterGain.connect(ctx.destination);

      const BPM = 96;
      const beat = 60 / BPM; // ~625ms

      // Walking bass — a simple G pentatonic pattern
      const bassNotes = [98.0, 98.0, 110.0, 123.5, 130.8, 110.0, 98.0, 87.3];
      // G2, G2, A2, B2, C3, A2, G2, F2
      let bassStep = 0;
      const bassInterval = setInterval(() => {
        playNote(ctx, masterGain, bassNotes[bassStep % bassNotes.length], beat * 0.6, 0.7, 'triangle', 0.02);
        bassStep++;
      }, beat * 1000);

      // Melody — plays every 2 beats, nice clean pentatonic
      // G major pentatonic: G4, A4, B4, D5, E5
      const melodyNotes = [392, 440, 494, 587, 659, 587, 494, 440, 392, 330, 370, 392];
      let melodyStep = 0;
      const melodyInterval = setInterval(() => {
        playNote(ctx, masterGain, melodyNotes[melodyStep % melodyNotes.length], beat * 1.2, 0.28, 'sine', 0.015);
        melodyStep++;
      }, beat * 2 * 1000);

      // Kick drum — boom on beats 1 and 3
      let kickCount = 0;
      const kickInterval = setInterval(() => {
        if (kickCount % 2 === 0) {
          // Kick: pitch sweep from 120Hz to 40Hz
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(120, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.18);
          gain.gain.setValueAtTime(0.9, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.3);
        }
        kickCount++;
      }, beat * 2 * 1000);

      // Snare — on beats 2 and 4 (offset by 1 beat)
      let snareCount = 0;
      const snareOffset = beat * 1000;
      const snareTimer = setTimeout(() => {
        const snareInterval = setInterval(() => {
          // Snare = short noise burst + tonal body
          playNoise(ctx, masterGain, 0.22, 0.12, 3000);
          playNote(ctx, masterGain, 220, 0.06, 0.15, 'triangle', 0.005);
          snareCount++;
        }, beat * 2 * 1000);
        cleanupRef.current = () => {
          clearInterval(bassInterval);
          clearInterval(melodyInterval);
          clearInterval(kickInterval);
          clearInterval(snareInterval);
          ctx.close();
          audioCtxRef.current = null;
        };
      }, snareOffset);

      // Temporary cleanup before snare starts
      cleanupRef.current = () => {
        clearTimeout(snareTimer);
        clearInterval(bassInterval);
        clearInterval(melodyInterval);
        clearInterval(kickInterval);
        ctx.close();
        audioCtxRef.current = null;
      };

      // Hi-hat — eighth notes, very subtle
      let hatCount = 0;
      const hatInterval = setInterval(() => {
        playNoise(ctx, masterGain, hatCount % 2 === 0 ? 0.06 : 0.025, 0.04, 9000);
        hatCount++;
      }, (beat / 2) * 1000);
    };

    initAudio();

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);
}
