import { useEffect } from 'react';

const NARRATION_SCRIPTS: Record<number, string> = {
  0: "Still running your sheds on paper? Farm Buddy changes all of that.",
  1: "On placement day, open Broiler Base Mate. Set your placement date, enter bird numbers per shed, and your full feed program calculates instantly — every shed, every day, automatically.",
  2: "Each day, open Silo Base Mate from your phone and log your silo readings straight from the shed floor. Feed on hand updates instantly so you always know your stock.",
  3: "Your feed program stays live throughout the batch. Today's row highlights automatically, feed targets auto-calculate, and low feed alerts fire to your phone before you run out.",
  4: "The weight sheet tracks your weigh-ins through the batch. Enter bird weights and Farm Buddy calculates FCR, average daily gain, and flags when density is approaching break points.",
  5: "At the end of the batch, Farm Buddy gives you a full summary — birds placed, placement date, days on farm, total feed, FCR, average weight, mortality, and your complete catch breakdown. Everything your processor needs.",
  6: "Farm Buddy. Every shed. Every batch. Every day. Get started at farm buddy dot com dot au.",
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
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    };

    const t = setTimeout(() => {
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
    }, 120);

    return () => {
      clearTimeout(t);
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
