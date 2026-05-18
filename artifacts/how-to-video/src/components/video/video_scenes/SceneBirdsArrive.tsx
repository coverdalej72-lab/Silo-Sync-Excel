import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ScreenCallout } from '../ScreenCallout';

const BASE = import.meta.env.BASE_URL;

// Simulated typing hook
function useTypedText(fullText: string, active: boolean, delayMs = 0) {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    if (!active) { setDisplayed(''); return; }
    const start = setTimeout(() => {
      let i = 0;
      const iv = setInterval(() => {
        i++;
        setDisplayed(fullText.slice(0, i));
        if (i >= fullText.length) clearInterval(iv);
      }, 42);
      return () => clearInterval(iv);
    }, delayMs);
    return () => clearTimeout(start);
  }, [active, fullText, delayMs]);
  return displayed;
}

const SHEDS = [
  { name: '1 & 2', birds: '80,000' },
  { name: '3 & 4', birds: '80,000' },
  { name: '5 & 6', birds: '80,000' },
  { name: '7 & 8', birds: '79,500' },
  { name: '9 & 10', birds: '80,000' },
  { name: '11 & 12', birds: '80,200' },
];

export function SceneBirdsArrive() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2800),   // start typing date
      setTimeout(() => setPhase(4), 5200),   // bird numbers appear
      setTimeout(() => setPhase(5), 8000),   // confirm / checkmark
      setTimeout(() => setPhase(6), 10000),  // transition to shed breakdown
      setTimeout(() => setPhase(7), 12500),  // callouts on shed screenshot
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const typedDate = useTypedText('20 March 2026', phase >= 3, 200);

  return (
    <motion.div
      className="absolute inset-0 flex items-center overflow-hidden"
      style={{ background: '#0a1c0f' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 35% 50%, rgba(201,162,39,0.07) 0%, transparent 55%)' }} />

      {/* LEFT column */}
      <div className="relative z-20 flex flex-col justify-center h-full pl-[5%] w-[38%] pr-4">
        <motion.div
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-black mb-4 self-start"
          style={{ background: 'rgba(201,162,39,0.15)', color: 'var(--color-accent)', border: '1px solid rgba(201,162,39,0.3)', fontSize: 'clamp(9px, 1.2vw, 13px)' }}
          initial={{ opacity: 0, y: -8 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
        >
          STEP 1 OF 6
        </motion.div>

        <motion.h2
          className="font-black text-white leading-none mb-3"
          style={{ fontSize: 'clamp(22px, 4.2vw, 52px)' }}
          initial={{ opacity: 0, y: 18 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
          transition={{ delay: 0.08 }}
        >
          BIRDS<br /><span style={{ color: 'var(--color-accent)' }}>ARRIVED?</span>
        </motion.h2>

        {[
          'Open Broiler Base Mate and tap Summary',
          'Enter the date your birds were placed',
          'Set the total bird count for each shed',
          'Your full batch program builds automatically',
        ].map((b, i) => (
          <motion.div
            key={b}
            className="flex items-start gap-3 mb-2.5"
            initial={{ opacity: 0, x: -14 }}
            animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -14 }}
            transition={{ delay: i * 0.15, type: 'spring', damping: 22 }}
          >
            <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center font-black text-[#0a2415]"
              style={{ background: 'var(--color-accent)', fontSize: 'clamp(8px, 1vw, 11px)' }}>✓</span>
            <span className="text-white/80 leading-snug" style={{ fontSize: 'clamp(11px, 1.5vw, 16px)' }}>{b}</span>
          </motion.div>
        ))}

        <motion.div
          className="mt-5 rounded-2xl px-4 py-3 flex items-center gap-3"
          style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)' }}
          initial={{ opacity: 0 }}
          animate={phase >= 5 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ type: 'spring', damping: 20 }}
        >
          <motion.span
            style={{ fontSize: 'clamp(20px, 2.5vw, 28px)' }}
            animate={phase >= 5 ? { rotate: [0, 15, -10, 5, 0], scale: [1, 1.3, 1] } : {}}
            transition={{ duration: 0.5 }}
          >✅</motion.span>
          <div>
            <div className="font-black text-white" style={{ fontSize: 'clamp(11px, 1.4vw, 15px)' }}>Batch set up — ready to go</div>
            <div className="text-white/50" style={{ fontSize: 'clamp(9px, 1.1vw, 12px)' }}>All 6 sheds populated instantly</div>
          </div>
        </motion.div>
      </div>

      {/* RIGHT column */}
      <div className="relative z-20 flex items-center justify-center h-full" style={{ width: '57%', paddingRight: '2%' }}>
        <AnimatePresence mode="wait">

          {/* Phase 1–5: Animated Summary form */}
          {phase < 6 && (
            <motion.div
              key="summary-form"
              className="w-full rounded-2xl overflow-hidden shadow-2xl"
              style={{ border: '2px solid rgba(255,255,255,0.1)', background: '#0f2718' }}
              initial={{ opacity: 0, x: 50 }}
              animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.3 } }}
              transition={{ type: 'spring', damping: 24 }}
            >
              {/* App header */}
              <div className="flex items-center gap-3 px-4 py-3" style={{ background: 'var(--color-primary)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <img src={`${BASE}logo.png`} alt="Farm Buddy" style={{ height: 22, width: 'auto' }} />
                <span className="font-black text-white" style={{ fontSize: 'clamp(11px, 1.4vw, 15px)' }}>Double B Farm — Broiler Base Mate</span>
              </div>

              {/* Tab bar */}
              <div className="flex items-center gap-1 px-3 pt-2 pb-1 flex-wrap" style={{ background: '#132b1a', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="px-3 py-1 rounded-lg font-black text-[#0a2415]"
                  style={{ background: 'var(--color-accent)', fontSize: 'clamp(8px, 1.1vw, 12px)' }}>≡ Summary</div>
                {SHEDS.map((s) => (
                  <div key={s.name} className="px-3 py-1 rounded-lg font-bold text-white/40"
                    style={{ background: 'rgba(255,255,255,0.06)', fontSize: 'clamp(7px, 0.9vw, 10px)' }}>
                    {s.name}
                  </div>
                ))}
              </div>

              {/* Form body */}
              <div className="p-4 flex flex-col gap-4">

                {/* Placement date field */}
                <div>
                  <div className="text-white/50 font-bold mb-1.5 uppercase tracking-wider" style={{ fontSize: 'clamp(8px, 1vw, 10px)' }}>
                    📅 Placement Date
                  </div>
                  <motion.div
                    className="rounded-xl px-4 py-3 font-black text-white flex items-center gap-2"
                    style={{
                      background: phase >= 3 ? 'rgba(201,162,39,0.1)' : 'rgba(255,255,255,0.05)',
                      border: `2px solid ${phase >= 3 ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)'}`,
                      fontSize: 'clamp(12px, 1.8vw, 20px)',
                      minHeight: '3em',
                      transition: 'border-color 0.3s, background 0.3s',
                    }}
                  >
                    {phase >= 3 ? (
                      <>
                        <span style={{ color: 'var(--color-accent)' }}>{typedDate}</span>
                        {typedDate.length < 'Monday 20 March 2026'.length && (
                          <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.5, repeat: Infinity }} style={{ color: 'var(--color-accent)' }}>|</motion.span>
                        )}
                      </>
                    ) : (
                      <span className="text-white/20" style={{ fontSize: 'clamp(10px, 1.3vw, 14px)' }}>Tap to set placement date...</span>
                    )}
                  </motion.div>
                </div>

                {/* Birds per shed */}
                <div>
                  <div className="text-white/50 font-bold mb-1.5 uppercase tracking-wider" style={{ fontSize: 'clamp(8px, 1vw, 10px)' }}>
                    🐔 Total Birds Per Shed
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {SHEDS.map((shed, i) => (
                      <motion.div
                        key={shed.name}
                        className="rounded-xl px-3 py-2 text-center"
                        style={{
                          background: phase >= 4 ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.05)',
                          border: `1.5px solid ${phase >= 4 ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.08)'}`,
                          transition: 'all 0.3s',
                        }}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={phase >= 4 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
                        transition={{ delay: i * 0.07, type: 'spring', damping: 20 }}
                      >
                        <div className="text-white/40 font-bold" style={{ fontSize: 'clamp(7px, 0.85vw, 9px)' }}>SHED {shed.name}</div>
                        <div className="font-black text-white" style={{ fontSize: 'clamp(10px, 1.3vw, 14px)', color: phase >= 4 ? '#4ade80' : 'white' }}>
                          {phase >= 4 ? shed.birds : '—'}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* GeniusFOM row */}
                <motion.div
                  className="flex items-center gap-3 rounded-xl px-4 py-3"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  initial={{ opacity: 0 }}
                  animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
                >
                  <span style={{ fontSize: 'clamp(14px, 1.8vw, 18px)' }}>📋</span>
                  <div className="flex-1">
                    <div className="font-black text-white" style={{ fontSize: 'clamp(9px, 1.2vw, 13px)' }}>GeniusFOM Spreadsheet</div>
                    <div className="text-white/40" style={{ fontSize: 'clamp(8px, 1vw, 11px)' }}>Paste once — feed program loads automatically</div>
                  </div>
                  <div className="font-black px-3 py-1 rounded-lg" style={{ background: phase >= 5 ? '#16a34a' : 'rgba(255,255,255,0.08)', color: 'white', fontSize: 'clamp(8px, 1vw, 11px)', transition: 'background 0.4s' }}>
                    {phase >= 5 ? '✓ Loaded' : 'Paste'}
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* Phase 6+: Real screenshot of shed tab with callouts */}
          {phase >= 6 && (
            <motion.div
              key="shed-breakdown"
              className="relative w-full rounded-2xl overflow-hidden shadow-2xl"
              style={{ border: '2px solid rgba(255,255,255,0.1)' }}
              initial={{ opacity: 0, x: 40, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ type: 'spring', damping: 22 }}
            >
              <img
                src={`${BASE}screen-feed-program.jpg`}
                alt="Shed breakdown"
                className="w-full h-auto block"
              />

              {/* Callout: Shed tabs */}
              <ScreenCallout top="12%" left="0%" width="62%" height="8%" label="All 6 sheds — loaded instantly" labelSide="bottom" visible={phase >= 7} />
              {/* Callout: Placement date */}
              <ScreenCallout top="30%" left="0%" width="40%" height="10%" label="Your placement date" labelSide="right" visible={phase >= 7} color="#4ade80" />
              {/* Callout: Total birds */}
              <ScreenCallout top="29%" left="80%" width="19%" height="13%" label="Birds per shed" labelSide="left" visible={phase >= 7} color="#4ade80" />
              {/* Callout: Feed allocations */}
              <ScreenCallout top="40%" left="68%" width="32%" height="16%" label="STR · GWR · FIN · WDW feed split" labelSide="left" visible={phase >= 7} />
              {/* Callout: Feed summary */}
              <ScreenCallout top="52%" left="0%" width="55%" height="8%" label="Total feed ordered for the batch" labelSide="bottom" visible={phase >= 7} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
