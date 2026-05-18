import { useEffect } from 'react';

const NARRATION_SCRIPTS: Record<number, string> = {
  0: "Let me show you exactly how Farm Buddy works — start to finish. It's simpler than you think.",
  1: "Open Broiler Base Mate and paste in your GeniusFOM spreadsheet. Every shed appears instantly — placement date, bird numbers, and your complete feed program, automatically calculated for the whole batch. No typing, no maths.",
  2: "Every morning, open Silo Base Mate on your phone right at the shed. Type how many tonnes are in each silo and tap Save All Readings. That's your whole day's feed record — done in under a minute.",
  3: "Your feed program is always live. Today's row is highlighted automatically. You can see exactly what feed each shed needs today, how much is on hand, and how many birds are left. Every column updates as you go.",
  4: "Track your weigh-ins through the batch. Enter your bird weights and Farm Buddy calculates your FCR and average daily gain automatically. The Density view tells you when to start thinning — before it becomes a problem.",
  5: "At the end of the batch, tap End of Batch. Farm Buddy compiles your full summary — placement date, birds placed, days on farm, total feed used, FCR, average weight, mortality, and your complete catch breakdown. Everything your processor needs, already done.",
  6: "Farm Buddy. Every shed. Every batch. Every day. Get started at farmbuddy.com.au",
};

let cachedVoice: SpeechSynthesisVoice | null = null;

function getBestVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const namePrefs = ['Karen', 'Catherine', 'Moira', 'Samantha', 'Daniel', 'Aaron'];
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
      utterance.rate = 0.92;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    };
    const t = setTimeout(() => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) { trySpeak(); }
      else {
        const handler = () => { trySpeak(); window.speechSynthesis.removeEventListener('voiceschanged', handler); };
        window.speechSynthesis.addEventListener('voiceschanged', handler);
      }
    }, 120);
    return () => { clearTimeout(t); window.speechSynthesis.cancel(); };
  }, [currentScene]);

  useEffect(() => {
    const preload = () => { getBestVoice(); };
    window.speechSynthesis.addEventListener('voiceschanged', preload);
    preload();
    return () => window.speechSynthesis.removeEventListener('voiceschanged', preload);
  }, []);
}
