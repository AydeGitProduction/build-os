// apps/web/src/components/Sidebar.tsx
// UPDATED: Sidebar label "Autopilot Mode" → "Power Wizard"
//          Route href: "/autopilot" → "/wizard"

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart2,
  Settings,
  Bell,
  Users,
  Zap,        // Power Wizard icon (was: Bot or similar)
  FileText,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Nav Items ────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Analytics",
    href: "/analytics",
    icon: BarChart2,
  },
  {
    // CHANGED: was "Autopilot Mode" → "Power Wizard"
    // CHANGED: href was "/autopilot" → "/wizard"
    label: "Power Wizard",
    href: "/wizard",
    icon: Zap,
    badge: "New",
  },
  {
    label: "Notifications",
    href: "/notifications",
    icon: Bell,
  },
  {
    label: "Team",
    href: "/team",
    icon: Users,
  },
  {
    label: "Reports",
    href: "/reports",
    icon: FileText,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

const BOTTOM_ITEMS: NavItem[] = [
  {
    label: "Help & Support",
    href: "/support",
    icon: HelpCircle,
  },
];

// ─── Sidebar Component ────────────────────────────────────────────────────────

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-full w-64 flex-col border-r bg-card",
        className
      )}
    >
      {/* Logo / Brand */}
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg">AppName</span>
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1" role="list">
          {NAV_ITEMS.map((item) => (
            <SidebarItem
              key={item.href}
              item={item}
              isActive={
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`)
              }
            />
          ))}
        </ul>
      </nav>

      {/* Bottom Navigation */}
      <div className="border-t px-3 py-4">
        <ul className="space-y-1" role="list">
          {BOTTOM_ITEMS.map((item) => (
            <SidebarItem
              key={item.href}
              item={item}
              isActive={pathname === item.href}
            />
          ))}
        </ul>
      </div>
    </aside>
  );
}

// ─── Sidebar Item ─────────────────────────────────────────────────────────────

interface SidebarItemProps {
  item: NavItem;
  isActive: boolean;
}

function SidebarItem({ item, isActive }: SidebarItemProps) {
  const Icon = item.icon;

  return (
    <li>
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
        aria-current={isActive ? "page" : undefined}
      >
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            isActive ? "text-primary-foreground" : "text-muted-foreground"
          )}
        />
        <span className="flex-1">{item.label}</span>
        {item.badge && (
          <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
            {item.badge}
          </span>
        )}
      </Link>
    </li>
  );
}

export default Sidebar;