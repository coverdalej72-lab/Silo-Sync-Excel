import { useEffect, useRef } from 'react';

export function useBackgroundMusic() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const initAudio = () => {
      if (audioCtxRef.current) return;

      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;

      const masterGain = ctx.createGain();
      masterGain.gain.value = 0;
      masterGain.connect(ctx.destination);

      const BPM = 105;
      const beat = 60 / BPM;

      // --- Bass guitar pulse (E2 root, country-style walking) ---
      const bassOsc = ctx.createOscillator();
      bassOsc.type = 'triangle';
      bassOsc.frequency.value = 82.4;
      const bassGain = ctx.createGain();
      bassGain.gain.value = 0;
      const bassFilter = ctx.createBiquadFilter();
      bassFilter.type = 'lowpass';
      bassFilter.frequency.value = 320;
      bassOsc.connect(bassGain);
      bassGain.connect(bassFilter);
      bassFilter.connect(masterGain);
      bassOsc.start();

      const bassPattern = [82.4, 82.4, 98.0, 110.0, 123.5, 98.0, 82.4, 82.4];
      let bassStep = 0;
      const bassInterval = setInterval(() => {
        bassOsc.frequency.setValueAtTime(bassPattern[bassStep % bassPattern.length], ctx.currentTime);
        const now = ctx.currentTime;
        bassGain.gain.cancelScheduledValues(now);
        bassGain.gain.setValueAtTime(0, now);
        bassGain.gain.linearRampToValueAtTime(0.65, now + 0.03);
        bassGain.gain.exponentialRampToValueAtTime(0.01, now + beat * 0.85);
        bassStep++;
      }, beat * 1000);

      // --- Strummed guitar chord (G major: G3, B3, D4, G4) ---
      const chordNotes = [196.0, 246.94, 293.66, 392.0];
      const strumGain = ctx.createGain();
      strumGain.gain.value = 0;
      const strumFilter = ctx.createBiquadFilter();
      strumFilter.type = 'bandpass';
      strumFilter.frequency.value = 900;
      strumFilter.Q.value = 0.7;
      strumGain.connect(strumFilter);
      strumFilter.connect(masterGain);

      const strumOscs = chordNotes.map((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        osc.detune.value = (Math.random() - 0.5) * 6;
        osc.connect(strumGain);
        osc.start(ctx.currentTime + i * 0.035);
        return osc;
      });

      let strumCount = 0;
      const strumInterval = setInterval(() => {
        const now = ctx.currentTime;
        strumGain.gain.cancelScheduledValues(now);
        strumGain.gain.setValueAtTime(strumCount % 2 === 0 ? 0.13 : 0.07, now);
        strumGain.gain.exponentialRampToValueAtTime(0.001, now + beat * 1.9);
        strumCount++;
      }, beat * 2 * 1000);

      // --- Melody picking line ---
      const melodyNotes = [392.0, 440.0, 493.88, 440.0, 392.0, 329.63, 369.99, 392.0];
      const melodyOsc = ctx.createOscillator();
      melodyOsc.type = 'triangle';
      melodyOsc.frequency.value = melodyNotes[0];
      const melodyGain = ctx.createGain();
      melodyGain.gain.value = 0;
      const melodyReverb = ctx.createConvolver();
      melodyOsc.connect(melodyGain);
      melodyGain.connect(masterGain);
      melodyOsc.start();

      let melodyStep = 0;
      const melodyInterval = setInterval(() => {
        melodyOsc.frequency.setValueAtTime(melodyNotes[melodyStep % melodyNotes.length], ctx.currentTime);
        const now = ctx.currentTime;
        melodyGain.gain.cancelScheduledValues(now);
        melodyGain.gain.setValueAtTime(0, now);
        melodyGain.gain.linearRampToValueAtTime(0.16, now + 0.02);
        melodyGain.gain.exponentialRampToValueAtTime(0.001, now + beat * 1.6);
        melodyStep++;
      }, beat * 2 * 1000);

      // --- Hi-hat clicks ---
      const bufSize = Math.floor(ctx.sampleRate * 0.07);
      const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const nData = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) nData[i] = Math.random() * 2 - 1;

      let hatCount = 0;
      const hatInterval = setInterval(() => {
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuf;
        const hpf = ctx.createBiquadFilter();
        hpf.type = 'highpass';
        hpf.frequency.value = 9000;
        const hGain = ctx.createGain();
        const now = ctx.currentTime;
        hGain.gain.setValueAtTime(hatCount % 4 === 0 ? 0.08 : 0.035, now);
        hGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
        noise.connect(hpf);
        hpf.connect(hGain);
        hGain.connect(masterGain);
        noise.start(now);
        hatCount++;
      }, (beat / 2) * 1000);

      // Fade in nicely
      masterGain.gain.setValueAtTime(0, ctx.currentTime);
      masterGain.gain.linearRampToValueAtTime(0.32, ctx.currentTime + 2.5);

      cleanupRef.current = () => {
        clearInterval(bassInterval);
        clearInterval(strumInterval);
        clearInterval(melodyInterval);
        clearInterval(hatInterval);
        try { bassOsc.stop(); } catch {}
        strumOscs.forEach(o => { try { o.stop(); } catch {} });
        try { melodyOsc.stop(); } catch {}
        ctx.close();
        audioCtxRef.current = null;
      };
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
