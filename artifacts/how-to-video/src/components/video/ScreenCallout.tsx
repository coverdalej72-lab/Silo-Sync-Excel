import { motion } from 'framer-motion';

interface CalloutProps {
  top: string;
  left: string;
  width: string;
  height: string;
  label: string;
  labelSide?: 'top' | 'bottom' | 'left' | 'right';
  visible: boolean;
  color?: string;
}

export function ScreenCallout({ top, left, width, height, label, labelSide = 'bottom', visible, color = '#C9A227' }: CalloutProps) {
  return (
    <motion.div
      className="absolute pointer-events-none z-30"
      style={{ top, left, width, height }}
      initial={{ opacity: 0, scale: 1.08 }}
      animate={visible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 1.08 }}
      transition={{ type: 'spring', damping: 20, stiffness: 200 }}
    >
      {/* Border box */}
      <motion.div
        className="absolute inset-0 rounded-lg"
        style={{ border: `2.5px solid ${color}` }}
        animate={visible ? { boxShadow: [`0 0 0px ${color}55`, `0 0 16px ${color}99`, `0 0 0px ${color}55`] } : {}}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Corner accents */}
      {[
        { top: -3, left: -3 },
        { top: -3, right: -3 },
        { bottom: -3, left: -3 },
        { bottom: -3, right: -3 },
      ].map((pos, i) => (
        <div
          key={i}
          className="absolute w-3 h-3 rounded-sm"
          style={{ ...pos, background: color }}
        />
      ))}
      {/* Label */}
      <motion.div
        className="absolute whitespace-nowrap font-black rounded-lg px-3 py-1.5 shadow-xl"
        style={{
          background: color,
          color: '#0a2415',
          fontSize: 'clamp(9px, 1.1vw, 12px)',
          ...(labelSide === 'bottom' && { top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' }),
          ...(labelSide === 'top'    && { bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' }),
          ...(labelSide === 'right'  && { left: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' }),
          ...(labelSide === 'left'   && { right: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' }),
        }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={visible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
        transition={{ delay: 0.15 }}
      >
        {label}
      </motion.div>
    </motion.div>
  );
}
