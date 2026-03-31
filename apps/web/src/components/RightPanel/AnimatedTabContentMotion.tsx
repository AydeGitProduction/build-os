// src/components/RightPanel/AnimatedTabContentMotion.tsx
/**
 * Drop-in replacement for AnimatedTabContent when Framer Motion is available.
 * Uses AnimatePresence for more robust animation lifecycle management.
 */
import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import styles from './TabPanel.module.css';

const EXIT_VARIANTS = {
  exit: {
    opacity: 0,
    x: -8,
    transition: { duration: 0.1, ease: 'easeIn' },
  },
};

const ENTER_VARIANTS = {
  initial: { opacity: 0, x: 8 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

interface AnimatedTabContentMotionProps {
  tabKey: string;
  children: React.ReactNode;
  className?: string;
  id?: string;
  role?: string;
  'aria-labelledby'?: string;
}

export const AnimatedTabContentMotion: React.FC<AnimatedTabContentMotionProps> = ({
  tabKey,
  children,
  className,
  ...rest
}) => {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={tabKey}
        className={[styles.tabContent, styles.idle, className].filter(Boolean).join(' ')}
        style={{ position: 'absolute', inset: 0 }}
        initial={ENTER_VARIANTS.initial}
        animate={ENTER_VARIANTS.animate}
        exit={EXIT_VARIANTS.exit}
        {...rest}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};