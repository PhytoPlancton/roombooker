"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { initials } from "@/lib/ui/format";

interface TopnavProps {
  userName: string;
  syncedCount: number;
}

export function Topnav({ userName, syncedCount }: TopnavProps) {
  const pathname = usePathname();
  const isDash = pathname === "/dashboard";
  const isRooms = pathname?.startsWith("/dashboard/rooms");
  const isSettings = pathname?.startsWith("/dashboard/settings");

  return (
    <header className="topnav">
      <div className="brand">
        <div className="brand-dot">R</div>
        <span className="brand-name">roombooker</span>
      </div>
      <nav className="topnav-tabs">
        <Link className="topnav-tab" href="/dashboard" aria-current={isDash ? "page" : undefined}>
          Dashboard
        </Link>
        <Link className="topnav-tab" href="/dashboard/rooms" aria-current={isRooms ? "page" : undefined}>
          Salles
        </Link>
        <Link className="topnav-tab" href="/dashboard/settings" aria-current={isSettings ? "page" : undefined}>
          Réglages
        </Link>
      </nav>
      <div className="topnav-spacer" />
      <span className="topnav-status">
        <span className="status-dot" />
        <span>Sync active · {syncedCount} events</span>
      </span>
      <ThemeToggle />
      <div className="avatar" title={userName}>{initials(userName)}</div>
    </header>
  );
}
