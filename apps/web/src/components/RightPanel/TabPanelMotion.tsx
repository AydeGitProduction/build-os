'use client'
// src/components/RightPanel/TabPanelMotion.tsx
import React, { useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import styles from './TabPanel.module.css';
import type { TabDefinition } from './TabPanel';

interface TabPanelMotionProps {
  tabs: TabDefinition[];
  defaultTab?: string;
  onTabChange?: (tabId: string) => void;
  className?: string;
}

/**
 * Framer Motion version of TabPanel.
 * AnimatePresence mode="wait" handles the sequential out→in automatically.
 */
export const TabPanelMotion: React.FC<TabPanelMotionProps> = ({
  tabs,
  defaultTab,
  onTabChange,
  className,
}) => {
  const panelId = useId();
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.id ?? '');

  const handleTabClick = (tabId: string) => {
    if (tabId === activeTab) return;
    setActiveTab(tabId);
    onTabChange?.(tabId);
  };

  const activeTabData = tabs.find((t) => t.id === activeTab);

  return (
    <div className={[styles.tabPanelRoot, className].filter(Boolean).join(' ')}>
      {/* Tab Bar */}
      <div className={styles.tabBar} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeTab}
            className={[
              styles.tabButton,
              tab.id === activeTab ? styles.active : '',
            ].join(' ')}
            onClick={() => handleTabClick(tab.id)}
            tabIndex={tab.id === activeTab ? 0 : -1}
          >
            {tab.icon && <span className={styles.tabIcon}>{tab.icon}</span>}
            {tab.label}
            {tab.badge !== undefined && (
              <span className={styles.tabBadge}>{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Animated Content */}
      <div className={styles.contentWrapper}>
        <AnimatePresence mode="wait" initial={false}>
          {activeTabData && (
            <motion.div
              key={activeTab}
              className={[styles.tabContent, styles.idle].join(' ')}
              style={{ position: 'absolute', inset: 0, overflowY: 'auto' }}
              initial={{ opacity: 0, x: 8 }}
              animate={{
                opacity: 1,
                x: 0,
                transition: {
                  duration: 0.15,
                  ease: [0.25, 0.46, 0.45, 0.94],
                },
              }}
              exit={{
                opacity: 0,
                x: -8,
                transition: { duration: 0.1, ease: 'easeIn' },
              }}
              role="tabpanel"
              aria-labelledby={`${panelId}-tab-${activeTab}`}
              id={`${panelId}-panel-${activeTab}`}
            >
              {activeTabData.content}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};