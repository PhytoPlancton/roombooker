"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { initials } from "@/lib/ui/format";

interface TopnavProps {
  userName: string;
  syncedCount: number;
  isAdmin?: boolean;
}

export function Topnav({ userName, syncedCount, isAdmin }: TopnavProps) {
  const pathname = usePathname();
  const isDash = pathname === "/dashboard";
  const isRooms = pathname?.startsWith("/dashboard/rooms");
  const isSettings = pathname?.startsWith("/dashboard/settings");
  const isAdminPage = pathname?.startsWith("/dashboard/admin");

  return (
    <header className="topnav">
      <Link href="/dashboard" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
        <div className="brand-dot">R</div>
        <span className="brand-name">roombooker</span>
      </Link>
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
        {isAdmin && (
          <Link
            className="topnav-tab topnav-tab-admin"
            href="/dashboard/admin"
            aria-current={isAdminPage ? "page" : undefined}
          >
            Pilotage
          </Link>
        )}
      </nav>
      <div className="topnav-spacer" />
      <span className="topnav-status">
        <span className="status-dot" />
        <span>Sync active · {syncedCount} events</span>
      </span>
      <ThemeToggle />
      <Link
        href="/dashboard/settings?section=account"
        className="avatar"
        title={`${userName} — voir mon compte`}
        style={{ textDecoration: "none" }}
      >
        {initials(userName)}
      </Link>
    </header>
  );
}
