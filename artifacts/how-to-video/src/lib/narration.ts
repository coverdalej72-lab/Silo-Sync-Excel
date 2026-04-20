import { useEffect } from 'react';

const NARRATION_SCRIPTS: Record<number, string> = {
  0: "Still managing your shed on paper? There's a smarter way.",
  1: "Poultry Mate gives you a clean digital feed program — auto-calculating spreadsheets built for Australian producers.",
  2: "Scan delivery dockets straight from your phone. Data fills in automatically. No manual entry, no mistakes.",
  3: "Track your silo levels in real time. Always know exactly how much feed is in every bin.",
  4: "End-of-batch reporting done in seconds. Everything you need, automatically calculated.",
  5: "Poultry Mate. Download free today at poultry mate dot com dot au",
};

let cachedVoice: SpeechSynthesisVoice | null = null;

function getBestVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const namePrefs = ['Karen', 'Catherine', 'Moira', 'Samantha', 'Daniel'];
  for (const name of namePrefs) {
    const v = voices.find(v => v.name.includes(name));
    if (v) { cachedVoice = v; return v; }
  }

  const enAU = voices.find(v => v.lang === 'en-AU');
  if (enAU) { cachedVoice = enAU; return enAU; }

  const enAny = voices.find(v => v.lang.startsWith('en'));
  if (enAny) { cachedVoice = enAny; return enAny; }

  cachedVoice = voices[0];
  return voices[0];
}

export function useNarration(currentScene: number) {
  useEffect(() => {
    if (currentScene < 0 || !window.speechSynthesis) return;

    const text = NARRATION_SCRIPTS[currentScene];
    if (!text) return;

    window.speechSynthesis.cancel();

    const trySpeak = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = getBestVoice();
      if (voice) utterance.voice = voice;
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      trySpeak();
    } else {
      const handler = () => {
        trySpeak();
        window.speechSynthesis.removeEventListener('voiceschanged', handler);
      };
      window.speechSynthesis.addEventListener('voiceschanged', handler);
    }

    return () => {
      window.speechSynthesis.cancel();
    };
  }, [currentScene]);

  useEffect(() => {
    const preload = () => { getBestVoice(); };
    window.speechSynthesis.addEventListener('voiceschanged', preload);
    preload();
    return () => window.speechSynthesis.removeEventListener('voiceschanged', preload);
  }, []);
}
