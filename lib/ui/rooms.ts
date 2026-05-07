/**
 * Static room metadata used by the design (icons, colors, capacity).
 * These are display-only — the canonical Skedda IDs live in lib/skedda-http.ts.
 */

import type { RoomName } from "@/lib/bookings";

export interface RoomMeta {
  id: RoomName;
  slug: "jupiter" | "venus" | "earth" | "mars" | "mercury";
  name: string;
  cap: number | null;
  color: string;
  desc: string;
}

// 5 salles physiques de l'incubateur Antler France (ordre = ordre par défaut d'affichage).
export const ROOMS: RoomMeta[] = [
  { id: "Jupiter", slug: "jupiter", name: "Jupiter", cap: null, color: "#E07856", desc: "Big meeting room" },
  { id: "Earth",   slug: "earth",   name: "Earth",   cap: 10,   color: "#2B7A4B", desc: "Salle de réunion" },
  { id: "Venus",   slug: "venus",   name: "Venus",   cap: 2,    color: "#B86CB1", desc: "Small meeting room" },
  { id: "Mars",    slug: "mars",    name: "Mars",    cap: 2,    color: "#C24A38", desc: "Small meeting room" },
  { id: "Mercury", slug: "mercury", name: "Mercury", cap: 2,    color: "#8A8FB5", desc: "Small meeting room" },
];

export const roomById = (id: string | null | undefined): RoomMeta | undefined =>
  ROOMS.find((r) => r.id === id || r.slug === id);

export const ATTENDEE_COLORS = [
  "#E07856", "#2B7A4B", "#3A6FA7", "#B86CB1",
  "#B8741A", "#5BA89D", "#A8392B", "#8A8FB5",
];
