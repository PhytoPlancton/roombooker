/**
 * Convert a Mongo BookingDoc into a plain JSON shape consumable by client components.
 * This lives in a server-only module — never imported from "use client" files.
 */

import type { BookingDoc, RoomName } from "@/lib/bookings";
import { formatHHMM, initials } from "./format";

export type EventStatus = "synced" | "syncing" | "conflict" | "error" | "cancelled";

export interface EventVM {
  id: string;
  start: string; // HH:MM
  end: string;   // HH:MM
  startISO: string;
  endISO: string;
  title: string;
  room: RoomName | null;
  organizer: string;
  organizerInitials: string;
  attendees: string[]; // initials only — no PII leakage to the client
  attendeeEmails: string[]; // full emails for the drawer (already in DB)
  status: EventStatus;
  conflict: { type: "overlap" | "auth"; reason?: string; with?: string } | null;
  failureReason: string | null;
  bookingDocId: string;
  skeddaBookingRef: string | null;
}

/** Maps backend booking status + failureReason to design event status. */
function classifyStatus(
  status: BookingDoc["status"],
  failureReason: string | null,
): { status: EventStatus; conflict: EventVM["conflict"] } {
  if (status === "booked") return { status: "synced", conflict: null };
  if (status === "pending") return { status: "syncing", conflict: null };
  if (status === "cancelled") return { status: "cancelled", conflict: null };
  // status === "failed" — distinguish conflict from auth/other errors.
  const r = (failureReason || "").toLowerCase();
  if (r.includes("conflict") || r.includes("clash") || r.includes("already") || r.includes("slot_unavailable") || r.includes("unavailable")) {
    return { status: "conflict", conflict: { type: "overlap", reason: failureReason || undefined } };
  }
  return { status: "error", conflict: { type: "auth", reason: failureReason || "Erreur Skedda" } };
}

export function serializeBooking(b: BookingDoc, organizerName: string): EventVM {
  const startsAt = b.meeting.startsAt instanceof Date ? b.meeting.startsAt : new Date(b.meeting.startsAt);
  const endsAt = b.meeting.endsAt instanceof Date ? b.meeting.endsAt : new Date(b.meeting.endsAt);
  const cls = classifyStatus(b.status, b.failureReason);
  return {
    id: b._id.toString(),
    bookingDocId: b._id.toString(),
    start: formatHHMM(startsAt),
    end: formatHHMM(endsAt),
    startISO: startsAt.toISOString(),
    endISO: endsAt.toISOString(),
    title: b.meeting.title,
    room: b.room,
    organizer: organizerName,
    organizerInitials: initials(organizerName),
    attendees: (b.meeting.attendees || []).map((email) => {
      const name = email.split("@")[0].replace(/[^a-zA-Z]/g, " ").trim();
      return initials(name);
    }),
    attendeeEmails: b.meeting.attendees || [],
    status: cls.status,
    conflict: cls.conflict,
    failureReason: b.failureReason,
    skeddaBookingRef: b.skeddaBookingRef,
  };
}

export function dayOf(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD
}
