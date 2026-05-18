import { useEffect } from 'react';

const NARRATION_SCRIPTS: Record<number, string> = {
  0: "Let me show you exactly how Farm Buddy works — start to finish. It's simpler than you think.",
  1: "The day your birds arrive, open Broiler Base Mate and tap Summary. Enter the placement date and total birds for each shed. Then paste your GeniusFOM spreadsheet — and that's it. Your full batch program builds automatically. Every shed. Every feed phase. Already done.",
  2: "You can see every shed at a glance. The feed program shows you exactly what each shed needs each day — allocation, usage, and how much is on hand. Today's row is always highlighted so there's no searching.",
  3: "Every morning, head out to the sheds and open Silo Base Mate on your phone. Type in how many tonnes are left in each silo — A, B, and C — and tap Save All Readings. That's your whole feed record for the day, done in under a minute.",
  4: "As you enter silo readings each day, every column updates automatically. Feed ordered, feed used, feed on hand — all live, all accurate, right across every shed.",
  5: "Enter your weigh-in results and Farm Buddy calculates your FCR and daily gain instantly. The Density view tells you when you need to start thinning before it becomes a problem. Flock Forecast projects your expected weight and feed usage all the way to catch day.",
  6: "At the end of the batch, tap End of Batch. Farm Buddy compiles your full summary automatically — placement date, days on farm, total feed, FCR, average weight, mortality, and your complete catch breakdown. Everything your processor needs, already done.",
  7: "Farm Buddy. Every shed. Every batch. Every day. Get started at farmbuddy.com.au",
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
