/** HH:MM in Paris time. */
export function formatHHMM(d: Date): string {
  return d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
    hourCycle: "h23",
  });
}

/** "30 min" / "1 h" / "1 h 30" between two HH:MM strings. */
export function durationLabel(start: string, end: string): string {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const m = eh * 60 + em - (sh * 60 + sm);
  if (m < 60) return `${m} min`;
  if (m % 60 === 0) return `${m / 60} h`;
  return `${Math.floor(m / 60)} h ${m % 60}`;
}

/** "Aujourd'hui · Mer. 6 mai" style label for a date relative to today. */
export function dayLabel(d: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  const fmt = d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
  if (diff === 0) return `Aujourd'hui · ${fmt}`;
  if (diff === 1) return `Demain · ${fmt}`;
  if (diff === -1) return `Hier · ${fmt}`;
  return fmt;
}

/** Initials from "First Last" → "FL". Falls back to first 2 chars. */
export function initials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Format "il y a 12 min" / "il y a 1 h" relative to now. */
export function timeAgo(d: Date): string {
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 30) return "à l'instant";
  if (seconds < 60) return `il y a ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return `il y a ${days} j`;
}
