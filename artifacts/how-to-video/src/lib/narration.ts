import { useEffect } from 'react';

const NARRATION_SCRIPTS: Record<number, string> = {
  0: "Here's how Poultry Mate works. It replaces all your paper shed records with one simple app on your phone or tablet.",
  1: "Open your feed program and enter your shed details. Poultry Mate automatically calculates feed rates, adjustments, and tonnages for every age group and weight target.",
  2: "When a feed delivery arrives, tap Scan Docket and point your camera at the QR code on the delivery docket. The batch, date, and tonnes fill in instantly — no typing needed.",
  3: "Tap Add Reading any time to log your silo levels. The app tracks usage across the whole batch and shows you exactly how much feed is left in each bin.",
  4: "At the end of the batch, tap Generate Report. Poultry Mate compiles your full feed summary, conversion rate, and batch data — ready to send straight to your grower company.",
  5: "Download Poultry Mate free at poultrymate.com.au and get your first batch started today.",
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

    // Small delay so cancel() fully clears before new utterance starts
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
