// src/components/RightPanel/TabPanel.tsx
import React, { useId } from 'react';
import styles from './TabPanel.module.css';
import { AnimatedTabContent } from './AnimatedTabContent';
import { useTabTransition } from '../../hooks/useTabTransition';

export interface TabDefinition {
  id: string;
  label: string;
  icon?: React.ReactNode;
  content: React.ReactNode;
  badge?: number | string;
}

export interface TabPanelProps {
  tabs: TabDefinition[];
  defaultTab?: string;
  onTabChange?: (tabId: string) => void;
  className?: string;
}

/**
 * Right panel tab switcher with sequential fade-out → fade-in+slide animation.
 *
 * Animation sequence:
 *   1. Current tab fades out (opacity 1→0, 100ms)
 *   2. New tab slides in from right + fades in (translateX(8px)→0, opacity 0→1, 150ms)
 */
export const TabPanel: React.FC<TabPanelProps> = ({
  tabs,
  defaultTab,
  onTabChange,
  className,
}) => {
  const panelId = useId();
  const firstTabId = tabs[0]?.id ?? '';

  const { activeTab, displayTab, phase, switchTab } = useTabTransition(
    defaultTab ?? firstTabId,
  );

  const handleTabClick = (tabId: string) => {
    if (tabId === activeTab && phase === 'idle') return;
    switchTab(tabId);
    onTabChange?.(tabId);
  };

  const displayTabData = tabs.find((t) => t.id === displayTab);

  return (
    <div className={[styles.tabPanelRoot, className].filter(Boolean).join(' ')}>
      {/* ── Tab Bar ─────────────────────────────────────────────────────── */}
      <div
        className={styles.tabBar}
        role="tablist"
        aria-label="Right panel tabs"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          const tabId = `${panelId}-tab-${tab.id}`;
          const panelId2 = `${panelId}-panel-${tab.id}`;

          return (
            <button
              key={tab.id}
              id={tabId}
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId2}
              className={[styles.tabButton, isActive ? styles.active : ''].join(' ')}
              onClick={() => handleTabClick(tab.id)}
              tabIndex={isActive ? 0 : -1}
              onKeyDown={(e) => {
                // Arrow key navigation
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault();
                  const currentIndex = tabs.findIndex((t) => t.id === activeTab);
                  const direction = e.key === 'ArrowRight' ? 1 : -1;
                  const nextIndex =
                    (currentIndex + direction + tabs.length) % tabs.length;
                  const nextTab = tabs[nextIndex];
                  if (nextTab) handleTabClick(nextTab.id);
                }
              }}
            >
              {tab.icon && (
                <span className={styles.tabIcon} aria-hidden="true">
                  {tab.icon}
                </span>
              )}
              {tab.label}
              {tab.badge !== undefined && (
                <span className={styles.tabBadge} aria-label={`${tab.badge} items`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Content Area ──────────────────────────────────────────────────── */}
      <div className={styles.contentWrapper}>
        {displayTabData && (
          <AnimatedTabContent
            key={displayTab}
            phase={phase}
            aria-labelledby={`${panelId}-tab-${displayTab}`}
            id={`${panelId}-panel-${displayTab}`}
            role="tabpanel"
          >
            {displayTabData.content}
          </AnimatedTabContent>
        )}
      </div>
    </div>
  );
};

export default TabPanel;