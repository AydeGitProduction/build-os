// src/components/dashboard/DashboardCTABanner.tsx

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Sparkles, Rocket, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardCTAConfig, CTAVariant } from '@/hooks/useDashboardCTA';

interface DashboardCTABannerProps {
  config: DashboardCTAConfig;
  projectName?: string;
  className?: string;
}

// ─── Icon Map ───────────────────────────────────────────────────────────────

const IconMap: Record<string, React.ElementType> = {
  lightning: Zap,
  wand: Sparkles,
  rocket: Rocket,
};

// ─── Variant Style Map ───────────────────────────────────────────────────────

const variantStyles: Record<
  CTAVariant,
  {
    banner: string;
    badge: string;
    badgeText: string;
    button: string;
    glow: string;
    iconWrapper: string;
    iconColor: string;
    shimmer: boolean;
  }
> = {
  'continue-phase': {
    banner:
      'bg-gradient-to-r from-blue-950/80 via-blue-900/60 to-indigo-950/80 border-blue-700/40',
    badge: 'bg-blue-500/20 border-blue-500/30',
    badgeText: 'text-blue-300',
    button:
      'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/50 shadow-lg',
    glow: 'from-blue-600/20 via-transparent to-transparent',
    iconWrapper: 'bg-blue-500/20 ring-blue-500/30',
    iconColor: 'text-blue-400',
    shimmer: true,
  },
  'open-wizard': {
    banner:
      'bg-gradient-to-r from-emerald-950/80 via-teal-900/60 to-cyan-950/80 border-emerald-700/40',
    badge: 'bg-emerald-500/20 border-emerald-500/30',
    badgeText: 'text-emerald-300',
    button:
      'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/50 shadow-lg',
    glow: 'from-emerald-600/20 via-transparent to-transparent',
    iconWrapper: 'bg-emerald-500/20 ring-emerald-500/30',
    iconColor: 'text-emerald-400',
    shimmer: false,
  },
  'start-building': {
    banner:
      'bg-gradient-to-r from-slate-900/90 via-slate-800/70 to-slate-900/90 border-slate-700/40',
    badge: 'bg-slate-600/20 border-slate-600/30',
    badgeText: 'text-slate-400',
    button:
      'bg-slate-700 hover:bg-slate-600 text-white shadow-slate-900/50 shadow-lg',
    glow: 'from-slate-600/10 via-transparent to-transparent',
    iconWrapper: 'bg-slate-600/20 ring-slate-600/30',
    iconColor: 'text-slate-400',
    shimmer: false,
  },
};

// ─── Status Dot ──────────────────────────────────────────────────────────────

function StatusDot({ color }: { color: DashboardCTAConfig['statusColor'] }) {
  const colorMap = {
    blue: 'bg-blue-400',
    green: 'bg-emerald-400',
    amber: 'bg-amber-400',
    gray: 'bg-slate-500',
  };

  const pingMap = {
    blue: 'bg-blue-400',
    green: 'bg-emerald-400',
    amber: 'bg-amber-400',
    gray: 'bg-slate-500',
  };

  const shouldPing = color === 'blue' || color === 'amber';

  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {shouldPing && (
        <span
          className={cn(
            'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
            pingMap[color]
          )}
        />
      )}
      <span
        className={cn(
          'relative inline-flex rounded-full h-2 w-2',
          colorMap[color]
        )}
      />
    </span>
  );
}

// ─── Shimmer Overlay ─────────────────────────────────────────────────────────

function ShimmerOverlay() {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 animate-[shimmer_4s_ease-in-out_infinite]" />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DashboardCTABanner({
  config,
  projectName,
  className,
}: DashboardCTABannerProps) {
  const router = useRouter();
  const styles = variantStyles[config.variant];
  const Icon = IconMap[config.icon] ?? Zap;

  const handleCTAClick = () => {
    router.push(config.href);
  };

  return (
    <div
      className={cn(
        'relative w-full rounded-xl border backdrop-blur-sm overflow-hidden',
        styles.banner,
        className
      )}
    >
      {/* Glow gradient overlay */}
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-r pointer-events-none',
          styles.glow
        )}
      />

      {/* Shimmer effect for active phases */}
      {styles.shimmer && <ShimmerOverlay />}

      {/* Content */}
      <div className="relative flex items-center gap-4 px-5 py-4 sm:px-6 sm:py-5">
        {/* Icon */}
        <div
          className={cn(
            'flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg ring-1',
            styles.iconWrapper
          )}
        >
          <Icon className={cn('w-5 h-5', styles.iconColor)} />
        </div>

        {/* Text content */}
        <div className="flex-1 min-w-0">
          {/* Status badge */}
          <div className="flex items-center gap-2 mb-1">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border',
                styles.badge,
                styles.badgeText
              )}
            >
              <StatusDot color={config.statusColor} />
              {config.statusLabel}
            </span>
            {projectName && (
              <span className="text-xs text-slate-500 truncate hidden sm:inline">
                {projectName}
              </span>
            )}
          </div>

          {/* Description */}
          <p className="text-sm text-slate-300 leading-snug">
            {config.description}
          </p>
        </div>

        {/* CTA Button */}
        <div className="flex-shrink-0">
          <button
            onClick={handleCTAClick}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold',
              'transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2',
              'focus:ring-offset-transparent whitespace-nowrap',
              styles.button
            )}
            aria-label={config.label}
          >
            <span className="hidden sm:inline">{config.label}</span>
            <span className="sm:hidden">
              <ArrowRight className="w-4 h-4" />
            </span>
            <ArrowRight className="w-3.5 h-3.5 hidden sm:inline" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default DashboardCTABanner;